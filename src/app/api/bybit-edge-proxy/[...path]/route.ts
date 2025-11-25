import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export const preferredRegion = ['sin1', 'hkg1', 'icn1']; // Singapore, Hong Kong, Seoul

/**
 * 🌐 VERCEL EDGE PROXY FOR BYBIT API
 * 
 * Omija geo-blocking CloudFront używając Vercel Edge Functions w Azji.
 * Fallback dla Fly.io proxy gdy CloudFront blokuje.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const pathString = path.join('/');
    const searchParams = request.nextUrl.searchParams;
    
    // Build Bybit API URL
    const queryString = searchParams.toString();
    const bybitUrl = `https://api.bybit.com/${pathString}${queryString ? `?${queryString}` : ''}`;

    console.log(`[Vercel Edge Proxy] GET ${bybitUrl}`);

    // Forward headers from client
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Copy authentication headers if present
    const authHeaders = [
      'X-BAPI-API-KEY',
      'X-BAPI-TIMESTAMP',
      'X-BAPI-SIGN',
      'X-BAPI-RECV-WINDOW',
    ];

    authHeaders.forEach((headerName) => {
      const value = request.headers.get(headerName);
      if (value) {
        headers[headerName] = value;
      }
    });

    // Make request to Bybit
    const response = await fetch(bybitUrl, {
      method: 'GET',
      headers,
    });

    const data = await response.json();

    console.log(`[Vercel Edge Proxy] Response: ${response.status} - ${data.retMsg || 'OK'}`);

    // Return response
    return NextResponse.json(data, {
      status: response.status,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('[Vercel Edge Proxy] Error:', error);
    return NextResponse.json(
      { 
        retCode: -1, 
        retMsg: error instanceof Error ? error.message : 'Proxy error' 
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const pathString = path.join('/');
    const body = await request.text();
    
    const bybitUrl = `https://api.bybit.com/${pathString}`;

    console.log(`[Vercel Edge Proxy] POST ${bybitUrl}`);

    // Forward headers from client
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const authHeaders = [
      'X-BAPI-API-KEY',
      'X-BAPI-TIMESTAMP',
      'X-BAPI-SIGN',
      'X-BAPI-RECV-WINDOW',
    ];

    authHeaders.forEach((headerName) => {
      const value = request.headers.get(headerName);
      if (value) {
        headers[headerName] = value;
      }
    });

    // Make request to Bybit
    const response = await fetch(bybitUrl, {
      method: 'POST',
      headers,
      body,
    });

    const data = await response.json();

    console.log(`[Vercel Edge Proxy] Response: ${response.status} - ${data.retMsg || 'OK'}`);

    return NextResponse.json(data, {
      status: response.status,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('[Vercel Edge Proxy] Error:', error);
    return NextResponse.json(
      { 
        retCode: -1, 
        retMsg: error instanceof Error ? error.message : 'Proxy error' 
      },
      { status: 500 }
    );
  }
}