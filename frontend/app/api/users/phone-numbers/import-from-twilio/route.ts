import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NODE_ENV === 'development'
  ? (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000')
  : process.env.NEXT_PUBLIC_BACKEND_URL_PROD!;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    console.log('[Phone Numbers Import API] Authorization header:', authHeader ? '***' : 'none');

    if (!authHeader) {
      return NextResponse.json(
        {
          success: false,
          message: 'No authorization token provided',
        },
        { status: 401 },
      );
    }

    const response = await fetch(`${BACKEND_URL}/api/users/phone-numbers/import-from-twilio`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    console.log('[Phone Numbers Import API] Backend response status:', response.status);

    const data = await response
      .json()
      .catch(async () => {
        const text = await response.text();
        console.log('[Phone Numbers Import API] Non-JSON response:', text);
        return {
          success: false,
          message: text || 'Unexpected backend response',
        };
      });

    if (!response.ok) {
      console.log('[Phone Numbers Import API] Error response:', data);
      return NextResponse.json(
        {
          success: false,
          message: data.message || `Backend error: ${response.status}`,
        },
        { status: response.status },
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[Phone Numbers Import API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error',
      },
      { status: 500 },
    );
  }
}
