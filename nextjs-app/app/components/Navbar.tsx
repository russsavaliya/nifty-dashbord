'use client';

import { useEffect, useState } from 'react';

function getMarketStatus(): boolean {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const total = ist.getHours() * 60 + ist.getMinutes();
  return total >= 9 * 60 + 15 && total <= 15 * 60 + 30;
}

interface NavbarProps {
  isAuthenticated: boolean;
}

export default function Navbar({ isAuthenticated }: NavbarProps) {
  const [marketOpen, setMarketOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const update = () => {
      setMarketOpen(getMarketStatus());
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-800 bg-[#0b0f1a]/95 backdrop-blur-md px-5 py-0 h-14 flex items-center justify-between">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-sm font-bold shadow-lg">
          N
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-white font-bold text-lg tracking-tight">NiftyPredictor</span>
          <span className="hidden sm:inline text-slate-500 text-xs">Dashboard</span>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* IST Clock */}
        <span className="hidden md:inline text-slate-400 text-xs font-mono bg-slate-800/60 px-2.5 py-1 rounded-md border border-slate-700">
          IST {currentTime}
        </span>

        {/* Market status */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
            marketOpen
              ? 'bg-green-950/60 text-green-400 border-green-800'
              : 'bg-red-950/60 text-red-400 border-red-900'
          }`}
        >
          <span className="relative flex h-2 w-2">
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                marketOpen ? 'bg-green-400 blink' : 'bg-red-500'
              }`}
            />
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                marketOpen ? 'bg-green-400' : 'bg-red-500'
              }`}
            />
          </span>
          {marketOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
        </div>

        {/* Auth button */}
        {isAuthenticated ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-950/60 text-blue-400 border border-blue-800">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            Connected
          </div>
        ) : (
          <a
            href="/api/upstox/auth"
            className="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-xs font-semibold rounded-full transition-all shadow-lg glow-purple"
          >
            Connect Upstox
          </a>
        )}
      </div>
    </nav>
  );
}
