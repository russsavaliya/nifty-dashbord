import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest): Promise<NextResponse> {
  return NextResponse.json({ message: 'Socket.IO endpoint — connect via socket client.' });
}
