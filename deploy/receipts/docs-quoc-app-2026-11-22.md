# Receipt — docs.quoc.app self-host

- **Trạng thái:** ACTIVE, public qua Cloudflare Tunnel.
- **Xác minh lúc:** 2026-11-22 05:59 UTC.
- **Source:** `nguyendinhquocx/docs`, commit `b0c74951afdeb2560ec96eed1f653338bd3d9a1f`; upstream remote vẫn là `CasualOffice/docs`.
- **Source path:** `D:\pcloud\workspace\code\website\docs.quoc.app`.
- **ProDesk path:** `/home/quoc/apps/docs.quoc.app`.
- **Compose SHA-256:** `9452f20d9947cc4034e18d69ff53aa8e860a99cd0e9777aeea0121866ac089a3`.
- **Image:** `casual-editor:docs-quoc-app`, image ID `sha256:4cf2d9656685267660d2225d4ff1e4a886d9b7d21483272be93ed573a5c9bd67`.
- **Origin:** app chỉ bind `127.0.0.1:8080`; Cloudflare Tunnel `cloudflared-docs.service` active, ingress `docs.quoc.app` → loopback. Không mở inbound port.

## Bằng chứng

- Docker build và `docker compose config --quiet` PASS; sau deploy app/Redis healthy.
- `https://docs.quoc.app/health` trả HTTP 200; SPA root trả HTTP 200; DNS qua Cloudflare.
- ShareDialog tạo link `role=edit`, bỏ backend override thừa trên same-origin; tab mới đọc seed DOCX và hiển thị nội dung.
- Hai browser tab co-edit qua `/yjs`: presence báo peer thứ hai; sửa của người dùng xuất hiện ở tab còn lại.
- Agent Hocuspocus writer kết nối `wss://docs.quoc.app/yjs?role=edit`; text do agent ghi xuất hiện ở cả hai tab.
- Đóng hai tab test, restart app để xoá room synthetic; sau restart app healthy, public health vẫn 200 và registry có 0 room.
- Port audit: `127.0.0.1:8080` là listener duy nhất của app; Cloudflare Tunnel đang chạy. Không có test room/document id được ghi vào receipt.

## Giới hạn đã biết

- Không bật login; share URL là bearer link, ai có link đều có quyền sửa.
- Anonymous room registry và DOCX seed còn trong process memory. Redis giữ Y.Doc snapshots nhưng không làm room/seed sống qua app restart; link hiện tại mất hiệu lực sau restart. Tải DOCX quan trọng về máy trước khi restart.
- Bootstrap seed diễn ra ở client; check first-writer chưa phải atomic server lock. Tránh để nhiều người mở cùng link lần đầu đồng thời; người tạo link nên tự mở/join trước khi gửi.
