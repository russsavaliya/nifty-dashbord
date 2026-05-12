import { NextResponse } from 'next/server';

export async function GET(): Promise<NextResponse> {
  const apiKey = process.env.UPSTOX_API_KEY;
  const redirectUri = process.env.UPSTOX_REDIRECT_URI;

  if (!apiKey || !redirectUri) {
    return NextResponse.json(
      { error: 'Missing UPSTOX_API_KEY or UPSTOX_REDIRECT_URI in environment' },
      { status: 500 }
    );
  }

  const authUrl = new URL('https://api.upstox.com/v2/login/authorization/dialog');
  authUrl.searchParams.set('client_id', apiKey);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');

  return NextResponse.redirect(authUrl.toString());
}
