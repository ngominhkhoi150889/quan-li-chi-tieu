# Backend ghi sổ · Cloudflare Worker

Worker này giữ token GitHub và thay mọi người ghi khoản chi vào `ledger.json`. Trang GitHub Pages chỉ gọi Worker, nên người dùng không cần token và không rời trang.

- `GET /entries` — trả nội dung `ledger.json`.
- `POST /entries` — kiểm tra dữ liệu rồi thêm một khoản; không có thao tác sửa/xoá.
- `GET /health` — kiểm tra Worker sống.

Token GitHub nằm trong secret của Worker, không bao giờ gửi về trình duyệt. Worker chỉ có quyền ghi file qua token đó; người dùng cuối không sửa/xoá được khoản đã lưu.

## Thiết lập một lần

1. Tạo tài khoản Cloudflare miễn phí tại https://dash.cloudflare.com/sign-up.
2. Tạo fine-grained token tại https://github.com/settings/personal-access-tokens/new:
   - Repository access: `Only select repositories` → `quan-li-data`.
   - Permissions → `Contents`: **Read and write** (`Metadata`: Read).
3. Trong thư mục này:

```bash
cd server
npx wrangler login
npx wrangler secret put GITHUB_TOKEN
# dán token fine-grained khi được hỏi
npx wrangler deploy
```

4. Copy URL in ra (dạng `https://quan-li-ledger.<tài-khoản>.workers.dev`) và ghi vào `docs/backend.json`:

```json
{
  "url": "https://quan-li-ledger.<tài-khoản>.workers.dev"
}
```

5. Commit và push `docs/backend.json`. Trang sẽ tự chuyển sang chế độ ai cũng ghi được, không cần token.

## Kiểm tra

```bash
curl https://quan-li-ledger.<tài-khoản>.workers.dev/health
curl https://quan-li-ledger.<tài-khoản>.workers.dev/entries
```

## Cấu hình

`wrangler.toml` có sẵn `LEDGER_OWNER`, `LEDGER_REPO`, `LEDGER_BRANCH`, `ALLOWED_ORIGINS`. Đổi `ALLOWED_ORIGINS` nếu chạy trang ở tên miền khác.

## Bảo mật và giới hạn

- Token chỉ nằm trong secret của Worker; không có trong HTML/JS công khai.
- Worker chỉ đọc và thêm; không có endpoint sửa/xoá.
- Ai biết URL Worker đều có thể thêm khoản mới — đúng yêu cầu "ai cũng thêm được". Nếu bị spam, cần thêm Cloudflare Turnstile hoặc rate limit.
- `ALLOWED_ORIGINS` chỉ giới hạn trình duyệt gọi từ trang; không chặn được `curl` trực tiếp.
- Free plan của Cloudflare Workers: 100.000 request/ngày.
