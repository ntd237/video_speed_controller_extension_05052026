# Video Speed Controller - Kế hoạch triển khai Chrome Extension

## Giai đoạn 0: Làm rõ đầu vào

### Bối cảnh dự án
- Tên dự án: Video Speed Controller - Chrome Extension (Manifest V3)
- Loại dự án: New Project (từ đầu)
- Mục tiêu: Tạo extension Chrome sẵn sàng upload lên Web Store
- Công nghệ: Vanilla JS + HTML + CSS, không framework, không CDN
- Phạm vi: Multi-file (13+ tệp)
- Bảo mật: Tiêu chuẩn (CSP compliance)
- Hiệu suất: Tiêu chuẩn (không yêu cầu real-time)

---

## Giai đoạn 1: Phân tích yêu cầu

### Yêu cầu theo EARS

| Yêu cầu | EARS Format | Ưu tiên |
|---------|------------|--------|
| Điều khiển tốc độ | KHI người dùng tương tác với popup, HỆ THỐNG PHẢI cho phép điều chỉnh tốc độ từ 0.1x đến 16x | Cao |
| Lưu tốc độ yêu thích | KHI người dùng nhấp "Lưu tốc độ yêu thích", HỆ THỐNG PHẢI lưu tốc độ hiện tại (1 tốc độ duy nhất); nhấn phím F để áp dụng ngay; người dùng có thể thay đổi tốc độ yêu thích qua giao diện popup hoặc options | Cao |
| Tự động áp dụng | KHI video mới được phát hiện, HỆ THỐNG PHẢI tự động áp dụng tốc độ mặc định nếu autoApply=true | Cao |
| Overlay hiển thị | KHI video đang phát, HỆ THỐNG PHẢI hiển thị badge tốc độ có thể kéo được | Trung |
| Chế độ Blacklist/Whitelist | KHI người dùng bật chế độ, HỆ THỐNG PHẢI chỉ áp dụng tốc độ trên các trang được phép | Cao |
| Phím tắt | KHI người dùng nhấn S/D/R/F, HỆ THỐNG PHẢI: S = giảm tốc độ, D = tăng tốc độ, R = reset về 1x, F = áp dụng tốc độ yêu thích đã lưu | Trung |
| Trang tùy chọn | KHI người dùng truy cập options, HỆ THỐNG PHẢI cho phép cấu hình tất cả cài đặt | Cao |

### Ràng buộc
- Không framework, vanilla JS
- Không CDN (CSP compliance)
- chrome.storage.sync (giới hạn ~100KB)
- HTML5 video element
- Manifest V3

---

## Giai đoạn 2: Đặc tả giải pháp

### Kiến trúc kỹ thuật

```
video_speed_controller_extension_extension/
├── manifest.json
├── config/defaults.js
├── content/content.js
├── background/service_worker.js
├── popup/popup.html|js|css
├── options/options.html|js|css
└── icons/icon16|48|128.png
```

### Schema lưu trữ

```json
{
  "currentSpeed": 1.0,
  "defaultSpeed": 1.0,
  "stepSize": 0.5,
  "favoriteSpeed": null,
  "autoApply": true,
  "showOverlay": true,
  "overlayOpacity": 0.7,
  "mode": "blacklist",
  "blacklist": [],
  "whitelist": []
}
```

### Bảng đánh đổi

| Phương pháp | Ưu điểm | Nhược điểm | Độ phức tạp | Bảo mật | Khuyến nghị |
|------------|---------|-----------|-----------|--------|-----------|
| MutationObserver | Tự động, hiệu quả | Có thể bỏ lỡ video cũ | Thấp | Cao | ✅ |
| Polling | Đơn giản | Tiêu tốn CPU | Thấp | Cao | ❌ |
| chrome.storage.sync | Đồng bộ hóa | Giới hạn 100KB | Thấp | Cao | ✅ |
| Overlay draggable | UX tốt | Phức tạp hơn | Trung | Cao | ✅ |

**Chọn:** MutationObserver + chrome.storage.sync + Overlay draggable

### Edge Cases

| Edge Case | Điều kiện | Hành vi mong đợi | Tác động |
|-----------|----------|-----------------|---------|
| Video không src | Không có src attribute | Bỏ qua | Lỗi runtime |
| Tốc độ ngoài phạm vi | < 0.1 hoặc > 16 | Clamp [0.1, 16] | Playback hỏng |
| Storage quota vượt | Dữ liệu > 100KB | Từ chối write | Mất dữ liệu |
| Video bị xóa | Video remove khỏi DOM | Overlay cũng remove | Lỗi reference |
| Trang không video | Không có video | Popup vẫn hoạt động | UX confusing |

### Exception Handling

| Ngoại lệ | Nguồn | Chiến lược | Tác động | Phục hồi |
|---------|------|-----------|---------|---------|
| Storage read error | chrome.storage.sync | Catch, log, defaults | Reset cài đặt | Retry 1x |
| Storage write error | chrome.storage.sync | Catch, log, notify | Lỗi lưu | Retry 1x |
| Message timeout | content.js ↔ popup | Timeout 5s | Popup không update | Refresh |
| playbackRate error | HTML5 video | Catch, log | Tốc độ không đổi | Không |
| DOM mutation error | MutationObserver | Catch, log | Không phát hiện video | Retry |

### Race Conditions

| Tài nguyên | Kịch bản | Rủi ro | Giảm thiểu |
|-----------|---------|-------|-----------|
| currentSpeed | Popup + content cùng write | Không đồng bộ | Message queue FIFO |
| storage.sync | Popup + options + worker | Conflict | onChanged listener |
| Overlay DOM | MutationObserver + remove | Ghost overlay | Check existence |
| Favorites array | Thêm + xóa cùng lúc | Corruption | Immutable update |

---

## Giai đoạn 3: Kế hoạch triển khai

### Phân loại: New Project - 5 Giai đoạn

### Cây Task (15 tasks)

#### Giai đoạn 2: Kiến trúc dự án

**Task 2.1: Tạo cấu trúc thư mục**
- Mục tiêu: Tạo tất cả thư mục
- Tệp: Tất cả thư mục
- Thay đổi tối thiểu: mkdir -p config/ content/ background/ popup/ options/ icons/
- Xác minh: ls -la
- Kết quả: Tất cả thư mục được tạo
- Rollback: rm -rf config/ content/ background/ popup/ options/ icons/

**Task 2.2: Tạo config/defaults.js**
- Mục tiêu: Định nghĩa tất cả hằng số
- Tệp: config/defaults.js
- Thay đổi tối thiểu: Object chứa defaults
- Xác minh: node -c config/defaults.js
- Kết quả: Không lỗi syntax
- Rollback: rm config/defaults.js

**Task 2.3: Tạo manifest.json**
- Mục tiêu: Metadata extension, permissions, commands
- Tệp: manifest.json
- Thay đổi tối thiểu: Manifest V3 hợp lệ
- Xác minh: Validate JSON
- Kết quả: JSON hợp lệ
- Rollback: rm manifest.json

#### Giai đoạn 3: Triển khai cốt lõi

**Task 3.1: content.js - Phát hiện video**
- Mục tiêu: Phát hiện video, áp dụng tốc độ
- Tệp: content/content.js
- Thay đổi tối thiểu: MutationObserver + querySelector
- Xác minh: Console không lỗi
- Kết quả: Video phát hiện, tốc độ áp dụng
- Rollback: rm content/content.js

**Task 3.2: service_worker.js - Phím tắt**
- Mục tiêu: Xử lý S (giảm tốc độ), D (tăng tốc độ), R (reset về 1x), F (áp dụng tốc độ yêu thích)
- Tệp: background/service_worker.js
- Thay đổi tối thiểu: chrome.commands.onCommand với 4 lệnh: speed-down, speed-up, reset, apply-favorite
- Xác minh: Console không lỗi
- Kết quả: Phím tắt hoạt động
- Rollback: rm background/service_worker.js

**Task 3.3: popup UI**
- Mục tiêu: Tạo popup với slider, buttons, favorite speed, cấu hình step size
- Tệp: popup/popup.html|js|css
- Thay đổi tối thiểu: HTML + CSS + JS
- UI bao gồm:
  - Hiển thị tốc độ hiện tại (lớn, chính giữa)
  - Slider tốc độ 0.1–16x
  - 3 nút: Giảm (S) | Reset 1x (R) | Tăng (D)
  - Ô nhập step size (mặc định 0.5, có thể thay đổi trực tiếp)
  - Ô nhập tốc độ yêu thích (mặc định null, có thể nhập số bất kỳ và lưu; hiển thị tốc độ đang lưu; nút "Lưu tốc độ hiện tại"; nhấn F để áp dụng)
  - Toggle bật/tắt extension cho trang hiện tại
  - Link mở Options
- Xác minh: Mở popup, kiểm tra UI; thay đổi step size và favorite speed đều lưu vào storage
- Kết quả: Popup hiển thị, tất cả cấu hình hoạt động
- Rollback: rm popup/popup.*

**Task 3.4: content.js - Overlay**
- Mục tiêu: Hiển thị badge tốc độ hiện tại trên video, có thể kéo, điều chỉnh độ trong suốt, ẩn/hiện
- Tệp: content/content.js (mở rộng)
- Thay đổi tối thiểu:
  - Inject `<div>` overlay lên mỗi video, hiển thị tốc độ hiện tại (ví dụ: "1.5x")
  - Đọc `showOverlay` từ storage → ẩn hoàn toàn nếu false, hiện nếu true
  - Đọc `overlayOpacity` từ storage → áp dụng `opacity` CSS (dải 0.1–1.0, mặc định 0.7)
  - Overlay có thể kéo (drag) để đổi vị trí, lưu vị trí theo session
  - Lắng nghe `chrome.storage.onChanged` để cập nhật overlay theo thời gian thực khi người dùng đổi cài đặt
- Xác minh: Overlay hiển thị đúng tốc độ; tắt showOverlay → overlay ẩn ngay; chỉnh opacity → độ trong suốt thay đổi ngay
- Kết quả: Overlay hoạt động, draggable, phản ánh đúng trạng thái
- Rollback: Xóa overlay code

#### Giai đoạn 4: Tích hợp

**Task 4.1: options page**
- Mục tiêu: Trang cấu hình đầy đủ
- Tệp: options/options.html|js|css
- Thay đổi tối thiểu: HTML + CSS + JS
- UI bao gồm:
  - Toggle chế độ: Blacklist / Whitelist
  - Quản lý danh sách Blacklist (thêm/xóa domain)
  - Quản lý danh sách Whitelist (thêm/xóa domain)
  - Input step size (mặc định 0.5; nhãn: "Bước tăng/giảm khi nhấn phím S/D")
  - Input tốc độ yêu thích (nhãn: "Tốc độ yêu thích — nhấn F để áp dụng")
  - Input tốc độ mặc định khi extension tải
  - Toggle hiển thị overlay (ẩn/hiện badge tốc độ trên video)
  - Slider độ trong suốt overlay (0.1–1.0, mặc định 0.7; thay đổi áp dụng ngay lập tức)
  - Hiển thị phím tắt (read-only): S/D/R/F
  - Nút "Lưu cài đặt"
- Xác minh: Mở options, thay đổi step size và favorite speed → lưu → kiểm tra popup phản ánh đúng
- Kết quả: Options hoạt động, tất cả cấu hình lưu vào storage
- Rollback: rm options/options.*

**Task 4.2: Blacklist/Whitelist**
- Mục tiêu: Kiểm tra domain
- Tệ: content/content.js, options/options.js
- Thay đổi tối thiểu: Hàm checkDomain()
- Xác minh: Kiểm tra domain
- Kết quả: Chỉ hoạt động trên domain được phép
- Rollback: Xóa checkDomain()

**Task 4.3: Favorite speed**
- Mục tiêu: Lưu/áp dụng 1 tốc độ yêu thích duy nhất; cho phép thay đổi qua giao diện
- Tệp: popup/popup.js, options/options.js
- Thay đổi tối thiểu:
  - `saveFavorite(speed)` — lưu giá trị bất kỳ vào `favoriteSpeed`
  - `applyFavorite()` — áp dụng `favoriteSpeed` vào video khi nhấn F
  - Popup: ô nhập số để thay đổi tốc độ yêu thích + nút "Lưu tốc độ hiện tại"
  - Options: input field để nhập/thay đổi tốc độ yêu thích trực tiếp
- Xác minh: Nhập 3 vào ô favorite → lưu → nhấn F → video về 3x; đổi thành 1.5 → nhấn F → video về 1.5x
- Kết quả: Favorite speed thay đổi được qua UI, áp dụng đúng
- Rollback: Xóa hàm favorite

**Task 4.4: Tối ưu hóa**
- Mục tiêu: Giảm CPU usage
- Tệp: content/content.js
- Thay đổi tối thiểu: Debounce, throttle
- Xác minh: CPU < 5%
- Kết quả: Hiệu suất tốt
- Rollback: Revert optimization

#### Giai đoạn 5: Tài liệu

**Task 5.1: Icon**
- Mục tiêu: Tạo icon 16x16, 48x48, 128x128
- Tệp: icons/icon*.png
- Thay đổi tối thiểu: Tạo icon
- Xác minh: Icon hiển thị
- Kết quả: Icon đúng
- Rollback: rm icons/icon*.png

**Task 5.2: README**
- Mục tiêu: Tài liệu hướng dẫn
- Tệp: README.md
- Thay đổi tối thiểu: Tạo README
- Xác minh: README có nội dung
- Kết quả: README hoàn chỉnh
- Rollback: rm README.md

**Task 5.3: Kiểm tra cuối**
- Mục tiêu: Kiểm tra tất cả tính năng
- Tệp: Tất cả
- Thay đổi tối thiểu: Không
- Xác minh: Manual test
- Kết quả: Tất cả hoạt động
- Rollback: Không

**Task 5.4: Chuẩn bị upload**
- Mục tiêu: Chuẩn bị upload Web Store
- Tệp: Tất cả
- Thay đổi tối thiểu: Kiểm tra manifest, icon
- Xác minh: Extension hợp lệ
- Kết quả: Sẵn sàng upload
- Rollback: Không

### Ma trận truy vết

| Task | EARS | Giai đoạn | Phụ thuộc | Trạng thái |
|------|------|----------|----------|-----------|
| 2.1 | Tất cả | 2 | Không | NOT_STARTED |
| 2.2 | Tất cả | 2 | 2.1 | NOT_STARTED |
| 2.3 | Tất cả | 2 | 2.1 | NOT_STARTED |
| 3.1 | Điều khiển, Tự động | 3 | 2.3 | NOT_STARTED |
| 3.2 | Phím tắt | 3 | 2.3 | NOT_STARTED |
| 3.3 | Điều khiển, Reset | 3 | 2.3 | NOT_STARTED |
| 3.4 | Overlay | 3 | 3.1 | NOT_STARTED |
| 4.1 | Tùy chọn | 4 | 2.3 | NOT_STARTED |
| 4.2 | Blacklist/Whitelist | 4 | 3.1, 4.1 | NOT_STARTED |
| 4.3 | Favorite | 4 | 3.3 | NOT_STARTED |
| 4.4 | Tối ưu | 4 | 3.1 | NOT_STARTED |
| 5.1 | Tất cả | 5 | 2.1 | NOT_STARTED |
| 5.2 | Tất cả | 5 | 2.1 | NOT_STARTED |
| 5.3 | Tất cả | 5 | 4.4 | NOT_STARTED |
| 5.4 | Tất cả | 5 | 5.3 | NOT_STARTED |

### Tiêu chí thành công

- Tất cả task hoàn thành
- Tất cả EARS requirements thỏa mãn
- Không lỗi console
- Extension hoạt động trên tất cả trang
- Popup UI đúng
- Options page hoạt động
- Phím tắt hoạt động: S (giảm), D (tăng), R (reset 1x), F (áp dụng tốc độ yêu thích)
- Overlay hiển thị tốc độ hiện tại, draggable, ẩn/hiện đúng theo cài đặt, độ trong suốt cấu hình được (0.1–1.0)
- Favorite speed hoạt động: lưu 1 tốc độ duy nhất, phím F áp dụng ngay lập tức
- Blacklist/Whitelist hoạt động
- CPU < 5%
- Storage < 100KB
- Icon đúng
- README hoàn chỉnh
- Sẵn sàng upload Web Store

---

## Tóm tắt

Kế hoạch 5 giai đoạn, 15 task, phụ thuộc lẫn nhau. Dự kiến 3-5 ngày làm việc.
