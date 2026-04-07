import type {
  SourceBreakdown,
  WalletContextHints,
} from '../address-check.types';
import type { TransactionPatterns } from '../address-check.pattern-analyzer';
import { isExchangeLikePattern } from './advanced-risk.constants';

/**
 * UX hints when stablecoin sample SoF is all suspicious but the wallet is not “street-risk” overall.
 */
export function computeWalletContextHints(input: {
  patterns: TransactionPatterns;
  sourceBreakdown?: SourceBreakdown | null;
}): WalletContextHints {
  const trustedPct = input.sourceBreakdown?.summary?.trusted ?? 0;
  const suspiciousPct = input.sourceBreakdown?.summary?.suspicious ?? 0;
  const exchangeLikeWalletProfile = isExchangeLikePattern(input.patterns);

  const sampleHasNoTrusted = trustedPct < 0.5;
  const trustedContextOutsideSample =
    sampleHasNoTrusted &&
    exchangeLikeWalletProfile &&
    suspiciousPct > 55;

  let note: string | undefined;
  if (trustedContextOutsideSample) {
    note =
      'The analyzed USDT/USDC inflow sample shows no labeled trusted share, but this address still matches an exchange-like activity profile (many counterparties, fan-in). Funds may come from CEX deposit paths not captured in this sample or not yet labeled.';
  } else if (sampleHasNoTrusted && suspiciousPct > 80) {
    note =
      'No trusted-labeled share in this stablecoin sample — either counterparties are routing/omnibus addresses, or the sample window does not include direct CEX-tagged senders.';
  }

  return {
    exchangeLikeWalletProfile,
    trustedContextOutsideSample,
    note,
  };
}
