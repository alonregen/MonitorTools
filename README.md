# Monitor Tools

Static multi-tool web app that runs on **GitHub Pages** (client-side only: HTML, CSS, JS). Built as a single-page application (SPA) with hash-based routing.

## Running the app

**Static HTML/JS app. No server needed.**

- **GitHub Pages:** Push the repo to GitHub, enable Pages in repo Settings, then open `https://<username>.github.io/MonitorTools/`.
- **Locally:** **Do not open the MonitorTools folder in the browser** (that shows a file list). Instead, double‑click **`index.html`** or **`Open the app.html`** so the app loads. Use the file, not the folder.

## Features

- **HOME Page** – Welcome and links to all tools
- **Nested Search Query Builder** – Nested + Alert query modes; Condition vs JSON; convert, copy
- **Email Generator** – TSV payout data → emails grouped by gateway (alert blocks)
- **Tokens Extractor** – Extract `payment_token:`, `payout_token:`, and `payment_method:` (card payment, when value starts with `card_`) from text; copy buttons; error alert when input is empty
- **Analyze Logs** – Paste JSON logs → distribution chart (Chart.js) and summary

## Tech stack

- Bootstrap 5.3.3 (CDN)
- Font Awesome 6.5.1 (CDN)
- Chart.js 4.4.1 (CDN, for Analyze view)
- Vanilla JS (classic scripts, no build step); works from file:// and GitHub Pages

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

1. Push the repo to GitHub.
2. Go to the repo **Settings → Pages**.
3. **Source**: Deploy from a branch. **Branch**: `main` (or your default). **Folder**: `/ (root)`.
4. Save. After deployment, the app will be at `https://<username>.github.io/<repo>/`.
5. Open that URL (with a trailing slash) to use the app.

## Footer

The footer includes:
- Left: ©2024 Rapyd Financial Network (2016) Ltd
- Center: “Made By” and `ul#footerList` (credit: Alon R)
- Right: App Version and Updated date (in `index.html`)

## Legacy pages

`nested.html`, `email.html`, `tokens.html`, and `analyze.html` are redirect stubs that send users to `index.html#/nested`, etc., so old bookmarks still work.

## Version

Update the footer line in `index.html` (e.g. “App Version: 1.0.0 | Updated: 2026-02-15”) when releasing.
