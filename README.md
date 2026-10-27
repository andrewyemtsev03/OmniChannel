# Rx Omnichannel — Stada Kazakhstan (MVP)

In-house platform for sending MLR-approved HTML presentations (for example, ones made with Claude) to doctors over WhatsApp, and seeing who opened them and how long they spent on each slide.

**Stack:** React (Vite) · Node.js (Express) · PostgreSQL

## What the MVP does

- **Doctors** — add manually or import a CSV export from Proxima (Russian or English column names, comma or semicolon separated). Reps only see their own doctors.
- **Consent (СОПД)** — record each consent with purpose, channel, how it was given (paper form, eGov Mobile, digital), date, expiry and where the proof is kept. Withdraw at any time. **Nothing can be sent to a doctor without an active consent** — this is enforced on the server, not just in the UI.
- **Presentations** — upload a single `.html` file. Workflow: *Draft → In MLR review → Approved (with approval code) → Archived*. Only approved materials can be sent; approved files cannot be changed (upload a new version instead).
- **Sending** — each doctor gets a personal, tracked link. Send over WhatsApp (Cloud API, or test mode with a click-to-chat link) or create a link to show on a tablet during a visit.
- **Doctor view** — a "for healthcare professionals only" confirmation, then the deck full screen, with the MLR code in a footer bar. Works on phones.
- **Tracking** — time per slide, slides reached, number of views, open rate. Works with most HTML decks without changes.
- **Team and audit** — roles (admin, MLR reviewer, medical rep) and an activity log of compliance-relevant actions.

## Run it locally

You need **Node.js 22** (or 20.19+) and **PostgreSQL 16** (or Docker).

```bash
# 1. Start PostgreSQL (skip if you have your own)
docker compose up -d

# 2. Configure the server
cp server/.env.example server/.env        # then edit values if needed

# 3. Install everything
npm install
npm run install:all

# 4. Optional: demo data (4 doctors, 1 approved sample deck, demo users)
npm run seed

# 5. Start server (:4000) and React app (:5173) together
npm run dev
```

Open http://localhost:5173.

| Demo login | Email | Password |
|---|---|---|
| Admin | admin@stada.kz | ChangeMe123! (from `.env`) |
| Medical rep | rep@stada.kz | RepDemo123! |
| MLR reviewer | mlr@stada.kz | MlrDemo123! |

The database schema is created automatically on server start (`server/src/migrations`). The first admin is created from `ADMIN_EMAIL` / `ADMIN_PASSWORD` if there are no users yet.

## Run it in production

```bash
npm run build                 # builds the React app into client/dist
cd server && NODE_ENV=production npm start
```

The Node server then serves both the API and the React app on one port (default 4000). Put it behind a reverse proxy (nginx, Caddy) with HTTPS and set:

| Variable | Why |
|---|---|
| `NODE_ENV=production` | Secure cookies, strict checks |
| `JWT_SECRET` | Long random string. The server refuses to start in production without it |
| `PUBLIC_BASE_URL` | The public HTTPS address doctors open, e.g. `https://hcp.example.kz` — used to build links |
| `DATABASE_URL` | PostgreSQL connection string |
| `TRUST_PROXY=1` | When running behind a reverse proxy, so rate limits see the real client IP |
| `UPLOAD_DIR` | Where uploaded decks are stored. **Back this folder up together with the database** |

**Hosting:** Kazakhstan's personal data law requires databases with Kazakh citizens' personal data to be stored on servers in Kazakhstan. Host the server, the database and the uploads folder in a Kazakhstan data centre or cloud. Confirm the setup with your lawyer and Stada's IT/security team.

## Making Claude presentations track well

The viewer finds slides automatically. It looks, in order, for elements matching `[data-slide]`, `.slide`, `.slides > section`, `.reveal section`, then `section`, and treats whichever one is most visible on screen as the current slide. Most decks Claude makes already work.

When asking Claude for a deck, this prompt line helps:

> Make it a single self-contained HTML file. Put each slide in its own `<section class="slide">`, show one slide at a time, and support arrow keys, swipe and on-screen next/previous buttons. Don't rely on localStorage.

For full control, a deck can report its slide itself:

```js
// call whenever the slide changes; index is 0-based
window.StadaTrack && window.StadaTrack.slide(index, totalSlides);
```

**Security note:** uploaded decks are untrusted HTML. They are served with a `Content-Security-Policy: sandbox` header and loaded in a sandboxed iframe, so a deck cannot read platform cookies or act as a signed-in user. The deck only tells the wrapper page which slide is showing; the wrapper does the tracking. Decks can still load fonts and libraries from CDNs.

## WhatsApp

Without credentials the platform runs in **test mode**: nothing is sent automatically, and each result has an **Open WhatsApp** button that opens a pre-filled message on the rep's phone. Links are still personal and tracked.

To send from the company number via the official **WhatsApp Business Platform (Cloud API)**:

1. Verify the business in Meta Business Manager and create a WhatsApp Business Account with a phone number.
2. Create a system user and a permanent access token with `whatsapp_business_messaging` permission.
3. Create a message template, e.g. `presentation_share`, language Russian, with three body variables:
   > Здравствуйте, {{1}}! Направляю вам материал «{{2}}»: {{3}}

   Category: Marketing. Meta must approve it before use.
4. Set in `server/.env`: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANG`, `WHATSAPP_API_VERSION` (check Meta's docs for the current version).

Doctors must have opted in to WhatsApp messages from Stada; in the platform that means an active consent with channel *WhatsApp* or *All channels*.

## Roles

| | Admin | MLR reviewer | Medical rep |
|---|---|---|---|
| See doctors | All | All | Only their own |
| Add / edit doctors, record consents | ✓ | ✓ | Own doctors |
| Import CSV, delete doctors | ✓ | | |
| Upload, submit, approve presentations | ✓ | ✓ | |
| Archive / delete presentations | ✓ | | |
| Send approved presentations | ✓ | ✓ | Own doctors |
| Manage team, see activity log | ✓ | | |

## Project structure

```
stada-omnichannel/
├── server/                     Node.js + Express API
│   ├── src/
│   │   ├── index.js            app setup, routes, startup
│   │   ├── config.js           all settings from .env
│   │   ├── db.js               PostgreSQL pool, transactions, audit log
│   │   ├── migrate.js          applies migrations/*.sql in order
│   │   ├── migrations/         database schema (add new numbered files, never edit old ones)
│   │   ├── middleware/auth.js  cookie sessions, roles
│   │   ├── routes/             auth, users, doctors (+consents, import), presentations, send, viewer (+tracking), stats
│   │   ├── services/           viewer pages + slide reporter, WhatsApp, file storage, stats queries
│   │   └── seed.js             demo data
│   └── sample/sample-deck.html
├── client/                     React app (Vite)
│   └── src/
│       ├── App.jsx             routing, sign-in state, top bar
│       ├── api.js, lib.js      fetch wrapper, hooks, formatting
│       ├── components.jsx      shared UI pieces
│       └── pages/              Overview, Doctors, DoctorDetail, Presentations, PresentationDetail, Send, Users
├── docker-compose.yml          local PostgreSQL
├── README.md                   this file
└── CLAUDE.md                   project context for working on the code with Claude
```

## API overview

All `/api` routes except auth and tracking need a signed-in session cookie.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login`, `/api/auth/logout` · GET `/api/auth/me` | Sessions |
| GET/POST/PATCH | `/api/users` | Team (admin) |
| GET/POST | `/api/doctors` · GET/PATCH/DELETE `/api/doctors/:id` | Doctors |
| POST | `/api/doctors/import` | CSV import (admin) |
| POST | `/api/doctors/:id/consents` · `/api/doctors/:id/consents/:cid/withdraw` | Consents |
| GET/POST | `/api/presentations` · GET/PATCH/DELETE `/api/presentations/:id` | Presentations (+ stats) |
| POST | `/api/presentations/:id/{submit,approve,reject,archive,file}` | MLR workflow, replace file |
| GET | `/api/presentations/:id/file` | Sandboxed preview |
| POST | `/api/send` | Create links and send |
| GET | `/api/stats/overview` · `/api/stats/audit` | Dashboard, activity log |
| GET | `/v/:token` · `/v/:token/deck` | Public doctor view |
| POST | `/api/track` | Public slide-timing beacon |

## Before going live

- [ ] Lawyer approves the СОПД wording, purposes and retention periods; check whether Stada must register as a personal data operator under the 2026 amendments.
- [ ] Confirm with Proxima who holds the consents in their doctor database and for which purpose. Stada will likely need its own consent for sending materials.
- [ ] Hosting in Kazakhstan, HTTPS, daily backups of the database and `UPLOAD_DIR`.
- [ ] Strong `JWT_SECRET`, change the admin password, remove demo users and demo data.
- [ ] Stada IT/security review; agree who supports the system when you are away.
- [ ] Meta business verification and an approved WhatsApp template.
- [ ] Compliance agrees the "healthcare professionals only" wording on the viewer.

## Ideas for next versions

- Two-way sync with the Proxima API (doctors, reps, visits) instead of CSV.
- Four-eyes approval (uploader cannot approve their own deck) and approval expiry dates.
- WhatsApp webhooks for delivery/read status and doctor replies; a shared inbox for reps.
- Sign-in with Stada's Microsoft/Google accounts (SSO).
- HCP portal with verified login, webinars, and an email channel.
- Customer journeys (e.g. follow-up when a doctor stops at slide 3) and next-best-action hints for reps.
- Russian/Kazakh interface for reps; automated tests and monitoring.
