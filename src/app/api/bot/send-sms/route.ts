// ============================================
// 📱 SMS API ENDPOINT - SERVER-SIDE TWILIO
// ============================================
// ✅ This endpoint safely imports twilio on the server side
// ✅ Webpack won't bundle twilio because serverExternalPackages in next.config.ts
// ✅ Called by sms-service.ts client-side helper functions
// ✅ Updated: 2025-01-27 - Fixed Next.js route export conflict (moved sendSMSInternal to utility file)

import { NextRequest, NextResponse } from 'next/server';
import { sendSMSInternal, type SMSAlert } from '@/lib/sms-internal';

export async function POST(req: NextRequest) {
  try {
    const alert: SMSAlert = await req.json();
    const result = await sendSMSInternal(alert);
    
    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 500 });
    }
  } catch (error: any) {
    console.error('[SMS API] ❌ Endpoint error:', error.message);
    return NextResponse.json({
      success: false,
      error: error.message,
      attempt: 0,
    }, { status: 500 });
  }
}