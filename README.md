# AI Proxy Gateway

A single-command local AI proxy gateway. One command. No config files. No Docker. Just run it.

```bash
npx ai-proxy-gateway
```

That's it. You now have:
- An **OpenAI-compatible API** running at `http://localhost:4141/v1`
- A **dashboard** to manage your AI providers, view logs, and track costs
- **Multi-provider routing** — send requests to OpenAI, Anthropic, or Gemini through one endpoint

---

## Demo

<!-- REPLACE: Upload demo video to GitHub and paste the URL below -->
<!-- To upload: Edit this file on GitHub, drag & drop your video file into the editor -->

https://github.com/user-attachments/assets/f6bc8d7b-7b74-419c-af87-9592f59c24bc

---

## Screenshots

<!-- REPLACE: Upload screenshots to GitHub and paste the URLs below -->
<!-- To upload: Edit this file on GitHub, drag & drop images into the editor -->

### Dashboard

<img width="3836" height="1900" alt="screenshot1" src="https://github.com/user-attachments/assets/e45f5cc1-1c68-4907-8285-523db543bb11" />

### Services

<img width="3834" height="1904" alt="screenshot2" src="https://github.com/user-attachments/assets/e0734176-1737-4e36-9777-73ab9ca09ee8" />

### Logs

<img width="3840" height="1900" alt="image" src="https://github.com/user-attachments/assets/4875bd04-661c-495e-b737-42986483d73f" />


### Settings

<img width="3838" height="1912" alt="image" src="https://github.com/user-attachments/assets/ebc89567-30b2-4c4c-b85c-4cddd8312a32" />


---

## Why?

There are proxy tools like LiteLLM, but they require Python, config files, environment setup, and often Docker. This project takes a different approach:

- **One command** — `npx ai-proxy-gateway` and you're running
- **Zero config** — add your API keys through the dashboard UI
- **Just Node.js** — no Python, no Docker, no YAML files
- **Works with everything** — Claude Code, Cursor, Roo Code, OpenCode, Continue, or any OpenAI-compatible client

---

## Features

- **OpenAI-Compatible Proxy** — `/v1/chat/completions` and `/v1/models` endpoints with full streaming (SSE) support
- **Multi-Provider Routing** — automatically routes `gpt-*` → OpenAI, `claude-*` → Anthropic, `gemini-*` → Google Gemini, `deepseek-*` → DeepSeek, `@cf/*` → Cloudflare Workers AI
- **Dynamic Model Management** — add, remove, or auto-fetch models from each provider's API
- **Model Aliases** — create custom names like `fast` → `gpt-4o-mini` or `smart` → `claude-sonnet-4`
- **Dashboard** — real-time stats with d3 charts: request volume, provider split, activity heatmap, top models
- **Playground** — a scratch chat to test any service/model end-to-end, with streaming, latency and token counts
- **Request Logging** — every proxied request is logged with input/output tokens, latency, cost, and status
- **Cost Tracking** — automatic cost estimation with customizable per-model pricing
- **Service Management** — add, edit, enable/disable AI providers through the UI
- **Dark/Light Theme** — clean minimal UI with the Neural Canvas design system
- **SQLite Storage** — everything stored locally at `~/.ai-proxy-gateway/`

---

## Quick Start

### Requirements

- **Node.js 22+** (uses built-in `node:sqlite`)
- **npm**

### Run

```bash
npx ai-proxy-gateway
```

The gateway starts on port **4141** by default. Your browser opens to the dashboard automatically.

### Connect Your API Keys

1. Open `http://localhost:4141`
2. Go to **Services** → **Add Service**
3. Select your provider (OpenAI, Anthropic, or Gemini)
4. Paste your API key
5. Done — start sending requests

### Use It

The quickest check is the **Playground** tab in the dashboard — pick a model, send
a prompt, and confirm the service works before wiring up a client. It streams
through the same `/v1` path an external client uses, so anything you send there
also shows up in Logs.

To use it from your tools, point any OpenAI-compatible client at
`http://localhost:4141/v1`:

**Claude Code:**
```bash
ANTHROPIC_BASE_URL=http://localhost:4141 claude
```

**Cursor / Continue / Any OpenAI client:**
```
Base URL: http://localhost:4141/v1
```

**cURL:**
```bash
curl http://localhost:4141/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

---

## Configuration

### Port

```bash
# Environment variable
PORT=8080 npx ai-proxy-gateway

# CLI flag
npx ai-proxy-gateway --port 8080
```

### Data Directory

All data (SQLite database, config) is stored in `~/.ai-proxy-gateway/` by default. Override with:

```bash
PROXY_GATEWAY_HOME=/path/to/custom/dir npx ai-proxy-gateway
```

### Model Aliases

Create custom model names through the dashboard (Services → expand a service → Model Aliases):

| Alias | Target Model |
|-------|-------------|
| `fast` | `gpt-4o-mini` |
| `smart` | `claude-sonnet-4` |
| `cheap` | `gemini-2.0-flash` |

Then use them like any other model:

```bash
curl http://localhost:4141/v1/chat/completions \
  -d '{"model": "fast", "messages": [{"role": "user", "content": "Hi"}]}'
```

### Routing Rules

Requests are routed by model name prefix:

| Pattern | Provider |
|---------|----------|
| `gpt-*`, `o1`, `o3*` | OpenAI |
| `claude-*` | Anthropic |
| `gemini-*` | Google Gemini |
| `deepseek-*` | DeepSeek |
| `@cf/*` | Cloudflare Workers AI |
| Custom alias | Resolved to target model first |
| Any model in service_models | Routes to the owning service |

---

## Development

```bash
git clone https://github.com/doable-team/ai-proxy-gateway.git
cd ai-proxy-gateway
npm install
cd web && npm install && cd ..

# Start dev servers (API on :4141, Vite on :5173)
npm run dev
```

### Project Structure

```
├── src/                    # Server (TypeScript)
│   ├── index.ts            # CLI entry point
│   ├── types.ts            # Shared types
│   └── server/
│       ├── app.ts          # Express app
│       ├── db.ts           # SQLite setup + migrations
│       ├── proxy.ts        # OpenAI-compatible proxy router
│       ├── api/            # REST API (services, logs, stats, settings, aliases, models)
│       └── providers/      # Provider adapters (openai, anthropic, gemini, deepseek, cloudflare)
├── web/                    # Dashboard (React + Vite)
│   └── src/
│       ├── components/     # Layout, Sidebar, shadcn/ui components
│       ├── pages/          # Dashboard, Services, Playground, Logs, Settings
│       └── lib/            # API client, utilities
├── scripts/                # Build + seed scripts
├── DESIGN.md               # Design system reference
└── dist/                   # Production build output
```

### Build

```bash
npm run build          # Build server + web
npm start              # Run production build
```

### Tests

```bash
npm test               # Server unit + integration tests
cd web && npm test     # Frontend utility tests
npm run test:all       # Everything
```

---

## API Reference

### Proxy Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/chat/completions` | OpenAI-compatible chat completions (streaming supported) |
| `GET` | `/v1/models` | List all available models across providers |

### Dashboard API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/stats` | Dashboard statistics |
| `GET` | `/api/stats/timeseries` | 7-day request volume by provider |
| `GET` | `/api/stats/activity` | Per-active-day volume by provider (skips idle days) |
| `GET` | `/api/stats/heatmap` | Dense 7×24 weekday × hour request grid |
| `GET` | `/api/stats/providers` | Requests, tokens, cost and latency per provider |
| `GET/POST/PUT/DELETE` | `/api/services` | CRUD for AI provider services |
| `GET/POST/DELETE` | `/api/services/:id/models` | Manage models per service |
| `POST` | `/api/services/:id/models/fetch` | Auto-fetch models from provider API |
| `GET` | `/api/logs` | Paginated request logs (filterable) |
| `GET/POST/PUT/DELETE` | `/api/aliases` | Model alias management |
| `GET/PUT` | `/api/settings` | Gateway configuration |
| `GET/PUT` | `/api/settings/pricing` | Model pricing management |

---

## Tech Stack

- **Server**: Express + `node:sqlite` (built-in Node.js SQLite)
- **Frontend**: React 18 + Vite + Tailwind CSS v4 + shadcn/ui + Highcharts
- **Build**: esbuild (server), Vite (web)
- **Tests**: Vitest + Supertest

---

## License

MIT — see [LICENSE](LICENSE)

---

Made by [@doable-team](https://github.com/doable-team)
