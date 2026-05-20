# Watchdog

A desktop app that watches the web for you:

- **Website Radar** — track pages, detect when their content changes, and get a one-sentence AI summary of what changed.
- **Price Monitor** — track product pages, record a price-history graph, and get a native Windows notification when the price drops to (or below) your target.

Built as an Electron desktop app with a React + Vite frontend and a FastAPI + SQLite backend. AI summaries are produced by a local Ollama model so nothing leaves your machine.

## Tech stack

| Layer | Tools |
|---|---|
| Desktop shell | Electron |
| Frontend | React, TypeScript, Vite, TailwindCSS, Recharts, lucide-react |
| Backend | Python, FastAPI, Uvicorn, APScheduler |
| Storage | SQLite (via stdlib `sqlite3`) |
| Scraping | `cloudscraper`, `beautifulsoup4` |
| AI summaries | Local Ollama (`qwen3.5:4b` by default) |

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11+ (project is developed against 3.14)
- **Ollama** running locally on `http://127.0.0.1:11434` if you want AI website-change summaries. Pull the model once:
  ```
  ollama pull qwen3.5:4b
  ```
  Without Ollama the rest of the app still works — change summaries just show a fallback message.

## Setup (first time only)

From the project root `c:\own_ai\watch_dog`:

```powershell
# 1. Python virtualenv + backend deps
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt

# 2. Frontend deps (Electron, React, etc.)
npm install
npm --prefix frontend install
```

## Run it

From the project root:

| Command | What it does |
|---|---|
| `npm run dev` | Launches the desktop window (Electron) with the backend auto-started. **Use this normally.** |
| `npm run dev:web` | Starts backend + Vite only. Open `http://localhost:5173` in any browser. Use for browser-based testing. |
| `npm run backend` | Starts the FastAPI backend on its own, on port `8765`. Skips spawn if one is already up. |
| `npm run frontend` | Starts the Vite dev server + Electron without the auto-backend wrapper. |
| `npm run kill-backend` | Force-kill anything currently bound to port `8765`. Useful if a previous run left an orphan. |

After launch, the top-right corner shows a status pill — green `Running` means the backend is reachable; if it's red, click **Start Service** to spawn it.

## How it works

- **Website Radar**: stores a SHA-256 hash of the page's visible text. The scheduler refetches every 30 minutes; if the hash changes, it asks the local Ollama model for a one-sentence summary of what changed and appends it to the change history. Expanding a card also shows a live list of article/post links scraped from the page.
- **Price Monitor**: extracts price + currency from a product page using JSON-LD `Product` / `Offer` structured data, Open Graph `product:price:*` meta tags, Amazon-specific selectors, and a currency-prefixed text fallback (with sanity checks to reject implausible values from CAPTCHA pages). Every 15 minutes the scheduler rechecks all tracked products; new prices land in `price_history`. The expanded card shows a filled area chart, a running-minimum line, lowest/highest/average stats, and a Buy It Now link.
- **Notifications**: when a manual `Check now` finds a price ≤ your target, the Electron main process fires a native Windows notification.

## Project layout

```
watch_dog/
├── backend/
│   ├── run.py              # Launcher: pings :8765, skips spawn if alive
│   ├── requirements.txt
│   ├── watchdog.db         # SQLite (gitignored)
│   └── app/
│       ├── main.py         # FastAPI routes, APScheduler jobs
│       ├── db.py           # Schema + lightweight migrations
│       ├── scraper.py      # Price / rating / article / summary extractors
│       ├── ollama.py       # Local LLM client for change summaries
│       └── schemas.py      # Pydantic request models
├── frontend/
│   ├── electron/
│   │   ├── main.ts         # BrowserWindow + IPC + backend bootstrap
│   │   └── preload.ts      # contextBridge — exposes electronAPI to the renderer
│   └── src/
│       ├── App.tsx         # Single-page dashboard (Website Radar + Price Monitor tabs)
│       ├── api.ts          # REST client
│       └── types.ts        # Shared types
└── package.json            # Root scripts (dev / dev:web / backend / kill-backend)
```

## API surface (FastAPI, `http://127.0.0.1:8765`)

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/health` | Liveness probe |
| `GET`  | `/websites` | List tracked websites |
| `POST` | `/websites` | Track a new website (also seeds title/description on add) |
| `DELETE` | `/websites/{id}` | Stop tracking |
| `POST` | `/websites/{id}/check` | Force-recheck now |
| `GET`  | `/websites/{id}/updates` | AI-summary change history |
| `GET`  | `/websites/{id}/items` | Live-scraped article/post links from the page |
| `GET`  | `/products` | List tracked products |
| `POST` | `/products` | Track a new product (extracts initial price/rating/image) |
| `DELETE` | `/products/{id}` | Stop tracking |
| `POST` | `/products/{id}/check` | Force-recheck now (fires desktop notification on target hit) |
| `GET`  | `/products/{id}/history` | Price history points for the graph |
| `POST` | `/summarize` | Ad-hoc text diff summary via Ollama |

## Troubleshooting

- **"Failed to fetch" / red banner in the UI** — backend isn't on `:8765`. Run `npm run backend` in another terminal, or click **Start Service** in the top-right.
- **`WinError 10013` on `npm run dev`** — port `8765` is already bound by a leftover process from a previous run. Run `npm run kill-backend` and try again.
- **No window appears after `npm run dev`** — wait a few seconds; Electron has to compile its TS and spin up. If it still doesn't appear, try `npm run dev:web` and open `http://localhost:5173` to confirm the frontend itself is healthy.
- **Price shows `—`** — the site either blocked the scrape (Amazon CAPTCHA on shortlinks is the common case) or doesn't expose a parseable price. Try the full canonical product URL rather than a shortlink.
- **Iframe blank for some site** — only relevant in the old iframe-based view; the current Website Radar shows a scraped article list instead.

## License

Personal project — use at your own risk. No warranty.
