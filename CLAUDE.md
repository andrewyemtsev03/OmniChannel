# CLAUDE.md — project context

Read this first when working on this codebase. It explains what the project is, the decisions already made, and the rules that must not be broken.

## What this is

An in-house **Rx omnichannel platform for Stada Kazakhstan**. It replaces work previously done by third-party agencies. Core loop:

1. Marketing uploads an HTML presentation (often made with Claude).
2. MLR (medical, legal, regulatory) review approves it with an approval code.
3. Medical reps send it to doctors (HCPs) as a **personal tracked link**, mainly over **WhatsApp** (the main channel Kazakh doctors use).
4. The platform records when each doctor opened it and how long they spent on each slide.

Scope: **Kazakhstan only.** Reps use **Proxima CRM** (Proxima Research); doctors come from its database via CSV import for now, API sync later.

## Stack and commands

- `server/` Node.js 22, Express 4, `pg` (no ORM), ES modules. Entry: `server/src/index.js`.
- `client/` React 19 + Vite + react-router 7. Plain CSS in `client/src/styles.css` (no UI library).
- PostgreSQL 16. Schema in `server/src/migrations/*.sql`, applied automatically at startup.

```bash
npm run install:all   # install server + client
npm run dev           # server :4000 + client :5173 (Vite proxies /api and /v to :4000)
npm run seed          # demo data
npm run build         # React build -> client/dist, served by the Node server in production
```

## Rules that must not be broken

1. **Consent (СОПД) is enforced on the server.** `POST /api/send` refuses doctors without an active consent (WhatsApp needs channel `whatsapp` or `any`). Never move this check to the client only, and never add a code path that creates links or sends messages without it. "Active" = `withdrawn_at IS NULL AND given_at <= now() AND (expires_at IS NULL OR expires_at > now())` (`ACTIVE_CONSENT_SQL` in `server/src/utils.js`).
2. **Only `approved` presentations reach doctors.** Viewer routes and tracking check `status = 'approved'`. Approved files are immutable; changes mean a new presentation.
3. **Uploaded decks are untrusted HTML.** They are always served with `Content-Security-Policy: sandbox …` (`DECK_CSP` in `server/src/services/viewer.js`) and embedded in a sandboxed iframe **without** `allow-same-origin`. Never serve deck HTML from a route without that header, and never add `allow-same-origin` — it would let a deck act as the signed-in user.
4. **Reps see only their own doctors** (`doctors.rep_id`). Every doctor query and stats query takes the rep scope into account.
5. **Personal data stays in Kazakhstan.** Don't add third-party services (analytics, error tracking, CDNs for user data) that send doctor data abroad without checking with the user first.
6. **Audit compliance-relevant actions** with `audit()` from `server/src/db.js` (consents, approvals, sends, deletions, imports, user changes).
7. **Migrations are append-only.** Add `002_….sql`, `003_….sql`; never edit an applied migration.

## How things fit together

- Auth: JWT in an httpOnly cookie (`stada_session`), user reloaded from DB on every request (`middleware/auth.js`). Roles: `admin`, `reviewer` (MLR), `rep`.
- Tracking: `/v/:token` is a trusted wrapper page (Russian text, HCP confirmation gate). It loads `/v/:token/deck` (deck + injected `REPORTER` script) in a sandboxed iframe. The reporter posts `{type: 'stada:slide', index, total}` to the parent every second; the wrapper counts visible seconds per slide and flushes to `POST /api/track` every 10 s and on page hide (sendBeacon, `text/plain`). The server caps each ping at 30 s and scales per-slide values so they sum to the session total.
- Slide detection order: explicit `window.StadaTrack.slide(i, total)` → `[data-slide]`, `.slide`, `.slides > section`, `.reveal section`, `section` (most visible element wins) → number in `location.hash`.
- WhatsApp: `services/whatsapp.js`. Without `WHATSAPP_TOKEN` it runs in dry-run mode and returns a `wa.me` click-to-chat URL. Live mode sends an approved template with 3 body variables (name, title, link).
- Stats SQL lives in `services/stats.js`.

## Conventions

- Admin UI text is **English**; everything a doctor sees (viewer, gate, messages) is **Russian**. Domain terms stay as used locally: СОПД, MLR, Proxima.
- UI copy: sentence case, plain verbs, errors say what happened and how to fix it.
- Design tokens are CSS variables at the top of `styles.css`. Gold (`--gold`) is reserved for the slide attention strip; actions are green.
- Route handlers are wrapped in `ah()` and throw `HttpError(status, message)`; messages are shown to users, so write them for people.
- Keep dependencies minimal; prefer plain SQL and small modules.

## Status (MVP, Oct 2026)

Built and tested end to end: login and roles, doctors + CSV import, consents, upload + MLR workflow, sandboxed preview, send (link / WhatsApp dry-run), doctor viewer with HCP gate, per-slide tracking, dashboards, team management, audit log.

Not built yet (see README "Ideas for next versions"): Proxima API sync, SSO, four-eyes approval, WhatsApp webhooks and inbox, HCP portal, email channel, journeys, automated tests.

Open business questions the user is still clarifying: whether Proxima's doctor database includes valid СОПД covering Stada's use, and where Proxima stores that data.
