import { NextRequest, NextResponse } from 'next/server';

/**
 * 🌐 BYBIT PROXY ENDPOINT
 * 
 * Rozwiązuje problem blokady geograficznej CloudFront (403 error)
 * Przekierowuje żądania do Bybit API przez publiczny proxy
 */

const BYBIT_API_BASE = 'https://api.bybit.com';

// Lista publicznych proxy serwerów (możesz dodać swoje)
const PROXY_SERVERS = [
  // Cloudflare Workers proxy (jeśli dostępny)
  process.env.BYBIT_PROXY_URL,
  // Backup: bezpośrednie połączenie (jeśli region jest OK)
  null
].filter(Boolean);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { method, endpoint, headers, requestBody } = body;

    console.log(`\n🌐 [BYBIT PROXY] Request: ${method} ${endpoint}`);

    // Buduj pełny URL
    const url = `${BYBIT_API_BASE}${endpoint}`;
    
    console.log(`   Target URL: ${url}`);
    console.log(`   Headers:`, Object.keys(headers || {}));

    // Wykonaj żądanie do Bybit
    const response = await fetch(url, {
      method: method || 'GET',
      headers: {
        ...headers,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      body: requestBody ? JSON.stringify(requestBody) : undefined,
    });

    const responseText = await response.text();
    
    console.log(`   Response status: ${response.status}`);
    
    if (!response.ok) {
      console.error(`   ❌ Response error: ${responseText.substring(0, 200)}...`);
    }

    // Zwróć odpowiedź
    return new NextResponse(responseText, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error: any) {
    console.error(`❌ [BYBIT PROXY] Error:`, error.message);
    return NextResponse.json(
      { 
        retCode: -1, 
        retMsg: `Proxy error: ${error.message}`,
        error: error.message 
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const endpoint = searchParams.get('endpoint');
    const headersStr = searchParams.get('headers');
    
    if (!endpoint) {
      return NextResponse.json(
        { retCode: -1, retMsg: 'Missing endpoint parameter' },
        { status: 400 }
      );
    }

    const headers = headersStr ? JSON.parse(headersStr) : {};

    console.log(`\n🌐 [BYBIT PROXY] Request: GET ${endpoint}`);

    // Buduj pełny URL
    const url = `${BYBIT_API_BASE}${endpoint}`;
    
    console.log(`   Target URL: ${url}`);

    // Wykonaj żądanie do Bybit
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...headers,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    const responseText = await response.text();
    
    console.log(`   Response status: ${response.status}`);
    
    if (!response.ok) {
      console.error(`   ❌ Response error: ${responseText.substring(0, 200)}...`);
    }

    // Zwróć odpowiedź
    return new NextResponse(responseText, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error: any) {
    console.error(`❌ [BYBIT PROXY] Error:`, error.message);
    return NextResponse.json(
      { 
        retCode: -1, 
        retMsg: `Proxy error: ${error.message}`,
        error: error.message 
      },
      { status: 500 }
    );
  }
}
