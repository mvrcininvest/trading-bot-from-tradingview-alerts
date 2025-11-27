import { NextRequest, NextResponse } from 'next/server';
import { sendCloudFrontBlockAlert } from '@/lib/sms-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { serverInfo } = body;

    console.log(`📱 [SMS API] Sending CloudFront block alert...`);
    console.log(`   Server Info:`, serverInfo);

    const result = await sendCloudFrontBlockAlert(serverInfo);

    if (result.success) {
      console.log(`✅ [SMS API] Alert sent - Message ID: ${result.messageId}`);
      return NextResponse.json({
        success: true,
        messageId: result.messageId
      });
    } else {
      console.error(`❌ [SMS API] Failed to send alert: ${result.error}`);
      return NextResponse.json({
        success: false,
        error: result.error
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error(`❌ [SMS API] Exception:`, error.message);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
