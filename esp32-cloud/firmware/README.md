# ESP32 firmware integration contract (ESP-IDF)

**Đây là giao thức tích hợp, không phải firmware binary đã biên dịch.** Cần xác định ESP32/ESP32-S3/ESP32-C3/ESP32-C6, sơ đồ partition, flash size, codec/micro và phương án cấp phát Wi-Fi trước khi phát hành firmware.

## ESP32 provisioning

1. Sau khi đăng ký thiết bị trên web, cấp phát riêng `DEVICE_ID` (UUID) và `DEVICE_KEY` (64 hex characters) vào encrypted NVS/secure storage trên chính board.
2. Cấu hình `API_URL` là Render HTTPS origin, ví dụ `https://api.example.com`.
3. ESP32 gửi headers `X-Device-Id`, `X-Device-Key` cho **mọi** endpoint `/api/device/*`. Không in `DEVICE_KEY` ra log UART.
4. Dùng ESP-IDF certificate bundle để xác minh TLS; không dùng `setInsecure()`.

## Endpoint sequence

```text
ESP32                         Render API                     Cloudflare UI
  | POST /api/device/pair/request  |                                |
  |------------------------------->|                                |
  |      {code:"006421",expiresIn:300}                              |
  |<-------------------------------|                                |
  | [show code on serial / OLED]   |       user signs in Google      |
  |                                |<-- POST /api/devices/claim ------|
  | GET /api/device/pair/status    |                                |
  |------------------------------->|                                |
  |       {paired:true}            |                                |
  |<-------------------------------|                                |
  | POST /api/device/heartbeat     |                                |
  |------------------------------->|                                |
  | GET /api/device/ota            |                                |
  |------------------------------->|                                |
  |       {updateAvailable:...}    |                                |
```

**Lưu ý:** mã ví dụ phía trên không cố định, mã thực do API sinh bằng RNG mật mã, hợp lệ 5 phút.

### Example requests

```bash
curl -X POST "https://YOUR_API/api/device/pair/request" \
  -H "X-Device-Id: DEVICE_ID" -H "X-Device-Key: DEVICE_KEY"
curl "https://YOUR_API/api/device/pair/status" \
  -H "X-Device-Id: DEVICE_ID" -H "X-Device-Key: DEVICE_KEY"
curl -X POST "https://YOUR_API/api/device/heartbeat" \
  -H "Content-Type: application/json" -H "X-Device-Id: DEVICE_ID" \
  -H "X-Device-Key: DEVICE_KEY" -d '{"firmwareVersion":"0.1.0"}'
curl "https://YOUR_API/api/device/ota" \
  -H "X-Device-Id: DEVICE_ID" -H "X-Device-Key: DEVICE_KEY"
```

## OTA firmware (not a pairing code)

On `updateAvailable:true`, require:
- `board` matches the ESP32 board actually running.
- `url` uses HTTPS and the full firmware download validates TLS trust anchors.
- SHA-256 of downloaded bytes equals the expected 64-hex digest from the manifest.
- Firmware signed by trusted key and verified using ESP-IDF Secure Boot or signed app verification.
- Partitions `ota_0`, `ota_1`, `otadata`; rollback after self-test fails.
- Battery/power and free flash capacity sufficient, and no interrupted update.

Use ESP-IDF `esp_https_ota` and signed firmware verification; do not call `esp_restart()` unless the OTA operation has succeeded. The six-digit activation code does **not** flash firmware.

### XiaoZhi

The existing Go backend uses its own OTA provisioning endpoint `/xiaozhi/ota/`, which supplies WebSocket/MQTT settings. This is separate from `/api/device/ota`. The BilaBot UI uses XiaoZhi's own 6-digit activation sequence. Do not silently mix or substitute the two protocols.
