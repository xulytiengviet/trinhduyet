# Trình Duyệt ESP32 AI Cloud

## Cập nhật triển khai 03/11/2026

**Đã tạo trên Render (My Workspace):**
- Web Service: [trinhduyet-esp32-cloud-api](https://dashboard.render.com/web/srv-dbkkj559fdbs73bjjukg), URL `https://trinhduyet-esp32-cloud-api.onrender.com`, gói Free, khu vực Singapore.
- PostgreSQL: [trinhduyet-esp32-pg](https://dashboard.render.com/d/dpg-dbkkims9v7es73ek5pmg-a), gói Free, khu vực Singapore, hạn sử dụng 03/12/2026 theo Render.

**Giao diện GitHub Pages:** `https://xulytiengviet.github.io/trinhduyet/` có mã nguồn ở thư mục gốc (`index.html`), `docs/` và `esp32-cloud/frontend/`. Việc xuất bản thực tế còn phụ thuộc cấu hình Pages trong Settings → Pages.

**Đang ở chế độ setup_required:** Render API khởi động và trả JSON trạng thái trung thực, không báo đã ghép nối thiết bị. Còn phải cài GOOGLE_CLIENT_ID và DATABASE_URL trong Render. `ALLOWED_ORIGINS=https://xulytiengviet.github.io,https://xulytiengviet.github.io/trinhduyet` đã được cấu hình (Origin trình duyệt thực tế là `https://xulytiengviet.github.io`).

**Hoàn tất hai biến riêng tư:** Tại [Render Web Service → Environment](https://dashboard.render.com/web/srv-dbkkj559fdbs73bjjukg/env), thêm:
1. `DATABASE_URL` = Internal Database URL lấy trực tiếp từ trang database Render. Không chép URL này vào GitHub, Cloudflare hoặc trao đổi công khai.
2. `GOOGLE_CLIENT_ID` = OAuth Web Client ID trong [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials); tại OAuth Authorized JavaScript origins thêm chính xác `https://xulytiengviet.github.io`.

Tại GitHub Pages, thay `googleClientId: ""` trong `config.js` và `docs/config.js` bằng cùng Google OAuth Web Client ID (Client ID công khai được; Client Secret không được công bố). Sau thay đổi cần kiểm tra `GET /api/health` trả `status: "ok"`, đăng nhập Google, tạo thiết bị và ghép nối với ESP32 thật.

**Cloudflare Pages (tuỳ chọn):** Kết nối repo, build root `esp32-cloud/frontend`, build `npm run build`, output `dist`, hai build env `PUBLIC_API_URL=https://trinhduyet-esp32-cloud-api.onrender.com` và `PUBLIC_GOOGLE_CLIENT_ID=...`. Sau khi có Pages URL, thêm origin đó vào `ALLOWED_ORIGINS` trên Render và Google OAuth Authorized JavaScript origins.

---


Đây là **thành phần bổ sung** của repository [trinhduyet](https://github.com/xulytiengviet/trinhduyet), không thay thế hoặc sửa lõi Go XiaoZhi hiện có.

## Các thành phần

- **Cloudflare Pages** (`frontend/`): giao diện tiếng Việt, Google Identity Services, đăng ký thiết bị, nhập mã ghép nối, xem heartbeat, hướng dẫn OTA.
- **Render Node API** (`backend/`): xác minh Google ID Token **phía máy chủ**, PostgreSQL, bí mật thiết bị được băm SHA-256, mã 6 chữ số giới hạn 5 phút, giới hạn thử mã, kiểm tra manifest OTA.
- **Thiết bị ảo**: nhúng/liên kết [BilaBot](https://xulytiengviet.github.io/Bilabot/) vốn kế thừa [Olivia AI](https://github.com/roalfb/olivia-ai). Mã XiaoZhi do dịch vụ OTA XiaoZhi cấp; không do API này sinh.
- **Thiết bị thật**: cần firmware tương thích ESP32, wifi provisioning, lưu bí mật trong NVS và xác minh chứng chỉ TLS. Xem `firmware/README.md`.

## 1. Tạo Google OAuth Web client

Tại Google Cloud Console → APIs & Services → Credentials → Create Credentials → OAuth client ID → **Web application**. Cấu hình Authorized JavaScript origins bằng URL Cloudflare Pages chính thức (và custom domain nếu có).

Chỉ cần **Google Identity Services xác minh danh tính**, không cần quyền truy cập hộp thư Gmail. Gán cùng OAuth Client ID cho frontend và backend:
- Frontend: `PUBLIC_GOOGLE_CLIENT_ID`
- Render: `GOOGLE_CLIENT_ID`

Không đặt client secret hoặc API key cá nhân trong mã nguồn.

## 2. Triển khai API trên Render

Kết nối GitHub repository này vào Render và xem lại Blueprint `render.yaml`. Render tạo một Web Service Node và một PostgreSQL; **xem giá dịch vụ và xác nhận trước khi triển khai**.

Trong Render, đặt:
- `GOOGLE_CLIENT_ID`: Web Client ID ở trên.
- `ALLOWED_ORIGINS`: URL frontend chính xác, ví dụ `https://your-project.pages.dev`. Nhiều origin cách nhau bằng dấu phẩy. Không dùng `*`.
- `DATABASE_URL`: được Blueprint truyền từ database.
- `FIRMWARE_VERSION`, `FIRMWARE_BOARD`, `FIRMWARE_URL`, `FIRMWARE_SHA256`: chỉ khai báo khi **đã có firmware đúng bo mạch, URL HTTPS và SHA-256**.

API health: `https://<render-service>.onrender.com/api/health`. Chỉ trạng thái `ok` khi Postgres hoạt động.

**Lưu ý:** dịch vụ Render ngủ hoặc tắt không thể bảo đảm kích hoạt thiết bị/OTA tức thì. Sử dụng kế hoạch luôn hoạt động cho thiết bị thực.

## 3. Triển khai frontend trên Cloudflare Pages

Tạo Pages project kết nối repo:
- Root directory: `esp32-cloud/frontend`
- Build command: `npm run build`
- Build output directory: `dist`
- Build env `PUBLIC_API_URL`: đầy đủ URL API Render (không dấu `/` cuối)
- Build env `PUBLIC_GOOGLE_CLIENT_ID`: OAuth Web Client ID

Cloudflare Pages deployment chỉ phục vụ static frontend; **API không chạy trong GitHub Pages**.

## 4. Chu trình ghép nối ESP32 thật

1. Người dùng đăng nhập Google → **Thiết bị ESP32 → Tạo & cấp khóa thiết bị**.
2. Sao chép `DEVICE_ID`, `DEVICE_KEY`, `API_URL` (bí mật chỉ được trả về một lần) và cấp phát vào ESP32 qua kênh riêng. Không đưa khóa vào firmware công khai.
3. ESP32 POST `/api/device/pair/request` với headers `X-Device-Id`, `X-Device-Key`. API trả 6 chữ số chỉ sau khi xác thực phần cứng bằng khóa.
4. Nhập mã trên website khi đang đăng nhập **cùng Google account đã đăng ký thiết bị**.
5. ESP32 GET `/api/device/pair/status`, gửi POST `/api/device/heartbeat` với JSON `{"firmwareVersion":"0.1.0"}`.
6. ESP32 GET `/api/device/ota` → nhận `updateAvailable` và manifest firmware khi đã kích hoạt.

Các route device đều yêu cầu khóa riêng. Mã ghép nối là **mã của ESP32 Cloud**, **không phải XiaoZhi OTA activation code**. Đối với XiaoZhi OTA và voice/Opus/MCP dùng backend Go hiện tại hoặc BilaBot.

## 5. Kiểm thử

```bash
cd esp32-cloud/backend
npm install
npm test
GOOGLE_CLIENT_ID=... DATABASE_URL=... ALLOWED_ORIGINS=http://localhost:8788 npm start
```

```bash
cd esp32-cloud/frontend
PUBLIC_API_URL=http://localhost:3000 PUBLIC_GOOGLE_CLIENT_ID=... npm run build
# serve dist/ with a static HTTP server
```

Không có Google Client ID và PostgreSQL thật thì không thể kiểm thử end-to-end đăng nhập/ghép nối. Không hiển thị trạng thái ghép nối giả.

## 6. Tình trạng & giới hạn

- API đăng ký/ghép nối/heartbeat/manifest hoàn chỉnh về mặt mã nguồn, cần deploy và kiểm thử tích hợp.
- Chưa có firmware ESP32 signed binary hoặc thiết bị phần cứng được chọn nên **không tuyên bố OTA firmware chạy trên phần cứng**.
- Giao diện BilaBot chạy trong một phiên riêng; đây chưa phải một hệ thống chuyển giao đăng nhập Google → tài khoản XiaoZhi. Muốn gắn với XiaoZhi self-host cần xây adapter xác thực riêng, không được coi tài khoản Google là token XiaoZhi.
- Backend không có API để xóa thiết bị, thu hồi khóa hoặc giao diện upload firmware ở bản đầu; cần phát triển và kiểm toán bảo mật trước vận hành quy mô lớn.
- Không lưu Google ID Token trong localStorage hay cookie. Phiên đăng nhập nằm trong bộ nhớ của tab và sẽ phải đăng nhập lại khi tải lại trang.
- **Không chép mã Olivia AI vào repository**; tái sử dụng BilaBot (dẫn xuất từ Olivia, có ghi nguồn) bằng trang tích hợp/iframe và liên kết ngoài. Mọi nguồn kế thừa giữ nguyên giấy phép, ghi nhận tác giả.

## Bảo mật đề xuất khi production

Nâng cấp xác thực bằng device-bound keys trong NVS mã hóa/secure element, chống clone danh tính; kiểm tra ESP-IDF Secure Boot + Flash Encryption, ký firmware OTA, rollback, giới hạn cấp thiết bị theo tài khoản và nhật ký kiểm toán.

MIT (phần mã mới); kế thừa giấy phép MIT của lõi Go và ghi công BilaBot/Olivia theo các repository nguồn.
