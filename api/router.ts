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
  const path = url.pathname;

  if (path.includes('/scan-firsat')) return scanFirsat(req, res);
  if (path.includes('/check-signals')) return checkSignals(req, res);
  if (path.includes('/alarms')) return alarms(req, res);
  if (path.includes('/backtest')) return backtest(req, res);
  
  if (path.includes('/binance-proxy')) {
    req.query = {
      path: url.searchParams.get('path'),
      ...Object.fromEntries(url.searchParams.entries())
    };
    return binanceProxy(req, res);
  }
  
  if (path.includes('/dnd-summary')) return dndSummary(req, res);
  if (path.includes('/formation-projection')) return formationProjection(req, res);
  if (path.includes('/formation-stats')) return formationStats(req, res);
  if (path.includes('/market-summary')) return marketSummary(req, res);
  if (path.includes('/scan-multi-timeframe')) return scanMultiTimeframe(req, res);
  if (path.includes('/scan-short-term')) return scanShortTerm(req, res);

  return res.status(404).json({ error: 'API rotası bulunamadı' });
}