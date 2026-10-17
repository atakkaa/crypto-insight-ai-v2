// api/router.ts

import scanFirsat from './_lib/scan-firsat';
import checkSignals from './_lib/check-signals';
import alarms from './_lib/alarms';
import backtest from './_lib/backtest';
import binanceProxy from './_lib/binance-proxy';
import dndSummary from './_lib/dnd-summary';
import formationProjection from './_lib/formation-projection';
import formationStats from './_lib/formation-stats';
import marketSummary from './_lib/market-summary';
import scanMultiTimeframe from './_lib/scan-multi-timeframe';
import scanShortTerm from './_lib/scan-short-term';

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