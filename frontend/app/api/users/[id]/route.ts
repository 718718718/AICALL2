import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NODE_ENV === 'development'
  ? (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000')
  : process.env.NEXT_PUBLIC_BACKEND_URL_PROD!;

async function proxyRequest(
  request: NextRequest,
  userId: string,
  method: 'GET' | 'PUT'
) {
  const authHeader = request.headers.get('authorization');

  console.log(`[User Detail API] ${method} /${userId}`);
  console.log('[User Detail API] Authorization header:', authHeader ? '***' : 'none');

  if (!authHeader) {
    return NextResponse.json(
      {
        success: false,
        message: 'No authorization token provided',
      },
      { status: 401 },
    );
  }

  const backendUrl = `${BACKEND_URL}/api/users/${userId}`;

  const init: RequestInit = {
    method,
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  };

  if (method === 'PUT') {
    const body = await request.text();
    init.body = body;
  }

  const response = await fetch(backendUrl, init);
  console.log('[User Detail API] Backend response status:', response.status);

  const data = await response
    .json()
    .catch(async () => {
      const text = await response.text();
      console.log('[User Detail API] Non-JSON response:', text);
      return {
        success: false,
        message: text || 'Unexpected backend response',
      };
    });

  if (!response.ok) {
    console.log('[User Detail API] Error response:', data);
    return NextResponse.json(
      {
        success: false,
        message: data.message || `Backend error: ${response.status}`,
      },
      { status: response.status },
    );
  }

  return NextResponse.json(data, { status: 200 });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return await proxyRequest(request, id, 'GET');
  } catch (error) {
    console.error('[User Detail API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error',
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return await proxyRequest(request, id, 'PUT');
  } catch (error) {
    console.error('[User Detail API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error',
      },
      { status: 500 },
    );
  }
}
