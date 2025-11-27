import { NextRequest, NextResponse } from 'next/server';
import { sendSMSInternal } from '@/lib/sms-internal';

export async function POST(request: NextRequest) {
  try {
    console.log('\n📱 Testing SMS alert functionality...');
    
    const result = await sendSMSInternal({
      phone: '', // Will be fetched from settings by sendSMSInternal
      message: '🧪 Test SMS: Trading bot alert system działa poprawnie!',
      alertLevel: 'info',
      context: 'test_sms',
    });

    if (result.success) {
      console.log(`✅ Test SMS sent successfully! Message ID: ${result.messageId}`);
      return NextResponse.json({
        success: true,
        message: 'SMS testowy wysłany pomyślnie',
        messageId: result.messageId,
        attempt: result.attempt,
      });
    } else {
      console.error(`❌ Test SMS failed: ${result.error}`);
      return NextResponse.json({
        success: false,
        error: result.error,
        attempt: result.attempt,
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Test SMS error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error',
    }, { status: 500 });
  }
}