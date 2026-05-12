'use client';

interface Props {
  rsi: number; macd: number; macdSignal: number;
  ema9: number; ema21: number; bbUpper: number; bbLower: number; price: number;
  loading?: boolean;
}

function RSIArc({ value }: { value: number }) {
  const clamped = Math.min(Math.max(value, 0), 100);
  const color   = value > 70 ? '#ef4444' : value < 30 ? '#22c55e' : '#eab308';
  const bgColor = value > 70 ? '#450a0a' : value < 30 ? '#052e16' : '#422006';
  const label   = value > 70 ? 'Overbought' : value < 30 ? 'Oversold' : 'Neutral';
  const pct     = clamped / 100;
  const r = 30, cx = 40, cy = 38, strokeW = 5;
  const arcLen = Math.PI * r;
  const offset = arcLen * (1 - pct);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 80, height: 50 }}>
        <svg viewBox="0 0 80 50" width="80" height="50">
          <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`}
            fill="none" stroke="#1e293b" strokeWidth={strokeW} strokeLinecap="round" />
          <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`}
            fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round"
            strokeDasharray={arcLen} strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-end justify-center pb-1">
          <span className="text-sm font-bold" style={{ color }}>{value.toFixed(1)}</span>
        </div>
      </div>
      <span className="text-xs mt-1 px-2 py-0.5 rounded-full font-medium" style={{ color, background: bgColor }}>{label}</span>
    </div>
  );
}

function StatCard({ icon, label, value, sub, color }: { icon: string; label: string; value: string; sub?: string; color: 'green' | 'red' | 'yellow' | 'blue' }) {
  const colors = {
    green:  { text: 'text-green-400', bg: 'bg-green-950/40', border: 'border-green-900' },
    red:    { text: 'text-red-400',   bg: 'bg-red-950/40',   border: 'border-red-900'   },
    yellow: { text: 'text-yellow-400',bg: 'bg-yellow-950/40',border: 'border-yellow-900'},
    blue:   { text: 'text-blue-400',  bg: 'bg-blue-950/40',  border: 'border-blue-900'  },
  }[color];

  return (
    <div className={`rounded-xl p-4 border ${colors.border} ${colors.bg} flex flex-col gap-2`}>
      <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <span className={`font-bold text-sm ${colors.text}`}>{value}</span>
      </div>
      {sub && <span className="text-slate-600 text-xs font-mono">{sub}</span>}
    </div>
  );
}

export default function Indicators({ rsi, macd, macdSignal, ema9, ema21, bbUpper, bbLower, price, loading = false }: Props) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-[#0d1220] p-5">
        <div className="skeleton h-4 w-36 mb-4 rounded" />
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const macdBull  = macd > macdSignal;
  const emaBull   = ema9 > ema21;
  const nearUpper = bbUpper > 0 && price > bbUpper * 0.99;
  const nearLower = bbLower > 0 && price < bbLower * 1.01;

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0d1220] p-5 fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold text-sm">Technical Indicators</h3>
        <span className="text-slate-500 text-xs bg-slate-800 px-2 py-1 rounded-md">
          LTP: {price > 0 ? price.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
        </span>
      </div>

      <div className="flex items-center justify-center mb-5 py-2 bg-slate-900/50 rounded-xl border border-slate-800">
        <div className="flex flex-col items-center">
          <span className="text-slate-500 text-xs mb-2 uppercase tracking-wider">RSI (14)</span>
          <RSIArc value={rsi} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={macdBull ? '📈' : '📉'}
          label="MACD (12,26,9)"
          value={macdBull ? 'Bullish' : 'Bearish'}
          sub={`${macd.toFixed(2)} / Sig: ${macdSignal.toFixed(2)}`}
          color={macdBull ? 'green' : 'red'}
        />
        <StatCard
          icon={emaBull ? '🔼' : '🔽'}
          label="EMA Cross"
          value={emaBull ? 'Bullish Cross' : 'Bearish Cross'}
          sub={`EMA9: ${ema9.toFixed(1)}  EMA21: ${ema21.toFixed(1)}`}
          color={emaBull ? 'green' : 'red'}
        />
        <StatCard
          icon={nearUpper ? '⚠️' : nearLower ? '💡' : '✅'}
          label="Bollinger Bands"
          value={nearUpper ? 'Near Upper' : nearLower ? 'Near Lower' : 'Inside Bands'}
          sub={`U: ${bbUpper.toFixed(1)}  L: ${bbLower.toFixed(1)}`}
          color={nearUpper ? 'yellow' : nearLower ? 'blue' : 'green'}
        />
        <StatCard
          icon={rsi > 70 ? '🔴' : rsi < 30 ? '🟢' : '🟡'}
          label="RSI Signal"
          value={rsi > 70 ? 'Sell Zone' : rsi < 30 ? 'Buy Zone' : 'Watch Zone'}
          sub={`RSI: ${rsi.toFixed(2)}`}
          color={rsi > 70 ? 'red' : rsi < 30 ? 'green' : 'yellow'}
        />
      </div>
    </div>
  );
}
