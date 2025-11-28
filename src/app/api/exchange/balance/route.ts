import { NextRequest, NextResponse } from 'next/server';
import { getWalletBalance } from '@/lib/bybit-client';

/**
 * GET /api/exchange/balance
 * Pobiera saldo z giełdy Bybit
 */
export async function GET(request: NextRequest) {
  try {
    const apiKey = request.nextUrl.searchParams.get('apiKey');
    const apiSecret = request.nextUrl.searchParams.get('apiSecret');

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        {
          success: false,
          message: 'Missing API credentials',
        },
        { status: 400 }
      );
    }

    console.log('\n💰 [Balance API] Fetching wallet balance from Bybit...');
    console.log(`   API Key: ${apiKey.substring(0, 8)}...`);

    const result = await getWalletBalance(apiKey, apiSecret);

    console.log('   ✅ Balance fetched successfully');

    // Extract USDT balance from Unified account
    const account = result.list?.[0];
    
    if (!account) {
      return NextResponse.json({
        success: false,
        message: 'No account data found',
      });
    }

    // Find USDT coin
    const usdtCoin = account.coin?.find((c: any) => c.coin === 'USDT');

    if (!usdtCoin) {
      return NextResponse.json({
        success: true,
        balances: [],
        totalUSDT: 0,
      });
    }

    const totalBalance = parseFloat(usdtCoin.walletBalance || '0');
    const availableBalance = parseFloat(usdtCoin.availableToWithdraw || '0');
    const lockedBalance = totalBalance - availableBalance;

    console.log(`   💵 Total: ${totalBalance.toFixed(2)} USDT`);
    console.log(`   ✅ Available: ${availableBalance.toFixed(2)} USDT`);
    console.log(`   🔒 Locked: ${lockedBalance.toFixed(2)} USDT\n`);

    return NextResponse.json({
      success: true,
      balances: [
        {
          asset: 'USDT',
          free: availableBalance.toFixed(2),
          locked: lockedBalance.toFixed(2),
          total: totalBalance.toFixed(2),
        },
      ],
      totalUSDT: totalBalance,
    });
  } catch (error: any) {
    console.error('❌ [Balance API] Error:', error.message);
    
    return NextResponse.json(
      {
        success: false,
        message: error.message || 'Failed to fetch balance',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/exchange/balance
 * Pobiera saldo z giełdy Bybit (z body)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey, apiSecret } = body;

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        {
          success: false,
          message: 'Missing API credentials',
        },
        { status: 400 }
      );
    }

    console.log('\n💰 [Balance API POST] Fetching wallet balance from Bybit...');
    console.log(`   API Key: ${apiKey.substring(0, 8)}...`);

    const result = await getWalletBalance(apiKey, apiSecret);

    console.log('   ✅ Balance fetched successfully');

    // Extract USDT balance from Unified account
    const account = result.list?.[0];
    
    if (!account) {
      return NextResponse.json({
        success: false,
        message: 'No account data found',
      });
    }

    // Find USDT coin
    const usdtCoin = account.coin?.find((c: any) => c.coin === 'USDT');

    if (!usdtCoin) {
      return NextResponse.json({
        success: true,
        balances: [],
        totalUSDT: 0,
      });
    }

    const totalBalance = parseFloat(usdtCoin.walletBalance || '0');
    const availableBalance = parseFloat(usdtCoin.availableToWithdraw || '0');
    const lockedBalance = totalBalance - availableBalance;

    console.log(`   💵 Total: ${totalBalance.toFixed(2)} USDT`);
    console.log(`   ✅ Available: ${availableBalance.toFixed(2)} USDT`);
    console.log(`   🔒 Locked: ${lockedBalance.toFixed(2)} USDT\n`);

    return NextResponse.json({
      success: true,
      balances: [
        {
          asset: 'USDT',
          free: availableBalance.toFixed(2),
          locked: lockedBalance.toFixed(2),
          total: totalBalance.toFixed(2),
        },
      ],
      totalUSDT: totalBalance,
    });
  } catch (error: any) {
    console.error('❌ [Balance API POST] Error:', error.message);
    
    return NextResponse.json(
      {
        success: false,
        message: error.message || 'Failed to fetch balance',
      },
      { status: 500 }
    );
  }
}
