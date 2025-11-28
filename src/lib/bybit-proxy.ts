/**
 * Bybit Proxy - Routes Bybit API requests through external proxy to bypass CloudFront geo-blocking
 */

interface ProxyConfig {
  enabled: boolean;
  externalProxyUrl: string;
}

// Smart proxy detection - always use proxy in blocked regions
function getProxyConfig(): ProxyConfig {
  // Always enabled by default (can be disabled with env var)
  const enabled = process.env.DISABLE_BYBIT_PROXY !== 'true';
  
  // Use AllOrigins proxy - better reliability for API requests
  const externalProxyUrl = process.env.BYBIT_PROXY_URL || 'https://api.allorigins.win/raw?url=';
  
  return {
    enabled,
    externalProxyUrl
  };
}

/**
 * Check if we should use proxy
 */
export function shouldUseInternalProxy(): boolean {
  return getProxyConfig().enabled;
}

/**
 * Server-side proxy function - routes through external proxy to bypass geo-blocking
 */
export async function proxyBybitRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  bodyData?: any
): Promise<string> {
  const config = getProxyConfig();
  
  // Use external proxy to route through allowed region
  const proxiedUrl = `${config.externalProxyUrl}${encodeURIComponent(url)}`;
  
  console.log(`🔄 [External Proxy] ${method} ${url}`);
  console.log(`   Via: ${config.externalProxyUrl}`);

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

  const response = await fetch(proxiedUrl, fetchOptions);
  const text = await response.text();

  if (!response.ok) {
    console.error(`❌ [External Proxy] Error ${response.status}: ${text.substring(0, 200)}`);
    throw new Error(`Bybit API error: ${response.status} - ${text}`);
  }

  return text;
}

/**
 * Wraps Bybit API URL with external proxy (legacy - not used)
 */
export function wrapBybitUrl(originalUrl: string): string {
  const config = getProxyConfig();
  
  if (!config.enabled) {
    return originalUrl;
  }
  
  return `${config.externalProxyUrl}${encodeURIComponent(originalUrl)}`;
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
    externalProxyUrl: config.externalProxyUrl,
    environment: process.env.NODE_ENV
  };
}