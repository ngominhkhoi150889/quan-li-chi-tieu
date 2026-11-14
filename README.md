# Sổ chi tiêu · C++ WebAssembly

Ứng dụng web ghi lại các khoản người dùng đã nhập (tên khoản chi, số lượng, đơn giá), tự động tính thành tiền, tổng tiền và thống kê theo từng mặt hàng. Toàn bộ phần xử lý dữ liệu được viết bằng **C++** và biên dịch sang **WebAssembly** bằng Emscripten.

## Demo

- GitHub Pages: https://ngominhkhoi150889.github.io/quan-li-chi-tieu/

## Tính năng

- Nhập khoản chi: tên, số lượng, đơn giá (VND).
- Tính thành tiền (`số lượng × đơn giá`), tổng tiền, tổng số lượng, trung bình mỗi khoản.
- Bảng danh sách khoản đã nhập, xóa từng khoản hoặc xóa tất cả.
- Thống kê theo mặt hàng: gộp các khoản trùng tên, xếp hạng theo số tiền, hiển thị tỷ lệ % trên tổng.
- Tự động lưu dữ liệu vào `localStorage` của trình duyệt.
- Giao diện responsive, không dùng framework, không phụ thuộc CDN.

## Kiến trúc

```
Trình duyệt
├── docs/index.html + styles.css   Giao diện
├── docs/app.js                    Gọi hàm C++ qua Embind, render UI, localStorage
└── docs/core.js + core.wasm       Core C++ đã biên dịch bằng Emscripten
        ▲
        └── src/core.cpp           Quản lý khoản chi, tính tiền, thống kê
```

Các hàm C++ được export qua Embind:

| Hàm | Mô tả |
| --- | --- |
| `addEntry(name, qty, price)` | Thêm khoản chi, trả về id (hoặc -1 nếu không hợp lệ) |
| `removeEntry(id)` | Xóa một khoản |
| `clearEntries()` | Xóa toàn bộ |
| `getEntries()` | Danh sách khoản kèm thành tiền |
| `getStats()` | Tổng tiền, số khoản, tổng số lượng, trung bình, khoản lớn nhất |
| `getBreakdown()` | Thống kê gộp theo tên mặt hàng, sắp xếp giảm dần theo số tiền |

## Cấu trúc thư mục

```
.
├── src/core.cpp          # Core C++
├── docs/                 # Trang web tĩnh (nguồn GitHub Pages)
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── core.js           # Sinh ra bởi build
│   └── core.wasm         # Sinh ra bởi build
├── scripts/build.sh      # Script build WebAssembly
└── README.md
```

## Yêu cầu

- [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) (emsdk).
- Bash (Git Bash trên Windows) hoặc WSL/Linux/macOS.
- Python 3 (để chạy HTTP server tĩnh khi thử local).

## Build

```bash
# Cài emsdk lần đầu (ví dụ vào ~/emsdk)
git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
cd ~/emsdk
./emsdk install latest
./emsdk activate latest

# Build ứng dụng
cd /đường/dẫn/tới/quan-li
./scripts/build.sh
```

Nếu emsdk nằm ở vị trí khác:

```bash
EMSDK_DIR=/path/to/emsdk ./scripts/build.sh
```

Kết quả build được ghi vào `docs/core.js` và `docs/core.wasm`. Hai tệp này được commit vào repo để GitHub Pages phục vụ trực tiếp.

## Chạy local

WebAssembly cần được tải qua HTTP, không mở trực tiếp bằng `file://`:

```bash
python -m http.server 8080 --directory docs
```

Sau đó mở http://localhost:8080.

## Ghi chú

- Dữ liệu chỉ lưu trên trình duyệt của người dùng (`localStorage`), không gửi lên server.
- Mọi phép tính và thống kê đều chạy trong C++/WebAssembly; JavaScript chỉ làm nhiệm vụ hiển thị.
