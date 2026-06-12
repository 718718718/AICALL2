import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NODE_ENV === 'development'
  ? (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000')
  : process.env.NEXT_PUBLIC_BACKEND_URL_PROD!;

async function handleRequest(request: NextRequest, method: string, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await context.params;
    const { searchParams } = new URL(request.url);
    const backendPath = path.join('/');
    
    console.log(`[Proxy API] ${method} request to:`, backendPath);
    console.log('[Proxy API] Backend URL:', BACKEND_URL);
    
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
    
    let backendUrl = `${BACKEND_URL}/api/${backendPath}`;
    if (searchParams.toString()) {
      backendUrl += '?' + searchParams.toString();
    }
    
    console.log(`[Proxy API] Full backend URL:`, backendUrl);
    
    const response = await fetch(backendUrl, {
      method,
      headers,
      body: body || undefined,
    });

    console.log(`[Proxy API] Backend response status:`, response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[Proxy API] Error response:`, errorText);
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
    console.error(`[Proxy API] ${method} Error:`, error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Internal server error' 
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return handleRequest(request, 'GET', context);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return handleRequest(request, 'POST', context);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return handleRequest(request, 'PUT', context);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return handleRequest(request, 'DELETE', context);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return handleRequest(request, 'PATCH', context);
}