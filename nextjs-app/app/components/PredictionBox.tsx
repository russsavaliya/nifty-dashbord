'use client';

import { useEffect, useState } from 'react';

export interface PredictionResult {
  direction: 'UP' | 'DOWN';
  confidence: number;
  validated_accuracy?: number;
  model?: string;
  ensemble_prob?: number;
  lstm_prob?: number;
}

export interface ConfluenceResult {
  score: number;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  regime: 'TRENDING' | 'RANGING' | 'NEUTRAL';
  adx_value: number;
  signals: string[];
  action_suggestion: 'BUY CALL' | 'BUY PUT' | 'WAIT';
}

export interface Predictions {
  '5min': PredictionResult;
  '10min': PredictionResult;
  '30min': PredictionResult;
  confluence?: ConfluenceResult;
  pcr?: number | null;
  source?: 'ml' | 'error';
}

interface Props {
  predictions: Predictions | null;
  error?: string | null;
  loading?: boolean;
  lastUpdated: Date | null;
  marketOpen?: boolean;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AccuracyBadge({ value }: { value?: number }) {
  if (!value) return null;
  const color = value >= 58 ? 'text-green-700 bg-green-50 border-green-200'
              : value >= 54 ? 'text-yellow-700 bg-yellow-50 border-yellow-200'
              :               'text-slate-500 bg-slate-50 border-slate-200';
  return (
    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${color}`} title="Walk-forward validated accuracy">
      ✓ {value}%
    </span>
  );
}

function PCRBadge({ pcr }: { pcr?: number | null }) {
  if (pcr == null) return null;
  const bullish = pcr > 1.2;
  const bearish = pcr < 0.8;
  const color   = bullish ? 'text-green-700 bg-green-50 border-green-200'
                : bearish ? 'text-red-600 bg-red-50 border-red-200'
                :           'text-slate-500 bg-slate-50 border-slate-200';
  const label   = bullish ? '↑ Bullish' : bearish ? '↓ Bearish' : 'Neutral';
  return (
    <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border ${color}`} title="Put-Call Ratio (volume-based)">
      <span className="font-semibold">PCR {pcr.toFixed(2)}</span>
      <span>{label}</span>
    </div>
  );
}

function RegimeBadge({ regime, adx }: { regime?: string; adx?: number }) {
  if (!regime) return null;
  const cfg = regime === 'TRENDING' ? { color: 'text-blue-700 bg-blue-50 border-blue-200',  icon: '↗' }
            : regime === 'RANGING'  ? { color: 'text-orange-700 bg-orange-50 border-orange-200', icon: '↔' }
            :                         { color: 'text-slate-500 bg-slate-50 border-slate-200',  icon: '→' };
  return (
    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${cfg.color}`} title={`ADX = ${adx}`}>
      {cfg.icon} {regime} {adx != null ? `(ADX ${adx})` : ''}
    </span>
  );
}

function PredCard({ label, result }: { label: string; result: PredictionResult }) {
  const isUp  = result.direction === 'UP';
  const conf  = result.confidence;
  const color = isUp
    ? { text: 'text-green-700', border: 'border-green-200', bg: 'bg-green-50', bar: 'bg-green-500', badge: 'bg-green-100 text-green-700' }
    : { text: 'text-red-600',   border: 'border-red-200',   bg: 'bg-red-50',   bar: 'bg-red-500',   badge: 'bg-red-100 text-red-600'   };

  return (
    <div className={`flex-1 rounded-xl p-4 border ${color.border} ${color.bg} flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">{label}</span>
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${color.badge}`}>{result.direction}</span>
      </div>

      <div className="flex flex-col items-center py-1 gap-1">
        <span className="text-4xl">{isUp ? '⬆️' : '⬇️'}</span>
        <span className={`text-lg font-bold ${color.text}`}>{isUp ? 'UP' : 'DOWN'}</span>
      </div>

      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-slate-400">Confidence</span>
          <span className={`font-semibold ${color.text}`}>{conf}%</span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-1.5">
          <div className={`h-1.5 rounded-full ${color.bar} transition-all duration-700`} style={{ width: `${conf}%` }} />
        </div>
      </div>

      {/* Model probabilities */}
      {(result.ensemble_prob != null || result.lstm_prob != null) && (
        <div className="flex gap-2 text-xs text-slate-400 justify-center">
          {result.ensemble_prob != null && <span>ENS {(result.ensemble_prob * 100).toFixed(0)}%</span>}
          {result.lstm_prob     != null && <span>LSTM {(result.lstm_prob * 100).toFixed(0)}%</span>}
        </div>
      )}

      {result.validated_accuracy && (
        <div className="flex justify-center">
          <AccuracyBadge value={result.validated_accuracy} />
        </div>
      )}
    </div>
  );
}

function ConfluencePanel({ confluence, pcr }: { confluence: ConfluenceResult; pcr?: number | null }) {
  const score = confluence.score;
  const pct   = ((score + 7) / 14) * 100; // map -7..+7 → 0..100%

  const actionColor =
    confluence.action_suggestion === 'BUY CALL' ? 'bg-green-500 text-white'
  : confluence.action_suggestion === 'BUY PUT'  ? 'bg-red-500 text-white'
  :                                               'bg-slate-200 text-slate-600';

  const barColor =
    score >= 3  ? 'bg-green-500'
  : score <= -3 ? 'bg-red-500'
  :               'bg-yellow-400';

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-slate-700 text-xs font-semibold uppercase tracking-wider">Signal Confluence</span>
        <div className="flex items-center gap-2 flex-wrap">
          <RegimeBadge regime={confluence.regime} adx={confluence.adx_value} />
          {pcr != null && <PCRBadge pcr={pcr} />}
          <span className={`text-xs font-bold px-2 py-1 rounded-lg ${actionColor}`}>
            {confluence.action_suggestion}
          </span>
        </div>
      </div>

      {/* Score bar (-7 to +7) */}
      <div>
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>Bearish −7</span>
          <span className="font-semibold text-slate-600">Score: {score > 0 ? '+' : ''}{score}</span>
          <span>Bullish +7</span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-2.5">
          <div className={`h-2.5 rounded-full ${barColor} transition-all duration-700`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Trade only when score ≥ +3 or ≤ −3 (3+ signals aligned = higher accuracy)
        </p>
      </div>

      {/* Signal chips */}
      {confluence.signals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {confluence.signals.map((sig, i) => (
            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
              {sig}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PredictionBox({ predictions, error, loading = false, lastUpdated, marketOpen = false }: Props) {
  const [timeStr, setTimeStr] = useState('--:--:--');

  useEffect(() => {
    if (lastUpdated) {
      setTimeStr(lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
  }, [lastUpdated]);

  const modelLabel = predictions?.['5min']?.model ?? 'RF+GB+LSTM Ensemble';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 fade-in shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-slate-900 font-semibold text-sm">ML Predictions</h3>
        <span className="text-slate-500 text-xs bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
          {modelLabel}
        </span>
      </div>

      {/* Error state */}
      {error && !loading && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex flex-col gap-1">
          <span className="font-semibold">ML Service Unavailable</span>
          <span className="text-xs text-red-500">{error}</span>
        </div>
      )}

      {/* Loading skeleton */}
      {(loading || (!predictions && !error)) && (
        <div className="flex gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex-1 rounded-xl border border-slate-200 p-4 flex flex-col gap-3">
              <div className="skeleton h-3 w-10 rounded" />
              <div className="skeleton h-12 w-12 rounded-full mx-auto" />
              <div className="skeleton h-1.5 w-full rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Predictions */}
      {!loading && predictions && !error && (
        <>
          <div className="flex gap-3">
            <PredCard label="5 Min"  result={predictions['5min']}  />
            <PredCard label="10 Min" result={predictions['10min']} />
            <PredCard label="30 Min" result={predictions['30min']} />
          </div>

          {predictions.confluence && (
            <ConfluencePanel confluence={predictions.confluence} pcr={predictions.pcr} />
          )}
        </>
      )}

      <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-400">
        <span>Updated: {timeStr}</span>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${marketOpen ? 'bg-green-400 blink' : 'bg-slate-600'}`} />
          {marketOpen ? 'Auto-refresh every 60s' : 'Market closed'}
        </div>
      </div>
    </div>
  );
}
