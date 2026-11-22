# PWA quản lý tiền cám và lời/lỗ nuôi heo — bản đầu

## 1. Mục tiêu và công nghệ

Xây dựng ứng dụng tiếng Việt để ba mẹ ghi thu, chi trên điện thoại và xem lời/lỗ ước tính theo từng đợt nuôi tại từng trại.

- Dùng **Next.js + TypeScript**, giao diện Tailwind CSS; xử lý phía máy chủ trong cùng dự án.
- Dùng trực tiếp **PostgreSQL trên server có sẵn** của gia đình để lưu dữ liệu tập trung. Máy chủ Next.js kết nối cơ sở dữ liệu qua biến môi trường `DATABASE_URL`; không sử dụng Supabase. Tính năng đăng nhập và phân quyền sẽ được bổ sung ở lớp ứng dụng sau này.
- Cấu hình PWA với biểu tượng, manifest và chế độ mở như ứng dụng. Bản đầu cần mạng để đọc và ghi dữ liệu. [Tài liệu manifest](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest)
- Chạy thử bằng môi trường local, kết nối PostgreSQL có sẵn. Khi thử trên nhiều điện thoại, triển khai bản thử qua HTTPS trên Vercel; môi trường triển khai cần có kết nối mạng tới server PostgreSQL.

## 2. Màn hình và thao tác

**Trang chủ:** danh sách trại, nút thêm trại và lối vào bảng tổng hợp.

**Trong trại:** hiển thị đợt đang nuôi, thu − chi tạm tính và bốn nút lớn: **Nhập cám, Bán heo, Tiền công, Chi phí khác**. Có danh sách các đợt cũ.

**Đợt nuôi:**

- Tạo đợt với tên, ngày bắt đầu, số heo mua và tổng tiền giống.
- Mỗi trại có tối đa một đợt đang nuôi.
- Hiển thị lịch sử thu chi, cho phép sửa; xóa khoản ghi nhận cần xác nhận.
- Bấm “Kết thúc đợt”, ghi ngày kết thúc và xem lời/lỗ. Vẫn được bổ sung, sửa chi phí hoặc tiền bán sau đó; kết quả tự tính lại.
- Không cho xóa trại hoặc đợt đã có giao dịch trong bản đầu.

**Thiết kế trên điện thoại:** chữ rõ, nút lớn có nhãn, biểu mẫu một cột, bàn phím số cho tiền và số lượng. Ngày mặc định hôm nay, tiền hiển thị theo VND. Khi lưu lỗi, giữ nguyên nội dung đã nhập và cho thử lại.

## 3. Ghi nhận và tính toán

| Khoản | Thông tin nhập | Cách tính |
|---|---|---|
| Heo giống | Số con, tổng tiền giống khi tạo đợt | Tổng tiền nhập |
| Cám | Ngày, nhiều dòng loại cám; mỗi dòng có số bao, giá/bao, chiết khấu/bao | Số bao × (giá − chiết khấu), cộng tất cả dòng |
| Bán heo | Ngày, số con, tổng kg, giá/kg | Tổng kg × giá/kg |
| Tiền công | Tháng, tổng tiền công của đợt | Ba mẹ tự chia nếu một tháng có hai đợt |
| Chi phí khác | Ngày, nội dung, số tiền | Tổng tiền nhập |

- Có danh mục loại cám, thêm nhanh ngay khi nhập đơn. Tự điền giá và chiết khấu từ lần mua gần nhất của loại cám đó; cho sửa trước khi lưu.
- Mỗi dòng đơn cám lưu riêng tên, giá và chiết khấu tại thời điểm mua để đơn cũ không đổi theo danh mục.
- Mỗi đợt có một khoản tổng tiền công cho mỗi tháng; nhập lại tháng đã có sẽ mở khoản cũ để sửa.
- Chiết khấu mặc định bằng 0, không lớn hơn giá/bao. Số con, số bao là số nguyên dương; kg cho phép số thập phân.
- Tiền tính bằng kiểu số thập phân, làm tròn thành tiền đến đồng; phía máy chủ kiểm tra và tính lại trước khi lưu.

**Lời/lỗ = tiền bán − tiền giống − tiền cám − tiền công − chi phí khác.**

Đợt đang nuôi hiển thị “Thu − chi tạm tính”. Không ước tính giá trị heo hoặc cám còn lại.

**Bảng tổng hợp:** mỗi dòng là một đợt đã kết thúc, gồm trại, tên đợt, ngày kết thúc, tổng tiền bán, từng nhóm chi phí, tổng chi và lời/lỗ. Có dòng tổng cộng; lọc theo trại và khoảng ngày kết thúc. Mặc định xem tất cả đợt đã kết thúc, mới nhất trước.

## 4. Dữ liệu và khả năng thêm tài khoản

- Các thực thể chính: gia đình, trại, đợt nuôi, loại cám, đơn cám và chi tiết, lần bán heo, khoản chi.
- Mọi dữ liệu nghiệp vụ thuộc một gia đình; bản thử dùng một gia đình mặc định.
- Các thao tác đọc/ghi đi qua lớp xử lý máy chủ. Bản thử lấy gia đình mặc định từ cấu hình; sau này thay bằng gia đình mà tài khoản được cấp quyền truy cập.
- Chưa tạo màn hình tài khoản. Khi bổ sung đăng nhập, tạo liên kết tài khoản–gia đình và giữ nguyên dữ liệu hiện có.
- Thông tin kết nối PostgreSQL chỉ nằm phía máy chủ, không đưa vào mã phía trình duyệt hoặc Git. Trình duyệt đọc/ghi qua ứng dụng Next.js, không kết nối cơ sở dữ liệu trực tiếp. Dùng database và tài khoản cơ sở dữ liệu riêng cho ứng dụng trên server có sẵn.
- Lưu đơn cám và các dòng trong một giao dịch; chống ghi trùng khi bấm lưu nhiều lần. Phát hiện bản ghi đã được máy khác sửa và yêu cầu tải lại trước khi ghi đè.

## 5. Kiểm thử và giới hạn bản đầu

**Kiểm thử chính:**

- Đơn cám nhiều loại, chiết khấu theo bao, sửa giá mới không làm thay đổi đơn cũ.
- Ví dụ 10 bao × (300.000 − 20.000) = 2.800.000đ.
- Một đợt có nhiều lần bán, nhiều tháng tiền công và nhiều chi phí khác; báo cáo khớp các khoản đã nhập.
- Đợt kết thúc vẫn sửa được và bảng tổng hợp cập nhật đúng.
- Hai điện thoại cùng dùng dữ liệu; lưu lặp, mất mạng hoặc lỗi máy chủ không báo thành công sai hay tạo trùng.
- Kiểm tra biểu mẫu và việc thêm biểu tượng lên màn hình chính trên Android, iPhone.

**Giả định đã chốt:**

- Ước tính lời/lỗ dựa trên khoản đã ghi; không quản lý tồn đàn, heo chết, chuyển trại hay tồn cám.
- Thanh toán đủ ngay; không có công nợ, thông tin người mua/người bán.
- Không quản lý từng nhân công, chỉ tổng tiền công tháng.
- Chưa có đăng nhập, chế độ offline, biểu đồ hoặc xuất Excel.
- Dùng tiếng Việt, VND và múi giờ Việt Nam.
