# ESP32 ảo trong trình duyệt — nguồn và vận hành

Bản này kế thừa mã client XiaoZhi ESP32 ảo của [Olivia AI](https://github.com/roalfb/olivia-ai) và bản Việt hóa [BilaBot](https://github.com/xulytiengviet/Bilabot). Tại `docs/device/` giữ lại lõi client phía trình duyệt gồm giao thức OTA provisioning, Device-ID/Client-ID, WebSocket, âm thanh Opus, bộ điều khiển chat, camera và MCP. Giấy phép MIT, xem [LICENSE](LICENSE).

## Ba trạng thái thực

- **Mở**: website nạp `device/index.html`, trình duyệt khởi tạo danh tính ESP32 ảo và giữ cấu hình cục bộ. Giai đoạn này không đồng nghĩa đã kết nối XiaoZhi.
- **Ghép**: `launcher.js` gửi lệnh `pair` đến `device-bridge.js` trên cùng origin. Lõi BilaBot gọi OTA theo đúng giao thức thông qua gateway Hono đã cấu hình; chỉ hiển thị mã 6 số nếu máy chủ thật sự trả mã.
- **Trò chuyện**: sau khi XiaoZhi xác nhận mã, client tạo WebSocket qua gateway. Chỉ đánh dấu **Đã kết nối** khi nhận event `connected` sau khi WebSocket/hello xác nhận. Micro do người dùng cấp quyền và âm thanh Opus vẫn do client gốc xử lý.

**Không thay thế** quy trình nhận mã XiaoZhi bằng đăng nhập Google hoặc mã ESP32 Cloud (Render). Backend quản lý ESP32 vật lý nằm riêng ở `esp32-cloud/` và `docs/cloud.html`.

## Gateway

GitHub Pages chỉ chạy HTML/CSS/JS tĩnh; để proxy OTA, WebSocket headers, vision và cấp session cho người dùng, bản kế thừa dùng endpoint Cloudflare Pages do BilaBot cấu hình tại `device/config.js`. URL public mặc định do BilaBot cung cấp là `https://bilabot-web.pages.dev`. Nếu gateway không sẵn sàng hoặc cấu hình Turnstile/CORS không cho phép origin `https://xulytiengviet.github.io`, mã OTA sẽ không nhận được — UI hiển thị thông báo lỗi, không tự tạo mã.

**Cảnh báo quan trọng**: Gateway có thể xử lý access token phiên thiết bị và lưu lượng âm thanh, nên chỉ sử dụng gateway tin cậy. Client nhận token XiaoZhi theo giao thức từ gateway chính chủ, không đưa secret Google OAuth vào trang tĩnh. Không thêm dịch vụ bên thứ ba để thu thập bản ghi hội thoại.

## Air Pet - My Fen

Tệp HTML Air Pet do người dùng gửi là bootstrap của Flutter Web: nó tham chiếu các tệp Flutter/SoLoud/Opus WASM bên ngoài. Tệp HTML này không chứa đủ engine Flutter/Dart để có thể ghép nguyên trạng vào `trinhduyet`; chỉ dùng như tài liệu tham khảo cho mô hình trợ lý giọng nói web/PWA và ý tưởng avatar động.

## Khởi chạy và kiểm tra

- Mở `https://xulytiengviet.github.io/trinhduyet/`.
- Nhấn **Lấy mã và ghép thiết bị**. Mã hợp lệ được trả về từ OTA XiaoZhi, phải nhập trong giao diện `https://xiaozhi.me/console/agents`.
- Chỉ khi trạng thái hiển thị **Kết nối XiaoZhi thành công** mới bắt đầu hội thoại âm thanh/văn bản.
- Khi lỗi, mở thiết bị toàn màn hình tại `device/index.html` hoặc xem `BilaBot → Kết nối XiaoZhi` để kiểm tra Cloudflare gateway.

Bản `docs/index.html` là launcher dùng khi GitHub Pages xuất bản từ `/docs`. Bản `index.html` ở root dùng khi xuất bản từ `/`. Cả hai tham chiếu cùng `docs/device/` trong repo.
