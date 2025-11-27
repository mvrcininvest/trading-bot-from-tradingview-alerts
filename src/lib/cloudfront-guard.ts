// ============================================
// 🛡️ CLOUDFRONT GUARD - Automatic Detection & Emergency Shutdown
// ============================================
// Detects CloudFront 403 blocks and triggers:
// 1. SMS Alert
// 2. Bot Disable
// 3. Close All Positions
// 
// 🔒 SMART LOCK SYSTEM:
// - Lock aktywny dopóki użytkownik nie włączy bota ręcznie
// - Nie wysyła duplikatów SMS dopóki bot nie zostanie reaktywowany

import { db } from '@/db';
import { botSettings, botPositions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { sendCloudFrontBlockAlert } from '@/lib/sms-service';
import crypto from 'crypto';

// ✅ DIRECT BYBIT API CONNECTION
const BYBIT_API_BASE = 'https://api.bybit.com';

// ============================================
// 🔒 CHECK IF CLOUDFRONT SHUTDOWN IS ACTIVE
// ============================================
async function isShutdownLockActive(): Promise<boolean> {
  try {
    const settings = await db.select().from(botSettings).limit(1);
    
    if (settings.length === 0) {
      return false;
    }
    
    // Check if bot is disabled AND migration_date contains "cloudfront"
    // We use migration_date as a flag field (hacky but works without schema change)
    const isDisabled = !settings[0].botEnabled;
    const hasCloudFrontFlag = settings[0].migrationDate?.includes('CLOUDFRONT_LOCK');
    
    const lockActive = isDisabled && hasCloudFrontFlag;
    
    console.log(`[CloudFront Guard] Lock status check:`, {
      botEnabled: settings[0].botEnabled,
      hasCloudFrontFlag,
      lockActive
    });
    
    return lockActive;
  } catch (error: any) {
    console.error('[CloudFront Guard] Error checking lock status:', error);
    return false;
  }
}

// ============================================
// 🔓 RESET CLOUDFRONT LOCK (called when user enables bot)
// ============================================
export async function resetCloudFrontLock(): Promise<void> {
  try {
    const settings = await db.select().from(botSettings).limit(1);
    
    if (settings.length === 0) {
      return;
    }
    
    // Check if CloudFront flag exists
    if (settings[0].migrationDate?.includes('CLOUDFRONT_LOCK')) {
      console.log('[CloudFront Guard] 🔓 Resetting CloudFront lock - user enabled bot');
      
      // Remove CloudFront flag
      await db.update(botSettings)
        .set({
          migrationDate: null,
          updatedAt: new Date().toISOString()
        })
        .where(eq(botSettings.id, settings[0].id));
      
      console.log('✅ CloudFront lock reset - może wysłać kolejny SMS jeśli znowu będzie blokada');
    }
  } catch (error: any) {
    console.error('[CloudFront Guard] Error resetting lock:', error);
  }
}

// ============================================
// 🔐 BYBIT SIGNATURE HELPER
// ============================================

function createBybitSignature(
  timestamp: string,
  apiKey: string,
  apiSecret: string,
  recvWindow: string,
  params: string
): string {
  const message = timestamp + apiKey + recvWindow + params;
  return crypto.createHmac('sha256', apiSecret).update(message).digest('hex');
}

// ============================================
// ❌ CLOSE ALL POSITIONS (Internal function)
// ============================================

async function closeAllPositionsInternal(
  apiKey: string,
  apiSecret: string
): Promise<{ success: boolean; closed: number; errors: string[] }> {
  try {
    console.log('🔴 [Emergency] Fetching open positions to close...');
    
    const timestamp = Date.now().toString();
    const recvWindow = "5000";
    const params = `category=linear&settleCoin=USDT`;
    const signature = createBybitSignature(timestamp, apiKey, apiSecret, recvWindow, params);
    
    const headers: Record<string, string> = {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-SIGN": signature,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-SIGN-TYPE": "2",
      "X-BAPI-RECV-WINDOW": recvWindow,
      "Content-Type": "application/json",
    };
    
    const response = await fetch(`${BYBIT_API_BASE}/v5/position/list?${params}`, {
      method: "GET",
      headers,
    });

    const data = await response.json();

    if (data.retCode !== 0) {
      throw new Error(`Failed to fetch positions: ${data.retMsg}`);
    }

    const positions = data.result?.list?.filter((p: any) => parseFloat(p.size) !== 0) || [];
    
    console.log(`   Found ${positions.length} positions to close`);
    
    if (positions.length === 0) {
      return { success: true, closed: 0, errors: [] };
    }
    
    let closed = 0;
    const errors: string[] = [];
    
    for (const pos of positions) {
      const symbol = pos.symbol;
      const size = Math.abs(parseFloat(pos.size));
      const side = pos.side === 'Buy' ? 'Sell' : 'Buy'; // Opposite side to close
      
      try {
        const closeTimestamp = Date.now().toString();
        const closePayload = {
          category: 'linear',
          symbol: symbol,
          side: side,
          orderType: 'Market',
          qty: size.toFixed(3),
          positionIdx: 0,
          timeInForce: 'GTC'
        };
        
        const closeBodyString = JSON.stringify(closePayload);
        const closeSignature = createBybitSignature(closeTimestamp, apiKey, apiSecret, recvWindow, closeBodyString);
        
        const closeHeaders: Record<string, string> = {
          "X-BAPI-API-KEY": apiKey,
          "X-BAPI-SIGN": closeSignature,
          "X-BAPI-TIMESTAMP": closeTimestamp,
          "X-BAPI-SIGN-TYPE": "2",
          "X-BAPI-RECV-WINDOW": recvWindow,
          "Content-Type": "application/json",
        };
        
        const closeResponse = await fetch(`${BYBIT_API_BASE}/v5/order/create`, {
          method: "POST",
          headers: closeHeaders,
          body: closeBodyString,
        });
        
        const closeData = await closeResponse.json();
        
        if (closeData.retCode === 0) {
          console.log(`   ✅ Closed ${symbol} - Order: ${closeData.result?.orderId}`);
          closed++;
        } else {
          throw new Error(`${closeData.retMsg} (code: ${closeData.retCode})`);
        }
        
      } catch (error: any) {
        const errMsg = `Failed to close ${symbol}: ${error.message}`;
        console.error(`   ❌ ${errMsg}`);
        errors.push(errMsg);
      }
    }
    
    console.log(`✅ Emergency close complete: ${closed}/${positions.length} positions closed`);
    
    return { success: closed > 0, closed, errors };
    
  } catch (error: any) {
    console.error(`❌ [Emergency] Failed to close positions: ${error.message}`);
    return { success: false, closed: 0, errors: [error.message] };
  }
}

/**
 * Detect if response is CloudFront block
 */
export function isCloudFrontBlock(response: Response, text: string): boolean {
  // Check for HTML response (CloudFront error page)
  if (text.includes('<!DOCTYPE html>') || text.includes('<html')) {
    return true;
  }
  
  // Check for 403 status
  if (response.status === 403) {
    return true;
  }
  
  // Check for CloudFront in headers
  const server = response.headers.get('server');
  if (server?.includes('CloudFront')) {
    return true;
  }
  
  return false;
}

/**
 * Emergency shutdown: Disable bot, close positions, send SMS
 * 🔒 SMART LOCK: Won't send duplicate SMS until user manually enables bot
 */
export async function triggerEmergencyShutdown(reason: string, serverInfo?: any): Promise<void> {
  // ✅ Check if lock is already active
  const lockActive = await isShutdownLockActive();
  
  if (lockActive) {
    console.log('[CloudFront Guard] 🔒 Lock aktywny - bot już wyłączony przez poprzedni CloudFront block');
    console.log('   → Nie wysyłam SMS dopóki użytkownik nie włączy bota ręcznie');
    return;
  }
  
  try {
    console.log('\n🚨🚨🚨 [CLOUDFRONT GUARD] EMERGENCY SHUTDOWN TRIGGERED 🚨🚨🚨');
    console.log(`Reason: ${reason}`);
    console.log(`Server Info:`, serverInfo);
    
    // Step 1: Disable bot immediately + SET CLOUDFRONT LOCK FLAG
    console.log('\n🔴 Step 1: Disabling bot + setting CloudFront lock...');
    const settings = await db.select().from(botSettings).limit(1);
    
    if (settings.length === 0) {
      console.error('❌ No bot settings found - cannot disable bot');
    } else {
      await db.update(botSettings)
        .set({
          botEnabled: false,
          migrationDate: `CLOUDFRONT_LOCK_${new Date().toISOString()}`, // Flag for lock
          updatedAt: new Date().toISOString()
        })
        .where(eq(botSettings.id, settings[0].id));
      
      console.log('✅ Bot DISABLED + CloudFront lock SET');
      console.log('   🔒 Lock będzie aktywny dopóki użytkownik nie włączy bota ręcznie');
    }
    
    // Step 2: Get all open positions
    console.log('\n📊 Step 2: Checking open positions...');
    const openPositions = await db.select()
      .from(botPositions)
      .where(eq(botPositions.status, 'open'));
    
    console.log(`Found ${openPositions.length} open positions in DB`);
    
    if (openPositions.length === 0) {
      console.log('✅ No positions to close');
    } else if (!settings[0]?.apiKey || !settings[0]?.apiSecret) {
      console.error('❌ No API credentials - cannot close positions');
    } else {
      // Step 3: Close all positions using internal function
      console.log('\n❌ Step 3: Closing all positions...');
      
      const { apiKey, apiSecret } = settings[0];
      const closeResult = await closeAllPositionsInternal(apiKey, apiSecret);
      
      if (closeResult.success) {
        console.log(`✅ Closed ${closeResult.closed} positions`);
        
        // Update DB positions as closed
        for (const pos of openPositions) {
          await db.update(botPositions)
            .set({
              status: 'closed',
              closeReason: 'cloudfront_emergency_shutdown',
              closedAt: new Date().toISOString()
            })
            .where(eq(botPositions.id, pos.id));
        }
      } else {
        console.error(`❌ Failed to close some positions:`, closeResult.errors);
      }
    }
    
    // Step 4: Send SMS alert (TYLKO RAZ - dzięki lock-owi)
    console.log('\n📱 Step 4: Sending SMS alert...');
    try {
      const smsResult = await sendCloudFrontBlockAlert(serverInfo || {
        region: process.env.VERCEL_REGION || 'Unknown',
        ip: 'Unknown'
      });
      
      if (smsResult.success) {
        console.log(`✅ SMS alert sent: ${smsResult.messageId}`);
      } else {
        console.error(`❌ SMS alert failed: ${smsResult.error}`);
      }
    } catch (error: any) {
      console.error(`❌ SMS error: ${error.message}`);
    }
    
    console.log('\n🚨 [CLOUDFRONT GUARD] Emergency shutdown complete');
    console.log('   ✅ Bot disabled');
    console.log(`   ✅ ${openPositions.length} positions handled`);
    console.log('   ✅ SMS alert sent');
    console.log('   🔒 Lock aktywny - nie wyśle więcej SMS dopóki nie włączysz bota');
    console.log('\n⚠️ Aby zresetować lock: Włącz bota ręcznie w ustawieniach\n');
    
  } catch (error: any) {
    console.error('[CloudFront Guard] ❌ Emergency shutdown error:', error.message);
  }
}

/**
 * Wrap Bybit API calls with CloudFront detection
 */
export async function bybitFetchWithGuard(
  url: string,
  options: RequestInit,
  context: string = 'Unknown'
): Promise<Response> {
  console.log(`[CloudFront Guard] ${context} - Request to: ${url.substring(0, 100)}`);
  
  try {
    const response = await fetch(url, options);
    const text = await response.text();
    
    // Check for CloudFront block
    if (isCloudFrontBlock(response, text)) {
      console.error(`\n🚨 [CLOUDFRONT GUARD] DETECTED BLOCK in ${context}!`);
      console.error(`   Status: ${response.status}`);
      console.error(`   Server: ${response.headers.get('server')}`);
      console.error(`   Response preview: ${text.substring(0, 200)}`);
      
      // Get server info for SMS
      const serverInfo = {
        region: process.env.VERCEL_REGION || 'Unknown',
        context,
        status: response.status
      };
      
      // Trigger emergency shutdown (with smart lock)
      await triggerEmergencyShutdown(
        `CloudFront block detected in ${context}`,
        serverInfo
      );
      
      // Throw error to stop further processing
      throw new Error(`CLOUDFRONT_BLOCK: ${context}`);
    }
    
    // Return response with text already read
    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
    
  } catch (error: any) {
    // If it's our CloudFront block error, re-throw it
    if (error.message?.includes('CLOUDFRONT_BLOCK')) {
      throw error;
    }
    
    // For other network errors, check if it might be geo-blocking
    if (error.message?.includes('fetch') || error.message?.includes('network')) {
      console.warn(`[CloudFront Guard] Network error in ${context} - might be geo-block: ${error.message}`);
    }
    
    throw error;
  }
}