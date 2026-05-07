<div align="center">

# Lumen

**Open-source live streaming + real-time video calling, in one app.**

WebRTC for one-to-one and group calls. A go-live + watch flow for broadcasts. A library
for recordings. Auth, contacts, profiles, settings — batteries included.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![CI](https://github.com/REPLACE-WITH-YOUR-ORG/lumen/actions/workflows/ci.yml/badge.svg)](./.github/workflows/ci.yml)
[![Discord](https://img.shields.io/badge/chat-Discord-5865F2?logo=discord&logoColor=white)](https://discord.gg/REPLACE-WITH-YOUR-INVITE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

[Quick start](#quick-start) · [Demo](#try-the-demo) · [Architecture](#architecture) · [Contributing](./CONTRIBUTING.md) · [Community](./docs/COMMUNITY.md)

</div>

---

## What's inside

- 🎥 **One-to-one + group video calls** — WebRTC with adaptive quality
- 📡 **Go live & watch** — broadcaster/viewer flow with chat
- 🖥️ **Screen sharing** during calls and broadcasts
- 📚 **Library** — uploads and stream recordings
- 💬 **In-call chat** over Socket.IO
- 🔐 **Auth** — local username/password, Google OAuth, GitHub OAuth, password reset over SMTP
- 👤 **Profiles, contacts, settings**
- 📞 **Call history**
- 📱 Responsive UI (Tailwind + shadcn/ui)

## Tech stack

| Layer    | Tools                                                                        |
| -------- | ---------------------------------------------------------------------------- |
| Frontend | React 18, TypeScript, Tailwind, shadcn/ui, Wouter, TanStack Query, WebRTC    |
| Backend  | Node 20+, Express, Socket.IO, Passport (local + Google + GitHub)             |
| Data     | PostgreSQL 15, Drizzle ORM                                                   |
| Media    | WebRTC, fluent-ffmpeg                                                        |
| Build    | Vite, esbuild, tsx                                                           |
| Ops      | Docker Compose, optional Cloudflare Tunnel                                   |

## Quick start

> Need: **Node 20+**, **PostgreSQL** (or Docker), and a Chromium-based browser for full WebRTC parity.

```bash
git clone https://github.com/REPLACE-WITH-YOUR-ORG/lumen.git
cd lumen
cp .env.example .env          # generate a SESSION_SECRET inside (see the file)
npm install
npm run db:push               # apply Drizzle schema
npm run dev                   # http://localhost:5000
```

That's the dev loop. Hot-reload, no Docker needed. Postgres has to be reachable
at whatever `DATABASE_URL` you set in `.env`.

## Try the demo

The demo script boots the whole stack (app + Postgres) in containers and gives
you a URL.

```bash
npm run demo            # local-only — http://localhost:5000 (default)
npm run demo:public     # adds a Cloudflare quick tunnel for sharing
npm run demo:url        # reprint the URL
npm run demo:stop       # tear it all down
```

| Mode             | When                                                              | URL form                              |
| ---------------- | ----------------------------------------------------------------- | ------------------------------------- |
| **Local**        | default                                                           | `http://localhost:5000`               |
| **Quick tunnel** | `--public` flag, `npm run demo:public`, or `DEMO_PUBLIC=1`        | `https://<random>.trycloudflare.com`  |
| **Named tunnel** | `CLOUDFLARE_TUNNEL_TOKEN` set in `.env`                           | `https://<your.domain>`               |

If `*.trycloudflare.com` won't resolve on your machine
(`DNS_PROBE_FINISHED_NXDOMAIN`), it's almost always a local DNS filter or
antivirus web-protection. Plain `npm run demo` sidesteps it entirely.

## Configuration

Everything is environment-driven; see [`.env.example`](./.env.example) for the
full list with comments. Highlights:

| Variable                          | Notes                                                            |
| --------------------------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`                    | Postgres connection string. Required.                            |
| `SESSION_SECRET`                  | 32-byte hex. Required. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SECURE_COOKIES`                  | `true` only when behind HTTPS.                                   |
| `GOOGLE_CLIENT_ID` / `_SECRET`    | Optional. Hide button by leaving blank.                          |
| `GITHUB_CLIENT_ID` / `_SECRET`    | Optional. Same.                                                  |
| `SMTP_*`                          | Optional. Without it, password-reset links print to the console. |
| `CLOUDFLARE_TUNNEL_TOKEN`         | Optional. Switches `npm run demo` into named-tunnel mode.        |
| `PUBLIC_BASE_URL`                 | Absolute URL used in outbound emails.                            |

## Project layout

```
client/src/         React app (pages, components, hooks, contexts)
server/             Express + Socket.IO server (auth, routes, signaling, mailer)
db/                 Drizzle schema and helpers
migrations/         Generated SQL migrations
scripts/demo.mjs    Demo orchestrator
docker-compose.yml  app + postgres + cloudflared profiles
init-scripts/       Postgres init SQL
```

Top-level server entry points are in `server/`:
[`index.ts`](./server/index.ts), [`routes.ts`](./server/routes.ts),
[`socket.ts`](./server/socket.ts), [`auth.ts`](./server/auth.ts),
[`media.ts`](./server/media.ts), [`mailer.ts`](./server/mailer.ts),
[`notifications.ts`](./server/notifications.ts).

## Architecture (one paragraph)

Browser ⇄ Express + Socket.IO. Auth is session-based (Passport, MemoryStore for
dev — swap for a real store before prod). Real-time signaling rides
Socket.IO; WebRTC peer connections then run directly between browsers. The
server stays in the loop only for chat, presence, and broadcaster fan-out.
Drizzle owns the schema; migrations are generated, not hand-written.

## Roadmap

The big themes we're working on / want help with:

- [ ] SFU mode for large group calls and broadcasts (currently mesh)
- [ ] Recording uploads going through ffmpeg pipeline → library
- [ ] Mobile-friendly UI passes for the live/go-live flows
- [ ] E2EE for one-to-one calls
- [ ] Production-grade session store and migrations story

Pick anything off the list — or anything that bugs you — and open an issue
before sinking time into it. We'd rather scope it together than receive a
20-file PR cold.

## Community

- **💬 Discord** — [join the server](https://discord.gg/REPLACE-WITH-YOUR-INVITE) for help, roadmap chat, and pairing on issues
- **🐛 Issues** — [report a bug or request a feature](../../issues/new/choose)
- **🗣️ Discussions** — [GitHub Discussions](../../discussions) for longer-form questions
- **🔐 Security** — see [SECURITY.md](./SECURITY.md) — please don't file public issues for vulnerabilities

See [`docs/COMMUNITY.md`](./docs/COMMUNITY.md) for the Discord channel layout and how
we run things.

## Contributing

We love PRs. Read [CONTRIBUTING.md](./CONTRIBUTING.md) — it's short and tells
you exactly how to set up, branch, commit, and ship.

By contributing you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

[MIT](./LICENSE) © 2026 Amad Naseem and Lumen contributors
