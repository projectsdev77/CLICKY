# Clicky — Product & Technical Specification

> Status: **Draft v0.1** — for client review. Items marked **[OPEN]** need a client decision before build.

## 1. Source material

The client provided three inputs:

| Input | What it is | What we take from it |
|---|---|---|
| Tagline: *"AI-powered website analytics and user behavior insights for product teams."* | Positioning | Buyer = product teams. Analytics/insights is a first-class pillar, not an afterthought. |
| <https://clicky-competitor.lovable.app> | Lovable landing-page prototype (branded "Sheperd"). **Idea board only; nothing on it is a committed requirement.** | Product shape: an **AI agent embedded inside a SaaS product** via one script tag / npm package. Completes tasks, guides onboarding, proactively helps stuck users, and reports analytics back to the product team. |
| <https://www.heyclicky.com> | Reference competitor (consumer Mac app) | Interaction model: user asks out loud or in text, the assistant **sees the screen, explains, points/draws on screen, and can act as an agent**. Privacy posture (only looks when invoked, screenshots not stored). Tiered pricing by agent usage. |

### Product thesis

**Clicky is "heyclicky for your SaaS product."** A SaaS company installs the Clicky SDK in their web app. Their end users get an in-app AI buddy that understands the current page, answers questions, points at the right UI element, and can perform multi-step tasks for them. The SaaS company's product team gets a dashboard showing where users get stuck, what they ask for, and what Clicky resolved, which is the "website analytics and user behavior insights" promise.

Unlike heyclicky (desktop, any app, consumer), Clicky is **web-only, embedded, B2B**, and works from the DOM rather than screenshots. That makes it faster, cheaper, more precise and easier to make privacy-safe.

## 2. Users & personas

| Persona | Who | Goal | Surface |
|---|---|---|---|
| **Admin / Product Manager** (buyer) | PM, Head of Growth, CX lead at a SaaS company | Reduce support tickets, raise onboarding completion and feature adoption, understand user friction | Clicky Dashboard |
| **Developer** (installer) | Engineer at the SaaS company | Install in minutes, control what the agent may do, stay secure | SDK, docs, Dashboard settings |
| **End user** | Customer of the SaaS company | Get unstuck and get the job done without reading docs or filing a ticket | Clicky widget inside the host app |

## 3. Scope overview

Three products, one platform:

1. **Clicky Widget + SDK**: the in-app assistant end users interact with.
2. **Clicky Dashboard**: where product teams configure Clicky and see analytics/insights.
3. **Marketing site**: public site (the Lovable prototype is the starting point).

Plus a backend (API, agent runtime, event pipeline) shared by all three.

## 4. Functional requirements

Priority: **P0** = MVP, **P1** = v1 shortly after MVP, **P2** = later.

### 4.1 SDK & installation

| ID | Requirement | Pri |
|---|---|---|
| SDK-1 | Install via a single `<script>` tag with a public project key, or `npm i @clicky/sdk` with `Clicky.init({ projectKey })`. | P0 |
| SDK-2 | `Clicky.identify({ userId, traits })` associates sessions with the host app's user (plan, role, signup date, etc.). | P0 |
| SDK-3 | Framework-agnostic: works with React, Vue, Angular, and vanilla apps, including SPA route changes. | P0 |
| SDK-4 | Widget renders in a Shadow DOM so host CSS cannot break it and vice versa. | P0 |
| SDK-5 | Bundle ≤ 50 KB gzipped for the loader; the rest is lazy-loaded on first open. No measurable impact on host page performance. | P0 |
| SDK-6 | `Clicky.track(event, props)` for custom events from the host app. | P1 |
| SDK-7 | `Clicky.registerAction(name, schema, handler)` lets developers expose safe, typed app actions (e.g. `exportReport`) that the agent can call directly instead of driving the UI. | P1 |
| SDK-8 | Domain allow-list per project; key rejected on other origins. | P0 |

### 4.2 Page understanding

| ID | Requirement | Pri |
|---|---|---|
| PU-1 | Build a compact, LLM-friendly snapshot of the current page from the DOM and accessibility tree: visible interactive elements, labels, headings, form fields, and current values, each with a stable element reference. | P0 |
| PU-2 | **Redaction by default:** never send password fields, elements marked `data-clicky-mask`, or values matching PII patterns (emails, card numbers, etc.). Masking rules are configurable per project. | P0 |
| PU-3 | Elements with `data-clicky-ignore` are excluded entirely. | P0 |
| PU-4 | Snapshot is only captured when the user invokes Clicky, or for proactive triggers if enabled (see 4.5). It is never streamed continuously. | P0 |

### 4.3 Assistant: Ask & Guide ("Talk" mode)

| ID | Requirement | Pri |
|---|---|---|
| AS-1 | Floating launcher button plus keyboard shortcut opens Clicky. Default is **hold-to-talk** (hold `⌥/Alt + Space` or the launcher, speak, release), like heyclicky's hotkey. A text chat panel is always available as fallback. Shortcuts configurable. | P0 |
| AS-2 | User asks in natural language and gets a streamed answer grounded in the current page plus the product's knowledge base. | P0 |
| AS-3 | **Point the way:** the answer can highlight/spotlight specific elements on the page, with an animated cursor or arrow and a tooltip (the web equivalent of heyclicky's on-screen drawing). | P0 |
| AS-4 | **Step-by-step walkthrough:** for multi-step how-tos, Clicky guides the user one step at a time and advances when it detects the step was completed (navigation or DOM change). | P0 |
| AS-5 | Knowledge base: admins add help-center URLs (crawled, up to 30 pages) or paste articles; content is chunked and retrieved per question. *Built (M1) with Postgres full-text search. Still to do: file uploads (PDF/MD), embedding search if full-text quality falls short.* | P0 |
| AS-6 | **Voice-first.** Push-to-talk voice input with live transcript (streaming hosted speech-to-text). Spoken replies via streaming text-to-speech, synced with on-screen pointing so Clicky "talks you through" the page. Users can interrupt by speaking or pressing the key again. Mute/text-only toggle; admins can disable voice per project. Graceful handling of denied mic permission. Audio is not stored; only transcripts are. | P0 |
| AS-7 | Conversation persists across page navigations within a session. | P0 |
| AS-8 | Handoff: "Talk to a human" escalates to the host's support channel (email/Intercom/Zendesk link) with conversation transcript attached. | P1 |
| AS-9 | Localization: respond in the user's language. | P1 |

### 4.4 Agent: "Do it for me" mode

| ID | Requirement | Pri |
|---|---|---|
| AG-1 | User describes a goal; the agent plans and executes UI actions: click, type, select, navigate, scroll, wait. | P0 |
| AG-2 | Visible execution: each action is animated on screen, with a live step list in the panel. The user can pause or stop at any time. | P0 |
| AG-3 | **Confirmation gates:** before destructive or sensitive actions (delete, submit payment, send, change permissions, anything an admin flags), Clicky asks for explicit confirmation. | P0 |
| AG-4 | Admin-defined action policy per project: allow-list or block-list of pages/elements/action types; "read-only mode" (guide only, never act). | P0 |
| AG-5 | Error recovery: detect validation errors after an action and retry or explain. | P0 |
| AG-6 | Prefer registered app actions (SDK-7) over UI driving when available. | P1 |
| AG-7 | Saved **Workflows**: admins record or describe a named workflow (e.g. "Export Report", "Update Billing") that Clicky can run reliably on request. | P1 |
| AG-8 | Agent runs only in the user's browser session with the user's own permissions. Clicky never holds host-app credentials. | P0 |

### 4.5 Proactive assistance

| ID | Requirement | Pri |
|---|---|---|
| PR-1 | Struggle detection in the SDK: rage clicks, dead clicks, repeated form-validation errors, idle-on-form > N seconds, back-and-forth navigation loops. | P1 |
| PR-2 | When struggle is detected, show a subtle nudge ("Need a hand with this form?"). Admin controls on/off, thresholds, and pages. | P1 |
| PR-3 | Onboarding flows: admin defines a goal checklist (e.g. "Connect data source → Invite teammate → Create first report"); Clicky offers to guide new users through it adaptively. | P1 |
| PR-4 | Smart suggestions: surface relevant next actions based on behavior and identity traits. | P2 |

### 4.6 Analytics & insights (Dashboard)

This is the tagline's core promise and the main reason product teams will pay.

| ID | Requirement | Pri |
|---|---|---|
| AN-1 | Overview: conversations, unique users, resolution rate, agent tasks completed, average time-to-resolution, estimated tickets deflected and hours saved. Filterable by date range. | P0 |
| AN-2 | Conversation log: searchable list with transcript, page URL, user identity, outcome (resolved / escalated / abandoned), and thumbs up/down feedback. | P0 |
| AN-3 | **Topic clustering:** LLM groups user questions into topics ("How do I export?", "Billing changes") with volume and trend. | P0 |
| AN-4 | **Friction map:** pages and elements ranked by struggle signals (PR-1) and question volume. | P1 |
| AN-5 | Knowledge gaps: questions Clicky couldn't answer confidently, with a one-click "add answer to knowledge base". | P1 |
| AN-6 | Feature discovery: which features users ask about or are guided to, by user segment. | P1 |
| AN-7 | Onboarding funnel: completion per step for PR-3 flows. | P1 |
| AN-8 | Weekly AI-written insight digest emailed to admins ("3 things your users struggled with this week"). | P1 |
| AN-9 | Export (CSV) and webhook/Segment forwarding of Clicky events. | P2 |

### 4.7 Dashboard: configuration & admin

| ID | Requirement | Pri |
|---|---|---|
| DA-1 | Auth: email + password, magic link, Google SSO. | P0 |
| DA-2 | Organizations → Projects (one per app/environment). Team invites with roles: Owner, Admin, Viewer. | P0 |
| DA-3 | Install page: copy-paste snippet, framework guides, live "installation detected" check. | P0 |
| DA-4 | Widget appearance: brand color, position, launcher icon, assistant name, greeting, light/dark. Live preview. | P0 |
| DA-5 | Assistant behavior: custom instructions/persona, mode (guide-only vs agent), confirmation rules, page allow/block lists, masking rules. | P0 |
| DA-6 | Knowledge base management (sources, re-crawl, status). | P0 |
| DA-7 | Billing & usage: plan, usage meters, upgrade/downgrade via Stripe Checkout and Customer Portal. | P0 |
| DA-8 | Audit log of agent actions (who, what, page, when, confirmed?). | P1 |
| DA-9 | SAML SSO, data-retention controls, regional data residency. | P2 |

### 4.8 Marketing site

| ID | Requirement | Pri |
|---|---|---|
| MK-1 | Landing page (Hero, Capabilities, How it works, FAQ, CTA). The Lovable prototype is loose inspiration only: no placeholder metrics, fictional testimonials, or unearned compliance claims. | P0 |
| MK-2 | Pricing page (see §7), Docs, Trust/Security, Privacy, Terms, Changelog. | P0 |
| MK-3 | Live demo: Clicky running on a sample app the visitor can try. | P1 |
| MK-4 | "Book a demo" (Cal.com/Calendly) and "Start free trial" → sign-up. | P0 |

## 5. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | Voice: end of speech → first spoken audio ≤ 2 s p50. First streamed text token ≤ 1.5 s p50; single agent step ≤ 3 s p50. SDK loader adds < 20 ms to host main thread. |
| Reliability | 99.9% API uptime target. If Clicky is down, the widget fails silently and never breaks the host app. |
| Security | Tenant isolation on every query; project keys are public but origin-bound; admin API uses secret keys; all traffic TLS; secrets encrypted at rest. CSP-compatible SDK (documented directives). |
| Privacy | Redaction before data leaves the browser (PU-2). No screenshots stored. Configurable retention (default 90 days). DPA available. GDPR data export/delete endpoints. SOC 2 readiness as a v1+ goal. **The prototype's "SOC 2 aligned, GDPR ready" claim should not go live until true.** |
| Accessibility | Widget meets WCAG 2.1 AA: keyboard navigable, screen-reader labels, reduced motion respected. |
| Browser support | Last 2 versions of Chrome, Edge, Safari, Firefox. Mobile web is P1. |
| Cost control | Per-project rate limits and monthly usage caps tied to plan. Cheaper model for classification/clustering, stronger model for agent steps. |

## 6. Architecture (proposed)

```
 Host SaaS app (browser)                    Clicky Cloud
┌──────────────────────────┐        ┌───────────────────────────────────┐
│ Clicky SDK               │  HTTPS │ API (Next.js route handlers)       │
│  • loader + widget (UI)  │ ─────▶ │  • /v1/chat  (SSE stream)          │
│  • DOM snapshot + redact │  SSE   │  • /v1/agent/step                  │
│  • action executor       │ ◀───── │  • /v1/events (batched ingest)     │
│  • struggle detector     │        │                                    │
│  • event batcher         │        │ Agent runtime ──▶ Claude API        │
└──────────────────────────┘        │ RAG ──▶ pgvector                    │
                                    │ Workers (crawl, embed, cluster,     │
 Dashboard (browser) ─────────────▶ │  digests) via queue                 │
                                    │ Postgres (Supabase) · Stripe        │
                                    └───────────────────────────────────┘
```

**Agent loop (browser-driven):** the server never touches the host app directly. Each step:
1. SDK sends `{goal, history, pageSnapshot}`.
2. Server calls the LLM with tools (`click`, `type`, `select`, `navigate`, `highlight`, `ask_user`, `finish`, plus any registered app actions).
3. Server returns the next tool call; SDK validates it against the project's action policy, asks for confirmation if needed, executes, re-snapshots, and loops.

This keeps credentials and execution in the user's session (AG-8) and makes every action auditable.

### Proposed stack

| Layer | Choice | Why |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo, TypeScript everywhere | Shared types between SDK, API, and dashboard |
| Dashboard + API + marketing | Next.js (App Router) on Vercel | One deployable to start; split API out later if needed |
| SDK | Vanilla TS + Preact in Shadow DOM, bundled with tsup/esbuild | Small bundle, framework-agnostic |
| Database / auth | Postgres + pgvector via Drizzle ORM (hosted on Supabase/Neon, any managed Postgres works); Better Auth (email/password, magic link, Google, organizations, invites) | Portable, runs fully locally, no vendor lock-in for auth |
| Background jobs | Next.js `after()` for now (knowledge crawl); move to Inngest or Trigger.dev when jobs need retries/schedules | Crawling, clustering, digests |
| LLM | Anthropic Claude via the official SDK. Chat uses Claude Opus 5.5 at low effort (fast first word for voice), with server-side refusal fallback; model is configurable (`CLICKY_ASSISTANT_MODEL`). Haiku 5.5 is the candidate for clustering/summaries. A local stand-in answers when no key is set (dev/CI). | Quality + latency; cost tuning later with real traffic |
| Retrieval | Postgres full-text search (M1). Embeddings into pgvector later, only if needed | No extra vendor to start |
| Payments | Stripe Billing + metered usage | |
| Voice | Deepgram (streaming speech-to-text, browser connects with a 60-second token from our API) + ElevenLabs (text-to-speech, proxied through our API). Without those keys the widget falls back to the browser's built-in speech recognition and voices | Low latency, good quality; works out of the box without vendors |
| Email | Resend | Invites, digests |
| Observability | Sentry, PostHog (for our own product analytics) | |
| UI | Tailwind + shadcn/ui | Matches Lovable output, easy to port |

### Repo layout

```
apps/
  web/          # Next.js: marketing site, dashboard, API routes
  demo/         # sample SaaS app used for live demo + E2E tests
packages/
  sdk/          # @clicky/sdk: loader, widget, snapshot, executor
  shared/       # types, zod schemas, action policy logic
  db/           # schema + migrations
docs/
  SPEC.md
```

## 7. Data model (core)

- **Organization**: id, name, plan, stripe_customer_id
- **Membership**: user_id, org_id, role (owner/admin/viewer)
- **Project**: id, org_id, name, public_key, allowed_origins[], settings (appearance, behavior, policy, masking)
- **EndUser**: id, project_id, external_id, traits (jsonb), first_seen, last_seen
- **Session**: id, project_id, end_user_id, started_at, user_agent, entry_url
- **Conversation**: id, session_id, mode (ask/agent), outcome, topic_id, feedback, created_at
- **Message**: id, conversation_id, role, content, page_url, tokens, created_at
- **AgentAction**: id, conversation_id, type, target_ref, args (redacted), confirmed, status, error, created_at
- **Event**: id, project_id, session_id, type (pageview / rage_click / dead_click / form_error / custom / nudge_shown, etc.), url, element_ref, props, ts *(high volume; partition by month)*
- **KnowledgeSource**: id, project_id, type (url/file), status, last_synced_at → **KnowledgeChunk**: content, embedding
- **Topic**: id, project_id, label, summary, period
- **Workflow** (P1): id, project_id, name, description, steps (jsonb)
- **OnboardingFlow** (P1): id, project_id, steps (jsonb), audience rules
- **UsageRecord**: org_id, period, conversations, agent_tasks

## 8. Pricing & packaging (proposed, [OPEN])

The prototype has no pricing. heyclicky charges consumers per agent message. For B2B, we suggest pricing by **monthly active assisted users (MAU) + agent tasks**:

| Plan | Price | Includes |
|---|---|---|
| Free / Trial | $0 (14-day trial of Growth, then Free) | 1 project, 100 conversations/mo, guide-only mode, 7-day analytics |
| Growth | ~$199/mo | 3 projects, 2,000 conversations, 500 agent tasks, full analytics, proactive nudges |
| Scale | ~$799/mo | Unlimited projects, 10,000 conversations, 3,000 agent tasks, workflows, audit log, digests |
| Enterprise | Custom | SAML SSO, data residency, DPA, custom limits, SLA |

Behavior at limit (borrowed from heyclicky): Ask mode keeps working at a soft cap; agent tasks pause until next cycle or upgrade.

## 9. MVP definition & milestones

**MVP goal:** a SaaS team can install Clicky in under 10 minutes, their users can ask questions out loud (or by typing) and get talked through it (with highlights) or let the agent do simple tasks with confirmations, and the team can see conversations, topics, and core metrics.

| Milestone | Contents | Est. |
|---|---|---|
| **M0 Foundations** ✅ | Monorepo, CI, Postgres schema, auth, orgs/projects/team, install snippet + detection, demo app | 1 wk |
| **M1 SDK + Ask** ✅ | Shadow-DOM widget, DOM snapshot + redaction, streamed chat, knowledge base (URL crawl + pasted articles), point-the-way, conversation log, assistant settings | 2 wks |
| **M1.5 Voice** ✅ | Push-to-talk (hold Alt/⌥+Space or the mic button), STT/TTS with browser fallback, interruption, speech synced with pointing, mic-permission UX | 1 wk |
| **M2 Agent** ✅ | Agent loop (click/type/select/navigate/scroll), teach mode (wait_for_user walkthroughs), confirmation gates (click or say "yes"), admin blocked pages + keywords, guide-only mode, error reporting from the page, resume across full page loads, action audit log in transcripts | 2 wks |
| **M3 Dashboard analytics** ✅ | Overview (KPIs, conversations/day, topics), automatic topic grouping + knowledge gaps (Claude Haiku 5.5, background), 👍/👎 feedback, struggle signals (rage/dead clicks, form errors, stuck on form) → friction map + problem elements, conversation filters, demo-data seed | 1.5 wks |
| **M4 Billing + marketing** ✅ | Plans (Free/Growth/Scale/Enterprise) with enforced limits and 14-day Growth trial, Stripe Checkout + portal + webhooks (dev plan switcher until keys exist), Billing page with usage meters, Resend email, public site: landing, pricing, docs, security, draft privacy/terms | 1 wk |
| **M5 Hardening** ✅ | Browser test suites for every milestone (now in CI), accessibility audit (axe, WCAG 2 A/AA, light + dark: zero violations), request size limits, DNS-pinned SSRF-safe crawler, data retention job + per-user deletion, health endpoint, readable text on any brand color | 1 wk |
| **v1 (post-MVP)** | Proactive struggle detection + nudges, friction map, onboarding flows, workflows, registered app actions, digests, audit log, human handoff | 4–6 wks |

**Success metrics for beta customers:** ≥ 30% reduction in "how-to" support tickets; ≥ 70% of conversations rated resolved; median install time < 10 min; agent task success ≥ 85% on the demo app suite.

## 10. Open questions for the client

1. ~~**Name & brand.**~~ **Decided: Clicky.** (Note for the client: clicky.com is an existing web-analytics product. A trademark check is recommended before launch.)
2. ~~**Product shape.**~~ **Decided:** an embedded web version of heyclicky. SaaS companies install the SDK in their web app for their users. Not a desktop app, not a standalone analytics tool.
3. ~~**Analytics depth.**~~ **Decided:** insights from Clicky's own interactions and struggle signals (§4.6). No full product analytics (pageview tracking, retention, session replay). Clicky's events can be forwarded to PostHog/Segment instead (AN-9).
4. ~~**Agent autonomy.**~~ **Decided:** agent mode ships in MVP, with confirmation gates and admin policies (§4.4).
5. **Pricing.** Accept the proposed model in §8, or does the client have targets?
6. **Target customers / first design partners.** Any specific SaaS apps to pilot with? Their stack affects SDK priorities.
7. **Compliance.** Any customers requiring SOC 2 / HIPAA / EU data residency at launch?
8. **Hosting & accounts.** Who owns the Vercel, Supabase, Anthropic, and Stripe accounts? Budget for LLM usage during beta?
9. ~~**Lovable prototype.**~~ **Decided:** idea board only. Nothing on it must be implemented.
10. ~~**Voice.**~~ **Decided:** voice-first in MVP (AS-1, AS-6, milestone M1.5).
