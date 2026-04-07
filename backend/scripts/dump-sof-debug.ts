/**
 * One-off: dump sourceOfFundsSampleDebug for an address (top 10 counterparties).
 * Usage: npx tsx scripts/dump-sof-debug.ts <TRON_ADDRESS>
 */
import 'dotenv/config';
import { addressCheckService } from '../src/modules/address-check';

const addr = process.argv[2];
if (!addr || addr.length !== 34) {
  console.error('Usage: npx tsx scripts/dump-sof-debug.ts <TRON_ADDRESS>');
  process.exit(1);
}

async function main() {
  const result = await addressCheckService.analyzeAddress(addr, { debugSof: true });
  const meta = result.metadata;
  const rows = meta.sourceOfFundsSampleDebug?.counterparties ?? [];
  const top10 = rows.slice(0, 10);

  console.log(
    JSON.stringify(
      {
        address: addr,
        taintInput: meta.taintInput,
        stablecoinIncomingVolume: meta.stablecoinIncomingVolume,
        hasStablecoinSourceSample: meta.hasStablecoinSourceSample,
        stablecoinSourceSampleReason: meta.stablecoinSourceSampleReason,
        walletActivityContext: meta.walletActivityContext,
        sourceBreakdown: meta.sourceBreakdown,
        sourceOfFundsAggregation: meta.sourceOfFundsSampleDebug?.aggregation,
        walletContext: meta.walletContext,
        top10SofDebug: top10,
      },
      null,
      2
    )
  );
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
