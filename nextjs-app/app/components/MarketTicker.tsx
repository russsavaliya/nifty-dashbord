'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface TickerData {
  price: number;
  change: number;
  changePct: number;
  prevClose: number;
}

interface CandleUpdate {
  symbol: string;
  candle: { time: number; open: number; high: number; low: number; close: number; volume: number };
}

const DEFAULT: Record<string, TickerData> = {
  nifty50:    { price: 0, change: 0, changePct: 0, prevClose: 0 },
  banknifty:  { price: 0, change: 0, changePct: 0, prevClose: 0 },
};

let socketInstance: Socket | null = null;

export default function MarketTicker() {
  const [tickers, setTickers] = useState<Record<string, TickerData>>(DEFAULT);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!socketInstance) {
      socketInstance = io({ path: '/api/socket', transports: ['polling'] });
    }
    socketInstance.on('connect',    () => setConnected(true));
    socketInstance.on('disconnect', () => setConnected(false));
    socketInstance.on('candle_update', (data: CandleUpdate) => {
      setTickers((prev) => {
        const ex = prev[data.symbol];
        const change    = ex?.prevClose ? data.candle.close - ex.prevClose : 0;
        const changePct = ex?.prevClose ? (change / ex.prevClose) * 100 : 0;
        return {
          ...prev,
          [data.symbol]: {
            price: data.candle.close,
            change,
            changePct,
            prevClose: ex?.prevClose || data.candle.open,
          },
        };
      });
    });
    return () => {
      socketInstance?.off('candle_update');
      socketInstance?.off('connect');
      socketInstance?.off('disconnect');
    };
  }, []);

  const fmt   = (p: number) => p.toLocaleString('en-IN', { minimumFractionDigits: 2 });
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
              <span className="text-slate-400 text-xs">—  Waiting for live data</span>
            )}
          </div>
        );
      })}

      <div className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
        <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-slate-600'}`} />
        {connected ? 'Socket live' : 'Offline'}
      </div>
    </div>
  );
}
