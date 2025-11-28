import { NextRequest, NextResponse } from "next/server";
import crypto from 'crypto';

interface TestConnectionRequest {
  exchange: "bybit";
  apiKey: string;
  apiSecret: string;
}

// ✅ DIRECT BYBIT CONNECTION FOR TESTING (BYPASSES CLOUDFRONT GUARD)
const BYBIT_API_BASE = 'https://api.bybit.com';

// ============================================
// 🔐 BYBIT SIGNATURE HELPER
// ============================================
async function createBybitSignature(
  timestamp: string,
  apiKey: string,
  apiSecret: string,
  recvWindow: string,
  params: string
): Promise<string> {
  const message = timestamp + apiKey + recvWindow + params;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}

// ============================================
// 🔐 BYBIT API TEST (DIRECT - NO CLOUDFRONT GUARD)
// ============================================

async function testBybitConnection(apiKey: string, apiSecret: string) {
  console.log('\n🧪 [TEST CONNECTION] Direct test WITHOUT CloudFront Guard');
  console.log('   This is a diagnostic test - bypassing normal lock checks');
  
  try {
    // Try UNIFIED account first
    let lastError: any = null;
    
    for (const accountType of ['UNIFIED', 'CONTRACT']) {
      try {
        console.log(`\n   🔄 Testing accountType: ${accountType}...`);
        
        const timestamp = Date.now().toString();
        const recvWindow = '5000';
        const params = `accountType=${accountType}`;
        
        const signature = await createBybitSignature(timestamp, apiKey, apiSecret, recvWindow, params);
        
        const headers: Record<string, string> = {
          "X-BAPI-API-KEY": apiKey,
          "X-BAPI-SIGN": signature,
          "X-BAPI-TIMESTAMP": timestamp,
          "X-BAPI-SIGN-TYPE": "2",
          "X-BAPI-RECV-WINDOW": recvWindow,
          "Content-Type": "application/json",
        };
        
        // DIRECT FETCH - NO GUARD
        const response = await fetch(`${BYBIT_API_BASE}/v5/account/wallet-balance?${params}`, {
          method: "GET",
          headers,
        });

        const text = await response.text();
        console.log(`   Response status: ${response.status}`);
        console.log(`   Response preview: ${text.substring(0, 200)}`);
        
        // Check for CloudFront block
        if (text.includes('<!DOCTYPE html>') || text.includes('<html') || response.status === 403) {
          console.error(`   🚨 CLOUDFRONT BLOCK DETECTED on ${accountType}!`);
          throw new Error('CloudFront 403 block detected - server IP/region is blocked by Bybit');
        }

        const data = JSON.parse(text);

        if (data.retCode !== 0) {
          throw new Error(`Bybit API error (${data.retCode}): ${data.retMsg}`);
        }

        // Parse balances
        const balances: Array<{ asset: string; free: string; locked: string }> = [];

        if (data.result?.list?.[0]?.coin) {
          data.result.list[0].coin.forEach((coin: any) => {
            const walletBalance = parseFloat(coin.walletBalance || '0');
            const availableToWithdraw = parseFloat(coin.availableToWithdraw || '0');
            const locked = parseFloat(coin.locked || '0');

            if (walletBalance > 0 || locked > 0) {
              balances.push({
                asset: coin.coin,
                free: availableToWithdraw.toFixed(8),
                locked: locked.toFixed(8),
              });
            }
          });
        }

        console.log(`   ✅ ${accountType} account - Success! Found ${balances.length} coins`);

        return {
          success: true,
          message: `✅ Połączenie z Bybit Mainnet udane!\n\n🎉 CloudFront NIE BLOKUJE tego serwera!\n\nTyp konta: ${accountType}\nMożesz bezpiecznie używać bota.`,
          accountInfo: {
            canTrade: true,
            accountType,
            balances: balances.filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0),
          },
        };
      } catch (error: any) {
        console.error(`   ❌ ${accountType} failed: ${error.message}`);
        lastError = error;
      }
    }
    
    // Both failed
    throw lastError;
  } catch (error: any) {
    console.error(`\n   ❌ TEST FAILED: ${error.message}`);
    
    // Determine error type
    if (error.message.includes('CloudFront') || error.message.includes('403')) {
      return {
        success: false,
        message: `🚨 CLOUDFRONT BLOCK WYKRYTY!\n\nSerwer Render (${process.env.RENDER_REGION || 'Frankfurt'}) jest BLOKOWANY przez Bybit CloudFront.\n\n❌ Bot NIE MOŻE działać z tego serwera.\n\n💡 Rozwiązania:\n1. Zmień region na Render (Oregon, Singapore)\n2. Użyj VPS w dozwolonym regionie\n3. Użyj proxy/VPN`,
      };
    }
    
    return {
      success: false,
      message: `Bybit API Error: ${error.message}`,
    };
  }
}

// ============================================
// 📨 POST ENDPOINT
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body: TestConnectionRequest = await request.json();
    const { exchange, apiKey, apiSecret } = body;

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { success: false, message: "API Key i Secret są wymagane" },
        { status: 400 }
      );
    }

    if (exchange !== "bybit") {
      return NextResponse.json(
        { success: false, message: "Only Bybit mainnet is supported." },
        { status: 400 }
      );
    }

    const result = await testBybitConnection(apiKey, apiSecret);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: `Błąd serwera: ${error instanceof Error ? error.message : "Nieznany błąd"}`,
      },
      { status: 500 }
    );
  }
}