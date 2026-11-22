import { mutate } from '@/server/service';
import { errorResponse } from '@/server/http';
import { AppError } from '@/server/domain';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    // JSON-only plus Origin validation prevents cross-site form submissions in this account-free pilot.
    const origin = request.headers.get('origin');
    if (origin) {
      let allowed = false;
      try {
        const parsed = new URL(origin);
        allowed = process.env.APP_ORIGIN
          ? parsed.origin === new URL(process.env.APP_ORIGIN).origin
          : ['http:', 'https:'].includes(parsed.protocol) && parsed.host === request.headers.get('host');
      } catch { /* Invalid origins are rejected below. */ }
      if (!allowed) throw new AppError('Yêu cầu không hợp lệ.', 403, 'ORIGIN');
    }
    if (!request.headers.get('content-type')?.includes('application/json')) throw new AppError('Vui lòng gửi dữ liệu JSON.', 415, 'CONTENT_TYPE');
    const body = await request.text();
    if (body.length > 200000) throw new AppError('Nội dung quá lớn.', 413, 'TOO_LARGE');
    await mutate(JSON.parse(body));
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}
