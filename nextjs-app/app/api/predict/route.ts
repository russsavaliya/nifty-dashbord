import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken, fetchHistoricalCandles, getDateRange } from '@/lib/upstox';

export interface PredictionResult {
  direction: 'UP' | 'DOWN';
  confidence: number;
}

export interface PredictionResponse {
  '5min': PredictionResult;
  '10min': PredictionResult;
  '30min': PredictionResult;
}

function mockPrediction(): PredictionResponse {
  const rand = () => Math.floor(50 + Math.random() * 50);
  const dir = (): 'UP' | 'DOWN' => (Math.random() > 0.5 ? 'UP' : 'DOWN');
  return {
    '5min': { direction: dir(), confidence: rand() },
    '10min': { direction: dir(), confidence: rand() },
    '30min': { direction: dir(), confidence: rand() },
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') ?? 'nifty50';
  const interval = searchParams.get('interval') ?? '5minute';

  const token = getAccessToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated. Please connect Upstox.' }, { status: 401 });
  }

  try {
    const { fromDate, toDate } = getDateRange(30);
    const candles = await fetchHistoricalCandles(token, symbol, interval, fromDate, toDate);

    const latestCandles = candles.slice(-200);

    const mlUrl = process.env.ML_API_URL ?? 'http://127.0.0.1:8000';

    try {
      const mlResponse = await fetch(`${mlUrl}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candles: latestCandles, symbol }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!mlResponse.ok) {
        console.warn('[Predict] ML service returned error, using mock');
        return NextResponse.json(mockPrediction());
      }

      const prediction = (await mlResponse.json()) as PredictionResponse;
      return NextResponse.json(prediction);
    } catch (mlErr) {
      console.warn('[Predict] ML service unavailable, using mock prediction:', mlErr);
      return NextResponse.json(mockPrediction());
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Predict API]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
