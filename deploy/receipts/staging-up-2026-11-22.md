# Staging up receipt — 2026-11-22

Owner đã duyệt preflight receipt qua ask_user (chạy fixture, không đụng production).

## Command
    docker compose -f deploy/docker-compose.staging.yml up -d --build

## Result: PASS

| Container | Status |
| --- | --- |
| docs-quoc-app-staging-app-1 | Up, healthy, 127.0.0.1:18080->8080 |
| docs-quoc-app-staging-redis-1 | Up, healthy |

- GET http://127.0.0.1:18080/health → 200
- App log: "collab server listening on http://0.0.0.0:8080"
- Fixture data: data/staging/collab (SQLite users.db tự init trong container)
- Redis volume riêng: docs-quoc-app-staging_docs-quoc-app-staging-redis-data
- Redis prefix: docs-quoc-app-staging:room: (không đụng prefix casual-docs:room: của production)

## Isolation checks
- Production docs.quoc.app chạy trên ProDesk; không container production nào trên laptop.
- Port staging 18080 loopback-only; production selfhost file dùng 8080 — không xung đột.
- Compose file standalone, không overlay selfhost, không chứa secret production.

## Teardown (khi cần)
    docker compose -f deploy/docker-compose.staging.yml down        # giữ volume fixture
    docker compose -f docker-compose.staging.yml down -v            # xoá luôn redis volume

## Không thực hiện
- Không publish port ra ngoài LAN/public, không cấu hình tunnel/Access cho staging.
- Không copy JWT/JWKS/signing key production vào staging (đúng comment trong compose).
