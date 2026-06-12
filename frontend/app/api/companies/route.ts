import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NODE_ENV === 'development'
  ? (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000')
  : process.env.NEXT_PUBLIC_BACKEND_URL_PROD!;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    
    console.log('[Companies API] Authorization header:', authHeader ? '***' : 'none');
    console.log('[Companies API] Backend URL:', BACKEND_URL);
    
    if (!authHeader) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'No authorization token provided' 
        },
        { status: 401 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/api/companies`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    console.log('[Companies API] Backend response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('[Companies API] Error response:', errorText);
      return NextResponse.json(
        { 
          success: false, 
          message: `Backend error: ${response.status} ${errorText}` 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[Companies API] Success response received');

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[Companies API] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Internal server error' 
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const body = await request.json();
    
    console.log('[Companies API] POST request');
    console.log('[Companies API] Backend URL:', BACKEND_URL);
    
    if (!authHeader) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'No authorization token provided' 
        },
        { status: 401 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/api/companies`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    console.log('[Companies API] Backend response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('[Companies API] Error response:', errorText);
      return NextResponse.json(
        { 
          success: false, 
          message: `Backend error: ${response.status} ${errorText}` 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[Companies API] Success response received');

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[Companies API] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Internal server error' 
      },
      { status: 500 }
    );
  }
}