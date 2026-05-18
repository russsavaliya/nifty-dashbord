import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken, fetchPCR } from '@/lib/upstox';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') ?? 'nifty50';

  const token = getAccessToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const pcr = await fetchPCR(token, symbol);
  if (!pcr) {
    return NextResponse.json({ error: 'PCR unavailable — option chain data not accessible', pcr: null });
  }

  return NextResponse.json(pcr);
}
