import type { Transaction } from '../address-check.transaction-analyzer';

export interface CounterpartyOnchainStats {
  txCount: number;
  /** Distinct addresses that sent TRC20 to the subject (incoming). */
  uniqueIncomingSenders: number;
  /** Max share of subject's TRC20 incoming volume from a single sender (0..1). 1 if no incoming. */
  maxIncomingSenderShare: number;
}

/**
 * Stats for entity inference on a counterparty address (not root incoming share to parent).
 */
export function computeCounterpartyOnchainStats(
  transactions: Transaction[],
  analyzedAddress: string
): CounterpartyOnchainStats {
  const sub = analyzedAddress.toLowerCase();
  const volumeBySender = new Map<string, number>();
  let totalIncoming = 0;

  for (const tx of transactions) {
    if (!tx.tokenInfo || !tx.amount || tx.amount <= 0) continue;
    const to = tx.to?.toLowerCase() ?? '';
    const from = tx.from?.toLowerCase() ?? '';
    if (to === sub && from) {
      totalIncoming += tx.amount;
      volumeBySender.set(from, (volumeBySender.get(from) ?? 0) + tx.amount);
    }
  }

  const uniqueIncomingSenders = volumeBySender.size;
  if (totalIncoming <= 0) {
    return {
      txCount: transactions.length,
      uniqueIncomingSenders,
      maxIncomingSenderShare: 1,
    };
  }

  let maxVol = 0;
  for (const v of volumeBySender.values()) {
    maxVol = Math.max(maxVol, v);
  }

  return {
    txCount: transactions.length,
    uniqueIncomingSenders,
    maxIncomingSenderShare: maxVol / totalIncoming,
  };
}
