'use client';

import { useEffect, useState } from 'react';

export interface PredictionResult { direction: 'UP' | 'DOWN'; confidence: number; }
export interface Predictions { '5min': PredictionResult; '10min': PredictionResult; '30min': PredictionResult; }

interface Props {
  predictions: Predictions | null;
  loading?: boolean;
  lastUpdated: Date | null;
  marketOpen?: boolean;
}

function PredCard({ label, result }: { label: string; result: PredictionResult }) {
  const isUp  = result.direction === 'UP';
  const conf  = result.confidence;
  const color = isUp ? { text: 'text-green-400', border: 'border-green-800', bg: 'bg-green-950/30', bar: 'bg-green-500', badge: 'bg-green-950 text-green-400' }
                     : { text: 'text-red-400',   border: 'border-red-800',   bg: 'bg-red-950/30',   bar: 'bg-red-500',   badge: 'bg-red-950 text-red-400'   };

  return (
    <div className={`flex-1 rounded-xl p-4 border ${color.border} ${color.bg} flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">{label}</span>
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${color.badge}`}>{result.direction}</span>
      </div>

      <div className="flex flex-col items-center py-2 gap-1">
        <span className="text-4xl">{isUp ? '⬆️' : '⬇️'}</span>
        <span className={`text-lg font-bold ${color.text}`}>{isUp ? 'UP' : 'DOWN'}</span>
      </div>

      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-slate-500">Confidence</span>
          <span className={`font-semibold ${color.text}`}>{conf}%</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-1.5">
          <div className={`h-1.5 rounded-full ${color.bar} transition-all duration-700`} style={{ width: `${conf}%` }} />
        </div>
      </div>
    </div>
  );
}

export default function PredictionBox({ predictions, loading = false, lastUpdated, marketOpen = false }: Props) {
  const [timeStr, setTimeStr] = useState('--:--:--');

  useEffect(() => {
    if (lastUpdated) {
      setTimeStr(lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
  }, [lastUpdated]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0d1220] p-5 fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold text-sm">ML Predictions</h3>
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-xs bg-slate-800 px-2 py-1 rounded-md">RandomForest</span>
        </div>
      </div>

      {loading || !predictions ? (
        <div className="flex gap-3">
          {[1,2,3].map(i => (
            <div key={i} className="flex-1 rounded-xl border border-slate-800 p-4 flex flex-col gap-3">
              <div className="skeleton h-3 w-10 rounded" />
              <div className="skeleton h-12 w-12 rounded-full mx-auto" />
              <div className="skeleton h-1.5 w-full rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-3">
          <PredCard label="5 Min"  result={predictions['5min']}  />
          <PredCard label="10 Min" result={predictions['10min']} />
          <PredCard label="30 Min" result={predictions['30min']} />
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-600">
        <span>Updated: {timeStr}</span>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${marketOpen ? 'bg-green-400 blink' : 'bg-slate-600'}`} />
          {marketOpen ? 'Auto-refresh every 60s' : 'Market closed'}
        </div>
      </div>
    </div>
  );
}
