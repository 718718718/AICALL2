import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NODE_ENV === 'development'
  ? (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000')
  : process.env.NEXT_PUBLIC_BACKEND_URL_PROD!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    console.log('[Login API] Request body:', { email: body.email, password: '***' });
    console.log('[Login API] Backend URL:', BACKEND_URL);
    
    const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    console.log('[Login API] Backend response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('[Login API] Error response:', errorText);
      return NextResponse.json(
        { 
          success: false, 
          message: `Backend error: ${response.status} ${errorText}` 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[Login API] Success response received');

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[Login API] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Internal server error' 
      },
      { status: 500 }
    );
  }
}