# Lyk-Nu Auto Collision & Service Center: website + estimate booking

A static website with a built-in online estimate scheduler, running on Netlify (Functions + Blobs). There is no database to manage and no monthly software fee.

* **Public site:** `/` home, `/book/` schedule an estimate (`/estimate` redirects there)
* **Owner page:** `/admin/` is for the owner only and is **not linked anywhere on the public site** (type the address to reach it). He uses it to see appointments (and damage photos), to **block off time when he won't be at the shop**, and to set his **estimate availability windows**. It does not change the shop's posted hours
* **👉 Deploying:** see **[DEPLOY.md](DEPLOY.md)** (written for non-developers). Drag-and-drop deploys will **not** work because the booking system needs Netlify Functions.
* **Image credits and which photo is used where:** see **[CREDITS.md](CREDITS.md)**

## What's in this folder
| Path | What it is |
|---|---|
| `business.config.json` | **All the business facts** (phone, address, hours text, reviews, services). Edit this one file to change the text on the site. |
| `src/` | Page templates, CSS, JavaScript and web-sized images (`src/assets/img/`) |
| `netlify/functions/` | The backend (availability, booking, owner admin, public repair status lookup) |
| `netlify/lib/` | Shared logic: `core.mjs` (booking, email), `repairs.mjs` + `repairs-admin.mjs` (repair tracker) |
| `scripts/build.mjs` | Builds `src/` into `public/`, the folder Netlify publishes |
| `tests/` | Automated tests (booking API, repair tracker API, browser tests) and `tests/local/` (a no-Netlify local test server) |
| `images/` | Franklyn's original full-size shop photos (kept as-is; the site uses the optimized copies in `src/assets/img/`) |
| `original-draft/` | Franklyn's first single-page draft (`index.html`), kept for reference. It isn't used by the new site. |

## Changing business info
Edit **`business.config.json`** (phone, address, hours text, reviews, services, etc.), then redeploy. A value that starts with `TODO` is a placeholder: it stays hidden on the site, and the build prints a warning for it.
That file also holds the towing note (24/7), holiday note, appointment wording, warranty line (paint only), insurance list (text only, no logos; each entry is `{"name": ..., "url": ...}` and links to the insurer's own site) and the default booking-notification email (`notifyEmail`).
The shop's *posted* hours (Mon–Fri 8–5) are text in that file. The hours customers can **book estimates** are separate: the owner sets those as "estimate availability windows" on `/admin/`, and the public calendar follows them immediately.

## How booking works
* Estimates are 20 minutes each, one car at a time (the owner can change both on `/admin/`). The owner does estimates himself, so the site steers customers to book an appointment ("See availability") to meet him on a schedule that suits them.
* **Closed on major holidays:** New Year's Day, Memorial Day, Independence Day, Labor Day, Thanksgiving and Christmas can't be booked. These use the *actual* calendar date (no "observed" Friday/Monday shift). On `/admin/` → My availability the owner can turn the rule off or mark a specific holiday "Open anyway".
* Customers only see available slots. Closed days, blocked time, slots that are too soon, and slots that are already full can't be picked.
* The server re-checks every booking. Writes use compare-and-swap, so two people can't grab the same slot even if they submit at the same moment.
* Customers can attach up to 4 photos (the browser shrinks them before upload). Photos are stored privately, shown as thumbnails on the `/admin/` appointment, **attached to the notification email**, and also linked from it with expiring signed links (`/api/photo`, 30 days).
* The booking form's **Year**, **Make**, **Model** and **Insurance company** are plain native dropdowns (the most reliable on phones; no type-ahead lists). Models fill in after a make is picked. **Other (type it in)** reveals a text box. Makes and models come from a static list in `src/js/vehicles.js` (no outside lookups); edit that file to add more. Insurers come from `insurancePartners` in `business.config.json`. The server accepts and cleans whatever is posted (or an old single `vehicle` string). Browser test of the form: `tests/ui.test.mjs` (needs Playwright; see the file header).
* **Phone is required** on the booking form (at least 10 digits). It's checked in the browser and again on the server (`book.mjs` returns 400 with a `fields.phone` message).
* **Voice dictation:** under "What happened?" the description is a plain textarea, so the phone's own keyboard microphone works (iPhone and Android). The helper text tells customers to tap the keyboard mic or just type. There is no custom mic button or browser speech code, and the site sends a `microphone=()` Permissions-Policy because it never needs mic access. Don't add `autocomplete="off"` or an `inputmode` to that textarea, since either can hide the keyboard's mic.
* Optional email notices go through [Resend](https://resend.com) (see DEPLOY.md). Without it, appointments still show up on `/admin/`.

## Repair status tracker
Customers check `/status/` ("Check repair status" in the nav and footer) with their **work order number** (we're in the 8000s) and the **last 4 digits of the phone on file**. Staff manage repairs in `/admin/` → **Repairs** (add, edit stage/note/estimated date/"waiting on parts", **Advance**, mark picked up, delete). Full staff instructions are in DEPLOY.md ("Repair status tracker").
* **Stages:** Estimate, Waiting on insurance, Parts ordered, Disassembly, Body repair, Paint, Reassembly, Detail & QC, Ready for pickup (edit the list in `netlify/lib/repairs.mjs`, `STAGES`). No photos; no SMS. Email is optional via Resend (same `RESEND_API_KEY`/`NOTIFY_FROM` as bookings); the email never includes the phone number and a failed/missing email never blocks an update.
* **Data:** records live in the `lyknu-booking` Netlify Blobs store under `repairs/<work order>` (one record: name, phone, optional email, vehicle, stage, note, estimate, waiting flag, status history). The public API (`POST /api/status`) returns only first name + last initial, vehicle, stage, note, estimate, history and the shop phone; phone and email never leave the server. Work order numbers are unique (409 on a duplicate).
* **Lookup safety:** work order and last 4 are compared in constant time; an unknown work order and a wrong last 4 give the identical 404 ("we couldn't find that, please call us") after the same short delay. Failed lookups only are counted in a 15-minute window: `STATUS_IP_LIMIT` (default 20) per hashed client IP and `STATUS_WO_LIMIT` (default 8) per work order, then HTTP 429 with `Retry-After: 900`. Counters are Blobs entries (`throttle/ip/<sha256>`, `throttle/wo/<wo>`) and stay in the store after the window; they are harmless and can be deleted. The client IP is taken from Netlify's `x-nf-client-connection-ip`.
* **Page:** `src/status/index.html` + `src/js/status.js` (renders with `textContent` only), `<meta name="robots" content="noindex">`, listed in `sitemap.xml` when `SITE_URL` is set.

## Developer notes
```
npm install
export ADMIN_PASSWORD=choose-one SESSION_SECRET=random-string
npm run dev            # builds src/ -> public/ and runs netlify dev on :8888
ADMIN_PASSWORD=choose-one BASE=http://localhost:8888 npm test   # end-to-end API tests (booking + repair tracker)
# Without the Netlify CLI: the same functions on an in-memory Blobs stub, plus static public/ (state resets on restart)
ADMIN_PASSWORD=choose-one SESSION_SECRET=x npm run dev:local     # :8888
# Browser tests (need playwright-core; PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core CHROME=/path/to/chrome):
ADMIN_PASSWORD=choose-one node tests/ui.test.mjs; ADMIN_PASSWORD=choose-one node tests/ui-repairs.test.mjs
```
* `src/` holds templates (`{{config.x}}`, `{{> partial}}`, `{{i:icon}}`); `scripts/build.mjs` renders them into `public/`.
* `netlify/functions/`: `availability.mjs`, `book.mjs`, `admin.mjs`; shared logic is in `netlify/lib/core.mjs`.
* The shop's time zone is America/New_York.
