# Image credits

## Lyk-Nu shop photos (used with the owner's permission)
Franklyn supplied these photos (originals are in the `images/` folder of the GitHub repo), and the owner OK'd using them on the website. For the web versions:
- every one was resized and converted to WebP (large ≤1600px wide, plus an 800px version);
- **all EXIF/GPS metadata was stripped** (photo5 was a straight iPhone 15 Pro Max photo with full camera metadata);
- **readable license plates were blurred**: the pickup parked at the left edge of photo1 and the front plate of the rollback in photo6.

| Original | What it shows | Where it's used on the site |
|---|---|---|
| `images/photo5.jpg` | Candy-red lifted Ford Excursion in the shop bay | Home hero (`hero-shop`), social share image (`og-image.jpg`), gallery (featured) |
| `images/photo2.jpg` | Red/silver Chevy pickup with the front end torn down and the cab masked for paint | "Collision Repair" card (`collision-damage`), gallery **Before** |
| `images/photo1.jpg` | Same Chevy finished, side view outdoors | Gallery **After** |
| `images/photo3.jpg` | Same Chevy finished, front three-quarter view | "Auto Body & Paint" card (`body-paint-work`), gallery |
| `images/photo4.jpg` | Wide view of the shop floor with the Chevy in for repair | "About" section (`shop-floor`), gallery |
| `images/photo6.jpg` | Lyk-Nu rollback tow truck (USDOT 624512 on the bed) | "Towing & Road Service" card (`towing-flatbed`), gallery |
| `images/photo7.jpg` | Lyk-Nu wrecker in front of the shop building | Gallery |

Gallery files: `src/assets/img/gallery/shop-N.webp` and `shop-N-sm.webp`, where N is the photo number above.

## Stock photo (still used where no shop photo fits)
| File | Used for | Source | License |
|---|---|---|---|
| `mechanical-repair` | "Mechanical Repair" card | https://unsplash.com/photos/nkdv9cqz9VE (photographer @ilhamrahmat) | [Unsplash License](https://unsplash.com/license): free for commercial use, no attribution required |

If the shop has a photo of mechanical work (a car on a lift, engine work), replace `src/assets/img/mechanical-repair.webp` and `-sm.webp` with it. The site will then use no stock images at all.

## Logo
`src/assets/logo-mark.svg` is a simple placeholder "LN" badge. It is **not** the shop's official logo. The tow trucks carry a "Lyk-Nu" script logo; if the owner has that artwork as a file, it should replace the placeholder.
