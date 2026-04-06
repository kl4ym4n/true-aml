import type { AddressSecurity } from '../address-check.risk-calculator';
import type { TransactionPatterns } from '../address-check.pattern-analyzer';
import { detectEntityType } from './entity-type-detection';
import { isStrongWhitelistedExchange } from './whitelist';

export type EntityType =
  | 'mixer'
  | 'exchange'
  | 'defi'
  | 'bridge'
  | 'scam'
  | 'gambling'
  | 'p2p'
  | 'sanctions'
  | 'darknet'
  | 'phishing'
  | 'liquidity_pool'
  | 'payment_processor'
  | 'unknown';

const TAG_HINTS: Array<{ re: RegExp; type: EntityType }> = [
  { re: /mixer|tumbler|obfuscat/i, type: 'mixer' },
  { re: /exchange|cex|binance|okx|kraken|coinbase/i, type: 'exchange' },
  { re: /payment|processor|psp|fiat|on-?ramp/i, type: 'payment_processor' },
  { re: /bridge|wormhole|multichain/i, type: 'bridge' },
  { re: /defi|dex|swap|amm/i, type: 'defi' },
  { re: /pool|amm|lp\b|liquidity\s*pool/i, type: 'liquidity_pool' },
  { re: /gambl|casino|bet/i, type: 'gambling' },
  { re: /p2p|otc|peer/i, type: 'p2p' },
  { re: /sanction|ofac|sdn/i, type: 'sanctions' },
  { re: /dark|tor|market/i, type: 'darknet' },
];

/**
 * On-chain + graph stats for resolving a counterparty's entity (hop-1..3).
 * `rootIncomingShare` = share of the analyzed root's stablecoin inflow from this counterparty (SoF context).
 */
export interface CounterpartyEntityStatsInput {
  rootIncomingShare: number;
  txCount: number;
  uniqueCounterpartyCount: number;
  /**
   * For the counterparty address: max fraction of its TRC20 incoming from one sender (not parent's vol share).
   */
  maxCounterpartyShare: number;
  liquidityPoolInteractions?: number;
  swapLikeRatio?: number;
}

export interface CounterpartyEntityResolution {
  entity: EntityType;
  /** Short audit string for debugging SoF / entity bugs. */
  why: string;
}

/**
 * Classify counterparty / address entity from security provider + on-chain heuristics.
 */
export function classifyEntity(
  addressSecurity: AddressSecurity | null | undefined,
  patterns?: TransactionPatterns | null,
  addressInfoAccountType?: string | null
): EntityType {
  const tags = addressSecurity?.tags ?? [];
  for (const t of tags) {
    for (const { re, type } of TAG_HINTS) {
      if (re.test(String(t))) return type;
    }
  }

  if (addressSecurity?.isScam) return 'scam';
  if (addressSecurity?.isPhishing) return 'phishing';

  if (patterns) {
    const swapRatio = patterns.swapLikeRatio ?? 0;
    if (patterns.liquidityPoolInteractions > 2) {
      return 'liquidity_pool';
    }
    if (swapRatio >= 0.35) {
      return 'defi';
    }
  }

  if (addressInfoAccountType === 'Contract') {
    return 'defi';
  }

  return 'unknown';
}

function securitySuggestsExchangeRail(
  addressSecurity: AddressSecurity | null | undefined
): boolean {
  const tagged = classifyEntity(addressSecurity, null, null);
  return tagged === 'exchange' || tagged === 'payment_processor';
}

/**
 * Tags first, then graph heuristics with real tx / breadth / concentration signals.
 */
export function resolveCounterpartyEntity(
  address: string,
  addressSecurity: AddressSecurity | null | undefined,
  stats: CounterpartyEntityStatsInput,
  patterns?: TransactionPatterns | null
): CounterpartyEntityResolution {
  if (isStrongWhitelistedExchange(address)) {
    return { entity: 'exchange', why: 'strong_whitelist' };
  }

  const tagged = classifyEntity(addressSecurity, patterns, null);
  if (
    tagged === 'sanctions' ||
    tagged === 'scam' ||
    tagged === 'phishing' ||
    tagged === 'mixer' ||
    tagged === 'darknet'
  ) {
    return { entity: tagged, why: 'security_tags_high_risk' };
  }

  const inferred = detectEntityType(address, {
    uniqueCounterpartyCount: Math.max(0, stats.uniqueCounterpartyCount),
    txCount: Math.max(0, stats.txCount),
    maxCounterpartyShare: stats.maxCounterpartyShare,
    liquidityPoolInteractions:
      stats.liquidityPoolInteractions ?? patterns?.liquidityPoolInteractions,
    swapLikeRatio: stats.swapLikeRatio ?? patterns?.swapLikeRatio,
  }, patterns);

  if (inferred === 'exchange') {
    return { entity: 'exchange', why: 'onchain_heuristic_exchange' };
  }
  if (inferred === 'mixer') {
    return { entity: 'mixer', why: 'onchain_heuristic_mixer' };
  }
  if (inferred === 'liquidity_pool') {
    return { entity: 'liquidity_pool', why: 'onchain_heuristic_lp' };
  }
  if (inferred === 'payment_processor') {
    return { entity: 'payment_processor', why: 'onchain_heuristic_psp' };
  }

  const tx = stats.txCount;
  const mx = stats.maxCounterpartyShare;
  const uc = stats.uniqueCounterpartyCount;
  const root = stats.rootIncomingShare;

  if (
    tx > 25 &&
    root >= 0.04 &&
    mx < 0.35 &&
    uc >= 10 &&
    securitySuggestsExchangeRail(addressSecurity)
  ) {
    return {
      entity: 'exchange',
      why: 'tag_assisted_exchange_candidate',
    };
  }

  if (
    tx > 28 &&
    root >= 0.03 &&
    mx < 0.32 &&
    uc >= 8 &&
    securitySuggestsExchangeRail(addressSecurity)
  ) {
    return {
      entity: 'payment_processor',
      why: 'tag_assisted_psp_candidate',
    };
  }

  if (tagged !== 'unknown') {
    return { entity: tagged, why: 'security_tags_soft' };
  }

  return { entity: 'unknown', why: 'no_matching_heuristic' };
}
