import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken, fetchHistoricalCandles } from '@/lib/upstox';

function getDateRange(days: number): { fromDate: string; toDate: string } {
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { fromDate: fmt(fromDate), toDate: fmt(toDate) };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') ?? 'nifty50';
  const interval = searchParams.get('interval') ?? '5minute';

  const token = getAccessToken(request);
  if (!token) {
    return NextResponse.json(
      { error: 'Not authenticated. Please connect Upstox.', code: 'AUTH_REQUIRED' },
      { status: 401 }
    );
  }

  // Try progressively wider date ranges if no data returned
  const dayRanges = [7, 30, 60];

  for (const days of dayRanges) {
    try {
      const { fromDate, toDate } = getDateRange(days);
      const candles = await fetchHistoricalCandles(token, symbol, interval, fromDate, toDate);

      if (candles.length > 0) {
        return NextResponse.json({ candles, symbol, interval });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[Historical API] days=${days} error:`, message);

      // If auth error, stop retrying
      if (message.includes('401') || message.includes('403')) {
        return NextResponse.json(
          { error: 'Upstox token expired. Please reconnect.', code: 'TOKEN_EXPIRED' },
          { status: 401 }
        );
      }
    }
  }

  return NextResponse.json(
    { error: 'No candle data available. Market may be closed or no recent trading data.', code: 'NO_DATA' },
    { status: 404 }
  );
}
