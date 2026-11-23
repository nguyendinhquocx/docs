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

Verified rendered values: only loopback port 18080; staging-only bind and Redis volume; no production `../data/collab`, port 8080, tunnel, or credentials. **Do not run `up` until the human checkpoint explicitly accepts this preflight receipt.** This run has not started staging containers.

After that checkpoint, staging UAT must use fixture data only and cover owner/guest host routes, identity/JWT checks, guest capability + revoke, WebSocket auth-frame URL inspection, seed lease, concurrent ETag commits, crash recovery, Redis expiry, and browser/mobile UI. Never use the production `/data` volume for tests.

## Production configuration — NOT CUT OVER

The production Compose file requires these values in ProDesk's runtime environment; keep them out of the repository:

- `CF_ACCESS_TEAM` — Cloudflare team domain.
- `CF_ACCESS_AUD` — owner-host Access application AUD.
- `CF_ACCESS_IDENTITIES` — explicit owner identity allowlist.
- `COLLAB_ROOM_TOKEN_SECRET` — random signing secret for short-lived owner room tokens.

`CASUAL_PERSONAL_MODE=single` opens first-account signup only behind the owner host gate. App sessions roll for 45 days by default (`CASUAL_SESSION_TTL_DAYS`), matching the owner's request to avoid frequent re-login. Guest links expire after 30 days by default and can be revoked by `linkId`; revocation blocks new joins before closing only that link's active sockets.

Before any Cloudflare/DNS/tunnel mutation or production restart:

1. Inspect current `users.db`, files, and legacy share rows; back up the database, `/data` files, and Redis snapshot together. If any legacy share row exists, stop for the owner's hash-migrate vs reissue decision (OQ6).
2. Create the approved `nguyendinhquocx/collab` fork, keep `upstream` pointing to `CasualOffice/collab`, and update the submodule only after the fork exists. No remote push has been done by this implementation session.
3. Install and verify Cloudflare Access for `docs.quoc.app`, plus origin JWT validation; configure `docx.quoc.app` as the guest hostname. Test spoofed Host headers through the actual guest ingress.
4. Verify rollback on staging using a consistent DB + file + Redis snapshot. Record image digest, compose config, tunnel config, and rollback receipt.
5. Obtain the final production cutover approval, then perform the change. No Cloudflare policy, DNS, tunnel, production container, or production data was changed by this implementation session.
