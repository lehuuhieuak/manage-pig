import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Sổ trại nhà · Thu chi nuôi heo',
  description: 'Ghi tiền cám, tiền bán heo và xem lời lỗ từng đợt nuôi của gia đình.',
  applicationName: 'Sổ trại nhà',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Sổ trại nhà' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#245b43' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
