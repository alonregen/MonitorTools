# Monitor Tools

Static multi-tool web app that runs on **GitHub Pages** (client-side only: HTML, CSS, JS). Built as a single-page application (SPA) with hash-based routing.

## Live site (GitHub Pages)

After you enable **Pages** with **GitHub Actions**, the published URL is typically:

- **Project site:** `https://<username>.github.io/<repository>/` (for example `https://<username>.github.io/MonitorTools/`)
- **User/org site:** `https://<username>.github.io/` only applies when this repository is named `<username>.github.io`.

Routes use the hash, for example `https://<username>.github.io/MonitorTools/#/checklist` or `.../#/home`.

In the repository, go to **Settings → Pages → Build and deployment** and set the source to **GitHub Actions** (not “Deploy from a branch”) so [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml) runs on push to `main` and uploads the static tree.

## Running the app

**Static HTML/JS app. No server needed.**

- **GitHub Pages:** Push to `main` with Actions enabled; open your Pages URL and append a hash route if needed (e.g. `#/home`).
- **Locally:** **Do not open the MonitorTools folder in the browser** (that shows a file list). Instead, double‑click **`index.html`** or **`Open the app.html`** so the app loads. Use the file, not the folder.

## Features

- **HOME Page** – Welcome and links to all tools
- **Nested Search Query Builder** – Nested + Alert query modes; Condition vs JSON; convert, copy
- **Email Generator** – TSV payout data → emails grouped by gateway (alert blocks)
- **Tokens Extractor** – Extract `payment_token:` and `payout_token:` from text; copy buttons; error alert when input is empty
- **Analyze Logs** – Paste JSON logs → distribution chart (Chart.js) and summary
- **Shift Checklist** – Interactive checklist with local history retention (last 6), export actions, and optional frontend history password gate

## Tech stack

- Tailwind CSS (CDN) + small custom theme in `index.html`
- Font Awesome 6.5.1 (CDN)
- Chart.js 4.4.1 (CDN, statistics and analyze views)
- Vanilla JS (classic scripts, no build step); works from `file://` and GitHub Pages

## Project structure

```
MonitorTools/
├── index.html          # SPA entry; navbar (Rapyd logo), footer (ul#footerList), <div id="app">
├── nested.html         # Redirect stub → index.html#/nested
├── email.html          # Redirect stub → index.html#/email
├── tokens.html         # Redirect stub → index.html#/tokens
├── analyze.html        # Redirect stub → index.html#/analyze
├── img/
│   └── Rapyd-logo.png  # Navbar logo (optional; hidden if missing)
├── css/
│   └── styles.css      # Theme, navbar, footer, utilities
├── js/
│   ├── app.js          # Hash router; mounts views into #app
│   ├── lib/
│   │   └── dom.js      # byId, query, queryAll, escapeHtml, setHtml, copyToClipboard
│   └── views/
│       ├── home.js
│       ├── nested.js
│       ├── email.js
│       ├── tokens.js
│       ├── analyze.js
│       └── _template.js   # Scaffold for new tools
├── .gitignore             # Local-only: node_modules, coverage, test artifacts
└── README.md
```

## Routing

| Hash        | View    |
|------------|--------|
| `#/home`   | HOME Page |
| `#/nested` | Nested Search Query Builder |
| `#/email`  | Email Generator |
| `#/tokens` | Tokens Extractor |
| `#/analyze`| Analyze Logs |

Default route is `#/home`. Navbar active link uses `data-route` and `.active` class.

## How to add a new tool tab

1. **Create a view file**  
   Copy `js/views/_template.js` to e.g. `js/views/mytool.js`. Export an object with `route`, `navLabel`, `render()`, `mount(rootEl, context)`, and optional `unmount()`.

2. **Register in the router**  
   In `js/app.js`:  
   - `import { myToolView } from './views/mytool.js';`  
   - Add `{ path: 'mytool', view: myToolView }` to the `routes` array.

3. **Add a hash link in the navbar**  
   In `index.html`, inside the navbar `<ul>`, add:  
   `<li class="nav-item"><a class="nav-link" href="#/mytool" data-route="mytool">My Tool</a></li>`

4. **Use relative paths**  
   All assets use relative paths (e.g. `css/styles.css`, `js/app.js`, `img/...`) so the app works on GitHub Pages under `https://<username>.github.io/<repo>/`.

## Will it work from a GitHub Pages link?

**Yes.** The app is set up to run from a GitHub Pages URL (e.g. `https://<username>.github.io/MonitorTools/`):

- **Relative paths only** – All assets use relative paths (`css/styles.css`, `js/app.js`, `img/...`), so they load correctly under the repo subpath.
- **`<base href="./">`** – In `index.html` so CSS, JS, and images resolve correctly even when the page URL has no trailing slash.
- **Hash routing** – Routes use `#/home`, `#/nested`, etc. No server config needed; the same `index.html` is served and the router runs in the browser.
- **ES modules** – Supported on GitHub Pages; `import` paths are relative and resolve against the script URL.

Use the **full URL with trailing slash** when sharing: `https://<username>.github.io/MonitorTools/`

## Deploy on GitHub Pages

**Recommended if you use checklist “Send Email” (Web3Forms):** deploy with **GitHub Actions** so the key lives in **Repository secrets**, not in git.

1. Push the repo to GitHub.
2. **Settings → Secrets and variables → Actions → New repository secret**
   - `WEB3FORMS_ACCESS_KEY` — your Web3Forms access key (this **is** written into generated `js/config.local.js` on deploy, so treat the live site as exposing it to anyone who loads the app—same as any static API key pattern).
   - Optional: `CHECKLIST_OWNER_EMAIL` — used as the Web3Forms submitter field when supported.
3. **Settings → Pages → Build and deployment → Source:** choose **GitHub Actions** (not “Deploy from a branch”). If you previously used branch deploy, switch to Actions so only the workflow publishes the site.
4. The workflow **`.github/workflows/deploy-pages.yml`** runs on every push to **`main`**: it runs `node scripts/inject-local-env.mjs --ci`, then uploads the repo root (including generated `js/config.local.js`) to Pages. **The shift history password is not injected in CI** (so it does not appear in public `config.local.js`). Use **Shift history** / unlock and type the password in the browser, or set `SHIFT_HISTORY_PASSWORD` only in local `.env.local` for development. Deliberate opt-in to embed it in Pages exists only via `INJECT_SHIFT_HISTORY_PASSWORD_IN_PAGES=true` in the workflow env (not recommended).
5. If your default branch is not `main`, edit the `on.push.branches` list in that workflow file.

The live site URL: `https://<username>.github.io/<repo>/` (use a trailing slash when sharing).

**Simpler option (no Actions):** **Source → Deploy from a branch** (`main`, `/ (root)`). The app works, but Web3Forms will not be configured unless you commit a key (not recommended) or only use email locally via `.env.local`.

## Deploy on Netlify (optional)

You can host the same static tree on [Netlify](https://www.netlify.com/) using [`netlify.toml`](netlify.toml): build command `node scripts/inject-local-env.mjs --ci`, publish directory `.` (same as GitHub Actions inject).

### Site-wide username/password (Shift history and entire app)

The app uses **hash routes** (`#/shift-history`, `#/home`, …). The server only sees paths like `/` and `/index.html`, so Netlify cannot apply HTTP auth to “Shift history only”; the practical option is to protect the **whole site**.

An Edge Function at [`netlify/edge-functions/site-gate.js`](netlify/edge-functions/site-gate.js) enforces **HTTP Basic Auth** when both of these are set in the Netlify UI:

- **`BASIC_AUTH_USER`**
- **`BASIC_AUTH_PASSWORD`**

**Important:** In **Site configuration → Environment variables**, these must be available to **Functions** (Edge Functions read them at request time via `Netlify.env`). Build-time variables alone are not enough for the gate. The build still uses the same keys as GitHub Actions (`WEB3FORMS_ACCESS_KEY`, optional `CHECKLIST_OWNER_EMAIL`, optional inject flags) from Build env as documented in `netlify.toml`.

If **either** Basic Auth variable is set but not the other, the site responds with **503** (misconfiguration). If **both** are unset or empty, the gate is **off** (useful for previews or local `netlify dev` without secrets).

Paths under **`/.well-known/`** are excluded from the Edge Function in `netlify.toml` so challenges such as ACME can still be served.

### Shift history section login (Netlify Functions secrets)

Because the app uses **hash routes**, the server cannot gate only `#/shift-history` at the CDN. Optional **section** protection uses a Netlify Function and **HttpOnly cookies** (credentials are never embedded in static JS):

- **`SHIFT_HISTORY_SECTION_USER`** and **`SHIFT_HISTORY_SECTION_PASSWORD`** — when **both** are set (Functions env), the **`/api/shift-history-section-gate`** endpoint and **`/api/shift-history`** require a valid signed session cookie. If only one of user/password is set, the gate responds with **503** (misconfiguration), same pattern as site-wide Basic Auth.
- **`SHIFT_HISTORY_SECTION_COOKIE_SECRET`** — long random secret used to HMAC-sign the session cookie; **required** whenever user and password are set. If it is missing, the gate returns **503**.

The **Shift history** page calls `GET /api/shift-history-section-gate` to learn whether the gate is enabled; if it is, the user signs in on that page until `POST` succeeds and the browser stores the cookie. **Sign out** clears the cookie. Site-wide **`BASIC_AUTH_*`** can still apply first (browser prompts before any asset loads); the section cookie is an additional check for shift history and the shift-history API.

**Limitation:** Plain shift snapshots in **browser `localStorage`** are still readable on the same origin without the section cookie (e.g. via DevTools). This feature protects normal use and **cloud** history at `/api/shift-history`; it is not DRM against a determined same-origin attacker.

### Shift history password vs Basic Auth

- **Basic Auth:** Stops anonymous visitors from loading HTML, JS, or assets. Credentials never belong in git; set them only in Netlify.
- **`SHIFT_HISTORY_PASSWORD`:** Still encrypts checklist history in the browser. By default, CI does **not** embed it in `js/config.local.js` (users type it after opening the site). If the site is only for your team behind Basic Auth, you *may* set `INJECT_SHIFT_HISTORY_PASSWORD_IN_PAGES=true` and `SHIFT_HISTORY_PASSWORD` in **build** env so the inject script embeds it—anyone who knows the **HTTP Basic** credentials can still extract that value from downloaded JS, so treat that as a convenience tradeoff, not a second layer against teammates.

Test locally with the [Netlify CLI](https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/): `netlify dev` (set Basic Auth env in the Netlify site or `.env` as documented for CLI-linked sites).

## Footer

The footer includes:
- Left: ©2024 Rapyd Financial Network (2016) Ltd
- Center: “Made By” and `ul#footerList` (credit: Alon R)
- Right: App Version and Updated date (in `index.html`)

## Legacy pages

`nested.html`, `email.html`, `tokens.html`, and `analyze.html` are redirect stubs that send users to `index.html#/nested`, etc., so old bookmarks still work.

## Version

Update the footer line in `index.html` (e.g. “App Version: 1.0.0 | Updated: 2026-02-15”) when releasing.

## Shift History Password Gate (GitHub Pages)

The checklist history panel supports a browser-side password gate for convenience/privacy.

- Set one of these globals before `js/views/checklist.js` loads:
  - `window.MONITOR_TOOLS_SHIFT_HISTORY_PASSWORD = "your-password"`
  - or `window.__MONITOR_TOOLS_CONFIG__ = { shiftHistoryPassword: "your-password" }`
- If neither is set **and** there is no encrypted history blob in `localStorage` yet, shift history still works in **plain** mode: the Shift history page lists snapshots from this browser (and cloud sync when `MONITOR_TOOLS_SHIFT_HISTORY_NETLIFY_DB` is enabled) without a passphrase. Optional encryption (password and/or encrypted-at-rest blob) is for teams that want that extra step.
- History is stored in browser `localStorage` and automatically trimmed to the latest 6 snapshots.
- When a password is set and the browser supports **Web Crypto**, those snapshots are stored **encrypted at rest** (PBKDF2 + AES-GCM). The checklist UI still unlocks with the same password; while locked, the decrypted list is not kept on the in-memory `state` object (only an encrypted blob is written to `localStorage`).

Important:
- This is **not** true security on a static site. If you ever **do** put the password into shipped JS (local `config.local.js` or the optional CI embed flag), it can be read from the network or source like any other static asset.
- **GitHub Actions deploy (default):** the workflow does **not** write `SHIFT_HISTORY_PASSWORD` into `js/config.local.js`, so that secret is **not** exposed on the public site—users unlock history by **typing** the password in the UI.
- For real access control, use a backend authentication flow, or a host-level gate such as **HTTP Basic Auth on Netlify** (see [Deploy on Netlify](#deploy-on-netlify-optional)).

### Encrypted file backup (safe to commit to git)

Checklist data normally lives only in the browser (`localStorage`) and is **not** in the repository. If you want a **copy in git** without readable secrets:

1. On the **Shift checklist** (or **Shift history**) page, use **Export backup** under *Encrypted backup (git-safe)*.
2. **Password behavior:** If `SHIFT_HISTORY_PASSWORD` is present in the loaded app (from local `js/config.local.js` via `npm run local-config`, or from CI only if you set `INJECT_SHIFT_HISTORY_PASSWORD_IN_PAGES=true`), export uses that **same shift-history password** after a confirm dialog—no separate “file password.” If no password is loaded in the browser (typical public GitHub Pages build), export **asks you for a password** (twice to confirm); use the same value your team uses for shift history so imports stay consistent.
3. Commit only the downloaded `monitor-tools-checklist-backup-*.enc.json` file. It contains **ciphertext** (`kind`, `v`, `salt`, `iv`, `ct`)—there is no usable checklist data in git without that password.
4. **Import** tries the configured shift-history password first when it exists; otherwise it prompts. Wrong password or a file encrypted with a different passphrase falls back to a prompt (when configured) or shows an error.
5. **Do not** commit `.env.local`, `js/config.local.js`, or any password. **Repository secrets** (GitHub Actions) do **not** automatically encrypt in the browser: the static app never sees `SHIFT_HISTORY_PASSWORD` unless it is written into shipped JS (local dev) or you opt into the inject flag (not recommended for public sites).

The live **HTML/JS** of the site in git remains public; this feature only protects **backup files** you choose to add. Anyone can still fork the repo and see the app code.

## Shift Checklist Auto Email (Web3Forms)

The checklist `Send Email` button can send directly from the page (no mail client popup).

- Set one of these globals before `js/views/checklist.js` loads:
  - `window.MONITOR_TOOLS_WEB3FORMS_ACCESS_KEY = "your-web3forms-access-key"`
  - or `window.__MONITOR_TOOLS_CONFIG__ = { web3formsAccessKey: "your-web3forms-access-key" }`
- If no key is set, the checklist shows a clear missing-key message when sending.

### Local secrets (not committed)

1. Copy `.env.local.example` to `.env.local` and set `WEB3FORMS_ACCESS_KEY` (and optionally `SHIFT_HISTORY_PASSWORD`).
2. Run `npm run local-config`, or use `npm run start` / `npm run serve` (they run `npm run build:css` then inject env via `prestart` / `preserve`). That writes `js/config.local.js`, which is gitignored. Tailwind output goes to `css/tailwind.css` (gitignored; CI runs `npm run build:css` before deploy).
3. **Commit:** `.env.local.example`, `scripts/inject-local-env.mjs`, and `.gitignore` entries — never `.env.local` or `js/config.local.js`.

Note:
- In a static frontend, this key is publicly accessible in shipped JS/HTML.
- For fully secure mail sending, use a backend endpoint instead.
