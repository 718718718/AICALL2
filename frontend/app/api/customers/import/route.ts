import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NODE_ENV === 'development'
  ? (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000')
  : process.env.NEXT_PUBLIC_BACKEND_URL_PROD!;

export async function POST(request: NextRequest) {
  try {
    console.log('[Customer Import API] POST request');
    console.log('[Customer Import API] Backend URL:', BACKEND_URL);
    
    const authHeader = request.headers.get('authorization');
    const contentType = request.headers.get('content-type');
    
    const body = await request.text();
    
    const headers: Record<string, string> = {
      'Content-Type': contentType || 'application/json',
    };
    
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }
    
    const backendUrl = `${BACKEND_URL}/api/customers/import`;
    
    console.log(`[Customer Import API] Full backend URL:`, backendUrl);
    
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers,
      body,
    });

    console.log(`[Customer Import API] Backend response status:`, response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[Customer Import API] Error response:`, errorText);

      // Try to parse error message from JSON
      let errorMessage = 'インポートに失敗しました';
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        errorMessage = errorText;
      }

      return NextResponse.json(
        {
          success: false,
          error: errorMessage
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
    console.error('[Customer Import API] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Internal server error' 
      },
      { status: 500 }
    );
  }
}