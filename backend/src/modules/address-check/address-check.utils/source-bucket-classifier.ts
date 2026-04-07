import type { BlacklistCategory } from '@prisma/client';
import type { RiskFlag } from '../address-check.types';
import {
  isDangerousSourceSemantics,
  resolveTrustedSourceSemantics,
  DANGEROUS_BLACKLIST_CATEGORIES,
} from './trusted-source-semantics';

export { DANGEROUS_BLACKLIST_CATEGORIES };

/**
 * Volume-weighted SoF bucket. Dangerous evidence wins; then SUSPICIOUS DB; then trusted semantics.
 */
export function classifySourceBucket(input: {
  address: string;
  entity: string;
  flags: RiskFlag[];
  blacklistCategory?: string | null;
  exchangeLikeFallback?: boolean;
  graphLinkedToWhitelistedExchange?: boolean;
  candidateSignalExchangeInfra?: boolean;
  securityTags?: string[] | null;
}): 'trusted' | 'suspicious' | 'dangerous' {
  if (isDangerousSourceSemantics(input)) {
    return 'dangerous';
  }

  const cat = input.blacklistCategory as BlacklistCategory | undefined;
  if (cat === 'SUSPICIOUS') {
    return 'suspicious';
  }

  const semantics = resolveTrustedSourceSemantics(input);
  if (semantics.isTrusted) {
    return 'trusted';
  }

  return 'suspicious';
}
