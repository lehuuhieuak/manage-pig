# Theo dõi triển khai PLAN.md

## Phân công

- [x] Backend: PostgreSQL, migration, API, kiểm tra dữ liệu, giao dịch, chống ghi trùng, phiên bản bản ghi.
- [x] Frontend: giao diện tiếng Việt trên điện thoại, trại/đợt/thu chi/báo cáo, PWA.
- [x] Tích hợp: hướng dẫn cấu hình, môi trường PostgreSQL thử nghiệm, kiểm thử API và trình duyệt.
- [x] Reviewer độc lập cho backend; áp dụng skill Vercel khi review mã Next.js.
- [x] Reviewer độc lập cho frontend; áp dụng skill Vercel React/Next.js.
- [x] Reviewer độc lập cho phần tích hợp.
- [x] Orchestrator: sửa các phát hiện, chạy typecheck/lint/build/API/E2E và ghi nhận giới hạn thực tế.

## Quyết định

- Dùng PostgreSQL thử nghiệm riêng; người dùng xác nhận chưa cấu hình DATABASE_URL thật.
- Chưa triển khai lên Vercel hoặc đụng vào PostgreSQL của gia đình.
- Reviewer dùng `vercel-react-best-practices` từ `vercel-labs/agent-skills`, tải vào `/tmp/manage-pig-skills/react-best-practices` trong phiên làm việc.
- Review Next.js bổ sung dùng `next-best-practices` từ `vercel-labs/openreview`, tại `/tmp/manage-pig-skills/next-best-practices`.
- API chung: GET `/api/data`; POST `/api/mutate`; dữ liệu tiền là chuỗi số thập phân, tính lại tại máy chủ.
- Không có đăng nhập hoặc ghi dữ liệu khi offline trong bản đầu.

## Kiểm tra sau khi có môi trường thật

- [ ] Cấu hình database và tài khoản PostgreSQL riêng trên server gia đình; chạy migration.
- [ ] Triển khai HTTPS (Vercel), cấu hình biến môi trường và kiểm tra đường mạng tới PostgreSQL.
- [ ] Kiểm tra hai điện thoại thật, bàn phím và cài biểu tượng Android/iPhone theo README.

Các mục này cần môi trường thật; trong phiên này người dùng chọn PostgreSQL thử nghiệm trước.
