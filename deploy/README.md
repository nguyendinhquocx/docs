# Docs personal workspace — deployment contract

`docs.quoc.app` is the owner-only workspace. `docx.quoc.app` is the guest-only share surface. Both hostnames terminate at the same collab service, but the origin enforces an exact host/route matrix; Cloudflare Access is not the only security boundary.

## Runtime shape

- Fastify serves the owner SPA, owner session/file routes, and Hocuspocus `/yjs`.
- Owner host: Cloudflare Access at the edge **and** origin verification of `Cf-Access-Jwt-Assertion` (RS256/JWKS, exact team issuer, owner-app AUD, time claims, allowlisted identity).
- Guest host: no Access login. It serves `share.html` and token-scoped `/api/share/**` + `/yjs`; the capability travels in `#share=` and is sent only in `Authorization` headers / the Hocuspocus authentication frame.
- DOCX files live under `/data`; Redis is a rebuildable Y.Doc cache. SQLite stores owner sessions, files, room/file bindings, link digests, leases, and commit journals. The local host commits immutable versioned blobs and atomically swaps one metadata pointer.
- `/health` is loopback-only. Host ports bind `127.0.0.1`; there is no public Docker port.

## Isolated staging preflight

`deploy/docker-compose.staging.yml` is standalone; **do not** combine it with `docker-compose.selfhost.yml`. It uses project `docs-quoc-app-staging`, app port `127.0.0.1:18080`, bind data `../data/staging/collab`, and Redis volume `docs-quoc-app-staging-redis-data`.

Preflight is read-only and its rendered output is recorded at `deploy/receipts/staging-compose-config-2026-11-22.txt`:

```
docker compose -p docs-quoc-app-staging -f deploy/docker-compose.staging.yml config
```

Owner approved the fixture `up`; the local staging Compose app and Redis became healthy on loopback. Separately, a local browser smoke covered owner login/file creation/share and guest join; the production candidate's isolated route-matrix and 177 server tests passed. Receipt: `deploy/receipts/staging-up-2026-11-22.md`. Staging containers were stopped after smoke; fixture data and its Redis volume were preserved. All staging ran locally, not on the ProDesk production clone. A full staging DB+files+Redis restore/rollback rehearsal remains unverified; do not treat it as PASS. Never use the production `/data` volume for tests.

## Production configuration — ACTIVE (2026-11-23)

Production is running on ProDesk through `deploy/docker-compose.selfhost.yml`. The image runs behind Cloudflare Tunnel; the app port remains `127.0.0.1:8080`. Production `.env` is at `/home/quoc/apps/docs.quoc.app/deploy/.env`, mode `0600`, and is not in Git. It contains:

- `CF_ACCESS_TEAM` — Cloudflare team domain.
- `CF_ACCESS_AUD` — owner-host Access application AUD.
- `CF_ACCESS_IDENTITIES` — exact owner allowlist (confirmed by owner in phase-2 receipt).
- `COLLAB_ROOM_TOKEN_SECRET` — random signing secret for short-lived owner room tokens.

`CASUAL_PERSONAL_MODE=single` opens first-account signup only behind the owner host gate. App sessions roll for 45 days (`CASUAL_SESSION_TTL_DAYS`). Guest links expire after 30 days by default and can be revoked by `linkId`.

Cutover record: `deploy/receipts/cutover-phase2-2026-11-23.md`. The owner host returns Cloudflare Access login redirect; guest `share.html` is public by capability only. Origin rejects owner requests without an Access JWT (401) and guest access to owner routes/health (403). `docs.quoc.app` and `docx.quoc.app` route through the dedicated tunnel; no inbound port was opened. The pre-cutover Redis/data/config/image backup is off-host at `D:/pcloud/workspace/archive/docs-quoc-app-cutover-20261122/`.

Remaining owner UAT: complete the Cloudflare Access login, verify the Access policy allows the confirmed owner email, create the initial Docs username/password account, and smoke a share+revoke flow. The Access IdP method (email OTP vs Google) and its 30–60-day session duration were not independently verified. Full staging restore/rollback rehearsal also remains a documented verification gap. Do not claim end-to-end owner acceptance until these checks pass.
