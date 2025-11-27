// ============================================
// 📱 SMS SERVICE - HELPER FUNCTIONS
// ============================================
// ✅ Updated: 2025-01-27 - Use sendSMSInternal directly for server-side calls
// ✅ This file provides wrapper functions that work in both client and server contexts

import { sendSMSInternal } from '@/lib/sms-internal';

export interface SMSAlert {
  phone: string; // E.164 format: +48123456789
  message: string;
  alertLevel: 'critical' | 'warning' | 'info';
  context: string;
}

export interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
  attempt: number;
}

/**
 * Send SMS - works in both server-side and client-side contexts
 * Server-side: calls sendSMSInternal directly
 * Client-side: calls API endpoint via fetch
 */
export async function sendSMS(alert: SMSAlert): Promise<SMSResult> {
  // Check if we're in server-side context (API routes, server components)
  if (typeof window === 'undefined') {
    // ✅ SERVER-SIDE: Call sendSMSInternal directly (no fetch needed)
    console.log('[SMS] Server-side: calling sendSMSInternal directly');
    return await sendSMSInternal(alert);
  }
  
  // ✅ CLIENT-SIDE: Use fetch to call API endpoint
  try {
    console.log('[SMS] Client-side: calling API endpoint');
    const response = await fetch('/api/bot/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alert)
    });

    const result = await response.json();

    if (response.ok && result.success) {
      console.log('[SMS] ✅ SMS sent successfully via API');
      return result;
    } else {
      console.error('[SMS] ❌ SMS API call failed:', result.error);
      return {
        success: false,
        error: result.error || 'API call failed',
        attempt: result.attempt || 0
      };
    }
  } catch (error: any) {
    console.error('[SMS] ❌ Failed to call SMS API:', error.message);
    return {
      success: false,
      error: error.message,
      attempt: 0
    };
  }
}

/**
 * Send critical alert for CloudFront block
 */
export async function sendCloudFrontBlockAlert(serverInfo: {
  ip?: string;
  region?: string;
  city?: string;
}) {
  const message = `🚨 CRITICAL: Bot disabled! CloudFront blocks region: ${serverInfo.region || 'Unknown'}. All positions closed. Check dashboard.`;
  
  return await sendSMS({
    phone: '', // Will be fetched from settings by sendSMSInternal
    message,
    alertLevel: 'critical',
    context: 'cloudfront_block',
  });
}

/**
 * Send alert when emergency position close fails
 */
export async function sendEmergencyCloseFailureAlert(failedPositions: number, totalPositions: number) {
  const message = `⚠️ ALERT: Emergency close failed for ${failedPositions}/${totalPositions} positions! Manual intervention needed. Check bot logs.`;
  
  return await sendSMS({
    phone: '', // Will be fetched from settings by sendSMSInternal
    message,
    alertLevel: 'critical',
    context: 'emergency_close_failure',
  });
}