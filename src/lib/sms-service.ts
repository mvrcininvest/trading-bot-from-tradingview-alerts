// ============================================
// 📱 SMS SERVICE - API CLIENT (NO TWILIO IMPORTS)
// ============================================
// ✅ This file NO LONGER imports twilio directly
// ✅ All SMS logic moved to /api/bot/send-sms endpoint
// ✅ This file only provides helper functions to call the API

import { db } from '@/db';
import { botSettings } from '@/db/schema';

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
 * Validate E.164 phone number format
 */
export function validateE164Format(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone);
}

/**
 * Normalize phone number to E.164 format
 */
export function normalizePhoneNumber(phone: string, countryCode = '48'): string {
  let normalized = phone.replace(/\D/g, '');
  
  if (!normalized.startsWith(countryCode) && normalized.length >= 9) {
    if (normalized.startsWith('0')) {
      normalized = normalized.substring(1);
    }
    normalized = countryCode + normalized;
  }
  
  return '+' + normalized;
}

/**
 * Send SMS by calling the API endpoint (NO DIRECT TWILIO IMPORT)
 */
export async function sendSMS(alert: SMSAlert): Promise<SMSResult> {
  try {
    console.log(`[SMS] Calling API endpoint to send SMS...`);
    
    const response = await fetch('/api/bot/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alert)
    });

    const result = await response.json();

    if (response.ok && result.success) {
      console.log(`[SMS] ✅ SMS sent successfully via API`);
      return result;
    } else {
      console.error(`[SMS] ❌ SMS API call failed:`, result.error);
      return {
        success: false,
        error: result.error || 'API call failed',
        attempt: result.attempt || 0
      };
    }
  } catch (error: any) {
    console.error(`[SMS] ❌ Failed to call SMS API:`, error.message);
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
    phone: '', // Will be fetched from settings by API
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
    phone: '', // Will be fetched from settings by API
    message,
    alertLevel: 'critical',
    context: 'emergency_close_failure',
  });
}