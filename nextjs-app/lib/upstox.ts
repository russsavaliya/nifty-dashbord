import { NextRequest } from 'next/server';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const INSTRUMENT_KEYS: Record<string, string> = {
  nifty50: 'NSE_INDEX|Nifty 50',
  banknifty: 'NSE_INDEX|Nifty Bank',
};

export function getAccessToken(request: NextRequest): string | null {
  const cookie = request.cookies.get('upstox_token');
  return cookie?.value ?? null;
}

export async function fetchHistoricalCandles(
  token: string,
  symbol: string,
  interval: string,
  fromDate: string,
  toDate: string
): Promise<Candle[]> {
  const instrumentKey = INSTRUMENT_KEYS[symbol];
  if (!instrumentKey) throw new Error(`Unknown symbol: ${symbol}`);

  const encodedKey = encodeURIComponent(instrumentKey);
  const url = `https://api.upstox.com/v2/historical-candle/${encodedKey}/${interval}/${toDate}/${fromDate}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upstox API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    status: string;
    data: { candles: [string, number, number, number, number, number, number][] };
  };

  if (data.status !== 'success' || !data.data?.candles) {
    throw new Error('Invalid response from Upstox API');
  }

  return data.data.candles.map(
    ([timestamp, open, high, low, close, volume]) => ({
      time: Math.floor(new Date(timestamp).getTime() / 1000),
      open,
      high,
      low,
      close,
      volume,
    })
  );
}

export function getDateRange(days: number): { fromDate: string; toDate: string } {
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);

  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { fromDate: fmt(fromDate), toDate: fmt(toDate) };
}

// ── PCR (Put-Call Ratio) via Upstox Option Chain ──────────────────────────────
// PCR = total put volume / total call volume across ATM ± 5 strikes
// Volume-based PCR is more reliable than OI-based per research findings.

export interface PCRData {
  pcr: number;           // put volume / call volume
  put_volume: number;
  call_volume: number;
  atm_strike: number;
  timestamp: number;
}

const OPTION_INSTRUMENT: Record<string, string> = {
  nifty50:   'NSE_INDEX|Nifty 50',
  banknifty: 'NSE_INDEX|Nifty Bank',
};

// Nifty strikes are multiples of 50; BankNifty multiples of 100
const STRIKE_STEP: Record<string, number> = {
  nifty50:   50,
  banknifty: 100,
};

export async function fetchPCR(
  token: string,
  symbol: string
): Promise<PCRData | null> {
  try {
    // Step 1: Get current spot price
    const instKey     = encodeURIComponent(OPTION_INSTRUMENT[symbol] ?? OPTION_INSTRUMENT['nifty50']);
    const quoteUrl    = `https://api.upstox.com/v2/market-quote/ltp?instrument_key=${instKey}`;
    const quoteRes    = await fetch(quoteUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    });

    if (!quoteRes.ok) return null;
    const quoteData = await quoteRes.json() as {
      status: string;
      data: Record<string, { last_price: number }>;
    };

    const spotPrice = Object.values(quoteData.data ?? {})[0]?.last_price;
    if (!spotPrice) return null;

    // Step 2: Round to nearest ATM strike
    const step       = STRIKE_STEP[symbol] ?? 50;
    const atmStrike  = Math.round(spotPrice / step) * step;

    // Step 3: Fetch option chain for current expiry
    const chainUrl = `https://api.upstox.com/v2/option/chain?instrument_key=${instKey}&expiry_date=`;
    // Get nearest Thursday expiry (weekly)
    const expiry   = getNearestExpiry();
    const chainRes = await fetch(`${chainUrl}${expiry}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });

    if (!chainRes.ok) return null;
    const chainData = await chainRes.json() as {
      status: string;
      data: Array<{
        strike_price: number;
        call_options?: { market_data?: { volume?: number } };
        put_options?:  { market_data?: { volume?: number } };
      }>;
    };

    if (chainData.status !== 'success' || !chainData.data?.length) return null;

    // Step 4: Sum put & call volume across ATM ± 5 strikes
    const strikes    = 5;
    let putVol  = 0;
    let callVol = 0;

    for (const row of chainData.data) {
      const diff = Math.abs(row.strike_price - atmStrike);
      if (diff > step * strikes) continue;
      callVol += row.call_options?.market_data?.volume ?? 0;
      putVol  += row.put_options?.market_data?.volume  ?? 0;
    }

    if (callVol === 0) return null;

    return {
      pcr:          parseFloat((putVol / callVol).toFixed(4)),
      put_volume:   putVol,
      call_volume:  callVol,
      atm_strike:   atmStrike,
      timestamp:    Date.now(),
    };
  } catch {
    return null;   // PCR is optional — never fail the main prediction
  }
}

// Returns nearest weekly expiry (Thursday) in YYYY-MM-DD format
function getNearestExpiry(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = now.getDay(); // 0=Sun, 4=Thu
  const daysToThursday = (4 - day + 7) % 7 || 7; // if today is Thu, get next Thu
  const expiry = new Date(now);
  expiry.setDate(now.getDate() + daysToThursday);
  return expiry.toISOString().split('T')[0];
}

export function isMarketOpen(): boolean {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;

  const hours = ist.getHours();
  const minutes = ist.getMinutes();
  const totalMinutes = hours * 60 + minutes;
  const marketOpen = 9 * 60 + 15;
  const marketClose = 15 * 60 + 30;

  return totalMinutes >= marketOpen && totalMinutes <= marketClose;
}
