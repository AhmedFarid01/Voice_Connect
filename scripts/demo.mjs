#!/usr/bin/env node
/**
 * Lumen demo script.
 *
 *   npm run demo        → start everything, print a public HTTPS URL
 *   npm run demo:stop   → tear it all down
 *   npm run demo:url    → reprint the current URL
 *
 * Two modes, auto-detected:
 *   • Quick tunnel (default): random *.trycloudflare.com URL, no setup.
 *   • Named tunnel: when CLOUDFLARE_TUNNEL_TOKEN is set in .env, the demo
 *     attaches to your own domain.
 */

import { spawn, spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import dns from "node:dns/promises";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const MAGENTA = "\x1b[35m";

const log = (m) => console.log(`${DIM}[demo]${RESET} ${m}`);
const info = (m) => console.log(`${CYAN}[demo]${RESET} ${m}`);
const ok = (m) => console.log(`${GREEN}[demo]${RESET} ${m}`);
const warn = (m) => console.log(`${YELLOW}[demo]${RESET} ${m}`);
const err = (m) => console.error(`${RED}[demo]${RESET} ${m}`);

// ── .env reader (no dotenv dep needed for one-shot use) ─────────────────────
function readEnv() {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const env = readEnv();
const TOKEN = (process.env.CLOUDFLARE_TUNNEL_TOKEN ?? env.CLOUDFLARE_TUNNEL_TOKEN ?? "").trim();
const HOSTNAME = (process.env.CLOUDFLARE_TUNNEL_HOSTNAME ?? env.CLOUDFLARE_TUNNEL_HOSTNAME ?? "").trim();
const NAMED = TOKEN.length > 0;
const PROFILE = NAMED ? "demo-named" : "demo";

// ── Compose helpers ─────────────────────────────────────────────────────────
function compose(args, opts = {}) {
  return spawn("docker", ["compose", "--profile", PROFILE, ...args], {
    stdio: opts.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
}

function composeSync(args, profile = PROFILE) {
  return spawnSync("docker", ["compose", "--profile", profile, ...args], {
    encoding: "utf-8",
    shell: process.platform === "win32",
  });
}

function checkDocker() {
  const r = spawnSync("docker", ["--version"], {
    encoding: "utf-8",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    err("Docker doesn't seem to be installed or running.");
    err("Install Docker Desktop from https://www.docker.com/products/docker-desktop/");
    process.exit(1);
  }
}

// ── URL discovery ───────────────────────────────────────────────────────────
function readCloudflaredLogs(service) {
  const r = composeSync(["logs", "--no-color", service]);
  return (r.stdout || "") + (r.stderr || "");
}

async function findQuickUrl({ timeoutMs = 60_000 } = {}) {
  const start = Date.now();
  const re = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
  while (Date.now() - start < timeoutMs) {
    const out = readCloudflaredLogs("cloudflared");
    const match = out.match(re);
    if (match) return match[0];
    await new Promise((res) => setTimeout(res, 1000));
  }
  return null;
}

const REGISTERED_RE = /Registered tunnel connection|Connection \w+ registered/i;
const FATAL_RE = /(failed to fetch token|Unauthorized|invalid tunnel secret|Cannot determine|context canceled|connection refused)/i;

async function waitForRegistered(service, { timeoutMs = 60_000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const out = readCloudflaredLogs(service);
    if (REGISTERED_RE.test(out)) return { ok: true };
    const fatal = out.match(FATAL_RE);
    if (fatal) return { ok: false, reason: fatal[0] };
    await new Promise((res) => setTimeout(res, 1000));
  }
  return { ok: false, reason: "timeout waiting for tunnel registration" };
}

/**
 * Check that the host actually resolves on this machine. If a local DNS filter
 * (Pi-hole / AdGuard / corporate DNS) is blocking trycloudflare.com, the
 * registered tunnel won't help — the user's browser can't even look it up.
 * We test against the system resolver AND Cloudflare's 1.1.1.1, and warn loudly
 * if they disagree.
 */
async function checkResolves(host, { timeoutMs = 15_000 } = {}) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    try {
      await dns.lookup(host);
      return { systemResolves: true, lastErr: null };
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, 1000));
    }
  }
  // Try 1.1.1.1 directly to disambiguate "DNS not propagated" vs "filter".
  let publicResolves = false;
  try {
    const r = new dns.Resolver();
    r.setServers(["1.1.1.1", "8.8.8.8"]);
    await r.resolve4(host);
    publicResolves = true;
  } catch {
    /* still nothing */
  }
  return { systemResolves: false, publicResolves, lastErr };
}

// ── Banner ──────────────────────────────────────────────────────────────────
function banner({ url, mode }) {
  const lines = [
    `${BOLD}🎬 Your demo is live${RESET}`,
    "",
    `${BOLD}${GREEN}${url}${RESET}`,
    "",
    `${DIM}Mode:   ${mode}${RESET}`,
    `${DIM}Stop:   npm run demo:stop${RESET}`,
  ];
  const width = Math.max(...lines.map((l) => stripAnsi(l).length)) + 4;
  const bar = "─".repeat(width);
  console.log("");
  console.log(`${MAGENTA}${bar}${RESET}`);
  for (const l of lines) console.log(`${MAGENTA}│${RESET}  ${l}`);
  console.log(`${MAGENTA}${bar}${RESET}`);
  console.log("");
}
function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

// ── Subcommands ─────────────────────────────────────────────────────────────
async function up() {
  checkDocker();

  if (NAMED) {
    info(`Named tunnel mode — token detected.`);
    if (HOSTNAME) info(`Expected hostname: ${BOLD}${HOSTNAME}${RESET}`);
    else
      warn(
        "CLOUDFLARE_TUNNEL_HOSTNAME isn't set, so I can only print a fallback URL." +
          "\n        Add it to .env to see your real domain in the banner.",
      );
  } else {
    info("Quick tunnel mode — random *.trycloudflare.com URL.");
    info("Set CLOUDFLARE_TUNNEL_TOKEN in .env to use your own domain instead.");
  }

  // If switching modes, make sure the other profile's tunnel container isn't
  // still running. Stop both quietly first.
  composeSync(["down"], "demo");
  composeSync(["down"], "demo-named");

  info("Building and starting containers (app + postgres + cloudflared)…");
  const upChild = compose(["up", "-d", "--build"], { inherit: true });
  await new Promise((resolve, reject) => {
    upChild.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`docker compose exited ${code}`)),
    );
  });

  let url = null;
  let mode = "";
  let host = null;
  const service = NAMED ? "cloudflared-named" : "cloudflared";

  if (NAMED) {
    info("Waiting for the named tunnel to register with Cloudflare's edge…");
    const reg = await waitForRegistered(service);
    if (!reg.ok) {
      err(`Tunnel didn't register: ${reg.reason}`);
      err(`  docker compose --profile demo-named logs cloudflared-named`);
      err("Common causes: bad token, hostname not yet propagated, or the");
      err("dashboard's Public Hostname isn't pointed at http://app:5000.");
      process.exit(1);
    }
    mode = "Named tunnel (your domain)";
    host = HOSTNAME || null;
    url = host ? `https://${host}` : "https://<your configured hostname>";
  } else {
    info("Waiting for the Cloudflare quick tunnel URL…");
    url = await findQuickUrl();
    if (!url) {
      err("Couldn't read a tunnel URL within 60s.");
      err("Run `docker compose --profile demo logs cloudflared` to debug.");
      process.exit(1);
    }
    info("Waiting for the tunnel to fully register before announcing the URL…");
    const reg = await waitForRegistered(service, { timeoutMs: 45_000 });
    if (!reg.ok) {
      warn(`Tunnel registration check: ${reg.reason}`);
      warn("URL is printed below but might not resolve yet. If it doesn't load,");
      warn("retry in 30s, or check the cloudflared logs.");
    }
    mode = "Quick tunnel (random URL)";
    try {
      host = new URL(url).hostname;
    } catch {
      host = null;
    }
  }

  // DNS sanity check on the host we're about to advertise.
  if (host) {
    info(`Verifying that ${host} resolves from this machine…`);
    const probe = await checkResolves(host);
    if (!probe.systemResolves) {
      console.log("");
      err(`DNS lookup for ${host} failed on the system resolver.`);
      if (probe.publicResolves) {
        err("…but it DOES resolve via 1.1.1.1 / 8.8.8.8.");
        err("That means a local DNS filter is blocking the host. Likely culprits:");
        err("  • Pi-hole / AdGuard / NextDNS — add an allow-rule for trycloudflare.com");
        err("  • Corporate or school network filtering");
        err("  • Some antivirus suites with web-protection (Kaspersky, Avast, ESET)");
        err("Quickest workaround: set your system DNS to 1.1.1.1, or open the URL");
        err("from your phone on mobile data.");
      } else {
        err("It also doesn't resolve from public DNS yet.");
        err("This is usually transient — wait 30 seconds and reload, or run:");
        err("  docker compose --profile " + PROFILE + " logs cloudflared");
        err("to see whether the tunnel is actually connected.");
      }
      console.log("");
    } else {
      ok(`${host} resolves cleanly.`);
    }
  }

  banner({ url, mode });

  console.log(`${YELLOW}Notes${RESET}`);
  console.log(`  • Username/password sign-up works out of the box.`);
  console.log(
    `  • For Google/GitHub OAuth, add ${url}/api/auth/google/callback (and the`,
  );
  console.log(`    GitHub equivalent) to those provider apps' allowed callbacks.`);
  console.log(`  • SMTP not set? Password-reset links print to the server log below.`);
  console.log("");

  info("Tailing app logs (Ctrl+C just stops tailing — containers keep running):");
  console.log("");
  const tail = compose(["logs", "-f", "--tail=20", "app"], { inherit: true });
  process.on("SIGINT", () => {
    tail.kill("SIGINT");
    console.log("");
    info("Tail stopped. Containers still running. `npm run demo:stop` to tear down.");
    process.exit(0);
  });
}

function down() {
  checkDocker();
  info("Stopping demo containers (both profiles)…");
  for (const profile of ["demo", "demo-named"]) {
    const r = composeSync(["down"], profile);
    process.stdout.write(r.stdout || "");
    process.stderr.write(r.stderr || "");
  }
  ok("All stopped.");
}

async function url() {
  checkDocker();
  if (NAMED) {
    if (HOSTNAME) console.log(`https://${HOSTNAME}`);
    else {
      err("Named-tunnel mode is on but CLOUDFLARE_TUNNEL_HOSTNAME isn't set.");
      err("Either set it in .env or check your Cloudflare dashboard for the public hostname.");
      process.exit(1);
    }
    return;
  }
  const u = await findQuickUrl({ timeoutMs: 5_000 });
  if (u) console.log(u);
  else {
    err("No tunnel URL found. Is the demo running? (`npm run demo`)");
    process.exit(1);
  }
}

// ── Entrypoint ──────────────────────────────────────────────────────────────
const cmd = process.argv[2] || "up";
switch (cmd) {
  case "up":
    await up();
    break;
  case "down":
    down();
    break;
  case "url":
    await url();
    break;
  default:
    console.log("Usage: node scripts/demo.mjs [up|down|url]");
    process.exit(1);
}
