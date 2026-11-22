# Sổ trại heo

Ứng dụng tiếng Việt để ghi thu chi nuôi heo theo trại và đợt nuôi. Dùng Next.js, TypeScript, Tailwind CSS và PostgreSQL trực tiếp. Bản đầu cần mạng; dữ liệu không được lưu offline.

## Chạy trên máy phát triển

Cần Node.js 20.9 trở lên (khuyến nghị Node.js 24 LTS), npm và PostgreSQL 16 trở lên.

```bash
npm ci
cp .env.example .env
```

Sửa `DATABASE_URL` trong `.env` thành kết nối tới database và tài khoản PostgreSQL riêng cho ứng dụng. Giữ `DEFAULT_FAMILY_ID` ổn định: đây là gia đình sở hữu dữ liệu của bản thử. Đừng đổi giá trị này sau khi đã nhập dữ liệu nếu muốn tiếp tục xem cùng dữ liệu.

```bash
npm run db:migrate
npm run dev
```

Mở <http://localhost:3000>. Khi chạy bản production:

```bash
npm run build
npm start
```

Không đưa `.env` vào Git. Chuỗi kết nối chỉ được dùng ở máy chủ; trình duyệt gọi API Next.js. Khi PostgreSQL yêu cầu TLS, cấu hình kết nối đúng theo chứng chỉ và hướng dẫn của máy chủ; không tắt xác minh chứng chỉ để khắc phục lỗi kết nối.

## PostgreSQL thử nghiệm

File `.env.example` mặc định trỏ đến PostgreSQL riêng trên cổng `55439`. Cấu hình `compose.test.yaml` hiện mở cổng này trên các địa chỉ mạng của máy chạy Docker (`0.0.0.0`).

```bash
docker compose -f compose.test.yaml up -d --wait
cp .env.example .env
npm run db:migrate
npm run dev
```

Tắt database thử nghiệm, giữ dữ liệu để lần sau dùng tiếp:

```bash
docker compose -f compose.test.yaml down
```

Chỉ khi muốn xóa toàn bộ dữ liệu thử nghiệm, dùng `docker compose -f compose.test.yaml down -v`. Không dùng thông tin đăng nhập mẫu cho database thật.

## Kiểm thử

Chạy kiểm tra tĩnh và build:

```bash
npm run typecheck
npm run lint
npm run build
```

Bộ kiểm thử tích hợp gọi API thật và dùng database thật. Trước khi chạy, bật PostgreSQL thử nghiệm, chạy migration và mở ứng dụng ở terminal khác như hướng dẫn trên. **Chỉ chạy với database thử nghiệm**: kiểm thử tạo các trại/đợt có tên duy nhất và giữ lại giao dịch để kiểm tra quy tắc không cho xóa dữ liệu đã phát sinh.

```bash
npm test
```

Có thể đổi máy chủ bằng `TEST_BASE_URL=http://127.0.0.1:3001 npm test`.

`npm run test:unit` chạy riêng kiểm tra tính tiền/đầu vào, không cần máy chủ. `npm run test:db` chạy kiểm tra giao dịch, ghi đồng thời và phạm vi gia đình trực tiếp trên PostgreSQL thử nghiệm; cần `DATABASE_URL` trong môi trường hoặc `.env` và đã chạy migration.

Kiểm thử trình duyệt mô phỏng điện thoại Chromium và WebKit:

```bash
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

Các bài kiểm tra bao gồm biểu mẫu, lỗi mạng giữ nội dung, ghi dữ liệu, manifest và kích thước màn hình. Trình duyệt mô phỏng không thay thế kiểm tra trên thiết bị thật.

## Cách dùng

1. Thêm trại, vào trại và tạo đợt với ngày bắt đầu, số con và tổng tiền giống.
2. Dùng bốn nút **Nhập cám**, **Bán heo**, **Tiền công**, **Chi phí khác** để ghi nhận. Một đơn cám có thể có nhiều dòng loại cám; giá và chiết khấu được lưu cùng từng dòng.
3. Tiền công mỗi đợt chỉ có một khoản mỗi tháng. Chọn lại tháng đã ghi để sửa khoản đó.
4. Lịch sử cho phép sửa; xóa khoản ghi nhận cần xác nhận. Nếu điện thoại khác đã sửa, tải lại dữ liệu trước khi chỉnh tiếp.
5. Kết thúc đợt rồi mở **Bảng tổng hợp** để lọc theo trại và ngày kết thúc. Sau khi kết thúc vẫn được bổ sung hoặc sửa khoản thu chi.

Thu − chi tạm tính / lời lỗ = tiền bán − tiền giống − tiền cám − tiền công − chi phí khác. Không tính giá trị heo, cám còn lại; không theo dõi tồn đàn, công nợ hoặc từng nhân công.

## Thử trên Android và iPhone

Triển khai bản thử qua HTTPS (chẳng hạn Vercel), đặt `DATABASE_URL` và `DEFAULT_FAMILY_ID` trong biến môi trường phía máy chủ. Môi trường triển khai phải kết nối được tới PostgreSQL. Chạy migration một lần bằng kết nối đúng trước khi sử dụng; build không tự thay đổi database.

Bản này chưa có tài khoản hay phân quyền người dùng. Khi dùng dữ liệu thật, chỉ mở bản thử cho người trong gia đình bằng cơ chế giới hạn truy cập ở lớp triển khai. `DEFAULT_FAMILY_ID` là cấu hình phạm vi dữ liệu, không phải mật khẩu.

Trên Android mở bằng Chrome và chọn **Thêm vào màn hình chính / Cài đặt ứng dụng**. Trên iPhone mở bằng Safari, chọn **Chia sẻ → Thêm vào MH chính**. Biểu tượng và manifest hỗ trợ mở dạng ứng dụng; bản đầu không có chế độ offline.

Cần tự kiểm tra trước khi dùng chính thức:

- Hai điện thoại cùng thấy dữ liệu sau khi tải lại; sửa đồng thời hiển thị yêu cầu tải lại.
- Mất mạng khi lưu giữ nguyên nội dung và cho thử lại; không báo thành công khi chưa lưu.
- Đơn 10 bao × (300.000 − 20.000) hiển thị 2.800.000đ; ngày theo múi giờ Việt Nam.
- Biểu tượng trên màn hình chính Android/iPhone, bàn phím số, nhãn, kích thước chữ và biểu mẫu khi xoay màn hình.

## Docker

`compose.yaml` build và chạy Next.js production dạng standalone, kết nối tới PostgreSQL có sẵn qua `DATABASE_URL`. Cần Docker Engine và Docker Compose v2 trở lên. Nếu chưa có `.env`, tạo từ mẫu dành cho Docker:

```bash
cp .env.docker.example .env
```

Nếu đã có `.env`, giữ lại file và bổ sung các biến theo `.env.docker.example`. Đặt `DATABASE_URL` thành kết nối mà container truy cập được. Với PostgreSQL trên cùng máy Docker, dùng `host.docker.internal` thay cho `localhost`; với server khác, dùng IP hoặc tên miền của server đó. `localhost` trong container chỉ chính container ứng dụng.

Mẫu Docker trỏ tới PostgreSQL thử nghiệm của dự án trên cổng `55439`. Nếu dùng mẫu này, bật database trước:

```bash
docker compose -f compose.test.yaml up -d --wait
```

Sau khi PostgreSQL đã sẵn sàng, chạy ứng dụng:

```bash
docker compose up -d --build --wait
```

Mở <http://localhost:3000>. Compose chạy service `migrate` một lần để tạo cấu trúc dữ liệu và gia đình mặc định, sau đó mới khởi động `web`. Nếu migration lỗi, ứng dụng chưa được khởi động; xem lỗi bằng `docker compose logs migrate`. `--wait` chờ API kết nối được PostgreSQL. Biến môi trường kết nối chỉ được truyền khi chạy container, không đưa vào image hay bước build.

Các lệnh thường dùng:

```bash
docker compose logs -f web
docker compose ps --all
docker compose down
```

`down` dừng các service của ứng dụng và không xóa PostgreSQL có sẵn hay dữ liệu của nó. Đổi `APP_PORT` trong `.env` nếu cổng `3000` đang dùng. Để truy cập qua IP của máy chạy Docker trong mạng gia đình, đặt `BIND_ADDRESS=0.0.0.0` rồi chạy lại lệnh `up`; khi dùng reverse proxy/tên miền, có thể đặt thêm `APP_ORIGIN` khớp địa chỉ truy cập thực tế.
