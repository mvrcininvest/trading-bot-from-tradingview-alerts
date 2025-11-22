// ============================================
// ⏱️ RATE LIMITER MODULE
// ============================================
// Zapobiega przekroczeniu limitów Bybit API:
// - Public API: rate limits według Bybit docs
// - Private API: rate limits według Bybit docs
// - Implementuje exponential backoff

export class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private running = 0;
  private maxConcurrent: number;
  private minInterval: number; // ms między requestami
  private lastRequest = 0;

  constructor(maxConcurrent = 5, minIntervalMs = 100) {
    this.maxConcurrent = maxConcurrent;
    this.minInterval = minIntervalMs;
  }

  /**
   * Wykonaj funkcję z rate limiting
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          // Wait if needed
          const now = Date.now();
          const timeSinceLastRequest = now - this.lastRequest;
          if (timeSinceLastRequest < this.minInterval) {
            const waitTime = this.minInterval - timeSinceLastRequest;
            await this.sleep(waitTime);
          }

          this.lastRequest = Date.now();
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.running--;
          this.processQueue();
        }
      });

      this.processQueue();
    });
  }

  /**
   * Wykonaj wiele funkcji sekwencyjnie z rate limiting
   */
  async executeMany<T>(fns: Array<() => Promise<T>>): Promise<T[]> {
    const results: T[] = [];
    for (const fn of fns) {
      const result = await this.execute(fn);
      results.push(result);
    }
    return results;
  }

  /**
   * Przetwarza kolejkę
   */
  private processQueue() {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const fn = this.queue.shift();
      if (fn) {
        this.running++;
        fn();
      }
    }
  }

  /**
   * Helper: Sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Zwraca status kolejki
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      running: this.running,
      maxConcurrent: this.maxConcurrent,
    };
  }
}

/**
 * Singleton instance dla Bybit API
 */
export const bybitRateLimiter = new RateLimiter(5, 100); // 5 concurrent, 100ms interval

// Legacy export for backwards compatibility
export const okxRateLimiter = bybitRateLimiter;