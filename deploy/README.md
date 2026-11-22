# Production deploy — collab server (one origin)

Real-time collaboration AND the REST surface run on the shared
[`collab`](../collab) server (Hocuspocus + Yjs on Fastify), which also
serves the bundled editor SPA. Production runs **one** app container
behind Caddy for TLS:

```
            ┌─────────── Caddy (proxy) ───────────┐
  client ──▶│  everything    → app :8080          │
            └──────────────────────────────────────┘
                              │
                    app (collab server)
                    /          → bundled editor SPA
                    /yjs       → Hocuspocus WS (Y.Doc per room)
                    /api/rooms → share-link / seed
                    /auth /files /wopi → Mode 2/3 host surface
```

The editor reaches the WS broker at **same-origin `/yjs`** (the App.tsx
same-origin default), so nothing host-specific is baked into the SPA
build.

## Run

```bash
# from the repo root
git submodule update --init                 # fetch the collab server
docker compose -f docker-compose.prod.yml up -d --build
# → http://localhost:8080
```

For a real domain with automatic HTTPS:

```bash
COLLAB_SITE_ADDRESS=doc.example.com \
  docker compose -f docker-compose.prod.yml up -d --build
# (uncomment the 80/443 ports in the proxy service)
```

## What matters

- **`/yjs` routing + WebSocket upgrades.** Hocuspocus' WS upgrade lives
  at `/yjs`. The Caddyfile proxies the whole origin to `app`; any other
  ingress (nginx, a cloud LB) must pass WebSocket upgrades through.
- **SPA build has collab on.** The bundled image builds with
  `VITE_COLLAB_ENABLED=true` (see `../Dockerfile`) and relies on the
  same-origin `/yjs` default — no `VITE_COLLAB_BACKEND` needed when
  served same-origin. Point it elsewhere only for split-origin setups.
- **Persisting state uses separate backends.** `REDIS_URL` stores Y.Doc
  room snapshots; `CASUAL_STORAGE=local` (or `s3`/`postgres`) stores host
  files. Neither setting persists the in-memory anonymous room registry
  or its uploaded DOCX seed; see the fork-specific limitation below.
- **Format per product.** Docs sets `CASUAL_FILE_EXT=.docx`; sheets
  deploy the same image with `.xlsx`. On a shared Redis, give each a
  distinct `CASUAL_REDIS_PREFIX`.

> The legacy in-repo Go gateway (`backend/`) was removed 2026-06-28 once
> the editor, share-link flow, and this deploy moved fully to the collab
> server. See `docs/internal/23-collab-server-migration.md`.

## Quoc.app self-host (this fork)

The fork deployment lives at `docs.quoc.app`; source mirror on Windows is
`D:\pcloud\workspace\code\website\docs.quoc.app`, ProDesk clone is
`~/apps/docs.quoc.app`. It uses `deploy/docker-compose.selfhost.yml`:

```
git submodule update --init
docker compose -f deploy/docker-compose.selfhost.yml up -d --build
```

The app binds only `127.0.0.1:8080`. A dedicated Cloudflare Tunnel on
ProDesk routes `docs.quoc.app` to that loopback origin and passes `/yjs`
WebSocket upgrades through; no host inbound port is opened. Runtime tunnel
config/unit stay on ProDesk at `~/.cloudflared/docs-production.yml` and
`~/.config/systemd/user/cloudflared-docs.service` (no credential is stored
in this repo).

Share links grant `role=edit`. There is no login or per-user access control
in this deployment, so treat the URL as a bearer link: anyone who gets it
can edit that room. Open the generated link once yourself before forwarding
it; the first browser initializes the Y.Doc from the DOCX seed. The current
client-side first-writer check is not an atomic server lock, so simultaneous
first opens remain a race edge case.

**Durability limitation:** this anonymous `/api/rooms` flow keeps the room
registry and uploaded DOCX seed in process memory. Redis persists Y.Doc
snapshots, but after an app/container restart the room ID and seed lookup
are gone, so existing share links stop working. `CASUAL_STORAGE=local` does
not make these anonymous room seeds durable. Export/download important DOCX
files before a restart; durable room metadata/seed storage requires a
separate product change.
