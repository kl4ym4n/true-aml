/**
 * Seed known risky platforms into KnownPlatform table.
 *
 * IMPORTANT: All addresses below are PLACEHOLDERS.
 * Before running in production, replace each address[] with verified
 * on-chain addresses from blockchain explorers or platform documentation.
 *
 * Run: npm run seed:platforms
 */
import prisma from '../config/database';

const platforms = [
  // ── GAMBLING ──────────────────────────────────────────────────────────
  {
    name: 'WINk',
    category: 'GAMBLING' as const,
    chain: 'TRON',
    contractAddresses: [] as string[],
    hotWalletAddresses: [] as string[],
    confidence: 0.9,
    source: 'manual',
    notes: 'TRON gambling dApp using WIN token',
  },
  {
    name: 'JustBet',
    category: 'GAMBLING' as const,
    chain: 'TRON',
    contractAddresses: [] as string[],
    hotWalletAddresses: [] as string[],
    confidence: 0.85,
    source: 'manual',
    notes: 'TRON-based betting platform',
  },
  {
    name: 'SunPump Gambling',
    category: 'GAMBLING' as const,
    chain: 'TRON',
    contractAddresses: [] as string[],
    hotWalletAddresses: [] as string[],
    confidence: 0.75,
    source: 'manual',
    notes: 'TRON meme/gambling pools associated with SunPump ecosystem',
  },

  // ── HIGH_RISK_EXCHANGE ────────────────────────────────────────────────
  {
    name: 'Garantex',
    category: 'HIGH_RISK_EXCHANGE' as const,
    chain: 'TRON',
    contractAddresses: [] as string[],
    hotWalletAddresses: [] as string[],
    confidence: 0.95,
    source: 'ofac',
    notes: 'OFAC-sanctioned Russian crypto exchange (April 2022)',
  },
  {
    name: 'Bitzlato',
    category: 'HIGH_RISK_EXCHANGE' as const,
    chain: 'TRON',
    contractAddresses: [] as string[],
    hotWalletAddresses: [] as string[],
    confidence: 0.95,
    source: 'ofac',
    notes: 'OFAC-sanctioned exchange, FinCEN primary money laundering concern',
  },
  {
    name: 'SUEX',
    category: 'HIGH_RISK_EXCHANGE' as const,
    chain: 'TRON',
    contractAddresses: [] as string[],
    hotWalletAddresses: [] as string[],
    confidence: 0.95,
    source: 'ofac',
    notes: 'OFAC-sanctioned OTC desk (September 2021)',
  },

  // ── TERRORIST_FINANCING ───────────────────────────────────────────────
  {
    name: 'OFAC SDN Terrorist Financing',
    category: 'TERRORIST_FINANCING' as const,
    chain: 'TRON',
    contractAddresses: [] as string[],
    hotWalletAddresses: [] as string[],
    confidence: 0.98,
    source: 'ofac',
    notes: 'Addresses from OFAC SDN list with terrorism-financing designation',
  },

  // ── CHILD_EXPLOITATION ────────────────────────────────────────────────
  {
    name: 'CSAM Known Addresses',
    category: 'CHILD_EXPLOITATION' as const,
    chain: 'TRON',
    contractAddresses: [] as string[],
    hotWalletAddresses: [] as string[],
    confidence: 0.99,
    source: 'manual',
    notes: 'Addresses associated with CSAM markets — direct match only',
  },
];

async function main(): Promise<void> {
  console.log('Seeding KnownPlatform table...');
  let upserted = 0;

  for (const p of platforms) {
    await prisma.knownPlatform.upsert({
      where: { name_chain: { name: p.name, chain: p.chain } },
      create: {
        name: p.name,
        category: p.category,
        chain: p.chain,
        contractAddresses: p.contractAddresses,
        hotWalletAddresses: p.hotWalletAddresses,
        confidence: p.confidence,
        source: p.source,
        notes: p.notes,
      },
      update: {
        category: p.category,
        contractAddresses: p.contractAddresses,
        hotWalletAddresses: p.hotWalletAddresses,
        confidence: p.confidence,
        notes: p.notes,
      },
    });
    upserted++;
    console.log(`  done: ${p.name} (${p.category})`);
  }

  console.log(`Done. Upserted ${upserted} platforms.`);
  console.log('NEXT STEP: Fill in placeholder addresses before running ingestion.');
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
