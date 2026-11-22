import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return { name: 'Sổ trại nhà · Thu chi nuôi heo', short_name: 'Sổ trại nhà', description: 'Ghi thu chi, xem lời lỗ nuôi heo của gia đình.', start_url: '/', display: 'standalone', background_color: '#f7f7ef', theme_color: '#245b43', lang: 'vi', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] };
}
