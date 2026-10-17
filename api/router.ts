// api/router.ts

import scanFirsat from './_lib/scan-firsat.js';
import checkSignals from './_lib/check-signals.js';
import alarms from './_lib/alarms.js';
import backtest from './_lib/backtest.js';
import binanceProxy from './_lib/binance-proxy.js';
import dndSummary from './_lib/dnd-summary.js';
import formationProjection from './_lib/formation-projection.js';
import formationStats from './_lib/formation-stats.js';
import marketSummary from './_lib/market-summary.js';
import scanMultiTimeframe from './_lib/scan-multi-timeframe.js';
import scanShortTerm from './_lib/scan-short-term.js';

export default async function handler(req: any, res: any) {
  const url = new URL(req.url, `http://${req.headers?.host || 'localhost'}`);

  // vercel.json'dan gelen originalPath parametresini al
  const originalPath = url.searchParams.get('originalPath') || url.pathname;

  // Gelen originalPath'e göre doğru fonksiyonu çağır
  if (originalPath.includes('/scan-firsat')) return scanFirsat(req, res);
  if (originalPath.includes('/check-signals')) return checkSignals(req, res);
  if (originalPath.includes('/alarms')) return alarms(req, res);
  if (originalPath.includes('/backtest')) return backtest(req, res);

  if (originalPath.includes('/binance-proxy')) {
    // Gelen tüm query parametrelerini (path dahil) binance-proxy'ye aktar
    req.query = {
      ...Object.fromEntries(url.searchParams.entries())
    };
    return binanceProxy(req, res);
  }

  if (originalPath.includes('/dnd-summary')) return dndSummary(req, res);
  if (originalPath.includes('/formation-projection')) return formationProjection(req, res);
  if (originalPath.includes('/formation-stats')) return formationStats(req, res);
  if (originalPath.includes('/market-summary')) return marketSummary(req, res);
  if (originalPath.includes('/scan-multi-timeframe')) return scanMultiTimeframe(req, res);
  if (originalPath.includes('/scan-short-term')) return scanShortTerm(req, res);

  return res.status(404).json({ error: 'API rotası bulunamadı' });
}