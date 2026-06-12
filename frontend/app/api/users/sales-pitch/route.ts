import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NODE_ENV === 'development'
  ? (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000')
  : process.env.NEXT_PUBLIC_BACKEND_URL_PROD!;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    
    console.log('[Sales Pitch API] GET Authorization header:', authHeader ? '***' : 'none');
    console.log('[Sales Pitch API] Backend URL:', BACKEND_URL);
    
    if (!authHeader) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'No authorization token provided' 
        },
        { status: 401 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/api/users/sales-pitch`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    console.log('[Sales Pitch API] Backend response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('[Sales Pitch API] Error response:', errorText);
      return NextResponse.json(
        { 
          success: false, 
          message: `Backend error: ${response.status} ${errorText}` 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[Sales Pitch API] Success response received');

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[Sales Pitch API] Error:', error);
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
    
    console.log('[Sales Pitch API] POST Authorization header:', authHeader ? '***' : 'none');
    console.log('[Sales Pitch API] Backend URL:', BACKEND_URL);
    
    if (!authHeader) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'No authorization token provided' 
        },
        { status: 401 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/api/users/sales-pitch`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    console.log('[Sales Pitch API] Backend response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('[Sales Pitch API] Error response:', errorText);
      return NextResponse.json(
        { 
          success: false, 
          message: `Backend error: ${response.status} ${errorText}` 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[Sales Pitch API] Success response received');

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[Sales Pitch API] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const body = await request.json();
    
    console.log('[Sales Pitch API] PUT Authorization header:', authHeader ? '***' : 'none');
    console.log('[Sales Pitch API] Backend URL:', BACKEND_URL);
    
    if (!authHeader) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'No authorization token provided' 
        },
        { status: 401 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/api/users/sales-pitch`, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    console.log('[Sales Pitch API] Backend response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('[Sales Pitch API] Error response:', errorText);
      return NextResponse.json(
        { 
          success: false, 
          message: `Backend error: ${response.status} ${errorText}` 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[Sales Pitch API] Success response received');

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[Sales Pitch API] PUT Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
