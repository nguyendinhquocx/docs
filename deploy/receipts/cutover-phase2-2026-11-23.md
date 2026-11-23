# Production cutover receipt — phase 2 (2026-11-23)

## Status

Production image is live on ProDesk. Owner host remains behind Cloudflare Access; guest host is now routed through the dedicated `cloudflared-docs` tunnel. No public inbound port or firewall rule was added.

## Owner authorization and identity

- Owner explicitly requested `deploy production` and supplied Cloudflare team/AUD values in `note-2026-11-23.txt`.
- The note labels were reversed. Live Access redirect confirmed `holy-sun-099e.cloudflareaccess.com` as the team domain; Access metadata confirmed the 64-hex value as the app audience tag. Owner confirmed the corrected mapping.
- OQ1 identity confirmed by owner as `quocnguyent10v@gmail.com`. ProDesk `deploy/.env` allowlist was corrected to that exact identity before the final app restart; file remains mode `0600`.
- `COLLAB_ROOM_TOKEN_SECRET` remains ProDesk-only in `.env`; the value is not recorded here.
- Cloudflare's login provider (email OTP vs Google) and Access session duration were not independently verified. The external owner host returns an Access login redirect (302). Owner must complete a browser login and confirm the provider/session duration; target session is 30–60 days.

## Pre-cutover backup

- ProDesk backup directory: `/home/quoc/apps/docs.quoc.app/backups/cutover-20261122T0440/`.
- Contents include Redis `SAVE` snapshot, `data/collab` archive, deploy config, rollback image ID, SHA256 manifest, and the pre-change `docs-production.yml` tunnel config.
- Off-host copy: `D:/pcloud/workspace/archive/docs-quoc-app-cutover-20261122/`.
- SHA256 verification passed on the off-host copy, including the tunnel config (`e129552c…`).
- OQ6 inventory before cutover: `data/collab` contained no files, `users.db` did not exist, and the old share registry was in-memory. Five Redis room keys were synthetic/test snapshots and were included in the backup. No legacy share rows required migration. First app boot initialized a fresh personal-mode database.

## Deploy and rollback identity

- Image was built from the ProDesk source state root `5b362e52` plus collab submodule `b83006b` from the private mirror `nguyendinhquocx/collab`, fetched using its dedicated read-only deploy key. ProDesk checkout later fast-forwarded docs/receipt-only commits to root `a89a591c`; no application code changed and no rebuild was needed.
- Candidate/active image ID: `sha256:88d3a2062a982cf56109373fb32f03e13ec73024ee3e388179c72504523fdde7`.
- Rollback image ID preserved from backup and tagged `casual-editor:rollback-20261122`: `sha256:4cf2d9656685267660d2225d4ff1e4a886d9b7d21483272be93ed573a5c9bd67`.
- Active compose: `/home/quoc/apps/docs.quoc.app/deploy/docker-compose.selfhost.yml`.
- Data bind: `/home/quoc/apps/docs.quoc.app/data/collab` → `/data`, loopback port `127.0.0.1:8080` only.
- The image runs as uid 999 (`casual`). The verified-empty data directory is `999:1000`, mode `2770` (setgid; host group `quoc` retains access). This fixed the candidate's initial SQLite `SQLITE_CANTOPEN` in a disposable root-owned volume before production start. No existing data was re-owned.

## Cloudflare Tunnel and public probes

- Tunnel config was backed up and hash-verified off-host before change.
- Added `docx.quoc.app` → `http://127.0.0.1:8080` to `/home/quoc/.cloudflared/docs-production.yml`; correct command `cloudflared tunnel --config … ingress validate` returned `OK`.
- Created DNS CNAME via `cloudflared tunnel route dns docs-quoc-app docx.quoc.app`; `cloudflared-docs.service` restarted and is active.
- DNS resolves through Cloudflare.
- Public probes: `https://docs.quoc.app/` → 302 (Access login); `https://docx.quoc.app/share.html` → 200; guest `/health` and `/files` → 403.
- Active production origin matrix (no credentials used): owner `Host: docs.quoc.app` without Access JWT → 401; guest `share.html` → 200; guest `/files`, `/auth/login`, `/health`, `/api/rooms` → 403.
- Compose app and Redis are healthy; internal container `localhost:8080/health` → 200. Public Docker port remains loopback-only.

## Remaining owner UAT

1. Open `https://docs.quoc.app`, complete the configured Cloudflare Access login, and verify the policy allows `quocnguyent10v@gmail.com` (the application login layer only accepts this identity's Access assertion).
2. Create the first owner account in Docs and set its local username/password. The app session TTL is 45 days.
3. Confirm whether Access uses email OTP or Google and set/check Access session duration at 30–60 days.
4. Create a test share link from the owner UI and confirm a second browser can open `https://docx.quoc.app/#share=…`; revoke the link after the test.

The local staging app/Redis containers were stopped after smoke; its bind fixture and named Redis volume were preserved. Project `clear-trash` plans found no safe CLEAR items; local build/dependency outputs (974.49 MiB) and ProDesk vendor `dist` (535.72 KiB) remain UNCERTAIN and untouched. ProDesk Docker shows 14.02 GB reclaimable build cache, mostly cross-project, so no global prune was run.

Until owner login/bootstrap UAT passes, infrastructure cutover is ACTIVE but end-to-end owner acceptance remains pending. Full staging DB+files+Redis restore/rollback rehearsal was not performed; this is recorded as a verification gap, not claimed PASS.
