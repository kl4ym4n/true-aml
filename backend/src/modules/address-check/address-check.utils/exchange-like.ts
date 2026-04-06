import type { BlacklistCategory } from '@prisma/client';
import type { RiskFlag } from '../address-check.types';
import { DANGEROUS_BLACKLIST_CATEGORIES } from './source-bucket-classifier';

/**
 * Conservative SoF-only signal: many counterparties, diffuse incoming, no hard-risk evidence.
 * Does not replace whitelist / DB EXCHANGE; fills gaps when heuristics still yield `unknown`.
 */
export function isExchangeLikeCounterparty(input: {
  flags: RiskFlag[];
  blacklistCategory?: string | null;
  isMetadataBlacklisted?: boolean;
  txCount: number;
  uniqueCounterpartyCount: number;
  maxIncomingSenderShare: number;
  /** Share of root wallet's analyzed stablecoin inflow from this address (0..1). */
  rootIncomingShare: number;
  entity: string;
}): boolean {
  const f = new Set(input.flags);
  if (f.has('scam') || f.has('phishing') || f.has('malicious')) {
    return false;
  }

  const cat = input.blacklistCategory as BlacklistCategory | undefined;
  if (cat && DANGEROUS_BLACKLIST_CATEGORIES.has(cat)) {
    return false;
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
    return false;
  }

  if (f.has('blacklisted') || input.isMetadataBlacklisted) {
    if (cat && DANGEROUS_BLACKLIST_CATEGORIES.has(cat)) {
      return false;
    }
    if (cat === 'SUSPICIOUS') {
      return false;
    }
    if (cat === 'EXCHANGE') {
      return false;
    }
    return false;
  }

  if (e === 'exchange' || e === 'payment_processor') {
    return false;
  }

  if (input.txCount < 45) {
    return false;
  }
  if (input.maxIncomingSenderShare >= 0.22) {
    return false;
  }
  if (input.uniqueCounterpartyCount < 12) {
    return false;
  }

  if (input.rootIncomingShare < 0.02 && input.txCount < 90) {
    return false;
  }

  return true;
}
