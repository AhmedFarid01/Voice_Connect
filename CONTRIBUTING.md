# Contributing to Lumen

Thanks for taking the time to contribute. This guide is short on purpose —
read it once, then ship.

By participating you agree to follow our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Quick links

- 💬 [Discord server](https://discord.gg/REPLACE-WITH-YOUR-INVITE) — fastest way to ask questions or pair on something
- 🐛 [Open an issue](../../issues/new/choose)
- 🗣️ [Start a discussion](../../discussions)
- 🔐 [Report a security issue privately](./SECURITY.md)

## Ground rules

1. **Open an issue first** for anything bigger than a small bug fix or doc tweak. We'd rather agree on the shape before you spend a weekend on it.
2. **One concern per PR.** A 12-file PR that fixes a bug *and* renames things is a pain to review. Split it.
3. **Don't ship secrets.** `.env` is gitignored — keep it that way. Never paste real tokens in issues.
4. **Be kind.** Reviewers and maintainers are humans doing this in their evenings.

## Dev setup

Prereqs: **Node 20+**, **PostgreSQL 15+** (or Docker), modern browser.

```bash
git clone https://github.com/REPLACE-WITH-YOUR-ORG/lumen.git
cd lumen
cp .env.example .env       # fill in SESSION_SECRET, DATABASE_URL
npm install
npm run db:push            # sync the Drizzle schema to your DB
npm run dev                # http://localhost:5000, hot-reload
```

Don't want to install Postgres locally?

```bash
npm run demo               # Docker: app + postgres at http://localhost:5000
npm run demo:stop
```

Useful one-liners:

| Command              | What it does                                              |
| -------------------- | --------------------------------------------------------- |
| `npm run dev`        | Tsx-powered dev server with hot reload                    |
| `npm run check`      | TypeScript type-check (no emit)                           |
| `npm run build`      | Production build (Vite client + esbuild server)           |
| `npm run db:push`    | Push current schema to DB                                 |
| `npm run db:generate`| Generate a SQL migration from schema changes              |
| `npm run db:migrate` | Run pending migrations                                    |
| `npm run demo`       | Local Docker stack                                        |
| `npm run demo:public`| Local Docker stack + Cloudflare quick tunnel              |

## Workflow

1. **Fork & branch.** Branch off `main`. Branch names: `feat/<thing>`, `fix/<thing>`, `docs/<thing>`, `chore/<thing>`.
2. **Code.** Match the surrounding style. We prefer small, readable functions over clever abstractions.
3. **Type-check.** `npm run check` must pass.
4. **Test in browser.** WebRTC bugs love hiding from automated tests — actually click through the flow you touched.
5. **Commit.** Use [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `perf:`.
6. **Push & PR.** Fill in the PR template. Link the issue. Screenshots for UI changes.
7. **Address review.** We squash-merge by default; clean commit history inside the PR isn't required.

### Commit examples

```
feat(live): add mute toggle to broadcaster controls
fix(socket): close peer connection on tab unload
docs(readme): clarify named-tunnel setup
```

## Code style

- **TypeScript strict mode** — don't broaden types to silence the compiler. Fix the root cause.
- **No `any` unless commented why.** Prefer `unknown` + a narrowing check.
- **Server side**: keep route handlers thin. Long handlers belong in `server/<feature>.ts` files.
- **Client side**: components live in `client/src/components`, pages in `client/src/pages`. Hooks start with `use…`. Use TanStack Query for server state, not `useEffect` + `fetch`.
- **Database**: schema changes go through Drizzle. Generate a migration (`npm run db:generate`) and commit it.
- **Comments**: explain *why*, not *what*. The code shows what it does; the comment explains why it can't be simpler.

## Reporting bugs

Use the **Bug report** issue template. The most helpful bug reports include:

- Steps to reproduce — concrete, numbered
- What you expected vs. what happened
- Browser + OS (WebRTC behaviour varies by version)
- Server logs (`npm run dev` console) and browser DevTools console
- A minimal `.env` (with secrets redacted) if config is involved

## Suggesting features

Use the **Feature request** issue template. Tell us the user problem before
the proposed solution — the *why* is what makes a good feature pitch.

For anything chunky, draft a short design note in
[Discussions](../../discussions) before opening an issue.

## Reviewing & getting reviewed

- A maintainer will pick up open PRs within a few days. If yours is stuck for >7 days, ping the [Discord](https://discord.gg/REPLACE-WITH-YOUR-INVITE) `#contributors` channel.
- Reviews focus on correctness, scope, and clarity — not personal taste. If a review comment says "consider X", you don't have to take it; reply with your reasoning.
- "LGTM" plus a green CI = ready to merge. Maintainers handle the merge.

## Releasing

Maintainers only. We tag from `main` (`vX.Y.Z`) and let CI build. Contributors don't need to touch this.

## Questions?

Open a [Discussion](../../discussions) or hop into [Discord](https://discord.gg/REPLACE-WITH-YOUR-INVITE). No question is too small.
