// api/router.ts
import scanFirsat from './_lib/scan-firsat';

export default async function handler(req: any, res: any) {
  const path = req.url?.split('?')[0] ?? '';

  if (path.includes('/scan-firsat')) {
    return scanFirsat(req, res);
  }

  return res.status(404).json({ error: 'API rotası bulunamadı' });
}