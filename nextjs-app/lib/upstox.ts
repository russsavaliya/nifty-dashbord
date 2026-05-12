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
