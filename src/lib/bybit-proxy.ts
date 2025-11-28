/**
 * Bybit Proxy - Routes Bybit API requests server-side to bypass CloudFront geo-blocking
 */

interface ProxyConfig {
  enabled: boolean;
  useServerSideProxy: boolean;
  externalProxyUrl?: string;
}

// Smart proxy detection - auto-enable in production OR manual enable via env var
function getProxyConfig(): ProxyConfig {
  // Manual override - always check this first
  const manualEnable = process.env.USE_BYBIT_PROXY === 'true';
  
  const isProduction = process.env.NODE_ENV === 'production';
  const isVercel = !!process.env.VERCEL;
  const isRender = !!process.env.RENDER;
  
  // Auto-enable proxy in deployment environments OR if manually enabled
  const autoEnableProxy = isProduction && (isVercel || isRender);
  
  const enabled = manualEnable || autoEnableProxy;
  
  // Use server-side proxy (recommended) or external proxy URL
  const useServerSideProxy = enabled;
  const externalProxyUrl = process.env.BYBIT_PROXY_URL || 'https://corsproxy.io/?';
  
  return {
    enabled,
    useServerSideProxy,
    externalProxyUrl
  };
}

/**
 * Check if we should use server-side proxy (always true when enabled)
 */
export function shouldUseInternalProxy(): boolean {
  const config = getProxyConfig();
  return config.enabled && config.useServerSideProxy;
}

/**
 * Server-side proxy function - makes requests directly from Next.js server
 * This bypasses CloudFront geo-blocking
 */
export async function proxyBybitRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  bodyData?: any
): Promise<string> {
  console.log(`🔄 [Server Proxy] ${method} ${url}`);

  const fetchOptions: RequestInit = {
    method,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...headers
    }
  };

  if (bodyData && (method === 'POST' || method === 'PUT')) {
    fetchOptions.body = JSON.stringify(bodyData);
  }

  const response = await fetch(url, fetchOptions);
  const text = await response.text();

  if (!response.ok) {
    console.error(`❌ [Server Proxy] Error ${response.status}: ${text.substring(0, 200)}`);
    throw new Error(`Bybit API error: ${response.status} - ${text}`);
  }

  return text;
}

/**
 * Wraps Bybit API URL with external proxy if enabled (fallback method - not used)
 */
export function wrapBybitUrl(originalUrl: string): string {
  const config = getProxyConfig();
  
  // If using server-side proxy, don't wrap
  if (config.useServerSideProxy) {
    return originalUrl;
  }
  
  if (!config.enabled) {
    console.log('[Bybit Proxy] Disabled - using direct connection');
    return originalUrl;
  }
  
  if (!config.externalProxyUrl) {
    console.warn('[Bybit Proxy] Enabled but no proxy URL configured');
    return originalUrl;
  }
  
  const proxiedUrl = `${config.externalProxyUrl}${encodeURIComponent(originalUrl)}`;
  console.log(`[Bybit Proxy] Routing through external proxy: ${originalUrl.substring(0, 50)}...`);
  
  return proxiedUrl;
}

/**
 * Check if proxy is currently active
 */
export function isProxyEnabled(): boolean {
  return getProxyConfig().enabled;
}

/**
 * Get proxy status for diagnostics
 */
export function getProxyStatus() {
  const config = getProxyConfig();
  return {
    enabled: config.enabled,
    useServerSideProxy: config.useServerSideProxy,
    externalProxyUrl: config.externalProxyUrl,
    environment: process.env.NODE_ENV,
    isVercel: !!process.env.VERCEL,
    isRender: !!process.env.RENDER
  };
}