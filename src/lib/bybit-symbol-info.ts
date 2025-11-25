/**
 * Bybit Symbol Information Helper
 * Fetches trading rules and lot size info for symbols
 */

import { createBybitSignature } from './bybit-helpers';

// ✅ USE SAME PROXY AS bybit-helpers.ts
function getAbsoluteProxyUrl(endpoint: string): string {
  // On Vercel production/preview
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/bybit-edge-proxy${endpoint}`;
  }
  
  // Fallback to custom env var
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return `${process.env.NEXT_PUBLIC_APP_URL}/api/bybit-edge-proxy${endpoint}`;
  }
  
  // Local development - use localhost
  return `http://localhost:3000/api/bybit-edge-proxy${endpoint}`;
}

interface BybitLotSizeFilter {
  minOrderQty: string;
  maxOrderQty: string;
  qtyStep: string;
  postOnlyMaxOrderQty: string;
}

interface BybitSymbolInfo {
  symbol: string;
  baseCoin: string;
  quoteCoin: string;
  lotSizeFilter: BybitLotSizeFilter;
  minNotionalValue: string;
}

interface SymbolInfoCache {
  symbol: string;
  minOrderQty: number;
  qtyStep: number;
  precision: number;
  minNotional: number;
  fetchedAt: number;
}

// Cache symbol info for 1 hour
const CACHE_DURATION_MS = 60 * 60 * 1000;
const symbolCache = new Map<string, SymbolInfoCache>();

/**
 * Get symbol trading info from Bybit
 */
export async function getSymbolInfo(
  symbol: string,
  apiKey: string,
  apiSecret: string
): Promise<SymbolInfoCache> {
  // Check cache first
  const cached = symbolCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < CACHE_DURATION_MS) {
    console.log(`📦 [SymbolInfo] Using cached data for ${symbol}`);
    return cached;
  }

  console.log(`🔍 [SymbolInfo] Fetching trading rules for ${symbol}...`);

  try {
    const timestamp = Date.now().toString();
    const recvWindow = '5000';
    const queryParams: Record<string, any> = {
      category: "linear",
      symbol: symbol,
    };

    const queryString = new URLSearchParams(queryParams as any).toString();
    const signature = await createBybitSignature(timestamp, apiKey, apiSecret, recvWindow, queryString);

    // ✅ CRITICAL FIX: Use proxy instead of direct API
    const url = getAbsoluteProxyUrl(`/v5/market/instruments-info?${queryString}`);

    console.log(`[SymbolInfo] Fetching from: ${url.substring(0, 50)}...`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-BAPI-API-KEY": apiKey,
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-SIGN": signature,
        "X-BAPI-RECV-WINDOW": recvWindow,
        "X-BAPI-SIGN-TYPE": "2",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [SymbolInfo] Bybit API error (${response.status}):`, errorText.substring(0, 200));
      throw new Error(`Failed to fetch symbol info: HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.retCode !== 0 || !data.result?.list || data.result.list.length === 0) {
      console.error(`❌ [SymbolInfo] Invalid response:`, data);
      throw new Error(`Failed to fetch symbol info: ${data.retMsg || "No data"}`);
    }

    const symbolData: BybitSymbolInfo = data.result.list[0];
    const lotSize = symbolData.lotSizeFilter;

    // Calculate precision from qtyStep
    const qtyStep = parseFloat(lotSize.qtyStep);
    const precision = qtyStep.toString().includes(".")
      ? qtyStep.toString().split(".")[1].length
      : 0;

    const info: SymbolInfoCache = {
      symbol: symbolData.symbol,
      minOrderQty: parseFloat(lotSize.minOrderQty),
      qtyStep: qtyStep,
      precision: precision,
      minNotional: parseFloat(symbolData.minNotionalValue || "0"),
      fetchedAt: Date.now(),
    };

    // Cache the result
    symbolCache.set(symbol, info);

    console.log(`✅ [SymbolInfo] ${symbol}:`, {
      minQty: info.minOrderQty,
      qtyStep: info.qtyStep,
      precision: info.precision,
      minNotional: info.minNotional,
    });

    return info;
  } catch (error) {
    console.error(`❌ [SymbolInfo] Failed to fetch ${symbol}:`, error);
    throw error;
  }
}

/**
 * Round quantity to proper precision based on symbol rules
 */
export function roundQuantityToStep(
  quantity: number,
  qtyStep: number,
  precision: number
): number {
  // Round down to nearest step
  const rounded = Math.floor(quantity / qtyStep) * qtyStep;
  // Format with correct precision
  return parseFloat(rounded.toFixed(precision));
}

/**
 * Calculate minimum margin required for a symbol
 */
export function calculateMinimumMargin(
  minOrderQty: number,
  price: number,
  leverage: number
): number {
  const minContractValue = minOrderQty * price;
  const minMargin = minContractValue / leverage;
  return minMargin;
}

/**
 * Validate and adjust position size to meet symbol requirements
 */
export async function validateAndAdjustPositionSize(
  symbol: string,
  targetPositionSizeUsd: number,
  marketPrice: number,
  leverage: number,
  apiKey: string,
  apiSecret: string
): Promise<{
  isValid: boolean;
  adjustedPositionSize: number;
  adjustedQuantity: number;
  reason: string;
  symbolInfo: SymbolInfoCache;
}> {
  // Get symbol info
  const symbolInfo = await getSymbolInfo(symbol, apiKey, apiSecret);

  // Calculate target quantity
  const targetQuantity = targetPositionSizeUsd / marketPrice;

  // Round to proper precision
  const roundedQuantity = roundQuantityToStep(
    targetQuantity,
    symbolInfo.qtyStep,
    symbolInfo.precision
  );

  // Check if meets minimum
  if (roundedQuantity < symbolInfo.minOrderQty) {
    // Calculate minimum required position size
    const minRequiredPositionSize = symbolInfo.minOrderQty * marketPrice;
    const minRequiredMargin = calculateMinimumMargin(
      symbolInfo.minOrderQty,
      marketPrice,
      leverage
    );

    console.log(`⚠️ [PositionSize] ${symbol}: Target too small`);
    console.log(`   Target: ${targetPositionSizeUsd.toFixed(2)} USD`);
    console.log(`   Minimum required: ${minRequiredPositionSize.toFixed(2)} USD`);
    console.log(`   Min margin at ${leverage}x: ${minRequiredMargin.toFixed(2)} USD`);

    // AUTO-ADJUST: Increase to minimum required
    const adjustedQuantity = symbolInfo.minOrderQty;
    const adjustedPositionSize = adjustedQuantity * marketPrice;

    return {
      isValid: true,
      adjustedPositionSize: adjustedPositionSize,
      adjustedQuantity: adjustedQuantity,
      reason: `Auto-adjusted from ${targetPositionSizeUsd.toFixed(2)} to ${adjustedPositionSize.toFixed(2)} USD (minimum for ${symbol})`,
      symbolInfo,
    };
  }

  // Target is sufficient
  return {
    isValid: true,
    adjustedPositionSize: targetPositionSizeUsd,
    adjustedQuantity: roundedQuantity,
    reason: `Target size sufficient for ${symbol}`,
    symbolInfo,
  };
}

/**
 * Clear symbol info cache (useful for testing)
 */
export function clearSymbolCache() {
  symbolCache.clear();
  console.log("🗑️ [SymbolInfo] Cache cleared");
}