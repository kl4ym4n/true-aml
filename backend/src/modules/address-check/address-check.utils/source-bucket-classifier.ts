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
 * 1) Strong CEX whitelist → trusted
 * 2) Entity exchange / payment_processor → trusted
 * 3) DB category EXCHANGE → trusted
 * 4) Dangerous flags / categories / high-risk entities → dangerous
 * 5) Else → suspicious (not “everything suspicious by default” after trust checks)
 */
export function classifySourceBucket(input: {
  address: string;
  entity: string;
  flags: RiskFlag[];
  blacklistCategory?: string | null;
}): 'trusted' | 'suspicious' | 'dangerous' {
  if (isStrongWhitelistedExchange(input.address)) {
    return 'trusted';
  }
  if (
    input.entity === 'exchange' ||
    input.entity === 'payment_processor'
  ) {
    return 'trusted';
  }

  const cat = input.blacklistCategory as BlacklistCategory | undefined;
  if (cat === 'EXCHANGE') {
    return 'trusted';
  }

  const f = new Set(input.flags);
  if (f.has('scam') || f.has('phishing')) {
    return 'dangerous';
  }
  if (f.has('malicious')) {
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

  if (cat && DANGEROUS_BLACKLIST_CATEGORIES.has(cat)) {
    return 'dangerous';
  }
  if (cat === 'SUSPICIOUS') {
    return 'suspicious';
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

  return 'suspicious';
}
