import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NODE_ENV === 'development'
  ? 'http://localhost:5000'
  : process.env.NEXT_PUBLIC_BACKEND_URL_PROD!;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');

    console.log('[Admin Users API] Authorization header:', authHeader ? '***' : 'none');
    console.log('[Admin Users API] Backend URL:', BACKEND_URL);

    if (!authHeader) {
      return NextResponse.json(
        {
          success: false,
          message: 'No authorization token provided'
        },
        { status: 401 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/api/auth/admin/users`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    console.log('[Admin Users API] Backend response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('[Admin Users API] Error response:', errorText);
      return NextResponse.json(
        {
          success: false,
          message: `Backend error: ${response.status} ${errorText}`
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[Admin Users API] Success response received');

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[Admin Users API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error'
      },
      { status: 500 }
    );
  }
}