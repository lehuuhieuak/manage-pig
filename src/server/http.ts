import { ZodError } from 'zod';
import { AppError } from './domain';

export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof ZodError) return Response.json({ error: error.issues[0]?.message ?? 'Dữ liệu nhập không hợp lệ.', code: 'VALIDATION' }, { status: 400 });
  if (error instanceof SyntaxError) return Response.json({ error: 'Nội dung gửi lên không hợp lệ.', code: 'VALIDATION' }, { status: 400 });
  // Do not expose query text, connection strings or credentials in API responses/logs.
  console.error('Manage Pig request failed:', error instanceof Error ? error.name : 'UnknownError');
  return Response.json({ error: 'Không thể kết nối hoặc lưu dữ liệu. Vui lòng thử lại, nội dung nhập của bạn vẫn được giữ.', code: 'SERVER_ERROR' }, { status: 503 });
}
