import type { AddressSecurity } from '../address-check.risk-calculator';
import type { TransactionPatterns } from '../address-check.pattern-analyzer';

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
  | 'unknown';

const TAG_HINTS: Array<{ re: RegExp; type: EntityType }> = [
  { re: /mixer|tumbler|obfuscat/i, type: 'mixer' },
  { re: /exchange|cex|binance|okx|kraken|coinbase/i, type: 'exchange' },
  { re: /bridge|wormhole|multichain/i, type: 'bridge' },
  { re: /defi|dex|swap|amm|liquidity/i, type: 'defi' },
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
    if (patterns.liquidityPoolInteractions > 2 || swapRatio >= 0.35) {
      return 'defi';
    }
  }

  if (addressInfoAccountType === 'Contract') {
    return 'defi';
  }

  return 'unknown';
}
