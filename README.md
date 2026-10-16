# Clicky

An AI buddy that lives inside your web app. Users ask out loud, and Clicky sees the page, talks them through it, points at the right thing, or does it for them. Product teams see where users get stuck.

See [docs/SPEC.md](docs/SPEC.md) for the product and technical spec.

## Repo layout

| Path | What |
|---|---|
| `apps/web` | Next.js: dashboard, auth, API (`/api/v1/*`), serves the SDK at `/sdk/v1/clicky.js` |
| `apps/demo` | "Acme Analytics", a fake SaaS app with Clicky installed, for development and testing |
| `packages/sdk` | `@clicky/sdk`: the script/npm package customers install |
| `packages/db` | Drizzle schema and migrations (Postgres) |
| `packages/shared` | Types, settings schema and helpers shared by SDK and server |
| `e2e` | Browser tests for the dashboard and assistant (see `e2e/README.md`) |

## Getting started

Requires Node 22+, pnpm 10, and Postgres 16 (`docker compose up -d` starts one).

```sh
pnpm install
cp apps/web/.env.example apps/web/.env.local   # then set BETTER_AUTH_SECRET
pnpm db:migrate
pnpm db:seed      # demo@clicky.test / password123, with a project wired to the demo app
pnpm dev          # dashboard on :3000, demo app on :5173
```

Open http://localhost:3000, sign in as the demo user, then open http://localhost:5173. The Clicky launcher appears in the demo app and the dashboard's Install page shows it as installed.

Ask Clicky something (type it, or hold Alt+Space / ⌥ Space and talk). To give it product knowledge, add `http://localhost:5173/help/index.html` on the dashboard's Knowledge page (set `CLICKY_ALLOW_PRIVATE_FETCH=1` so the crawler may read localhost).

### AI and voice providers

Everything works without API keys, using stand-ins:

| Without | You get | Add for the real thing |
|---|---|---|
| `ANTHROPIC_API_KEY` | A simple local stand-in that matches words to page elements | Claude answers (Opus 5.5 by default, `CLICKY_ASSISTANT_MODEL` to change) |
| `DEEPGRAM_API_KEY` | The browser's built-in speech recognition (Chrome, Edge, Safari) | Fast, accurate streaming transcription in every browser |
| `ELEVENLABS_API_KEY` | The browser's built-in voices | Natural-sounding speech |

Emails (magic links, invitations) are printed to the web server log until an email provider is configured.

## How the assistant works

1. The SDK (`packages/sdk`) takes a snapshot of the page: interactive elements with refs (`[e12] button "Export"`), headings and visible text. Passwords, payment fields, `data-clicky-mask` elements and personal data (emails, phone and card numbers) are masked in the browser; `data-clicky-ignore` subtrees are skipped.
2. `POST /api/v1/chat` checks the project key against the request's website, finds relevant help-center chunks, and streams Claude's reply back as server-sent events.
3. Replies point at things by writing `{{point:e12}}`. The widget strips these markers and moves an animated pointer to the element: right away for typed questions, or in time with the sentence being spoken for voice questions.

## Common commands

```sh
pnpm typecheck | pnpm lint | pnpm test | pnpm build
pnpm db:generate --name <change>   # after editing packages/db/src/schema.ts
pnpm db:migrate
```
