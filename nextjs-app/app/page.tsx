'use client';

import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import Navbar from './components/Navbar';
import MarketTicker from './components/MarketTicker';
import CandleChart from './components/CandleChart';
import Indicators from './components/Indicators';
import PredictionBox, { type Predictions } from './components/PredictionBox';

type Interval = '5minute' | '10minute' | '30minute';

const INTERVALS: { label: string; value: Interval }[] = [
  { label: '5 Min',  value: '5minute'  },
  { label: '10 Min', value: '10minute' },
  { label: '30 Min', value: '30minute' },
];

interface IndicatorData {
  rsi: number; macd: number; macdSignal: number;
  ema9: number; ema21: number; bbUpper: number; bbLower: number; price: number;
}

const DEFAULT_IND: IndicatorData = { rsi: 50, macd: 0, macdSignal: 0, ema9: 0, ema21: 0, bbUpper: 0, bbLower: 0, price: 0 };

function isMarketOpen(): boolean {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const total = ist.getHours() * 60 + ist.getMinutes();
  return total >= 9 * 60 + 15 && total <= 15 * 60 + 30;
}

export default function HomePage() {
  const [interval, setIntervalVal] = useState<Interval>('5minute');
  const [indicators, setIndicators] = useState<IndicatorData>(DEFAULT_IND);
  const [predictions, setPredictions] = useState<Predictions | null>(null);
  const [predictError, setPredictError] = useState<string | null>(null);
  const [predictLoading, setPredictLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const marketOpen = isMarketOpen();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (err) setUrlError(decodeURIComponent(err));
    const cookies = document.cookie.split(';').map(c => c.trim());
    setIsAuthenticated(cookies.some(c => c.startsWith('upstox_connected=')));
  }, []);

  const fetchPredictions = useCallback(async () => {
    if (!isAuthenticated) return;
    setPredictLoading(true);
    setPredictError(null);
    try {
      const res = await axios.get<Predictions>(`/api/predict?symbol=nifty50&interval=${interval}`);
      if (res.data.source === 'error' || (res.data as { error?: string }).error) {
        setPredictError((res.data as { error?: string }).error ?? 'ML service unavailable');
        setPredictions(null);
      } else {
        setPredictions(res.data);
        setLastUpdated(new Date());
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } }; message?: string })
        ?.response?.data?.error ?? (err as { message?: string })?.message ?? 'ML service unavailable';
      setPredictError(msg);
      setPredictions(null);
      console.error('[Predict]', err);
    } finally {
      setPredictLoading(false);
    }
  }, [isAuthenticated, interval]);

  useEffect(() => {
    fetchPredictions();
    if (!marketOpen) return;
    const timer = globalThis.setInterval(fetchPredictions, 60_000);
    return () => globalThis.clearInterval(timer);
  }, [fetchPredictions, marketOpen]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <Navbar isAuthenticated={isAuthenticated} />
      <MarketTicker />

      <main className="max-w-screen-2xl mx-auto px-5 py-6 space-y-5">

        {/* Error banner */}
        {urlError && (
          <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
            <span className="text-red-600">Auth error: {urlError}</span>
            <a href="/api/upstox/auth" className="ml-4 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Reconnect</a>
          </div>
        )}

        {/* Auth prompt */}
        {!isAuthenticated && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-xl flex-shrink-0">🔌</div>
            <div>
              <p className="text-amber-700 font-semibold text-sm">Upstox not connected</p>
              <p className="text-slate-500 text-xs mt-0.5">Connect your Upstox account to load live charts and ML predictions.</p>
            </div>
            <a href="/api/upstox/auth" className="sm:ml-auto px-5 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg whitespace-nowrap">
              Connect Upstox →
            </a>
          </div>
        )}

        {/* Controls row */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">Interval</span>
          <div className="flex items-center gap-1 bg-white rounded-xl p-1 border border-slate-200">
            {INTERVALS.map(iv => (
              <button
                key={iv.value}
                onClick={() => setIntervalVal(iv.value)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  interval === iv.value
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {iv.label}
              </button>
            ))}
          </div>

          <div className="ml-auto">
            {marketOpen ? (
              <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded-full border border-green-200">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 blink" />
                Live · Updates every 60s
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-white px-3 py-1.5 rounded-full border border-slate-200">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                Market closed · Showing historical data
              </div>
            )}
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <CandleChart symbol="nifty50"   interval={interval} title="Nifty 50"    onIndicatorsUpdate={setIndicators} />
          <CandleChart symbol="banknifty" interval={interval} title="Bank Nifty" />
        </div>

        {/* Indicators + Predictions */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Indicators {...indicators} loading={indicators.price === 0} />
          <PredictionBox predictions={predictions} error={predictError} loading={predictLoading} lastUpdated={lastUpdated} marketOpen={marketOpen} />
        </div>

        <footer className="text-center text-slate-400 text-xs py-4 border-t border-slate-200">
          NiftyPredictor · Data via Upstox API · ML by RandomForest · <span className="text-red-900">Not financial advice</span>
        </footer>
      </main>
    </div>
  );
}
