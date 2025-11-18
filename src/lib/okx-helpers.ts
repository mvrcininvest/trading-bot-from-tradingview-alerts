// ============================================
// 🏦 OKX API HELPERS
// ============================================
// Pomocnicze funkcje do interakcji z OKX API
// - Pobieranie realized PnL z trade history
// - Czyszczenie orphaned orders
// - Zarządzanie algo orders

import crypto from 'crypto';
import { okxRateLimiter } from './rate-limiter';
import { classifyOkxError } from './error-classifier';

// ============================================
// 🔐 OKX SIGNATURE
// ============================================

function createOkxSignature(
  timestamp: string,
  method: string,
  requestPath: string,
  body: string,
  apiSecret: string
): string {
  const message = timestamp + method + requestPath + body;
  return crypto.createHmac('sha256', apiSecret).update(message).digest('base64');
}

// ============================================
// 📡 OKX REQUEST WITH RETRY
// ============================================

export async function makeOkxRequestWithRetry(
  method: string,
  endpoint: string,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean,
  body?: any,
  maxRetries = 3
): Promise<any> {
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Use rate limiter
      const result = await okxRateLimiter.execute(async () => {
        const timestamp = new Date().toISOString();
        const bodyString = body ? JSON.stringify(body) : '';
        
        const signature = createOkxSignature(timestamp, method, endpoint, bodyString, apiSecret);

        const headers: Record<string, string> = {
          'OK-ACCESS-KEY': apiKey,
          'OK-ACCESS-SIGN': signature,
          'OK-ACCESS-TIMESTAMP': timestamp,
          'OK-ACCESS-PASSPHRASE': passphrase,
          'Content-Type': 'application/json',
        };

        if (demo) {
          headers['x-simulated-trading'] = '1';
        }

        const response = await fetch(`https://www.okx.com${endpoint}`, {
          method,
          headers,
          body: bodyString || undefined,
        });

        const text = await response.text();
        let data;
        
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`OKX returned non-JSON: ${text.substring(0, 200)}`);
        }

        // Check for rate limit
        if (data.code === '50011') {
          throw new Error('Rate limit exceeded');
        }

        return data;
      });

      // Success
      return result;

    } catch (error: any) {
      lastError = error;
      
      // Classify error
      const classified = classifyOkxError(
        error.code || 'unknown',
        error.message || String(error)
      );

      // If permanent error, don't retry
      if (classified.isPermanent) {
        console.error(`❌ Permanent error on attempt ${attempt}/${maxRetries}:`, error.message);
        throw error;
      }

      // If temporary, retry with exponential backoff
      if (attempt < maxRetries) {
        const waitTime = (classified.retryAfterMs || 1000) * attempt;
        console.warn(`⚠️ Attempt ${attempt}/${maxRetries} failed, retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // All retries failed
  throw new Error(`Failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
}

// ============================================
// 💰 GET REALIZED PNL FROM TRADE HISTORY
// ============================================

export interface RealizedPnlData {
  realizedPnl: number;
  fillPrice: number;
  closedAt: string;
  fees: number;
  fillQty: number;
}

export async function getRealizedPnlFromOkx(
  orderId: string,
  symbol: string,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean
): Promise<RealizedPnlData | null> {
  try {
    console.log(`💰 Fetching realized PnL for order ${orderId} (${symbol})...`);

    const data = await makeOkxRequestWithRetry(
      'GET',
      `/api/v5/trade/fills-history?instId=${symbol}&ordId=${orderId}`,
      apiKey,
      apiSecret,
      passphrase,
      demo,
      undefined,
      2 // Only 2 retries for PnL fetch
    );

    if (data.code !== '0' || !data.data || data.data.length === 0) {
      console.warn(`⚠️ No fill data found for order ${orderId}`);
      return null;
    }

    const fills = data.data;
    
    // Sum up all fills
    const totalPnl = fills.reduce((sum: number, fill: any) => {
      return sum + parseFloat(fill.fillPnl || '0');
    }, 0);

    const totalFees = fills.reduce((sum: number, fill: any) => {
      return sum + Math.abs(parseFloat(fill.fee || '0'));
    }, 0);

    const netPnl = totalPnl - totalFees;

    const firstFill = fills[0];
    const fillPrice = parseFloat(firstFill.fillPx || '0');
    const fillQty = fills.reduce((sum: number, fill: any) => sum + parseFloat(fill.fillSz || '0'), 0);
    const closedAt = new Date(parseInt(firstFill.ts || '0')).toISOString();

    console.log(`✅ Realized PnL: ${netPnl.toFixed(2)} USD (Fees: ${totalFees.toFixed(2)})`);

    return {
      realizedPnl: netPnl,
      fillPrice,
      closedAt,
      fees: totalFees,
      fillQty,
    };
  } catch (error: any) {
    console.error(`❌ Failed to get realized PnL:`, error.message);
    return null;
  }
}

// ============================================
// 🧹 CLEANUP ORPHANED ORDERS
// ============================================

export interface CleanupResult {
  success: boolean;
  cancelledCount: number;
  failedCount: number;
  errors: string[];
}

export async function cleanupOrphanedOrders(
  symbol: string,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean,
  maxRetries = 3
): Promise<CleanupResult> {
  console.log(`\n🧹 Cleaning up orphaned orders for ${symbol}...`);

  const result: CleanupResult = {
    success: true,
    cancelledCount: 0,
    failedCount: 0,
    errors: [],
  };

  try {
    // Get all pending algo orders
    const algoData = await makeOkxRequestWithRetry(
      'GET',
      '/api/v5/trade/orders-algo-pending?ordType=conditional',
      apiKey,
      apiSecret,
      passphrase,
      demo,
      undefined,
      2
    );

    if (algoData.code !== '0') {
      console.error(`❌ Failed to get algo orders: ${algoData.msg}`);
      result.success = false;
      result.errors.push(`Failed to fetch algo orders: ${algoData.msg}`);
      return result;
    }

    const algoOrders = (algoData.data || []).filter((a: any) => a.instId === symbol);
    
    if (algoOrders.length === 0) {
      console.log(`✅ No orphaned orders found for ${symbol}`);
      return result;
    }

    console.log(`📊 Found ${algoOrders.length} algo orders for ${symbol}`);

    // Cancel each order with retry
    for (const order of algoOrders) {
      let cancelled = false;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const cancelData = await makeOkxRequestWithRetry(
            'POST',
            '/api/v5/trade/cancel-algos',
            apiKey,
            apiSecret,
            passphrase,
            demo,
            [{
              algoId: order.algoId,
              instId: symbol,
            }],
            1 // Single retry for cancel
          );

          if (cancelData.code === '0') {
            console.log(`   ✅ Cancelled algo order ${order.algoId} (attempt ${attempt})`);
            result.cancelledCount++;
            cancelled = true;
            break;
          } else {
            console.warn(`   ⚠️ Cancel attempt ${attempt} failed: ${cancelData.msg}`);
          }
        } catch (error: any) {
          console.error(`   ❌ Cancel attempt ${attempt} error:`, error.message);
          
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
          }
        }
      }

      if (!cancelled) {
        result.failedCount++;
        result.success = false;
        const errorMsg = `Failed to cancel algo order ${order.algoId} after ${maxRetries} attempts`;
        result.errors.push(errorMsg);
        console.error(`   ❌ ${errorMsg}`);
      }
    }

    console.log(`\n🧹 Cleanup complete: ${result.cancelledCount} cancelled, ${result.failedCount} failed`);
    return result;

  } catch (error: any) {
    console.error(`❌ Cleanup failed:`, error.message);
    result.success = false;
    result.errors.push(error.message);
    return result;
  }
}

// ============================================
// 🔄 CANCEL SINGLE ALGO ORDER WITH RETRY
// ============================================

export async function cancelAlgoOrderWithRetry(
  algoId: string,
  symbol: string,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean,
  maxRetries = 3
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const data = await makeOkxRequestWithRetry(
        'POST',
        '/api/v5/trade/cancel-algos',
        apiKey,
        apiSecret,
        passphrase,
        demo,
        [{
          algoId,
          instId: symbol,
        }],
        1
      );

      if (data.code === '0') {
        console.log(`✅ Cancelled algo ${algoId} (attempt ${attempt})`);
        return true;
      } else {
        console.warn(`⚠️ Cancel attempt ${attempt} failed: ${data.msg}`);
      }
    } catch (error: any) {
      console.error(`❌ Cancel attempt ${attempt} error:`, error.message);
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      }
    }
  }

  console.error(`❌ Failed to cancel algo ${algoId} after ${maxRetries} attempts`);
  return false;
}
