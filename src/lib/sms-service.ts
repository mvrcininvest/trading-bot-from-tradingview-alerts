import { db } from '@/db';
import { botSettings, botLogs } from '@/db/schema';
import { eq } from 'drizzle-orm';

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
 * Converts Polish numbers: 123456789 -> +48123456789
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
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoffDelay(attempt: number, baseDelayMs = 500, maxDelayMs = 30000): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 0.1 * baseDelayMs;
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: string): boolean {
  const retryablePatterns = [
    'timeout',
    'ECONNREFUSED',
    'ETIMEDOUT',
    '429', // Rate limit
    '503', // Service unavailable
    '502', // Bad gateway
    'connection reset',
    'network unreachable',
    'temporarily unavailable',
  ];
  return retryablePatterns.some((pattern) =>
    error.toLowerCase().includes(pattern)
  );
}

/**
 * Lazy load Twilio client to avoid webpack bundling issues
 */
function getTwilioClient(accountSid: string, authToken: string) {
  const twilio = require('twilio');
  return twilio(accountSid, authToken);
}

/**
 * Send SMS with retry logic (up to 5 attempts with exponential backoff)
 */
export async function sendSMS(alert: SMSAlert): Promise<SMSResult> {
  const maxAttempts = 5;
  const timeoutMs = 10000; // 10 seconds per attempt
  
  // Fetch SMS settings from database
  const settings = await db.select().from(botSettings).limit(1);
  
  if (!settings || settings.length === 0) {
    console.error('[SMS] No bot settings found');
    return {
      success: false,
      error: 'No bot settings configured',
      attempt: 0,
    };
  }
  
  const config = settings[0];
  
  // Check if SMS alerts are enabled
  if (!config.smsAlertsEnabled) {
    console.log('[SMS] SMS alerts disabled in settings');
    return {
      success: false,
      error: 'SMS alerts disabled',
      attempt: 0,
    };
  }
  
  // Validate configuration
  if (!config.twilioAccountSid || !config.twilioAuthToken || !config.twilioPhoneNumber) {
    console.error('[SMS] Twilio credentials not configured');
    return {
      success: false,
      error: 'Twilio credentials not configured',
      attempt: 0,
    };
  }
  
  if (!config.alertPhoneNumber) {
    console.error('[SMS] Alert phone number not configured');
    return {
      success: false,
      error: 'Alert phone number not configured',
      attempt: 0,
    };
  }
  
  // Normalize and validate phone number
  const normalizedPhone = normalizePhoneNumber(config.alertPhoneNumber);
  if (!validateE164Format(normalizedPhone)) {
    console.error('[SMS] Invalid phone format:', config.alertPhoneNumber);
    return {
      success: false,
      error: `Invalid phone format: ${config.alertPhoneNumber}`,
      attempt: 0,
    };
  }
  
  // Validate message length (SMS limit: 160 characters)
  if (alert.message.length > 160) {
    console.warn('[SMS] Message too long, truncating to 160 chars');
    alert.message = alert.message.substring(0, 157) + '...';
  }
  
  // ✅ FIX: Lazy load Twilio client here instead of top-level
  const client = getTwilioClient(config.twilioAccountSid, config.twilioAuthToken);
  
  // Retry loop with exponential backoff
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      console.log(`[SMS] Sending SMS (attempt ${attempt + 1}/${maxAttempts})...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      const message = await Promise.race([
        client.messages.create({
          body: alert.message,
          from: config.twilioPhoneNumber,
          to: normalizedPhone,
        }),
        new Promise<never>((_, reject) =>
          controller.signal.addEventListener('abort', () =>
            reject(new Error('SMS send timeout'))
          )
        ),
      ]).finally(() => clearTimeout(timeoutId));
      
      console.log(`[SMS] ✅ SMS sent successfully! Message ID: ${message.sid}`);
      
      // Log to bot logs
      await db.insert(botLogs).values({
        timestamp: Date.now(),
        level: 'info',
        action: 'sms_sent',
        message: `SMS alert sent: ${alert.context}`,
        details: JSON.stringify({
          messageId: message.sid,
          phone: normalizedPhone,
          alertLevel: alert.alertLevel,
          attempt: attempt + 1,
        }),
        createdAt: Date.now(),
      });
      
      return {
        success: true,
        messageId: message.sid,
        attempt: attempt + 1,
      };
      
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      console.error(`[SMS] Attempt ${attempt + 1} failed:`, errorMsg);
      
      // Check if error is retryable
      if (!isRetryableError(errorMsg)) {
        // Non-retryable error - fail immediately
        await db.insert(botLogs).values({
          timestamp: Date.now(),
          level: 'error',
          action: 'sms_failed',
          message: `SMS alert failed (non-retryable): ${alert.context}`,
          details: JSON.stringify({
            error: errorMsg,
            phone: normalizedPhone,
            alertLevel: alert.alertLevel,
            attempt: attempt + 1,
          }),
          createdAt: Date.now(),
        });
        
        return {
          success: false,
          error: errorMsg,
          attempt: attempt + 1,
        };
      }
      
      // Retryable error - wait before retry (except on last attempt)
      if (attempt < maxAttempts - 1) {
        const backoffDelay = calculateBackoffDelay(attempt);
        console.log(`[SMS] Retrying in ${backoffDelay.toFixed(0)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }
    }
  }
  
  // All attempts failed
  console.error('[SMS] ❌ All retry attempts exhausted');
  
  await db.insert(botLogs).values({
    timestamp: Date.now(),
    level: 'error',
    action: 'sms_failed',
    message: `SMS alert failed after ${maxAttempts} attempts: ${alert.context}`,
    details: JSON.stringify({
      phone: normalizedPhone,
      alertLevel: alert.alertLevel,
      attempts: maxAttempts,
    }),
    createdAt: Date.now(),
  });
  
  return {
    success: false,
    error: 'Max retry attempts exceeded',
    attempt: maxAttempts,
  };
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
    phone: '', // Will be fetched from settings
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
    phone: '', // Will be fetched from settings
    message,
    alertLevel: 'critical',
    context: 'emergency_close_failure',
  });
}