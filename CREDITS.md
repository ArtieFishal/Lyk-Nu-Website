# Image credits

## Lyk-Nu shop photos (used with the owner's permission)
Franklyn supplied these photos (originals are in the `images/` folder of the GitHub repo), and the owner OK'd using them on the website. For the web versions:
- every one was resized and converted to WebP (large ≤1600px wide, plus an 800px version);
- **all EXIF/GPS metadata was stripped** (photo5 was a straight iPhone 15 Pro Max photo with full camera metadata);
- **readable license plates were blurred**: the pickup parked at the left edge of photo1 and the front plate of the rollback in photo6.

| Original | What it shows | Where it's used on the site |
|---|---|---|
| `images/photo5.jpg` | Candy-red lifted Ford Excursion in the shop bay | Home hero (`hero-shop`), social share image (`og-image.jpg`) |
| `images/photo2.jpg` | Red/silver Chevy pickup with the front end torn down and the cab masked for paint | Not currently used on the site (replaced on the "Collision Repair" card by the Ford sedan photo) |
| `images/photo1.jpg` | Same Chevy finished, side view outdoors | Not currently used on the site (the "Our Work" gallery was removed to avoid repeating photos) |
| `images/photo3.jpg` | Same Chevy finished, front three-quarter view | "Auto Body & Paint" card (`body-paint-work`) |
| `images/photo4.jpg` | Wide view of the shop floor with the Chevy in for repair | "About" section (`shop-floor`) |
| `images/photo6.jpg` | Lyk-Nu rollback tow truck (USDOT 624512 on the bed) | "Towing & Road Service" card (`towing-flatbed`) |
| `images/photo7.jpg` | Lyk-Nu wrecker in front of the shop building | Not currently used on the site (gallery removed) |
| `paint-booth-interior.jpg` (added later; replaced the closed-doors booth photo) | Inside the downdraft paint booth: side lighting and floor grates | Home "Paint department" feature (`paint-booth-interior`) |
| `paint-mixing-room.jpg` (added later) | Paint mixing room with PPG Envirobase shelves | Home "Paint department" feature (`paint-mixing-room`) |
| `alignment-lift.jpg` (added later; replaced the stock mechanic photo) | Blue two-post lift with a John Bean Visualiner alignment machine behind it and a white truck on the lift | "Mechanical Repair" card, left half of the photo pair (`alignment-lift`) |
| `tire-changer-balancer.jpg` (added later) | Coats Maxx tire changer and Hunter wheel balancer (web version cropped to portrait around both machines) | "Mechanical Repair" card, right half of the photo pair (`tire-changer-balancer`) |
| `collision-repair-ford.jpg` (added later; replaced the Chevy pickup photo) | Dark gray Ford sedan mid-repair: rear quarter panel in white primer with green masking tape, rear bumper off, trunk open (web version cropped to landscape around the repair area) | "Collision Repair" card (`collision-repair-ford`) |

The "Our Work" gallery was removed because its photos repeated the service-card photos; the gallery image files were deleted from the project (still in git history).

## Stock photos
None. The last stock photo (the Unsplash engine-bay picture on the "Mechanical Repair" card) was replaced with the shop's own photos and its files were deleted.

## Logo
The Lyk-Nu logo is the shop's own artwork, supplied by the shop owner's team (originals in the repo: `images/logo-originals/Lyk-Nu Logo.png` = "LYK-NU" wordmark, `images/logo-originals/Lyk-Nu Full Logo.png` = wordmark plus "AUTO COLLISION & SERVICE CENTER" tagline). Nothing about the artwork was redrawn; it was only given a transparent background and resized.

| File (`src/assets/img/logo/`) | Derived from | Used in |
|---|---|---|
| `lyknu-logo-full-600/1200 .webp/.png` | Full logo with tagline | Header (all pages, on white), admin header, footer (on a white plate), schema.org `logo` (1200 PNG) |
| `lyknu-wordmark-400/800 .webp/.png` | Wordmark | Not currently used on pages (kept for reuse) |
| `favicon-32.png`, `favicon-192.png`, `apple-touch-icon.png`, `/favicon.ico` | Letters of the wordmark stacked as "LYK / NU" on white | Browser tab icon, home-screen icon |
| `../og-image.jpg` | Full logo over a blurred-dark shop photo | Link preview (Facebook, iMessage, etc.) |
| `images/logo-transparent/*.png` (not published on the site) | Full-resolution transparent cutouts | Reuse (print, signage, social) |

## Fonts (self-hosted, no third-party requests)
| Font | Files (`src/assets/fonts/`) | License |
|---|---|---|
| Barlow Condensed (600, 700, 800), by Jeremy Tribby | `barlow-condensed-latin-*-normal.woff2` | [SIL Open Font License 1.1](https://openfontlicense.org), via [Fontsource](https://fontsource.org) |
| Inter (variable), by Rasmus Andersson | `inter-latin-wght-normal.woff2` | [SIL Open Font License 1.1](https://openfontlicense.org), via [Fontsource](https://fontsource.org) |

## Insurance company links
The insurance names on the home page link to each company's official public website. They are text links only (no logos or trademarks are used) and the site states that Lyk-Nu is not affiliated with or endorsed by those companies.
