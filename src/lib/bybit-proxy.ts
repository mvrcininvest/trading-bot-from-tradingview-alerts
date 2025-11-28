/**
 * Bybit Proxy - Routes Bybit API requests through proxy to bypass CloudFront geo-blocking
 */

interface ProxyConfig {
  enabled: boolean;
  proxyUrl?: string;
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
  
  const proxyUrl = process.env.BYBIT_PROXY_URL || 'https://api.allorigins.win/raw?url=';
  
  return {
    enabled,
    proxyUrl: proxyUrl
  };
}

/**
 * Wraps Bybit API URL with proxy if enabled
 */
export function wrapBybitUrl(originalUrl: string): string {
  const config = getProxyConfig();
  
  if (!config.enabled) {
    console.log('[Bybit Proxy] Disabled - using direct connection');
    return originalUrl;
  }
  
  if (!config.proxyUrl) {
    console.warn('[Bybit Proxy] Enabled but no proxy URL configured');
    return originalUrl;
  }
  
  const proxiedUrl = `${config.proxyUrl}${encodeURIComponent(originalUrl)}`;
  console.log(`[Bybit Proxy] Routing through proxy: ${originalUrl.substring(0, 50)}...`);
  
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
    proxyUrl: config.proxyUrl,
    environment: process.env.NODE_ENV,
    isVercel: !!process.env.VERCEL,
    isRender: !!process.env.RENDER
  };
}