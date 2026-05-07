# Video Speed Controller

> Chrome extension để điều chỉnh tốc độ phát video HTML5 trên mọi trang web bằng phím tắt đơn giản và overlay hiển thị tốc độ trực tiếp trên video.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Manifest](https://img.shields.io/badge/manifest-v3-green)
![License](https://img.shields.io/badge/license-CC%20BY--NC--ND%204.0-lightgrey)

---

## Mục lục

- [Giới thiệu](#giới-thiệu)
- [Tính năng](#tính-năng)
- [Cài đặt](#cài-đặt)
- [Sử dụng](#sử-dụng)
- [Phím tắt](#phím-tắt)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [Cấu hình](#cấu-hình)
- [License](#license)
- [Liên hệ](#liên-hệ)


---

## Giới thiệu

### Vấn đề

- Các trang web video thường không cho phép điều chỉnh tốc độ vượt quá 2x
- Không có phím tắt đơn giản để thay đổi tốc độ nhanh chóng khi đang xem
- Khó biết tốc độ hiện tại đang là bao nhiêu trong khi xem video

### Giải pháp

Video Speed Controller cho phép:
- Điều chỉnh tốc độ từ **0.1x đến 20x** trên mọi trang web có video HTML5
- Nhấn **một phím duy nhất** để tăng/giảm tốc độ ngay lập tức
- Hiển thị **overlay tốc độ** ngay trên góc video, có thể kéo thả đến vị trí tùy ý

### Công nghệ

- Chrome Extension Manifest V3
- Vanilla JavaScript (không có dependency bên ngoài)
- Chrome Storage Sync API
- Chrome Scripting & Tabs API

---

## Tính năng

### Tính năng cốt lõi

- **Điều chỉnh tốc độ**: Tăng/giảm theo bước tùy chỉnh (mặc định 0.5), hỗ trợ preset nhanh
- **Overlay trên video**: Hiển thị tốc độ hiện tại ngay góc trên trái video, có thể kéo thả
- **Phím tắt đơn**: D (tăng), S (giảm), R (reset 1x), F (áp dụng yêu thích), V (ẩn/hiện overlay)
- **Tốc độ yêu thích**: Lưu và áp dụng tốc độ ưa thích nhanh (mặc định 3x)
- **Tự động áp dụng**: Áp dụng tốc độ đã lưu cho mọi video khi tải trang
- **Blacklist / Whitelist**: Kiểm soát trang nào được bật extension

### Tính năng nâng cao

- **Popup live update**: Slider và hiển thị tốc độ trong popup cập nhật ngay lập tức khi nhấn phím tắt
- **Điều chỉnh độ trong suốt**: Slider điều chỉnh opacity của overlay ngay trong popup
- **Preset bước nhảy**: Các nút preset nhanh (0.25 / 0.5 / 1.0 / 2.0) để chọn bước tăng giảm
- **Phát hiện video tự động**: Tự phát hiện và áp dụng cả với video được thêm động (SPA)
- **Kéo overlay không dừng video**: Di chuyển overlay mà video vẫn tiếp tục phát

---

## Cài đặt

### Cài đặt ở chế độ Developer (Load unpacked)

1. Clone hoặc tải về repository:
   ```bash
   git clone https://github.com/ntd237/video_speed_controller_extension_05052026.git
   ```

2. Mở Chrome và truy cập:
   ```
   chrome://extensions/
   ```

3. Bật **Developer mode** (góc trên phải)

4. Nhấn **Load unpacked** và chọn thư mục dự án

5. Extension sẽ xuất hiện trong thanh công cụ Chrome

---

## Sử dụng

### Popup UI

Nhấn vào icon extension trong thanh công cụ để mở popup:

- **Thanh trượt tốc độ**: Kéo để thay đổi tốc độ (0.1 – 20x)
- **Nút − / 1x / +**: Giảm / reset / tăng tốc độ theo bước đã chọn
- **Preset bước nhảy**: Chọn nhanh bước nhảy 0.25, 0.5, 1.0, hoặc 2.0
- **Tốc độ yêu thích**: Nhập tốc độ ưa thích → nhấn **Lưu** để ghi nhớ
- **Độ trong suốt**: Kéo slider để điều chỉnh độ trong suốt của overlay
- **Toggle trang**: Bật/tắt extension cho domain hiện tại
- **Nút Cài đặt**: Mở trang Options để cấu hình nâng cao

### Trang Options

Truy cập tại `chrome://extensions/` → nhấn **Details** → **Extension options**, hoặc nhấn nút **Cài đặt** trong popup:

- Chọn chế độ **Blacklist** (mặc định ở mọi nơi, trừ danh sách) hoặc **Whitelist** (chỉ trang trong danh sách)
- Quản lý danh sách domain
- Cài tốc độ mặc định và tốc độ yêu thích
- Bật/tắt overlay và điều chỉnh độ trong suốt
- Bật/tắt tự động áp dụng tốc độ

---

## Phím tắt

Các phím tắt hoạt động khi **trang web đang có focus** (không phải khi đang gõ vào ô input):

| Phím | Chức năng |
|------|-----------|
| `D` | Tăng tốc độ theo bước |
| `S` | Giảm tốc độ theo bước |
| `R` | Reset về 1x |
| `G` | Áp dụng tốc độ yêu thích |
| `V` | Ẩn / hiện overlay tốc độ |

> Các phím tắt cũng hoạt động **bên trong popup** khi popup đang mở.
>
> Để tùy chỉnh phím tắt ở cấp browser: `chrome://extensions/shortcuts`

---

## Cấu trúc dự án

```
video_speed_controller_extension_extension_05052026/
├── manifest.json           # Cấu hình extension (MV3)
├── config/
│   └── defaults.js         # Hằng số mặc định dùng chung
├── background/
│   └── service_worker.js   # Xử lý lệnh phím tắt từ content script
├── content/
│   └── content.js          # Script inject vào trang, quản lý tốc độ & overlay
├── popup/
│   ├── popup.html          # UI popup chính
│   ├── popup.css           # Style popup
│   └── popup.js            # Logic popup
├── options/
│   ├── options.html        # Trang cài đặt nâng cao
│   ├── options.css         # Style trang cài đặt
│   └── options.js          # Logic trang cài đặt
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── docs/
    └── plan/               # Tài liệu kế hoạch phát triển
```

### Mô tả các module chính

| Module | Mô tả |
|--------|-------|
| `config/defaults.js` | DEFAULTS object chia sẻ cho tất cả scripts; mọi hằng số đều khai báo ở đây |
| `content/content.js` | Inject vào mọi trang; phát hiện video, áp dụng tốc độ, tạo overlay, lắng nghe phím tắt |
| `background/service_worker.js` | Nhận lệnh từ content script, tính tốc độ mới, lưu storage, gửi lại content script |
| `popup/popup.js` | Điều khiển UI popup; đồng bộ live với storage khi phím tắt thay đổi tốc độ |
| `options/options.js` | Quản lý cài đặt nâng cao; blacklist/whitelist, tốc độ mặc định, hiển thị overlay |

---

## Cấu hình

Tất cả giá trị mặc định được khai báo trong `config/defaults.js`:

| Tham số | Mặc định | Mô tả |
|---------|---------|-------|
| `currentSpeed` | `1.0` | Tốc độ hiện tại |
| `defaultSpeed` | `1.0` | Tốc độ reset (phím R) |
| `stepSize` | `0.5` | Bước tăng/giảm mỗi lần nhấn phím |
| `favoriteSpeed` | `3` | Tốc độ yêu thích (phím G) |
| `autoApply` | `true` | Tự động áp dụng tốc độ khi tải trang |
| `showOverlay` | `true` | Hiển thị overlay tốc độ trên video |
| `overlayOpacity` | `0.7` | Độ trong suốt overlay (0.1 – 1.0) |
| `mode` | `'blacklist'` | Chế độ hoạt động: `'blacklist'` hoặc `'whitelist'` |
| `minSpeed` | `0.1` | Tốc độ tối thiểu |
| `maxSpeed` | `20.0` | Tốc độ tối đa |
| `stepSizeOptions` | `[0.25, 0.5, 1.0, 2.0]` | Các preset bước nhảy trong UI |

---

## License

Dự án này được phát hành dưới giấy phép **CC BY-NC-ND 4.0** (Creative Commons Attribution-NonCommercial-NoDerivatives 4.0):

- **Được phép**: Tự do sao chép và chia sẻ với điều kiện ghi rõ nguồn
- **Không được phép**: Chỉnh sửa, remix hoặc phát triển dựa trên mã nguồn
- **Không được phép**: Sử dụng cho mục đích thương mại

Xem toàn bộ nội dung tại: [LICENSE](LICENSE)

---

## Liên hệ

- **Tác giả**: ntd237
- **Email**: ntd237.work@gmail.com
- **GitHub**: [https://github.com/ntd237](https://github.com/ntd237)
