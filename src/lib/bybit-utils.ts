import crypto from "crypto";

/**
 * Podpisuje request do Bybit API używając HMAC SHA256
 * @param apiKey - Klucz API Bybit
 * @param apiSecret - Sekret API Bybit
 * @param timestamp - Timestamp w milisekundach
 * @param params - Parametry zapytania jako obiekt
 * @returns Signature hex string
 */
export async function signBybitRequest(
  apiKey: string,
  apiSecret: string,
  timestamp: number,
  params: Record<string, any>
): Promise<string> {
  const recvWindow = "5000";
  
  // Sortuj parametry alfabetycznie i stwórz query string
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  
  // Stwórz payload do podpisania
  const payload = `${timestamp}${apiKey}${recvWindow}${sortedParams}`;
  
  // Wygeneruj HMAC SHA256 signature
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(payload)
    .digest("hex");
  
  return signature;
}
