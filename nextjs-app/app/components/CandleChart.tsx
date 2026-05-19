'use client';

import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import type { IChartApi, ISeriesApi, CandlestickData, HistogramData, LineData, Time } from 'lightweight-charts';

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }
interface IndicatorData { rsi: number; macd: number; macdSignal: number; ema9: number; ema21: number; bbUpper: number; bbLower: number; price: number; }

interface Props {
  symbol: string;
  interval: string;
  title: string;
  onIndicatorsUpdate?: (d: IndicatorData) => void;
}

function calcEMA(data: number[], p: number): number[] {
  const k = 2 / (p + 1), ema: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < p - 1) ema.push(NaN);
    else if (i === p - 1) ema.push(data.slice(0, p).reduce((a, b) => a + b, 0) / p);
    else ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function calcRSI(c: number[], p = 14): number[] {
  const rsi: number[] = new Array(p).fill(NaN);
  let ag = 0, al = 0;
  for (let i = 1; i <= p; i++) { const d = c[i] - c[i-1]; if (d >= 0) ag += d; else al -= d; }
  ag /= p; al /= p;
  rsi.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
  for (let i = p + 1; i < c.length; i++) {
    const d = c[i] - c[i-1], g = d > 0 ? d : 0, l = d < 0 ? -d : 0;
    ag = (ag * (p - 1) + g) / p; al = (al * (p - 1) + l) / p;
    rsi.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
  }
  return rsi;
}

function calcBB(c: number[], p = 20): { upper: number[]; mid: number[]; lower: number[] } {
  const upper: number[] = [], mid: number[] = [], lower: number[] = [];
  for (let i = 0; i < c.length; i++) {
    if (i < p - 1) { upper.push(NaN); mid.push(NaN); lower.push(NaN); continue; }
    const sl = c.slice(i - p + 1, i + 1), mean = sl.reduce((a,b)=>a+b,0)/p;
    const std = Math.sqrt(sl.reduce((a,b)=>a+(b-mean)**2,0)/p);
    mid.push(mean); upper.push(mean + 2*std); lower.push(mean - 2*std);
  }
  return { upper, mid, lower };
}

export default function CandleChart({ symbol, interval, title, onIndicatorsUpdate }: Props) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const chartRef       = useRef<IChartApi | null>(null);
  const candleRef      = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef      = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ema9Ref        = useRef<ISeriesApi<'Line'> | null>(null);
  const ema21Ref       = useRef<ISeriesApi<'Line'> | null>(null);

  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [lastCandle, setLastCandle] = useState<Candle | null>(null);
  const [candleCount, setCandleCount] = useState(0);

  useEffect(() => {
    let chart: IChartApi;

    async function init() {
      if (!containerRef.current) return;
      const { createChart, ColorType, CrosshairMode } = await import('lightweight-charts');

      chart = createChart(containerRef.current, {
        width:  containerRef.current.clientWidth,
        height: 380,
        layout: { background: { type: ColorType.Solid, color: '#ffffff' }, textColor: '#64748b' },
        grid:   { vertLines: { color: '#f1f5f9' }, horzLines: { color: '#f1f5f9' } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#e2e8f0' },
        timeScale: { borderColor: '#e2e8f0', timeVisible: true, secondsVisible: false },
      });
      chartRef.current = chart;

      candleRef.current = chart.addCandlestickSeries({
        upColor: '#22c55e', downColor: '#ef4444',
        borderUpColor: '#22c55e', borderDownColor: '#ef4444',
        wickUpColor: '#4ade80',  wickDownColor: '#f87171',
      });

      volumeRef.current = chart.addHistogramSeries({
        color: '#26a69a', priceFormat: { type: 'volume' }, priceScaleId: 'vol',
      });
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

      ema9Ref.current  = chart.addLineSeries({ color: '#60a5fa', lineWidth: 1, title: 'EMA9' });
      ema21Ref.current = chart.addLineSeries({ color: '#fb923c', lineWidth: 1, title: 'EMA21' });

      const ro = new ResizeObserver(() => {
        if (containerRef.current && chart) chart.applyOptions({ width: containerRef.current.clientWidth });
      });
      if (containerRef.current) ro.observe(containerRef.current);

      await loadData();
    }

    async function loadData() {
      setLoading(true); setError(null); setErrorCode(null);
      try {
        const res = await axios.get<{ candles: Candle[]; error?: string; code?: string }>(
          `/api/historical?symbol=${symbol}&interval=${interval}`
        );
        const candles = res.data.candles?.sort((a, b) => a.time - b.time) ?? [];
        if (!candles.length) { setError('No data available for this symbol.'); setLoading(false); return; }

        candleRef.current?.setData(candles.map(c => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })));
        volumeRef.current?.setData(candles.map(c => ({ time: c.time as Time, value: c.volume, color: c.close >= c.open ? '#22c55e30' : '#ef444430' })));

        const closes = candles.map(c => c.close);
        const e9 = calcEMA(closes, 9), e21 = calcEMA(closes, 21);
        ema9Ref.current?.setData( candles.map((c,i) => ({ time: c.time as Time, value: e9[i]  })).filter(d => !isNaN(d.value)) as LineData[]);
        ema21Ref.current?.setData(candles.map((c,i) => ({ time: c.time as Time, value: e21[i] })).filter(d => !isNaN(d.value)) as LineData[]);

        const last = candles[candles.length - 1];
        setLastCandle(last);
        setCandleCount(candles.length);
        chartRef.current?.timeScale().fitContent();

        if (onIndicatorsUpdate) {
          const rsiArr = calcRSI(closes);
          const e12 = calcEMA(closes, 12), e26 = calcEMA(closes, 26);
          const macdLine = e12.map((v, i) => v - e26[i]).filter(v => !isNaN(v));
          const macdSig  = calcEMA(macdLine, 9);
          const bb = calcBB(closes, 20);
          onIndicatorsUpdate({
            rsi: parseFloat((rsiArr[rsiArr.length - 1] ?? 50).toFixed(2)),
            macd: macdLine[macdLine.length - 1] ?? 0,
            macdSignal: macdSig[macdSig.length - 1] ?? 0,
            ema9:  e9[e9.length - 1]   ?? 0,
            ema21: e21[e21.length - 1] ?? 0,
            bbUpper: bb.upper[bb.upper.length - 1] ?? 0,
            bbLower: bb.lower[bb.lower.length - 1] ?? 0,
            price: last.close,
          });
        }
      } catch (err) {
        if (axios.isAxiosError(err)) {
          const code = err.response?.data?.code as string | undefined;
          const msg  = err.response?.data?.error as string | undefined;
          setErrorCode(code ?? null);
          setError(msg ?? 'Failed to load chart data');
        } else {
          setError('Failed to load chart data');
        }
      } finally {
        setLoading(false);
      }
    }

    init();
    const liveInterval = setInterval(loadData, 60_000);
    return () => { chart?.remove(); chartRef.current = null; clearInterval(liveInterval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval]);

  const isUp   = lastCandle ? lastCandle.close >= lastCandle.open : true;
  const change = lastCandle ? lastCandle.close - lastCandle.open : 0;

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white fade-in shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-8 rounded-full ${isUp ? 'bg-green-500' : 'bg-red-500'}`} />
          <div>
            <h3 className="text-slate-900 font-semibold text-sm">{title}</h3>
            {lastCandle && (
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-base font-bold ${isUp ? 'text-green-700' : 'text-red-600'}`}>
                  {lastCandle.close.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${isUp ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                  {isUp ? '▲' : '▼'} {Math.abs(change).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          {candleCount > 0 && <span className="bg-slate-100 border border-slate-200 px-2 py-1 rounded-md">{candleCount} candles</span>}
          <span className="flex items-center gap-1.5"><span className="w-3 h-px bg-blue-400 inline-block" />EMA9</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-px bg-orange-400 inline-block" />EMA21</span>
        </div>
      </div>

      {/* Chart body */}
      <div className="relative" style={{ height: 380 }}>
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white gap-3">
            <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-slate-400 text-sm">Loading {title}...</span>
          </div>
        )}

        {!loading && error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white gap-4 px-6">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl">
              {errorCode === 'AUTH_REQUIRED' || errorCode === 'TOKEN_EXPIRED' ? '🔑' : errorCode === 'NO_DATA' ? '📊' : '⚠️'}
            </div>
            <div className="text-center">
              <p className="text-slate-700 font-medium mb-1">
                {errorCode === 'NO_DATA' ? 'No Trading Data Available' : errorCode === 'AUTH_REQUIRED' ? 'Authentication Required' : 'Chart Unavailable'}
              </p>
              <p className="text-slate-500 text-sm max-w-xs">{error}</p>
            </div>
            {(errorCode === 'AUTH_REQUIRED' || errorCode === 'TOKEN_EXPIRED') && (
              <a href="/api/upstox/auth" className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors">
                Reconnect Upstox
              </a>
            )}
            {errorCode === 'NO_DATA' && (
              <p className="text-slate-400 text-xs text-center">Market is closed. Data will appear on next trading day at 9:15 AM IST.</p>
            )}
          </div>
        )}

        <div ref={containerRef} style={{ height: 380 }} />
      </div>
    </div>
  );
}
