// ============================================
// 🔍 ERROR CLASSIFICATION MODULE
// ============================================
// Klasyfikuje błędy na:
// - api_temporary: Przejściowe błędy API (retry możliwy)
// - trade_fault: Błędy biznesowe (permanent lock)
// - unknown: Nieznane błędy

export type ErrorType = 'api_temporary' | 'trade_fault' | 'unknown';

export interface ClassifiedError {
  type: ErrorType;
  originalCode?: string;
  originalMessage: string;
  isPermanent: boolean;
  shouldRetry: boolean;
  retryAfterMs?: number;
}

/**
 * Klasyfikuje błąd OKX API
 */
export function classifyOkxError(errorCode: string, errorMessage: string): ClassifiedError {
  const msgLower = errorMessage.toLowerCase();
  
  // ============================================
  // API TEMPORARY - Błędy przejściowe
  // ============================================
  const apiTemporaryKeywords = [
    'rate limit',
    'too many requests',
    'timeout',
    'timed out',
    '503',
    '502',
    '504',
    'service unavailable',
    'connection',
    'temporary',
    'try again',
    'retry',
    'network',
    'unavailable',
  ];
  
  if (apiTemporaryKeywords.some(keyword => msgLower.includes(keyword))) {
    return {
      type: 'api_temporary',
      originalCode: errorCode,
      originalMessage: errorMessage,
      isPermanent: false,
      shouldRetry: true,
      retryAfterMs: 2000, // 2 seconds
    };
  }
  
  // ============================================
  // TRADE FAULT - Błędy biznesowe (permanent)
  // ============================================
  const tradeFaultKeywords = [
    'instrument not found',
    'insufficient balance',
    'insufficient funds',
    'invalid price',
    'already closed',
    'position not found',
    'would trigger immediately',
    'order size',
    'minimum',
    'maximum',
    'invalid parameter',
    'not supported',
    'margin insufficient',
    'leverage',
    'position side',
    'order already',
  ];
  
  if (tradeFaultKeywords.some(keyword => msgLower.includes(keyword))) {
    return {
      type: 'trade_fault',
      originalCode: errorCode,
      originalMessage: errorMessage,
      isPermanent: true,
      shouldRetry: false,
    };
  }
  
  // ============================================
  // UNKNOWN - Nieznane błędy (defensive retry)
  // ============================================
  return {
    type: 'unknown',
    originalCode: errorCode,
    originalMessage: errorMessage,
    isPermanent: false,
    shouldRetry: true,
    retryAfterMs: 3000, // 3 seconds for unknown errors
  };
}

/**
 * Helper: Sprawdza czy błąd wymaga permanent lock
 */
export function requiresPermanentLock(errorType: ErrorType): boolean {
  return errorType === 'trade_fault';
}

/**
 * Helper: Sprawdza czy można retry
 */
export function canRetry(errorType: ErrorType): boolean {
  return errorType === 'api_temporary' || errorType === 'unknown';
}

// ✅ Export alias for compatibility with webhook
export const classifyError = classifyOkxError;