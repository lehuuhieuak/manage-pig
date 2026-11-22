# Kết quả review độc lập

Mỗi phần triển khai được giao cho subagent; sau khi hoàn thành, subagent khác review. Orchestrator tích hợp và xử lý phát hiện.

## Skill sử dụng

- [Next.js Best Practices — vercel-labs/openreview](https://github.com/vercel-labs/openreview/tree/main/.agents/skills/next-best-practices)
- [Vercel React Best Practices — vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices)

## Backend

- P1: kiểm tra Origin bằng URL nội bộ Next.js có thể chặn thao tác lưu hợp lệ. Đã so với Host của yêu cầu hoặc APP_ORIGIN được cấu hình. Có kiểm thử cùng nguồn thành công, khác nguồn bị từ chối và trình duyệt gọi API thật.
- P2: Decimal mặc định có thể làm tròn lệch một đồng với tích số lớn. Đã dùng Decimal clone precision 50 ở máy chủ và giao diện, thêm kiểm thử hồi quy. Hiển thị tiền bằng BigInt để không mất độ chính xác khi đổi sang Number.
- Đã review lại bằng skill Next.js sau khi sửa; không còn phát hiện cần chặn ở phần này.

## Tích hợp

- P2: E2E giả lập API bỏ sót kiểm tra trình duyệt lưu qua API thật. Đã thêm e2e/live-api.spec.ts.
- P2: chưa kiểm tra bảng tổng hợp trên giao diện. Đã thêm e2e/report.spec.ts với nhóm chi phí, tổng cộng, bộ lọc và sửa chi phí sau khi kết thúc.
- Migration nạp `.env` bằng @next/env; không tự chạy migration khi build.

## Frontend

- P2: đổi tháng tiền công đang sửa có thể bỏ ID/version và tạo bản ghi mới. Đã giữ ID/version của bản ghi cũ khi chuyển sang tháng chưa có.
- P2: sau lỗi mạng, thử lại nhận lỗi đầu vào rõ ràng vẫn bị khóa biểu mẫu. Đã mở khóa khi có kết quả từ chối xác định; tiếp tục giữ request ID và khóa dữ liệu khi chưa xác nhận được hoặc gặp HTTP 5xx.
- P2: xung đột tiền công hoặc đợt đang nuôi thiếu thao tác tải lại dữ liệu. Đã bổ sung, giữ tháng tiền công đang chọn khi mở khoản hiện có từ máy khác.
- Đã bổ sung ba E2E hồi quy trong e2e/labor-retry.spec.ts; reviewer đã kiểm tra lại các sửa đổi và không còn phát hiện cần chặn.

## Kiểm chứng thực tế

- `npm run typecheck`, `npm run lint`, `npm run build`: đạt.
- `npm test` trên PostgreSQL thử nghiệm và API production: 14 bài đạt; bài kiểm thử PostgreSQL trực tiếp tách riêng được bỏ qua trong lệnh này.
- `npm run test:db`: đạt (giao dịch, chống trùng, sửa đồng thời, phạm vi gia đình và dữ liệu lịch sử).
- Playwright trên bản production: 22/22 đạt, gồm Chromium mô phỏng Pixel và WebKit mô phỏng iPhone.
- Sau khi bỏ ô ngày không dùng trong biểu mẫu tiền công: build lại đạt, chạy lại 6/6 trường hợp hồi quy tiền công/lỗi mạng trên hai trình duyệt đều đạt.
- Đã xem ảnh chụp giao diện ở chiều rộng 390px.
- Chưa kiểm tra trên Android/iPhone vật lý, PostgreSQL gia đình hoặc triển khai HTTPS/Vercel.
