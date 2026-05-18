import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken, fetchHistoricalCandles, fetchPCR, getDateRange } from '@/lib/upstox';

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

export interface PredictionResponse {
  '5min': PredictionResult;
  '10min': PredictionResult;
  '30min': PredictionResult;
  confluence?: ConfluenceResult;
  pcr?: number | null;
  source: 'ml' | 'error';
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const symbol   = searchParams.get('symbol')   ?? 'nifty50';
  const interval = searchParams.get('interval') ?? '5minute';

  const token = getAccessToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated. Please connect Upstox.' }, { status: 401 });
  }

  try {
    // Fetch historical candles + PCR in parallel — PCR failure never blocks prediction
    const { fromDate, toDate } = getDateRange(60);
    const [candles, pcrData] = await Promise.all([
      fetchHistoricalCandles(token, symbol, interval, fromDate, toDate),
      fetchPCR(token, symbol).catch(() => null),
    ]);

    const latestCandles = candles.slice(-1000);
    const pcr           = pcrData?.pcr ?? null;

    const mlUrl = process.env.ML_API_URL ?? 'http://127.0.0.1:8000';

    const mlResponse = await fetch(`${mlUrl}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candles: latestCandles, symbol, pcr }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!mlResponse.ok) {
      const detail = await mlResponse.text().catch(() => 'Unknown ML error');
      console.error('[Predict] ML service error:', detail);
      return NextResponse.json(
        { error: 'ML service returned an error. Please check if the Python server is running.', detail },
        { status: 502 }
      );
    }

    const prediction = (await mlResponse.json()) as PredictionResponse;
    // Attach PCR data so frontend can display it
    prediction.pcr = pcr;
    return NextResponse.json(prediction);

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Predict API]', message);

    if (message.includes('fetch') || message.includes('ECONNREFUSED') || message.includes('abort')) {
      return NextResponse.json(
        { error: 'ML service is offline. Start the Python server: cd python-ml && python main.py', source: 'error' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: message, source: 'error' }, { status: 500 });
  }
}
