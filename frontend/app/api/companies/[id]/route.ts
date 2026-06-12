import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NODE_ENV === 'development'
  ? (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000')
  : process.env.NEXT_PUBLIC_BACKEND_URL_PROD!;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authHeader = request.headers.get('authorization');
    const { id } = await params;
    
    console.log('[Company Detail API] Company ID:', id);
    console.log('[Company Detail API] Authorization header:', authHeader ? '***' : 'none');
    console.log('[Company Detail API] Backend URL:', BACKEND_URL);
    
    if (!authHeader) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'No authorization token provided' 
        },
        { status: 401 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/api/companies/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    console.log('[Company Detail API] Backend response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('[Company Detail API] Error response:', errorText);
      return NextResponse.json(
        { 
          success: false, 
          message: `Backend error: ${response.status} ${errorText}` 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[Company Detail API] Success response received');

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[Company Detail API] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Internal server error' 
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authHeader = request.headers.get('authorization');
    const { id } = await params;
    
    console.log('[Company Delete API] Company ID:', id);
    console.log('[Company Delete API] Authorization header:', authHeader ? '***' : 'none');
    
    if (!authHeader) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'No authorization token provided' 
        },
        { status: 401 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/api/companies/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    console.log('[Company Delete API] Backend response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('[Company Delete API] Error response:', errorText);
      return NextResponse.json(
        { 
          success: false, 
          message: `Backend error: ${response.status} ${errorText}` 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[Company Delete API] Success response received');

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[Company Delete API] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Internal server error' 
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authHeader = request.headers.get('authorization');
    const { id } = await params;
    const body = await request.json();

    console.log('[Company Update API] Company ID:', id);
    console.log('[Company Update API] Authorization header:', authHeader ? '***' : 'none');

    if (!authHeader) {
      return NextResponse.json(
        {
          success: false,
          message: 'No authorization token provided'
        },
        { status: 401 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/api/companies/${id}`, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    console.log('[Company Update API] Backend response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('[Company Update API] Error response:', errorText);
      return NextResponse.json(
        {
          success: false,
          message: `Backend error: ${response.status} ${errorText}`
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[Company Update API] Success response received');

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[Company Update API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error'
      },
      { status: 500 }
    );
  }
}
