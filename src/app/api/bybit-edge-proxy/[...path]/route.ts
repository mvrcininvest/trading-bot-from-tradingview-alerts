// ✅ VERCEL EDGE FUNCTION (Singapore region) - Proxy for Bybit API
// This runs on Vercel's edge network in the deployed region (Singapore)

export const runtime = 'edge';

const BYBIT_BASE_URL = 'https://api.bybit.com';

export async function GET(
  request: Request,
  props: { params: Promise<{ path: string[] }> }
) {
  const params = await props.params;
  return handleBybitProxy(request, params.path);
}

export async function POST(
  request: Request,
  props: { params: Promise<{ path: string[] }> }
) {
  const params = await props.params;
  return handleBybitProxy(request, params.path);
}

async function handleBybitProxy(request: Request, pathSegments: string[]) {
  try {
    const path = pathSegments.join('/');
    
    // Parse request URL to get query parameters
    const requestUrl = new URL(request.url);
    const queryString = requestUrl.search; // Includes the '?' if present
    
    // Build target URL
    const targetUrl = `${BYBIT_BASE_URL}/${path}${queryString}`;
    
    console.log(`[Vercel Edge Proxy] ${request.method} ${targetUrl}`);

    // Copy headers from request (except host)
    const headers = new Headers();
    request.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'host') {
        headers.set(key, value);
      }
    });

    // Add headers for Bybit
    headers.set('Content-Type', 'application/json');

    const options: RequestInit = {
      method: request.method,
      headers,
    };

    // For POST/PUT add body
    if (request.method === 'POST' || request.method === 'PUT') {
      const body = await request.text();
      if (body) {
        options.body = body;
      }
    }

    // Forward request to Bybit
    const response = await fetch(targetUrl, options);
    const data = await response.text();

    console.log(`[Vercel Edge Proxy] Response: ${response.status}`);

    // Return response with same status and headers
    return new Response(data, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  } catch (error: any) {
    console.error('[Vercel Edge Proxy] Error:', error);
    
    return new Response(
      JSON.stringify({
        retCode: -1,
        retMsg: `Proxy error: ${error.message}`,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}