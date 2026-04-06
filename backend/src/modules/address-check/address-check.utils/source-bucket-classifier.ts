import type { BlacklistCategory } from '@prisma/client';
import type { RiskFlag } from '../address-check.types';
import { isStrongWhitelistedExchange } from './whitelist';

/** DB categories treated as dangerous for source-of-funds (not SUSPICIOUS / EXCHANGE). */
export const DANGEROUS_BLACKLIST_CATEGORIES = new Set<BlacklistCategory>([
  'SANCTION',
  'STOLEN_FUNDS',
  'RANSOM',
  'DARK_MARKET',
  'SCAM',
  'PHISHING',
  'MIXER',
]);

/**
 * Single priority chain for volume-weighted source buckets.
 * 1) Dangerous direct evidence (flags, categories, high-risk entities)
 * 2) Strong CEX whitelist → trusted
 * 3) Entity exchange / payment_processor → trusted
 * 4) DB category EXCHANGE → trusted
 * 5) SoF-only exchange-like fallback (see {@link isExchangeLikeCounterparty})
 * 6) Else → suspicious
 */
export function classifySourceBucket(input: {
  address: string;
  entity: string;
  flags: RiskFlag[];
  blacklistCategory?: string | null;
  /** Set upstream when heuristics indicate CEX-like rails without explicit label. */
  exchangeLikeFallback?: boolean;
}): 'trusted' | 'suspicious' | 'dangerous' {
  const f = new Set(input.flags);
  const cat = input.blacklistCategory as BlacklistCategory | undefined;

  if (f.has('scam') || f.has('phishing') || f.has('malicious')) {
    return 'dangerous';
  }

  if (cat && DANGEROUS_BLACKLIST_CATEGORIES.has(cat)) {
    return 'dangerous';
  }

  const e = input.entity;
  if (
    e === 'sanctions' ||
    e === 'mixer' ||
    e === 'darknet' ||
    e === 'scam' ||
    e === 'phishing' ||
    e === 'gambling'
  ) {
    return 'dangerous';
  }

  if (f.has('blacklisted')) {
    if (cat && DANGEROUS_BLACKLIST_CATEGORIES.has(cat)) {
      return 'dangerous';
    }
    if (cat === 'SUSPICIOUS') {
      return 'suspicious';
    }
    return 'suspicious';
  }

  if (cat === 'SUSPICIOUS') {
    return 'suspicious';
  }

  if (isStrongWhitelistedExchange(input.address)) {
    return 'trusted';
  }
  if (e === 'exchange' || e === 'payment_processor') {
    return 'trusted';
  }
  if (cat === 'EXCHANGE') {
    return 'trusted';
  }
  if (input.exchangeLikeFallback) {
    return 'trusted';
  }

  return 'suspicious';
}
