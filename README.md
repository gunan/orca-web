# Orca Web

A self-hosted web interface that runs the **real OrcaSlicer CLI** on your server. Upload an STL, OBJ, or 3MF model, choose a print intent, and download generated G-code—no Selkies, VNC, or streamed desktop required.

> **Project stage:** This is the first end-to-end vertical slice, not yet a replacement for every desktop control. It proves the durable architecture and core upload → native slicing → download workflow. Printer/filament preset import and the full parameter editor are the next milestones.

## Architecture

```text
Browser (React) → HTTP API (Node/Express) → OrcaSlicer CLI → persistent G-code
```

The server does not reimplement slicing. `server/slicer.js` invokes OrcaSlicer's headless `--slice` mode, keeping toolpath generation in the upstream engine while replacing only its desktop UI. Jobs survive a server restart; an interrupted job is marked failed rather than left permanently active.

## Run locally

Requirements: Node.js 20+ and a Linux OrcaSlicer executable.

```bash
npm install
npm run build
ORCA_SLICER_BIN=/path/to/OrcaSlicer npm start
```

Open <http://localhost:3000>. During UI development, run the API on port 3000 and `npm run dev` (Vite proxies `/api`).

## Deploy with Docker Compose

The image intentionally does not redistribute OrcaSlicer. Download an official Linux build on the host and mount its executable into the container:

```bash
export ORCA_SLICER_BIN=/absolute/path/to/OrcaSlicer
docker compose up --build -d
```

Application state is stored in the `orca-data` volume and the site is exposed on port 3000. Put it behind your existing HTTPS reverse proxy. Do not expose the current version directly to the public internet: authentication is not part of this milestone.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness and configured slicer |
| `GET` | `/api/profiles` | Available print intents |
| `POST` | `/api/jobs` | Multipart upload (`model`, `profile`) |
| `GET` | `/api/jobs/:id` | Poll job status |
| `GET` | `/api/jobs/:id/download` | Download completed G-code |

Uploads are limited to 500 MB and to `.stl`, `.obj`, and `.3mf` filenames. Output download names are sanitized. For production, also configure upload limits in your reverse proxy and isolate the service from untrusted networks.

## Test strategy

Tests use a tiny fake CLI with the same process boundary; no OrcaSlicer installation is necessary.

```bash
npm test            # command adapter + HTTP integration
npm run build       # production browser bundle
npm run test:e2e    # real browser upload/slice/download journey
```

Install the Playwright browser once with `npx playwright install chromium` if it is not already present.

## Roadmap

1. Import and select OrcaSlicer printer, filament, and process presets.
2. Read model metadata and provide WebGL placement/orientation tools.
3. Expose expert overrides generated from upstream option schemas.
4. Add authentication, per-user projects, job cancellation, and queue concurrency limits.
5. Preview G-code layers and send finished jobs to networked printers.
