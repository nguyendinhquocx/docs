# Production deploy receipt — UAT Revisions 1–4 (2026-11-23)

## Status

PASS. Production on ProDesk now runs the Revision 1–4 build. Owner order: "deploy produc". Data preserved; rollback images tagged; no config, tunnel, or firewall change.

## Source identity

- Root `bc83396` (fix(docs): owner UAT revisions 1–4) — fast-forwarded on ProDesk from `cdacf40`.
- Collab submodule `ad4099` (fix(share): wait for seed persistence before guest reload) from private mirror `nguyendinhquocx/collab` via read-only deploy key.
- Laptop final gate before push: packages typecheck green, vite example tests 5 pass, collab tests 178 pass, full vite build.

## Image and rollback identity

- New live image: `casual-editor:docs-quoc-app` = `sha256:288d11158c8a7238d91713c7553de967d3c0d7e5c4d521c4324c90ba07dde603`, built on ProDesk from the checkout above.
- Rollback (previous live): `casual-editor:rollback-20261123` = `sha256:88d3a2062a98…` (cutover image with Revisions 0 baseline).
- Rollback (pre-cutover original): `casual-editor:rollback-20261122` = `sha256:4cf2d965…`, untouched.
- `casual-editor:docs-quoc-app-candidate` re-tagged to the new build (candidate == live after deploy).

## Pre-swap backup

- `/home/quoc/apps/docs.quoc.app/backups/pre-uat-r4-20261123/`:
  - `collab-data.tgz` (5.7 MB, sha256 `76f370518d656da55264bfe06ca5cc2ff9c42040b782cd7c0bd19087dbe3b815`) — full `data/collab` incl. `users.db` (owner account) and 2 documents.
  - `redis-dump.rdb` (sha256 `56fbce7f07543b8c99816566416292362742239ac4b69c7c576e6a5cddccafbc`) — Redis SAVE taken before swap.
- Owner host remains behind Cloudflare Access; guest host behind the origin allowlist. No tunnel/DNS change.

## Swap and verification

- `docker compose -f deploy/docker-compose.selfhost.yml up -d --no-build app` — seconds-level blip; both `deploy-app-1` and `deploy-redis-1` healthy.
- Data intact after swap: 2 owner documents + `users.db` in `data/collab`, Redis DBSIZE 5, internal health `{"ok":true}`.
- Origin matrix (loopback, no credentials): owner `Host: docs.quoc.app` without JWT → 401 (`/` and `/files`); guest `Host: docx.quoc.app` → `share.html` 200, `/health` 403, `/files` 403. Bare-IP `/health` → 421 (exact-host gate working as designed).
- Public probes: `https://docs.quoc.app/` → 302 to `holy-sun-099e.cloudflareaccess.com` Access login (correct team + AUD); `https://docx.quoc.app/share.html` → 200; `https://docx.quoc.app/health` → 403.

## Revision content shipped

- R1: hero/hint copy removal, vi label, exit-confirm removal + save-before-leave flush, icon-only Share with dialog, server-side seed persistence wait, chrome cleanup (focus ring, z-index, StatusBadge).
- R2: white ribbon, monochrome presence circles, ShareDialog polish (copy→check).
- R3: header theme toggle hidden (View menu keeps theme), dark-mode icon invert, borderless revoke, dialog spacing.
- R4: borderless EN/VI locale control, seamless status footer.

## Carried-over owner gates (unchanged from phase 2 receipt)

1. Owner browser login through Access (IdP method + session duration still unverified; target 30–60 days).
2. Share-link + revoke end-to-end UAT from the owner UI.
3. Full restore/rollback rehearsal remains unperformed (documented gap); image + data backups above are the working rollback path.

## Rollback path

```
ssh prodesk-home
cd /home/quoc/apps/docs.quoc.app
docker tag casual-editor:rollback-20261123 casual-editor:docs-quoc-app
docker compose -f deploy/docker-compose.selfhost.yml up -d --no-build app
# data: restore from backups/pre-uat-r4-20261123/ only if data corruption suspected
```
