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

Emails (magic links, invitations) are printed to the web server log until an email provider is configured.

## Common commands

```sh
pnpm typecheck | pnpm lint | pnpm test | pnpm build
pnpm db:generate --name <change>   # after editing packages/db/src/schema.ts
pnpm db:migrate
```
