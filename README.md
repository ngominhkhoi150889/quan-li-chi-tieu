# Sổ chi tiêu chung · C++ WebAssembly

Ứng dụng web ghi lại các khoản chi (tên, mô tả, số lượng, đơn giá), tính thành tiền, tổng tiền và thống kê theo mặt hàng. Danh sách được **nhiều người dùng chung**: ai có link đều xem được, người có quyền ghi có thể thêm khoản chi mới. Toàn bộ phần tính toán viết bằng **C++**, biên dịch sang **WebAssembly** bằng Emscripten.

## Demo

- Ứng dụng: https://ngominhkhoi150889.github.io/quan-li-chi-tieu/
- Kho dữ liệu chung: https://github.com/ngominhkhoi150889/quan-li-data/issues

## Tính năng

- Xem danh sách khoản chi dùng chung, kèm mô tả và thời điểm nhập.
- Thêm khoản chi: tên, mô tả (không bắt buộc), số lượng, đơn giá (VND).
- Tính thành tiền (`số lượng × đơn giá`), tổng tiền, tổng số lượng, trung bình mỗi khoản — tất cả trong C++.
- Thống kê theo mặt hàng: gộp các khoản trùng tên, xếp hạng theo số tiền, hiển thị tỷ lệ % trên tổng.
- Tự động làm mới khi quay lại tab, có nút "Làm mới", dữ liệu gần nhất được lưu tạm trên trình duyệt khi mất mạng.
- Giao diện responsive, không dùng framework, không phụ thuộc CDN.

## Dữ liệu chung lưu ở đâu?

Một repo công khai riêng là [`quan-li-data`](https://github.com/ngominhkhoi150889/quan-li-data). Mỗi khoản chi là một **GitHub Issue đang mở**:

- Tiêu đề issue = tên khoản chi.
- Nội dung issue = mô tả của người nhập, kèm khối ẩn `<!--ledger:...-->` chứa số lượng, đơn giá và khoá chống trùng (base64 JSON).
- Issue bị đóng hoặc xoá sẽ không còn xuất hiện trong sổ.

Trang web đọc dữ liệu qua GitHub REST API (đọc công khai, không cần đăng nhập). Việc ghi cần một token GitHub có quyền `Issues: Read and write` trên đúng repo dữ liệu đó. Không có server trung gian nào.

```
Trình duyệt ──đọc (công khai)──► GitHub Issues của quan-li-data
            ──ghi (token)──────►
            │
            └── docs/core.js + core.wasm  (C++ tính tiền & thống kê)
```

## Bật quyền thêm

### Cách 1: token dùng chung cho cả trang (khuyến nghị cho chủ sổ)

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Repository access**: `Only select repositories` → chọn `quan-li-data`.
3. **Repository permissions**: `Issues` = **Read and write**. (Quyền `Metadata` tự động được thêm ở mức Read.)
4. Đặt thời hạn ngắn (30–90 ngày), tạo token và sao chép.
5. Vào repo mã nguồn → **Settings → Secrets and variables → Actions → New repository secret**, tên `LEDGER_TOKEN`, dán token.
6. Chạy lại workflow **Deploy GitHub Pages** (hoặc push lên `main`). Workflow ghi `docs/config.json` từ secret rồi mới đóng gói trang.

**Lưu ý bảo mật:** trang tĩnh không có server nên token trong `docs/config.json` nằm trong gói xuất bản và **bất kỳ ai mở web đều đọc được**. Vì vậy hãy dùng token giới hạn đúng một repo dữ liệu, chỉ quyền Issues, thời hạn ngắn và thu hồi khi không dùng nữa. Đừng dùng token có quyền `repo`/`contents` hay token của tổ chức. Token không bao giờ được commit vào repo mã nguồn (`docs/config.json` nằm trong `.gitignore`).

### Cách 2: mỗi người tự nhập token

Khi trang chưa có `LEDGER_TOKEN`, nút thêm bị tắt và hiện banner "chế độ chỉ xem". Người dùng có thể bấm **Dùng token GitHub của tôi**, dán token fine-grained (cùng cấu hình như trên) để bật quyền thêm trên trình duyệt của họ. Token chỉ lưu trong `localStorage` của máy đó và chỉ gửi tới `api.github.com`.

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
├── src/core.cpp                  # Core C++
├── docs/                         # Trang web tĩnh (nguồn GitHub Pages)
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── core.js                   # Sinh ra bởi build
│   └── core.wasm                 # Sinh ra bởi build
├── scripts/build.sh              # Script build WebAssembly
├── .github/workflows/pages.yml   # Xuất bản Pages + chèn LEDGER_TOKEN
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

Mở http://localhost:8080. Trang sẽ đọc dữ liệu thật từ `quan-li-data` và ở chế độ chỉ xem.

Muốn thử phần ghi khi chạy local, tạo `docs/config.json` (đã nằm trong `.gitignore`, không commit):

```json
{
  "owner": "ngominhkhoi150889",
  "repo": "quan-li-data",
  "token": "github_pat_..."
}
```

## Giới hạn hiện tại

- Chỉ hiển thị tối đa 300 khoản mới nhất (3 trang × 100 issue).
- Không có sửa/xoá trong ứng dụng để tránh xoá nhầm dữ liệu dùng chung. Muốn ẩn một khoản, đóng issue tương ứng trên GitHub.
- Đọc công khai bị giới hạn 60 request/giờ mỗi IP; trang đã giãn nhịp làm mới (5 phút/lần, khi tab đang mở) và dùng bản lưu gần nhất nếu bị giới hạn. Khi trang có token thì hạn mức cao hơn nhiều.
