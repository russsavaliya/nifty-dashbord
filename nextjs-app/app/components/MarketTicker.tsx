'use client';

import { useEffect, useState } from 'react';

interface TickerData {
  price: number;
  change: number;
  changePct: number;
  prevClose: number;
}

interface Candle {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}

const DEFAULT: Record<string, TickerData> = {
  nifty50:   { price: 0, change: 0, changePct: 0, prevClose: 0 },
  banknifty: { price: 0, change: 0, changePct: 0, prevClose: 0 },
};

async function fetchLatestPrice(symbol: string): Promise<{ close: number; open: number } | null> {
  try {
    const res = await fetch(`/api/historical?symbol=${symbol}&interval=1minute`);
    if (!res.ok) return null;
    const data = await res.json() as { candles?: Candle[] };
    if (!data.candles?.length) return null;
    const latest = data.candles[data.candles.length - 1];
    const first  = data.candles[0];
    return { close: latest.close, open: first.open };
  } catch {
    return null;
  }
}

export default function MarketTicker() {
  const [tickers, setTickers] = useState<Record<string, TickerData>>(DEFAULT);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function refresh() {
    const [nifty, bank] = await Promise.all([
      fetchLatestPrice('nifty50'),
      fetchLatestPrice('banknifty'),
    ]);

    setTickers((prev) => {
      const next = { ...prev };
      if (nifty) {
        const change    = nifty.close - nifty.open;
        const changePct = (change / nifty.open) * 100;
        next.nifty50 = { price: nifty.close, change, changePct, prevClose: nifty.open };
      }
      if (bank) {
        const change    = bank.close - bank.open;
        const changePct = (change / bank.open) * 100;
        next.banknifty = { price: bank.close, change, changePct, prevClose: bank.open };
      }
      return next;
    });
    setLastUpdated(new Date());
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmt    = (p: number) => p.toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const fmtPct = (p: number) => `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`;

  const items = [
    { key: 'nifty50',   label: 'NIFTY 50' },
    { key: 'banknifty', label: 'BANK NIFTY' },
  ];

  return (
    <div className="bg-white border-b border-slate-200 px-5 py-2.5 flex items-center gap-8">
      {items.map(({ key, label }) => {
        const t    = tickers[key];
        const isUp = t.change >= 0;
        const has  = t.price > 0;

        return (
          <div key={key} className="flex items-center gap-2.5">
            <span className="text-slate-500 text-xs font-semibold tracking-wider">{label}</span>
            {has ? (
              <>
                <span className="text-slate-900 font-bold text-sm">{fmt(t.price)}</span>
                <span className={`flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded ${isUp ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                  {isUp ? '▲' : '▼'} {fmt(Math.abs(t.change))}
                  <span className="text-xs opacity-80">({fmtPct(t.changePct)})</span>
                </span>
              </>
            ) : (
              <span className="text-slate-400 text-xs">— Loading...</span>
            )}
          </div>
        );
      })}

      <div className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
        <span className={`w-1.5 h-1.5 rounded-full ${lastUpdated ? 'bg-green-500' : 'bg-slate-400'}`} />
        {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString('en-IN')}` : 'Loading...'}
      </div>
    </div>
  );
}
