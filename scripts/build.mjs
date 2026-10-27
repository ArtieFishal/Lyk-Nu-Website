// Builds the static site: src/ + business.config.json -> public/
// Usage: node scripts/build.mjs   (Netlify runs this automatically via `npm run build`)
// Set SITE_URL (or Netlify's automatic URL) to emit absolute canonical/OG URLs and a sitemap.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'src'), OUT = path.join(root, 'public');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'business.config.json'), 'utf8'));
const SITE = (process.env.SITE_URL || process.env.URL || '').replace(/\/$/, '');
const warnings = [];

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isTodo = (v) => typeof v === 'string' && /^TODO/i.test(v.trim());
(function scan(o, p = '') {
  if (typeof o === 'string' && isTodo(o)) warnings.push(`${p}: ${o}`);
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (!k.startsWith('_')) scan(v, p ? `${p}.${k}` : k);
})(cfg);
const val = (v) => (isTodo(v) ? '' : v); // placeholders are hidden on the live site
const get = (p) => p.split('.').reduce((o, k) => (o == null ? o : o[k]), cfg);

const ICONS = {
  pin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="vertical-align:-2px"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>',
  clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="vertical-align:-2px"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10.4 3.5 2.1-.8 1.3L11 13V7h2z"/></svg>',
  phone: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="vertical-align:-3px"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V9h14zM7 11h5v5H7z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.4 14.6-4.2-4.2 1.4-1.4 2.8 2.8 5.6-5.6 1.4 1.4z"/></svg>',
  checkbig: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.6-4.6 1.4 1.4z"/></svg>',
  glass: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 7.5C6 5.8 9 5 12 5s6 .8 9 2.5l-1.6 8.6A2 2 0 0 1 17.4 18H6.6a2 2 0 0 1-2-1.9zm4.5 1.6-1 1 3.4 3.4 1-1zm4.5-.6-1 1 4.4 4.4 1-1z"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 14a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 0 0-7 0v6A3.5 3.5 0 0 0 12 14zm6-3.5a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.92V19H9.5a1 1 0 1 0 0 2h5a1 1 0 1 0 0-2H13v-2.58A6 6 0 0 0 18 10.5z"/></svg>',
  camera: '<svg width="30" height="30" viewBox="0 0 24 24" fill="#5b6573" aria-hidden="true"><path d="M9 3 7.2 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/></svg>',
  fb: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3 2 12h3v8h5v-5h4v5h5v-8h3z"/></svg>',
  truck: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 6h11v4h3.5l3.5 4v4h-2a2.5 2.5 0 0 1-5 0H10a2.5 2.5 0 0 1-5 0H3zm14 5v3h2.7L17.5 11zM7.5 17a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm9 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg>',
  star: '★',
};

const a = cfg.address || {};
const street = esc(a.street), city = esc(a.displayCity || a.city);
const mapQuery = encodeURIComponent(`${cfg.name}, ${a.street}, ${a.city}, ${a.state} ${a.zip}`);
const geo = cfg.geo && cfg.geo.lat ? `${cfg.geo.lat},${cfg.geo.lng}` : '';
const year = new Date().getFullYear();
const stars = (n) => '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n));

const hoursRows = (cfg.hoursDisplay || []).map((h) => `<tr><td>${esc(h.days)}</td><td>${esc(h.hours)}</td></tr>`).join('');
const r = cfg.rating || {};
const showRating = r.show && r.value && r.count;
const reviewsHtml = (cfg.reviews || []).filter((x) => x.text && !isTodo(x.text)).map((x) => `
        <figure class="review"><div class="stars" aria-label="${x.rating || 5} out of 5 stars">${stars(x.rating || 5)}</div>
          <blockquote>“${esc(x.text)}”</blockquote><figcaption>— ${esc(x.author || 'Customer')}${x.date ? ', ' + esc(x.date) : ''}</figcaption></figure>`).join('');
const social = cfg.social || {};
const ext = 'target="_blank" rel="noopener noreferrer"';
const NEWTAB = '<span class="sr-only"> (opens in a new tab)</span>';
// Facebook links open in the SAME tab and use the m. host: on iPhones a target=_blank link to www.facebook.com
// can fail iOS's universal-link hand-off to the Facebook app and bounce back. JSON-LD sameAs keeps the www URL.
const fbHref = val(social.facebook) ? social.facebook.replace('://www.facebook.com', '://m.facebook.com') : '';
const socialLinks = [
  fbHref && `<a href="${esc(fbHref)}" rel="noopener noreferrer" aria-label="${esc(cfg.name)} on Facebook">${ICONS.fb}<span>Facebook</span></a>`,
  val(social.google) && `<a href="${esc(social.google)}" ${ext}>Google${NEWTAB}</a>`,
  val(social.yelp) && `<a href="${esc(social.yelp)}" ${ext}>Yelp${NEWTAB}</a>`,
].filter(Boolean);
const email = val(cfg.email);
// insurance partners may be plain names or { name, url }
const insurers = (cfg.insurancePartners || []).map((x) => (typeof x === 'string' ? { name: x } : x)).filter((x) => x && x.name && !isTodo(x.name));

// ---------- JSON-LD ----------
const ld = {
  '@context': 'https://schema.org',
  '@type': ['AutoBodyShop', 'AutoRepair'],
  name: cfg.name,
  legalName: cfg.legalName || undefined,
  description: `Family owned and operated since ${cfg.foundedYear}. Collision repair, auto body and paint, full-service mechanic shop, 24/7 towing, jumpstarts, lockouts and other roadside help in ${a.displayCity || a.city}, Tennessee. Appointments preferred.`,
  telephone: cfg.phoneE164 || cfg.phone,
  faxNumber: val(cfg.fax) || undefined,
  email: email || undefined,
  foundingDate: cfg.foundedYear ? String(cfg.foundedYear) : undefined,
  address: { '@type': 'PostalAddress', streetAddress: a.street, addressLocality: a.city, addressRegion: a.state, postalCode: a.zip, addressCountry: a.country || 'US' },
  geo: geo ? { '@type': 'GeoCoordinates', latitude: cfg.geo.lat, longitude: cfg.geo.lng } : undefined,
  openingHours: cfg.hoursSchema && cfg.hoursSchema.length ? cfg.hoursSchema : undefined,
  areaServed: (cfg.serviceArea || []).filter((x) => !isTodo(x)).map((n) => /county/i.test(n)
    ? { '@type': 'AdministrativeArea', name: `${n}, TN` }
    : { '@type': 'City', name: `${n}, TN` }),
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Services',
    itemListElement: [
      ['Collision repair', 'Collision repair for passenger vehicles and small commercial vehicles.'],
      ['Auto body and paint', 'Body and fender work, straightening and refinishing.'],
      ['Mechanical repair', 'Full-service mechanic shop: general mechanical repair and computer diagnostics.'],
      ...(cfg.towing && cfg.towing.available247 ? [['24/7 towing', 'Towing and road service, available 24 hours a day, 7 days a week.']] : [['Towing and road service', 'Light-duty and rollback towing.']]),
      ['Jump starts', 'Jump-start service for vehicles with a dead battery.'],
      ['Lockout service', 'Unlocking vehicle doors for people locked out of their car.'],
      ['Roadside assistance', 'Jumpstarts, lockouts and other customer service requests from our tow truck. Just ask.'],
      ['Insurance claim repairs', 'We work with insurance claims and handle the claim process once the claim number is issued.'],
    ].map(([n, d]) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: n, description: d, areaServed: 'Campbell County, TN' } })),
  },
  sameAs: [social.facebook, social.yelp].map(val).filter(Boolean),
  hasMap: `https://www.google.com/maps/search/?api=1&query=${mapQuery}`,
  priceRange: '$$',
  url: SITE ? SITE + '/' : undefined,
  image: SITE ? SITE + '/assets/img/og-image.jpg' : undefined,
  logo: SITE ? SITE + '/assets/img/logo/lyknu-logo-full-1200.png' : undefined,
  potentialAction: SITE ? { '@type': 'ReserveAction', target: SITE + '/book/', name: 'Schedule a free estimate' } : undefined,
};
// Note: third-party ratings are intentionally NOT put in aggregateRating (Google's self-serving review policy).
delete ld.priceRange; // not verified
const jsonld = `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`;

const blocks = {
  BUILD: Date.now().toString(36),
  YEAR: String(year),
  YEARS: String(year - Number(cfg.foundedYear || year)),
  ABS: SITE,
  HOURS_SHORT: esc((cfg.hoursDisplay?.[0] ? `${cfg.hoursDisplay[0].days.replace('Monday – Friday', 'Mon–Fri')} ${cfg.hoursDisplay[0].hours}` : '')),
  HOURS_TABLE: `<table class="hours-table">${hoursRows}</table>`,
  HOURS_TABLE_DARK: `<table class="hours-table on-dark">${hoursRows}</table>`,
  RATING: showRating ? `<div class="rating-summary"><span class="big">${esc(r.value)}</span><div><div class="stars">${stars(r.value)}</div><div class="muted">${esc(r.count)} ${esc(r.source)} reviews${r.asOf ? ` (as of ${esc(r.asOf)})` : ''}</div></div></div>` : '',
  HERO_RATING: showRating ? `<div><strong>${esc(r.value)} <span class="stars" style="font-size:1.2rem">★</span></strong>${esc(r.count)} ${esc(r.source)} reviews</div>` : '',
  REVIEWS: reviewsHtml,
  REVIEW_LINK: val(social.google) ? `<a href="${esc(social.google)}" ${ext}>Read all reviews on Google →</a>` : '',
  JSONLD: jsonld,
  CANONICAL: '', // set per page below
  SOCIAL_LINKS: socialLinks.length ? `<p class="social-links">${socialLinks.join('')}</p>` : '',
  INSURANCE_LIST: insurers.map((x) => `<li>${x.url ? `<a class="insurer-link" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.name)}<span class="sr-only"> (official website, opens in a new tab)</span></a>` : `<span class="insurer-link">${esc(x.name)}</span>`}</li>`).join(''),
  INSURANCE_OPTIONS: insurers.map((x) => `<option value="${esc(x.name)}">${esc(x.name)}</option>`).join(''),
  INSURANCE_SENTENCE: (() => { const l = insurers.map((x) => x.name); return esc(l.length > 1 ? l.slice(0, -1).join(', ') + ' and ' + l.at(-1) : (l[0] || '')); })(),
  TOWING_NOTE: val(cfg.towingNote) ? `<div><dt>Towing</dt><dd><strong>24/7</strong> — <a href="tel:${esc((cfg.towing && cfg.towing.phoneE164) || cfg.phoneE164)}">${esc((cfg.towing && cfg.towing.phone) || cfg.phone)}</a>, any time, day or night.</dd></div>` : '',
  HOLIDAY_NOTE: val(cfg.holidayNote) ? `<p class="hours-note">${esc(cfg.holidayNote)}</p>` : '',
  MAP_SRC: `https://maps.google.com/maps?q=${geo ? encodeURIComponent(geo) + '+(' + encodeURIComponent(cfg.name) + ')' : mapQuery}&z=15&output=embed`,
  DIRECTIONS: `https://www.google.com/maps/dir/?api=1&destination=${mapQuery}`,
  SERVICE_AREA: esc((() => { const l = (cfg.serviceArea || []).filter((x) => !isTodo(x)); return l.length > 1 ? l.slice(0, -1).join(', ') + ' and ' + l.at(-1) : (l[0] || `${a.displayCity}, TN`); })()),
  FB_DD: fbHref ? `<div><dt>Facebook</dt><dd><a href="${esc(fbHref)}" rel="noopener noreferrer">Find us on Facebook</a></dd></div>` : '',
  EMAIL_DD: email ? `<div><dt>Email</dt><dd><a href="mailto:${esc(email)}">${esc(email)}</a></dd></div>` : '',
  EMAIL_LINE: email ? `<br><a href="mailto:${esc(email)}">${esc(email)}</a>` : '',
  FAX_LINE: val(cfg.fax) ? `<br>Fax: ${esc(cfg.fax)}` : '',
  USDOT_LINE: val(cfg.usdot) ? `USDOT ${esc(cfg.usdot)}` : '',
  FOOTER_BLURB: esc(`Family owned and operated since ${cfg.foundedYear}. Collision repair, paint & body, a full-service mechanic shop and 24/7 towing in ${a.displayCity || a.city}, Tennessee.`),
};

const partials = Object.fromEntries(fs.readdirSync(path.join(SRC, 'partials')).map((f) => [f.replace('.html', ''), fs.readFileSync(path.join(SRC, 'partials', f), 'utf8')]));

function render(html, pagePath) {
  for (let i = 0; i < 3; i++) html = html.replace(/\{\{>\s*(\w+)\s*\}\}/g, (_, n) => partials[n] ?? '');
  const canonical = SITE ? `<link rel="canonical" href="${SITE}${pagePath}">\n<meta property="og:url" content="${SITE}${pagePath}">` : '';
  return html.replace(/\{\{\s*([\w.:]+)\s*\}\}/g, (m, key) => {
    if (key.startsWith('i:')) return ICONS[key.slice(2)] ?? '';
    if (key === 'CANONICAL') return canonical;
    if (key in blocks) return blocks[key];
    const v = get(key);
    if (v === undefined) { warnings.push(`Unknown template token ${m} in ${pagePath}`); return ''; }
    return esc(val(v));
  });
}

// ---------- write output ----------
fs.rmSync(OUT, { recursive: true, force: true });
const pages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name), rel = path.relative(SRC, p);
    if (rel === 'partials') continue;
    const dest = path.join(OUT, rel);
    if (e.isDirectory()) { walk(p); continue; }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (e.name.endsWith('.html')) {
      const urlPath = '/' + rel.replace(/\\/g, '/').replace(/index\.html$/, '');
      fs.writeFileSync(dest, render(fs.readFileSync(p, 'utf8'), urlPath));
      if (!/404|admin/.test(rel)) pages.push(urlPath);
    } else fs.copyFileSync(p, dest);
  }
})(SRC);

fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nDisallow: /admin/\nDisallow: /api/\n${SITE ? `Sitemap: ${SITE}/sitemap.xml\n` : ''}`);
if (SITE) {
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join('\n')}\n</urlset>\n`);
}

console.log(`Built ${pages.length} public pages into public/ ${SITE ? `(site URL ${SITE})` : '(no SITE_URL/URL set: canonical + sitemap omitted)'}`);
if (warnings.length) {
  console.warn(`\n⚠  ${warnings.length} placeholder(s) in business.config.json are hidden on the site until confirmed:`);
  for (const w of warnings) console.warn('   - ' + w);
}
