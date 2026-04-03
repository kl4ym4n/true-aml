export interface AddressRecord {
  address: string;
  category: 'sanctions' | 'scam' | 'phishing' | 'suspicious';
  source: string;
  confidence: number; // 0..1
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function normalizeAddress(raw: string): string | null {
  const a = raw.trim();
  if (!a) return null;

  // TRON (base58, usually starts with T)
  if (a.startsWith('T')) {
    // Keep compatible with DB column (VarChar(42)) and typical TRON base58 length (34).
    if (a.length < 30 || a.length > 42) return null;
    return a;
  }

  // EVM (0x + 40 hex chars)
  if (/^0x[0-9a-fA-F]{40}$/.test(a)) {
    return a.toLowerCase();
  }

  return null;
}
