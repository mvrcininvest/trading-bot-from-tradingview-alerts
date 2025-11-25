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
    const url = new URL(request.url);
    
    // Zbuduj target URL
    const targetUrl = `${BYBIT_BASE_URL}/${path}${url.search}`;
    
    console.log(`[Vercel Edge Proxy] ${request.method} ${targetUrl}`);

    // Skopiuj headers z request (oprócz host)
    const headers = new Headers();
    request.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'host') {
        headers.set(key, value);
      }
    });

    // Dodaj headers dla Bybit
    headers.set('Content-Type', 'application/json');

    const options: RequestInit = {
      method: request.method,
      headers,
    };

    // Dla POST/PUT dodaj body
    if (request.method === 'POST' || request.method === 'PUT') {
      const body = await request.text();
      if (body) {
        options.body = body;
      }
    }

    // Forward request do Bybit
    const response = await fetch(targetUrl, options);
    const data = await response.text();

    console.log(`[Vercel Edge Proxy] Response: ${response.status}`);

    // Zwróć response z tymi samymi statusem i headerami
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