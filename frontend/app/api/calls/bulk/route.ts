import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NODE_ENV === 'development'
  ? (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000')
  : process.env.NEXT_PUBLIC_BACKEND_URL_PROD!;

async function handleRequest(request: NextRequest, method: string) {
  try {
    const { searchParams } = new URL(request.url);
    
    console.log(`[Bulk Calls API] ${method} request`);
    console.log('[Bulk Calls API] Backend URL:', BACKEND_URL);
    console.log('[Bulk Calls API] Search params:', searchParams.toString());
    
    const authHeader = request.headers.get('authorization');
    const contentType = request.headers.get('content-type');
    
    let body;
    if (method !== 'GET' && method !== 'DELETE') {
      body = await request.text();
    }
    
    const headers: Record<string, string> = {
      'Content-Type': contentType || 'application/json',
    };
    
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }
    
    let backendUrl = `${BACKEND_URL}/api/calls/bulk`;
    if (searchParams.toString()) {
      backendUrl += '?' + searchParams.toString();
    }
    
    console.log(`[Bulk Calls API] Full backend URL:`, backendUrl);
    
    const response = await fetch(backendUrl, {
      method,
      headers,
      body: body || undefined,
    });

    console.log(`[Bulk Calls API] Backend response status:`, response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[Bulk Calls API] Error response:`, errorText);
      return NextResponse.json(
        { 
          success: false, 
          message: `Backend error: ${response.status} ${errorText}` 
        },
        { status: response.status }
      );
    }

    const responseText = await response.text();
    let data;
    
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { text: responseText };
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error(`[Bulk Calls API] ${method} Error:`, error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Internal server error' 
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return handleRequest(request, 'GET');
}

export async function POST(request: NextRequest) {
  return handleRequest(request, 'POST');
}

export async function PUT(request: NextRequest) {
  return handleRequest(request, 'PUT');
}

export async function DELETE(request: NextRequest) {
  return handleRequest(request, 'DELETE');
}

export async function PATCH(request: NextRequest) {
  return handleRequest(request, 'PATCH');
}