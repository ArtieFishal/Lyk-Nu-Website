# Putting the Lyk-Nu website online (Netlify)

This guide is for someone who isn't a developer. Plan on about 20–30 minutes the first time.

> ## ⚠️ Important: do NOT use Netlify's drag-and-drop upload
> Netlify has a "drag and drop your site folder" box. **It does not work for this site.** Drag-and-drop uploads only plain pages. It does **not** set up the booking system (the "Netlify Functions" in `netlify/functions/`). The site would look fine, but **nobody could book an estimate and the owner page would not work.**
> Use **Option A (command line)** or **Option B (GitHub)** below.

---

## What you need
1. A free Netlify account: https://app.netlify.com/signup
2. **Node.js 20 or newer** (only for Option A): download the "LTS" installer from https://nodejs.org and click through it.
3. This project folder (unzip `lyknu-site.zip`).

---

## Option A: deploy from your computer (command line)

Open a terminal. On Windows that's "Command Prompt" or "PowerShell"; on Mac it's "Terminal". Run these one at a time:

```bash
cd path/to/lyknu-site          # the unzipped folder
npm install                    # downloads what the site needs (one time)
npm install -g netlify-cli     # installs Netlify's tool (one time)
netlify login                  # opens your browser; click "Authorize"
netlify init                   # choose "Create & configure a new project", pick your team, give it a name like lyknu
```
If `netlify init` asks for build settings, accept the defaults it shows (build command `npm run build`, publish directory `public`). They already come from `netlify.toml`.

**Set the owner's password.** This step is required. Without it the owner page stays locked:
```bash
netlify env:set ADMIN_PASSWORD "pick-a-strong-password-here"
netlify env:set SESSION_SECRET "any-long-random-text-like-k39dhQ02mzP"
```

**Publish:**
```bash
netlify deploy --build --prod
```
When it finishes it prints the live address, something like `https://lyknu.netlify.app`. To publish changes later, run `netlify deploy --build --prod` again from the same folder.

---

## Option B: deploy through GitHub (auto-updates)
1. Create a free GitHub account and a new **private** repository, then upload this folder's contents to it. GitHub's "Add file → Upload files" works, but leave out `node_modules` if it's there.
2. In Netlify, go to **Add new project → Import an existing project → GitHub** and pick the repository.
3. Netlify reads `netlify.toml` and fills in the build settings (build command `npm run build`, publish directory `public`, functions `netlify/functions`). Click **Deploy**.
4. Set the password as described below. Then go to **Deploys → Trigger deploy → Deploy site** so it takes effect.

After that, any change you commit on GitHub goes live automatically.

---

## Setting the owner password in Netlify's website (either option)
Go to **Project configuration → Environment variables → Add a variable** and add:

| Key | Value | Required? |
|---|---|---|
| `ADMIN_PASSWORD` | The password the owner will type on `/admin/` | **Yes** |
| `SESSION_SECRET` | Any long random text (keeps logins secure) | Strongly recommended |

The password is **never written in the website's code**. It lives only in Netlify. To change it, edit the variable and redeploy. Everyone who is logged in is signed out automatically, and logins expire after 12 hours anyway.

---

## Using the owner page
Go to `https://YOUR-SITE/admin/` (there is deliberately **no link** to it on the public site, so bookmark it) and enter the password.
* **Appointments:** upcoming estimate appointments, with the customer's phone, vehicle, damage description and photos. Use **Cancel** to free up a slot. Call the customer to let them know.
* **Block off time:** use this when you won't be at the shop: a whole day or a range of hours, for example "Out of town" or "Supplier meeting". Customers can't book those times. (This does not change the shop's posted hours.) There are quick buttons for "Block rest of today" and "Block tomorrow".
* **My availability:** your *estimate availability windows* (the hours each day you're available to do estimates, with an optional break), estimate length (e.g. 20 min), how many cars per time slot, the minimum notice (e.g. 2 hours), and how far ahead people can book. Also a **Major holidays** section: the shop is closed on major holidays by default; tick "Open anyway" to take bookings on a particular one.

All of this takes effect immediately; there's no need to redeploy.

---

## Optional: email notices for new bookings
Without this, bookings still show up on `/admin/`. To also get an email:
1. Create a free account at https://resend.com and verify the domain you'll send from (e.g. lyknu.com). Resend shows the DNS records to add.
Emails are sent only when `RESEND_API_KEY` and `NOTIFY_FROM` are set.

2. Add these environment variables in Netlify, then redeploy:

| Key | Example |
|---|---|
| `RESEND_API_KEY` | `re_xxxxxxxx` (from Resend) |
| `NOTIFY_FROM` | `Lyk-Nu Website <bookings@lyknu.com>` |
| `NOTIFY_TO` | Who gets new-booking emails. Optional: defaults to `notifyEmail` in `business.config.json` (mikefreeman@lyknu.com). Comma-separate for several. |
| `NOTIFY_CUSTOMER` | `true` to also email the customer a confirmation (optional) |

**What Mike's email contains, in order:** confirmation #, When, Name, Phone, Email, Vehicle, Insurance, the customer's Description, then the Photos line (and backup links) last. It is plain text.

**Photos in the email:** each customer photo (up to 4, 1.5 MB each, 20 MB cap overall) is attached to Mike's notification as `damage-<id>-N.jpg`, and the email also lists a link per photo. Those links are signed with `ADMIN_PASSWORD` + `SESSION_SECRET`, work for 30 days, and show only that one photo; changing either secret invalidates old links. The photos stay viewable any time in `/admin/` under the appointment.

---

## Later: moving to the real domain (lyknu.com or lyknew.com)
1. In Netlify, go to **Domain management → Add a domain** and type the domain (e.g. `lyknu.com`). Add `www.lyknu.com` as well.
2. Netlify shows DNS settings. At the company where the domain is registered (log in there), either:
   * switch the domain's **nameservers** to the 4 Netlify nameservers it lists (easiest), **or**
   * add the records Netlify shows: an `A` record for `@` pointing to Netlify's load-balancer IP, and a `CNAME` record for `www` pointing to `your-site.netlify.app`.
3. Wait for DNS to update (minutes to a few hours). Netlify then turns on free HTTPS automatically.
4. Add one more environment variable, `SITE_URL` = `https://lyknu.com` (your final address), and redeploy. Search engines and link previews then use the real domain.

Note: if email is on that domain (for example `@lyknu.com` addresses), **don't delete the existing MX/email records** when changing DNS. If you switch nameservers, copy the MX records into Netlify DNS first.

---

## Changing the text on the site
Business details (phone, hours shown on the page, address, reviews, services) are all in **`business.config.json`**. Edit it with any text editor (keep the quotes and commas), then redeploy (Option A: `netlify deploy --build --prod`; Option B: commit on GitHub).
Anything that starts with `TODO` is a placeholder that couldn't be confirmed online. It stays hidden until you fill it in.

## Before going live: please confirm with the owner
See the "Please confirm" list in the hand-off notes. Still open: exact Facebook and Google page links, certifications, and keeping the review rating current. (Towing is 24/7 with jumpstarts, lockouts and other roadside help; shop hours are Mon–Fri 8–5, closed on major holidays; the Limited Lifetime Warranty applies to paint only; commercial work is small commercial vehicles only.) Insurance names link to each company's own public website; these are not endorsements and the site says so.
