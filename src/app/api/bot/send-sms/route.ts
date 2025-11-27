// ============================================
// 📱 SMS API ENDPOINT - SERVER-SIDE TWILIO
// ============================================
// ✅ This endpoint safely imports twilio on the server side
// ✅ Webpack won't bundle twilio because serverExternalPackages in next.config.ts
// ✅ Called by sms-service.ts client-side helper functions
// ✅ Updated: 2025-01-27 - Fixed ESM import issue (direct import instead of Function constructor)

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { botSettings, botLogs } from '@/db/schema';
import Twilio from 'twilio';

interface SMSAlert {
  phone: string;
  message: string;
  alertLevel: 'critical' | 'warning' | 'info';
  context: string;
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
    '429',
    '503',
    '502',
    'connection reset',
    'network unreachable',
    'temporarily unavailable',
  ];
  return retryablePatterns.some((pattern) =>
    error.toLowerCase().includes(pattern)
  );
}

/**
 * Validate E.164 phone number format
 */
function validateE164Format(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone);
}

/**
 * Normalize phone number to E.164 format
 */
function normalizePhoneNumber(phone: string, countryCode = '48'): string {
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
 * ✅ EXPORTED: Internal SMS sending function (can be used by other API routes)
 * This avoids fetch() calls between API routes
 */
export async function sendSMSInternal(alert: SMSAlert): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
  attempt: number;
}> {
  const maxAttempts = 5;
  const timeoutMs = 10000;
  
  // Fetch SMS settings from database
  const settings = await db.select().from(botSettings).limit(1);
  
  if (!settings || settings.length === 0) {
    console.error('[SMS API] No bot settings found');
    return {
      success: false,
      error: 'No bot settings configured',
      attempt: 0,
    };
  }
  
  const config = settings[0];
  
  // Check if SMS alerts are enabled
  if (!config.smsAlertsEnabled) {
    console.log('[SMS API] SMS alerts disabled in settings');
    return {
      success: false,
      error: 'SMS alerts disabled',
      attempt: 0,
    };
  }
  
  // Validate configuration
  if (!config.twilioAccountSid || !config.twilioAuthToken || !config.twilioPhoneNumber) {
    console.error('[SMS API] Twilio credentials not configured');
    return {
      success: false,
      error: 'Twilio credentials not configured',
      attempt: 0,
    };
  }
  
  if (!config.alertPhoneNumber) {
    console.error('[SMS API] Alert phone number not configured');
    return {
      success: false,
      error: 'Alert phone number not configured',
      attempt: 0,
    };
  }
  
  // Normalize and validate phone number
  const normalizedPhone = normalizePhoneNumber(config.alertPhoneNumber);
  if (!validateE164Format(normalizedPhone)) {
    console.error('[SMS API] Invalid phone format:', config.alertPhoneNumber);
    return {
      success: false,
      error: `Invalid phone format: ${config.alertPhoneNumber}`,
      attempt: 0,
    };
  }
  
  // Validate message length (SMS limit: 160 characters)
  let message = alert.message;
  if (message.length > 160) {
    console.warn('[SMS API] Message too long, truncating to 160 chars');
    message = message.substring(0, 157) + '...';
  }
  
  // ✅ SAFE: Direct import works because serverExternalPackages: ['twilio'] in next.config.ts
  const client = Twilio(config.twilioAccountSid, config.twilioAuthToken);
  
  // Retry loop with exponential backoff
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      console.log(`[SMS API] Sending SMS (attempt ${attempt + 1}/${maxAttempts})...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      const twilioMessage = await Promise.race([
        client.messages.create({
          body: message,
          from: config.twilioPhoneNumber,
          to: normalizedPhone,
        }),
        new Promise<never>((_, reject) =>
          controller.signal.addEventListener('abort', () =>
            reject(new Error('SMS send timeout'))
          )
        ),
      ]).finally(() => clearTimeout(timeoutId));
      
      console.log(`[SMS API] ✅ SMS sent successfully! Message ID: ${twilioMessage.sid}`);
      
      // Log to bot logs
      await db.insert(botLogs).values({
        timestamp: Date.now(),
        level: 'info',
        action: 'sms_sent',
        message: `SMS alert sent: ${alert.context}`,
        details: JSON.stringify({
          messageId: twilioMessage.sid,
          phone: normalizedPhone,
          alertLevel: alert.alertLevel,
          attempt: attempt + 1,
        }),
        createdAt: Date.now(),
      });
      
      return {
        success: true,
        messageId: twilioMessage.sid,
        attempt: attempt + 1,
      };
      
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      console.error(`[SMS API] Attempt ${attempt + 1} failed:`, errorMsg);
      
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
        console.log(`[SMS API] Retrying in ${backoffDelay.toFixed(0)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }
    }
  }
  
  // All attempts failed
  console.error('[SMS API] ❌ All retry attempts exhausted');
  
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