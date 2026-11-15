# Sổ chi tiêu chung · C++ WebAssembly

Ứng dụng web ghi lại các khoản chi (tên, mô tả, số lượng, đơn giá), tính thành tiền, tổng tiền và thống kê theo mặt hàng. Danh sách được **nhiều người dùng chung**: ai có link đều xem được, dữ liệu nằm trong **một file JSON trên GitHub**. Toàn bộ phần tính toán viết bằng **C++**, biên dịch sang **WebAssembly** bằng Emscripten.

Khi đã cấu hình backend (Cloudflare Worker), **bất kỳ ai cũng bấm Lưu được ngay trong trang, không cần token** — token GitHub chỉ nằm trong secret của Worker.

## Demo

- Ứng dụng: https://ngominhkhoi150889.github.io/quan-li-chi-tieu/
- File dữ liệu chung: https://github.com/ngominhkhoi150889/quan-li-data/blob/main/ledger.json

## Tính năng

- Xem danh sách khoản chi dùng chung, kèm mô tả và thời điểm nhập.
- Nhập tên, mô tả (không bắt buộc), số lượng, đơn giá (VND) rồi bấm **Lưu khoản chi** để ghi thẳng vào file dữ liệu — không mở tab khác.
- Tính thành tiền (`số lượng × đơn giá`), tổng tiền, tổng số lượng, trung bình mỗi khoản — tất cả trong C++.
- Thống kê theo mặt hàng: gộp các khoản trùng tên, xếp hạng theo số tiền, hiển thị tỷ lệ % trên tổng.
- Ghi kiểu chỉ thêm: ứng dụng không có chức năng sửa/xoá khoản đã lưu.
- Tự làm mới khi quay lại tab, có nút "Làm mới", giữ bản lưu gần nhất trên trình duyệt khi mất mạng.
- Giao diện responsive, không dùng framework, không phụ thuộc CDN.

## Dữ liệu chung lưu ở đâu?

Repo công khai riêng là [`quan-li-data`](https://github.com/ngominhkhoi150889/quan-li-data), file [`ledger.json`](https://github.com/ngominhkhoi150889/quan-li-data/blob/main/ledger.json):

```json
{
  "v": 1,
  "updatedAt": "2026-11-15T08:00:00.000Z",
  "entries": [
    {
      "id": "3f2f0c0e-…",
      "name": "Cà phê",
      "description": "Hai ly, chia đôi",
      "qty": 2,
      "price": 35000,
      "createdAt": "2026-11-15T08:00:00.000Z"
    }
  ]
}
```

- `entries` là mảng chỉ-thêm; `id` là UUID sinh trên trình duyệt để tránh ghi trùng khi thử lại.
- Trang tĩnh đọc file qua GitHub Contents API; đọc được công khai, không cần token.
- Khi ghi, ứng dụng đọc file kèm `sha`, thêm khoản mới rồi `PUT` lại file. Nếu người khác vừa ghi trước, GitHub trả `409`, ứng dụng đọc lại và thử lại (tối đa 4 lần) nên không ghi đè dữ liệu của người khác.
- Ứng dụng không gọi API sửa/xoá nào; để ẩn dữ liệu phải sửa file bằng tay trên GitHub.

## Ghi không cần token (khuyến nghị)

GitHub không cho phép ghi file ẩn danh, nên để **mọi người lưu được mà không phải dán token**, thư mục [`server/`](server) chứa một **Cloudflare Worker** giữ token GitHub ở phía máy chủ:

```
Trình duyệt ──POST /entries──▶ Worker (giữ token GitHub) ──PUT──▶ quan-li-data/ledger.json
```

- Trang chỉ gọi Worker; token không bao giờ có trong HTML/JS và không gửi về trình duyệt.
- Worker chỉ có hai thao tác: đọc sổ và **thêm** khoản mới — không có endpoint sửa/xoá.
- Worker tự đọc `sha`, gộp khoản mới rồi ghi lại; nếu người khác vừa ghi trước (`409`) thì đọc lại và thử lại, tối đa 4 lần.
- Mã nguồn: [`server/worker.js`](server/worker.js) · cấu hình [`server/wrangler.toml`](server/wrangler.toml) · hướng dẫn deploy [`server/README.md`](server/README.md).

Bật chế độ này bằng cách triển khai Worker rồi ghi URL vào [`docs/backend.json`](docs/backend.json):

```json
{
  "url": "https://quan-li-ledger.<tài-khoản>.workers.dev"
}
```

Khi `url` để trống, trang quay về chế độ token dán một lần như mô tả bên dưới.

## Thêm khoản chi (chế độ token, khi chưa có backend)

GitHub yêu cầu xác thực cho mọi thao tác ghi file, nên nếu chưa triển khai Worker thì trang tĩnh cần một token ghi. Token **không** được nhúng vào trang (ai mở web cũng đọc được và có thể sửa/xoá dữ liệu); mỗi người ghi dán token của mình một lần:

1. Tạo **fine-grained token** ở https://github.com/settings/personal-access-tokens/new.
2. **Repository access** = `Only select repositories` → `quan-li-data`.
3. **Repository permissions** → `Contents` = **Read and write** (`Metadata` tự động có ở mức Read).
4. Trong ứng dụng, bấm **Bật ghi trực tiếp bằng token**, dán token và lưu.
5. Nhập khoản chi và bấm **Lưu khoản chi**. Token chỉ nằm trong `localStorage` của trình duyệt đó, chỉ gửi tới `api.github.com`, và xoá được bằng nút **Xóa token của tôi**.

Không có token thì vẫn xem được toàn bộ sổ, nhưng nút lưu sẽ nhắc dán token. Token fine-grained chỉ cấp được cho repo mà bạn sở hữu hoặc là cộng tác viên; người ngoài muốn ghi cần được mời làm cộng tác viên của `quan-li-data`.

## Kiến trúc

```
Trình duyệt
├── docs/index.html + styles.css   Giao diện
├── docs/app.js                    Đọc/ghi ledger.json (Worker hoặc GitHub API), gọi core C++
├── docs/backend.json              URL Worker (rỗng = chế độ token)
└── docs/core.js + core.wasm       Core C++ đã biên dịch bằng Emscripten
        ▲
        └── src/core.cpp           Giữ bản sao danh sách, tính tiền và thống kê

Cloudflare Worker (server/)
└── /entries                       Giữ token GitHub, chỉ đọc và thêm khoản

GitHub
└── quan-li-data/ledger.json       Nguồn dữ liệu chung, chỉ thêm khoản mới
```

Các hàm C++ được export qua Embind:

| Hàm | Mô tả |
| --- | --- |
| `addEntry(id, name, description, qty, price)` | Nạp một khoản vào core; trả về `false` nếu dữ liệu không hợp lệ hoặc trùng id |
| `clearEntries()` | Xoá bản sao trong bộ nhớ trước khi nạp lại từ file |
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
│   ├── backend.json    # URL Worker ghi dữ liệu
│   ├── core.js         # Sinh ra bởi build
│   └── core.wasm       # Sinh ra bởi build
├── server/             # Cloudflare Worker giữ token GitHub
│   ├── worker.js
│   ├── wrangler.toml
│   └── README.md
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

Mở http://localhost:8080. Trang đọc file thật từ `quan-li-data`.

Muốn thử phần ghi khi chạy local mà chưa deploy Worker, tạo `docs/config.json` (đã nằm trong `.gitignore`, không commit) rồi tải lại trang:

```json
{
  "owner": "ngominhkhoi150889",
  "repo": "quan-li-data",
  "branch": "main",
  "token": "github_pat_..."
}
```

Chỉ dùng cách này trên máy cá nhân; tệp cấu hình chứa token không được đưa lên hosting công khai.

## Giới hạn hiện tại

- Hiển thị tối đa 5000 khoản gần nhất (file chứa tối đa 20000 khoản do Worker cắt bớt phần cũ).
- Ứng dụng không có sửa/xoá; muốn sửa dữ liệu phải sửa `ledger.json` trực tiếp trên GitHub.
- Đọc công khai qua Contents API bị giới hạn 60 request/giờ mỗi IP; trang giãn nhịp làm mới (5 phút/lần khi tab đang mở) và tự chuyển sang đọc raw.githubusercontent.com khi bị giới hạn. Khi có token, hạn mức cao hơn nhiều. Ở chế độ backend, trang đọc qua Worker (15 giây cache) nên không đụng hạn mức ẩn danh.
- Ghi cần token `Contents: Read and write`; hai người ghi cùng lúc được xử lý bằng `sha` + thử lại, không ghi đè nhau.
- Ai biết URL Worker đều thêm được khoản mới — đúng thiết kế "ai cũng thêm được". Nếu bị spam, bật Cloudflare Turnstile hoặc rate limit; Cloudflare Workers free cho 100.000 request/ngày.
