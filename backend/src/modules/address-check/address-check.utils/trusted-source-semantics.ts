import type { BlacklistCategory } from '@prisma/client';
import type { RiskFlag } from '../address-check.types';
import { isStrongWhitelistedExchange } from './whitelist';

/** DB categories treated as dangerous for source-of-funds. */
export const DANGEROUS_BLACKLIST_CATEGORIES = new Set<BlacklistCategory>([
  'SANCTION',
  'STOLEN_FUNDS',
  'RANSOM',
  'DARK_MARKET',
  'SCAM',
  'PHISHING',
  'MIXER',
]);

export type TrustedSourceReason =
  | 'strong_whitelist'
  | 'exchange_entity'
  | 'payment_processor'
  | 'db_exchange_category'
  | 'security_tags_exchange'
  | 'graph_linked_to_whitelisted_exchange'
  | 'candidate_signal_exchange_infra'
  | 'exchange_like_fallback';

export interface TrustedSourceSemanticsInput {
  address: string;
  entity: string;
  flags: RiskFlag[];
  blacklistCategory?: string | null;
  exchangeLikeFallback?: boolean;
  graphLinkedToWhitelistedExchange?: boolean;
  candidateSignalExchangeInfra?: boolean;
  /** Raw provider tags (TronScan / etc.) */
  securityTags?: string[] | null;
}

const EXCHANGE_TAG_RE =
  /exchange|cex|binance|okx|kraken|coinbase|bybit|kucoin|gate\.?io|bitfinex/i;
const PAYMENT_TAG_RE =
  /payment|processor|psp|fiat|on-?ramp|custodian/i;

export function securityTagsSuggestExchangeRail(
  tags: string[] | null | undefined
): boolean {
  if (!tags?.length) return false;
  return tags.some(t => {
    const s = String(t);
    return EXCHANGE_TAG_RE.test(s) || PAYMENT_TAG_RE.test(s);
  });
}

/** True when SoF row must be treated as dangerous (overrides any trusted hint). */
export function isDangerousSourceSemantics(
  input: TrustedSourceSemanticsInput
): boolean {
  const f = new Set(input.flags);
  if (f.has('scam') || f.has('phishing') || f.has('malicious')) {
    return true;
  }
  const cat = input.blacklistCategory as BlacklistCategory | undefined;
  if (cat && DANGEROUS_BLACKLIST_CATEGORIES.has(cat)) {
    return true;
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
    return true;
  }
  if (f.has('blacklisted')) {
    if (cat && DANGEROUS_BLACKLIST_CATEGORIES.has(cat)) {
      return true;
    }
  }
  return false;
}

/**
 * Trusted rails for source-of-funds only (not global risk erasure).
 * Call only when {@link isDangerousSourceSemantics} is false.
 */
export function resolveTrustedSourceSemantics(
  input: TrustedSourceSemanticsInput
): { isTrusted: boolean; trustedReason: TrustedSourceReason | null } {
  if (isDangerousSourceSemantics(input)) {
    return { isTrusted: false, trustedReason: null };
  }

  const cat = input.blacklistCategory as BlacklistCategory | undefined;
  const f = new Set(input.flags);

  if (isStrongWhitelistedExchange(input.address)) {
    return { isTrusted: true, trustedReason: 'strong_whitelist' };
  }

  const e = input.entity;
  if (e === 'exchange') {
    return { isTrusted: true, trustedReason: 'exchange_entity' };
  }
  if (e === 'payment_processor') {
    return { isTrusted: true, trustedReason: 'payment_processor' };
  }
  if (cat === 'EXCHANGE') {
    return { isTrusted: true, trustedReason: 'db_exchange_category' };
  }

  if (f.has('blacklisted')) {
    return { isTrusted: false, trustedReason: null };
  }

  if (securityTagsSuggestExchangeRail(input.securityTags ?? undefined)) {
    return { isTrusted: true, trustedReason: 'security_tags_exchange' };
  }

  if (input.graphLinkedToWhitelistedExchange) {
    return {
      isTrusted: true,
      trustedReason: 'graph_linked_to_whitelisted_exchange',
    };
  }

  if (input.candidateSignalExchangeInfra) {
    return {
      isTrusted: true,
      trustedReason: 'candidate_signal_exchange_infra',
    };
  }

  if (input.exchangeLikeFallback) {
    return { isTrusted: true, trustedReason: 'exchange_like_fallback' };
  }

  return { isTrusted: false, trustedReason: null };
}
