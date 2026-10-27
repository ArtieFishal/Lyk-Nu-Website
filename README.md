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
| `netlify/functions/` | The booking backend (availability, booking, owner admin) |
| `scripts/build.mjs` | Builds `src/` into `public/`, the folder Netlify publishes |
| `tests/` | Automated tests for the booking system |
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
* Customers can attach up to 4 photos. The browser shrinks them before upload.
* Optional email notices go through [Resend](https://resend.com) (see DEPLOY.md). Without it, appointments still show up on `/admin/`.

## Developer notes
```
npm install
export ADMIN_PASSWORD=choose-one SESSION_SECRET=random-string
npm run dev            # builds src/ -> public/ and runs netlify dev on :8888
ADMIN_PASSWORD=choose-one BASE=http://localhost:8888 npm test   # 19 end-to-end API tests
```
* `src/` holds templates (`{{config.x}}`, `{{> partial}}`, `{{i:icon}}`); `scripts/build.mjs` renders them into `public/`.
* `netlify/functions/`: `availability.mjs`, `book.mjs`, `admin.mjs`; shared logic is in `netlify/lib/core.mjs`.
* The shop's time zone is America/New_York.
