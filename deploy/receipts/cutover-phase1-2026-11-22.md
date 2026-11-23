# Cutover receipt — giai đoạn 1 (2026-11-22, owner duyệt "deploy production")

Production docs.quoc.app trên ProDesk CHƯA bị restart — vẫn chạy bản cũ trong suốt giai đoạn này.

## Đã làm
1. **Backup (PASS, off-host):** ProDesk `/home/quoc/apps/docs.quoc.app/backups/cutover-20261122T0440/`
   (redis-dump.rdb sau SAVE, data-collab.tar.gz, deploy-config.tar.gz, rollback-image.txt =
   sha256:4cf2d965…, SHA256SUMS) + bản copy laptop `D:/pcloud/workspace/archive/docs-quoc-app-cutover-20261122/`,
   `sha256sum -c` OK ở cả hai nơi.
2. **Code sync (PASS):** laptop push `4672d46f..5b362e52` → `origin/docs`; ProDesk
   `/home/quoc/apps/docs.quoc.app` pull ff → `5b362e5`; submodule `collab` trỏ mirror
   `git@github-collab-mirror:nguyendinhquocx/collab.git` qua deploy key **read-only**
   `prodesk-docs-collab-deploy-key`, checkout `b83006b` (đúng pointer).
3. **Compose prod mới (PASS):** `deploy/docker-compose.prod.yml` thêm personal env
   (single, TTL 45) + host boundary `CF_*` đọc từ `deploy/.env` với guard `:?` —
   `docker compose config` từ chối khi thiếu Access config (đúng thiết kế refuse-boot).
4. **Image build + smoke (PASS):** `casual-editor:docs-quoc-app-candidate` build trên ProDesk;
   container test chứng minh refuse-boot khi thiếu CF_* (exit 1, message đủ env) và
   `/health` = 200 khi boot bình thường. Production container chưa bị đụng.
5. **`.env` khung trên ProDesk** `deploy/.env` chmod 600: `COLLAB_ROOM_TOKEN_SECRET`
   (đã sinh openssl rand -hex 32, không hiện log), `CF_GUEST_HOST=docx.quoc.app`,
   `CF_ACCESS_IDENTITIES=quocnguyent10@gmail.com`; `CF_ACCESS_TEAM`, `CF_ACCESS_AUD` chờ owner.

## OQ6 inventory (legacy share rows): KHÔNG có dữ liệu cần migrate
- `data/collab/` rỗng (0 file) — chưa từng có file DOCX persistent nào.
- `users.db` chưa tồn tại (bản cũ chưa bật personal mode) → không có bảng shares plaintext.
- Share registry bản cũ nằm **in-memory** (receipt 2026-11-22: mất sau restart) → không có row persistent.
- Redis: 5 key `casual-docs:room:*` là Y.Doc snapshot test/synthetic, đã backup; giữ nguyên, app mới không đọc.

## Giai đoạn 2 — chờ owner Cloudflare (blocker duy nhất còn lại)
1. Tạo Access application bảo vệ `docs.quoc.app` (policy: email `quocnguyent10@gmail.com`).
2. Lấy **team domain** (`<team>.cloudflareaccess.com`) và **AUD tag** từ Access app.
3. Thêm public hostname `docx.quoc.app` → `http://127.0.0.1:8080` vào tunnel `cloudflared-docs`
   (config backup trước khi reload; hoặc owner tự làm).
4. Đưa 2 giá trị (team domain + AUD) cho EP qua kênh masked → EP điền `.env`, build tag
   `casual-editor:docs-quoc-app`, `docker compose -f deploy/docker-compose.prod.yml up -d`,
   verify health + smoke owner/guest + viết receipt giai đoạn 2.
