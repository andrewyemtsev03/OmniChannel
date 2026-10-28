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
- **Overview** — 30-day engagement, views per day, and a "needs your attention" list: decks waiting for MLR review, links not opened after 3 days (follow-ups), doctors without СОПД.
- **Team and audit** — roles (admin, MLR reviewer, medical rep) and an activity log of compliance-relevant actions.

The interface follows the STADA corporate design manual: Noto Sans, STADA Blue `#005DB9` with Rubine `#D50058` as the accent, pill buttons, and the intersecting gradient circles. See [Design](#design).

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

# 4. Optional: demo data (10 fictional doctors, 3 sample decks, a month of views, demo users)
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

## Deploy a demo on Render

For showing the platform to management with **fictional demo data only**. Render has no data centre in Kazakhstan (its regions are the US, Frankfurt and Singapore), so real doctors' data must not be stored there.

1. Push this project to a GitHub repository (private is fine).
2. On [render.com](https://render.com), choose **New → Blueprint**, connect GitHub and pick the repository. Render reads `render.yaml` and proposes a web service and a PostgreSQL database, both on the free plan in Frankfurt.
3. Fill in the two prompted values: `ADMIN_EMAIL` and `ADMIN_PASSWORD` (your first admin login). `JWT_SECRET` is generated, `DATABASE_URL` is connected automatically, and the public link address is taken from Render.
4. Click **Apply** and wait for the first build (a few minutes). Open `https://<service-name>.onrender.com` and sign in.
5. `SEED_DEMO_DATA=true` loads the 10 fictional doctors, sample decks and demo users on start. It never duplicates data.

Free-tier limits to know before a demo:

- The service sleeps after 15 minutes without visits; the next visit waits about a minute. Open the site a few minutes before presenting.
- The free database **expires 30 days after creation** (then a 14-day grace period to upgrade) and has no backups. Fine for a demo, not for a pilot.
- Demo users `rep@stada.kz` and `mlr@stada.kz` have the passwords printed in this README. Set `SEED_DEMO_DATA` to `false` and deactivate them on the Team page if the link will be shared widely.

Vercel is not needed: the Node server serves the React app, the API and the doctor links from one address, which keeps sign-in cookies simple. Uploaded presentations are stored in PostgreSQL, so nothing is lost when Render restarts the service.

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

**Hosting:** Kazakhstan's personal data law requires databases with Kazakh citizens' personal data to be stored on servers in Kazakhstan. Host the server and the database in a Kazakhstan data centre or cloud. Confirm the setup with your lawyer and Stada's IT/security team.

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

## Design

The UI follows the *Руководство по корпоративному стилю STADA*:

| Element | Rule from the manual | How it is used here |
|---|---|---|
| STADA Blue `#005DB9` (Pantone 300) | Primary colour | Headings, buttons, links, "ready / approved" states, charts |
| Rubine `#D50058` | Accent colour | Things that need someone's action: decks in MLR review, missing СОПД, slide attention, focus rings |
| Grey `#828895` (Pantone 430) | Secondary | Secondary labels (body text uses a darker grey to stay readable) |
| Noto Sans | Corporate font; headings Regular, emphasis Bold | Self-hosted, with Cyrillic and extended Cyrillic for Kazakh letters. No requests to Google |
| Two intersecting circles, 1% → 100% gradient | Key design element; always overlapping | Page headers, sign-in, the doctor's confirmation screen, empty states, favicon |
| Pill buttons, white surfaces, light grey bands | Website template library | All buttons and page layout |

**Logo:** `server/public/brand/stada-logo.png` was taken from the brand book PDF (it is a 443×259 raster there). It is fine on screen, but ask STADA's communications team for the official SVG and replace the file; the manual forbids changing the logo's shape or colours. The Blair ITC typeface used for STADA buttons is licensed and not included.

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
│   ├── public/brand/           logo and self-hosted Noto Sans for the doctor-facing pages
│   └── sample/sample-deck.html
├── client/                     React app (Vite)
│   └── src/
│       ├── App.jsx             routing, sign-in state, top bar
│       ├── api.js, lib.js      fetch wrapper, hooks, formatting
│       ├── ui.jsx              design-system components: icons, circles, dialogs, toasts, chips…
│       ├── styles.css          STADA design tokens and all styles
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
- [ ] Hosting in Kazakhstan, HTTPS, daily database backups (presentations are stored in the database too).
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
