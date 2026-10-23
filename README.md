# Lyk-Nu Auto Collision & Service Center: website + estimate booking

A static website with a built-in online estimate scheduler, running on Netlify (Functions + Blobs). There is no database to manage and no monthly software fee.

* **Public site:** `/` home, `/book/` schedule an estimate (`/estimate` redirects there)
* **Owner page:** `/admin/` sets weekly hours, slot length and notice time, blocks out days or hours off, and lets him view or cancel appointments and see customers' damage photos
* **Our Work gallery:** real Lyk-Nu shop photos with a tap-to-enlarge viewer, plus a before/after of a two-tone Chevy pickup
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
Booking hours are **not** set in that file. The owner sets them on `/admin/`, and the public calendar follows them immediately.

## How booking works
* Customers only see open slots. Closed days, blocked time, slots that are too soon, and slots that are already full can't be picked.
* The server re-checks every booking. Writes use compare-and-swap, so two people can't grab the same slot even if they submit at the same moment.
* Customers can attach up to 4 photos. The browser shrinks them before upload.
* Optional email notices go through [Resend](https://resend.com) (see DEPLOY.md). Without it, appointments still show up on `/admin/`.

## Developer notes
```
npm install
export ADMIN_PASSWORD=choose-one SESSION_SECRET=random-string
npm run dev            # builds src/ -> public/ and runs netlify dev on :8888
ADMIN_PASSWORD=choose-one BASE=http://localhost:8888 npm test   # 16 end-to-end API tests
```
* `src/` holds templates (`{{config.x}}`, `{{> partial}}`, `{{i:icon}}`); `scripts/build.mjs` renders them into `public/`.
* `netlify/functions/`: `availability.mjs`, `book.mjs`, `admin.mjs`; shared logic is in `netlify/lib/core.mjs`.
* The shop's time zone is America/New_York.
