# Sổ chi tiêu chung · C++ WebAssembly

Ứng dụng web ghi lại các khoản chi (tên, mô tả, số lượng, đơn giá), tính thành tiền, tổng tiền và thống kê theo mặt hàng. Danh sách được **nhiều người dùng chung**: ai có link đều xem được, mọi người tạo thêm được khoản mới nhưng không sửa được khoản của người khác. Toàn bộ phần tính toán viết bằng **C++**, biên dịch sang **WebAssembly** bằng Emscripten.

## Demo

- Ứng dụng: https://ngominhkhoi150889.github.io/quan-li-chi-tieu/
- Kho dữ liệu chung: https://github.com/ngominhkhoi150889/quan-li-data/issues

## Tính năng

- Xem danh sách khoản chi dùng chung, kèm mô tả và thời điểm nhập.
- Thêm khoản chi: tên, mô tả (không bắt buộc), số lượng, đơn giá (VND).
- Tính thành tiền (`số lượng × đơn giá`), tổng tiền, tổng số lượng, trung bình mỗi khoản — tất cả trong C++.
- Thống kê theo mặt hàng: gộp các khoản trùng tên, xếp hạng theo số tiền, hiển thị tỷ lệ % trên tổng.
- Không có chức năng sửa/xoá: sổ chỉ ghi thêm, tránh làm hỏng dữ liệu của người khác.
- Tự động làm mới khi quay lại tab, có nút "Làm mới", giữ bản lưu gần nhất trên trình duyệt khi mất mạng.
- Giao diện responsive, không dùng framework, không phụ thuộc CDN.

## Dữ liệu chung lưu ở đâu?

Một repo công khai riêng là [`quan-li-data`](https://github.com/ngominhkhoi150889/quan-li-data). Mỗi khoản chi là một **GitHub Issue đang mở**:

- Tiêu đề issue = tên khoản chi.
- Nội dung issue = mô tả của người nhập, kèm khối ẩn `<!--ledger:...-->` chứa số lượng và đơn giá (base64 JSON).
- Issue bị đóng sẽ không còn xuất hiện trong sổ; dữ liệu vẫn nằm trong lịch sử issue.

Trang đọc dữ liệu qua GitHub REST API công khai (không cần đăng nhập, không cần token). Việc ghi do chính người dùng thực hiện trên GitHub, nên **không có token nào được nhúng vào trang**.

```
Trình duyệt ──đọc công khai──► GitHub Issues của quan-li-data
            ──tạo issue──────► (bằng tài khoản GitHub của người thêm)
            │
            └── docs/core.js + core.wasm  (C++ tính tiền & thống kê)
```

## Thêm khoản chi

### Cách mặc định: qua form GitHub (không cần token)

1. Điền tên, mô tả, số lượng, đơn giá rồi bấm **Thêm qua GitHub**.
2. Trang mở tab mới tới form issue của `quan-li-data`, đã điền sẵn tên và nội dung (kể cả khối `ledger`).
3. Đăng nhập GitHub nếu cần và bấm **Submit new issue**.
4. Quay lại trang: khi tab được chọn lại, sổ tự tải danh sách mới.

Cách này dùng đúng quyền của tài khoản GitHub đang đăng nhập, không tạo thêm thông tin xác thực nào và không ai sửa được khoản của người khác.

### Tuỳ chọn: thêm ngay trong trang bằng token

Nếu bạn có token ghi trên repo dữ liệu, bấm **Thêm ngay trong trang bằng token** trong banner, dán token và lưu. Nút thêm sẽ ghi trực tiếp qua GitHub API, không cần mở tab khác.

- Fine-grained token: **Repository access** = `Only select repositories` → `quan-li-data`; **Repository permissions** → `Issues` = **Read and write** (quyền `Metadata` tự động có ở mức Read).
- Token chỉ lưu trong `localStorage` của trình duyệt đó, chỉ gửi tới `api.github.com`, và có thể xoá bằng nút **Xóa token của tôi**.
- Token fine-grained chỉ cấp được cho repo mà bạn sở hữu hoặc là cộng tác viên. Người ngoài dùng cách này cần được mời làm cộng tác viên của `quan-li-data`.

Không nên nhúng token ghi vào mã nguồn hay bản xuất bản: trang tĩnh công khai thì bất kỳ ai mở web cũng đọc được token và có thể ghi/xoá issue trong kho dữ liệu.

## Kiến trúc

```
Trình duyệt
├── docs/index.html + styles.css   Giao diện
├── docs/app.js                    Gọi GitHub API, gọi core C++ qua Embind, render UI
└── docs/core.js + core.wasm       Core C++ đã biên dịch bằng Emscripten
        ▲
        └── src/core.cpp           Giữ bản sao danh sách, tính tiền và thống kê
```

Các hàm C++ được export qua Embind:

| Hàm | Mô tả |
| --- | --- |
| `addEntry(id, name, description, qty, price)` | Nạp một khoản vào core; trả về `false` nếu dữ liệu không hợp lệ hoặc trùng id |
| `clearEntries()` | Xoá bản sao trong bộ nhớ trước khi nạp lại từ GitHub |
| `getEntries()` | Danh sách khoản kèm thành tiền |
| `getStats()` | Tổng tiền, số khoản, tổng số lượng, trung bình, khoản lớn nhất |
| `getBreakdown()` | Thống kê gộp theo tên mặt hàng, sắp xếp giảm dần theo số tiền |

## Cấu trúc thư mục

```
.
├── src/core.cpp        # Core C++
├── docs/               # Trang web tĩnh (nguồn GitHub Pages)
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── core.js         # Sinh ra bởi build
│   └── core.wasm       # Sinh ra bởi build
├── scripts/build.sh    # Script build WebAssembly
└── README.md
```

## Yêu cầu

- [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) (emsdk) — chỉ cần khi sửa `src/core.cpp`.
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

Kết quả build ghi vào `docs/core.js` và `docs/core.wasm`; hai tệp này được commit để Pages phục vụ trực tiếp.

## Chạy local

WebAssembly cần được tải qua HTTP, không mở trực tiếp bằng `file://`:

```bash
python -m http.server 8080 --directory docs
```

Mở http://localhost:8080. Trang đọc dữ liệu thật từ `quan-li-data`.

Muốn thử phần ghi trực tiếp khi chạy local, tạo `docs/config.json` (đã nằm trong `.gitignore`, không commit) rồi tải lại trang:

```json
{
  "owner": "ngominhkhoi150889",
  "repo": "quan-li-data",
  "token": "github_pat_..."
}
```

Chỉ dùng cách này trên máy cá nhân; tệp cấu hình chứa token không được đưa lên hosting công khai.

## Giới hạn hiện tại

- Chỉ hiển thị tối đa 300 khoản mới nhất (3 trang × 100 issue).
- Không có sửa/xoá trong ứng dụng. Muốn ẩn một khoản, đóng issue tương ứng trên GitHub.
- Đọc công khai bị giới hạn 60 request/giờ mỗi IP; trang giãn nhịp làm mới (5 phút/lần khi tab đang mở) và dùng bản lưu gần nhất nếu bị giới hạn. Khi có token, hạn mức cao hơn nhiều.
