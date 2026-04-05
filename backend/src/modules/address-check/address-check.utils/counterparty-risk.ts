import type { RiskFlag } from '../address-check.types';

/**
 * Whether an incoming counterparty should count as "risky" for taint % / risky volume.
 * Exchanges and payment rails are not risky unless explicitly flagged.
 */
export function isAmlRiskyCounterparty(input: {
  entity: string;
  flags: RiskFlag[];
  entityRiskWeight: number;
  isMetadataBlacklisted?: boolean;
}): boolean {
  if (input.isMetadataBlacklisted) return true;
  const f = new Set(input.flags);
  if (f.has('blacklisted')) return true;
  if (f.has('scam') || f.has('phishing')) return true;
  if (f.has('malicious')) return true;

  const et = input.entity;
  if (et === 'exchange' || et === 'payment_processor') {
    return false;
  }

  return input.entityRiskWeight >= 0.5;
}
