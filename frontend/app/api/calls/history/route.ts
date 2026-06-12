import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NODE_ENV === 'development'
  ? (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000')
  : process.env.NEXT_PUBLIC_BACKEND_URL_PROD!;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const { searchParams } = new URL(request.url);
    
    if (!authHeader) {
      return NextResponse.json({ success: false, message: 'No authorization token provided' }, { status: 401 });
    }

    let url = `${BACKEND_URL}/api/calls/history`;
    if (searchParams.toString()) {
      url += '?' + searchParams.toString();
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ success: false, message: `Backend error: ${response.status} ${errorText}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[Calls History API] Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}