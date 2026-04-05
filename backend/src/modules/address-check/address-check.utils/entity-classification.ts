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

/**
 * Tags first, then graph heuristics (volume share + activity) for counterparty taint.
 */
export function resolveCounterpartyEntity(
  address: string,
  addressSecurity: AddressSecurity | null | undefined,
  volShare: number,
  counterpartyTxCount: number
): EntityType {
  if (isStrongWhitelistedExchange(address)) {
    return 'exchange';
  }

  const tagged = classifyEntity(addressSecurity, null, null);
  if (
    tagged === 'sanctions' ||
    tagged === 'scam' ||
    tagged === 'phishing' ||
    tagged === 'mixer' ||
    tagged === 'darknet'
  ) {
    return tagged;
  }

  const inferred = detectEntityType(address, {
    uniqueCounterpartyCount: Math.max(0, counterpartyTxCount),
    txCount: Math.max(0, counterpartyTxCount),
    maxCounterpartyShare: volShare,
  });

  if (inferred === 'exchange') return 'exchange';
  if (inferred === 'mixer') return 'mixer';
  if (inferred === 'liquidity_pool') return 'liquidity_pool';
  if (inferred === 'payment_processor') return 'payment_processor';

  return tagged;
}
