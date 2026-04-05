import type { BlacklistCategory } from '@prisma/client';
import type { RiskFlag } from '../address-check.types';
import { DANGEROUS_BLACKLIST_CATEGORIES } from './source-bucket-classifier';
import { isStrongWhitelistedExchange } from './whitelist';

/**
 * Whether an incoming counterparty should count as "risky" for taint % / risky volume.
 * Strong CEX whitelist and trusted rails override generic blacklist / graph suspicion.
 */
export function isAmlRiskyCounterparty(input: {
  address?: string;
  entity: string;
  flags: RiskFlag[];
  entityRiskWeight: number;
  isMetadataBlacklisted?: boolean;
  blacklistCategory?: string | null;
}): boolean {
  if (input.address && isStrongWhitelistedExchange(input.address)) {
    return false;
  }

  const et = input.entity;
  if (et === 'exchange' || et === 'payment_processor') {
    return false;
  }

  const cat = input.blacklistCategory as BlacklistCategory | undefined;
  if (cat === 'EXCHANGE') {
    return false;
  }

  const f = new Set(input.flags);
  if (f.has('scam') || f.has('phishing') || f.has('malicious')) {
    return true;
  }

  if (f.has('blacklisted') || input.isMetadataBlacklisted) {
    if (cat && DANGEROUS_BLACKLIST_CATEGORIES.has(cat)) {
      return true;
    }
    if (cat === 'SUSPICIOUS') {
      return true;
    }
    return true;
  }

  return input.entityRiskWeight >= 0.5;
}
