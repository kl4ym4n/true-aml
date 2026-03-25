import assert from 'node:assert/strict';
import type { RiskFlag } from '../address-check.types';

type TestableService = {
  runMultiHopIfNeeded: (
    address: string,
    hopLevel: number,
    baseRiskScore: number,
    transactions: unknown[],
    visitedAddresses: Set<string>,
    flags: RiskFlag[]
  ) => Promise<{
    finalRiskScore: number;
    flagsFromOtherHops: RiskFlag[];
    hopEntityFlags: RiskFlag[][];
    totalIncomingVolume: number;
    riskyIncomingVolume: number;
    taintPercent: number;
    topRiskyCounterparties: Array<{
      address: string;
      incomingVolume: number;
      riskScore: number;
      risky: boolean;
    }>;
    taintCalculationStats: {
      maxConsidered: number;
      checkedCounterparties: number;
      analyzedCounterparties: number;
      skippedVisited: number;
      skippedDust: number;
      counterpartyCacheHits: number;
      counterpartyCacheMisses: number;
    };
    taintScore: number;
    behavioralScore: number;
    volumeScore: number;
  }>;
  transactionAnalyzer: {
    fetchTRC20IncomingVolumes: (address: string) => Promise<{
      totalVolume: number;
      volumeByCounterparty: Map<string, number>;
      pagesFetched: number;
      scannedTxCount: number;
      stablecoinTxCount: number;
      truncated: boolean;
    }>;
  };
  analyzeAddressWithHops: (
    address: string,
    hopLevel: number,
    visitedAddresses: Set<string>
  ) => Promise<{ riskScore: number; flags: RiskFlag[] }>;
  counterpartyAnalysisCache: Map<
    string,
    {
      result: unknown;
      cachedAt: number;
    }
  >;
};

async function createServiceForRunMultiHopTests(): Promise<TestableService> {
  // Ensure env validation passes in test environment.
  process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
  process.env.TRONGRID_API_KEY ??= 'test-key';
  const { AddressCheckService } = await import('../address-check.service');
  return new AddressCheckService() as unknown as TestableService;
}

async function testCounterpartyCacheHitMissStats(): Promise<void> {
  const service = await createServiceForRunMultiHopTests();
  const now = Date.now();

  service.counterpartyAnalysisCache.set('CP1', {
    result: { riskScore: 80, flags: ['scam'] },
    cachedAt: now,
  });
  service.transactionAnalyzer.fetchTRC20IncomingVolumes = async () => ({
    totalVolume: 100,
    volumeByCounterparty: new Map([
      ['CP1', 60],
      ['CP2', 40],
    ]),
    pagesFetched: 1,
    scannedTxCount: 2,
    stablecoinTxCount: 2,
    truncated: false,
  });
  service.analyzeAddressWithHops = async (addr: string) => ({
    riskScore: addr === 'CP1' ? 80 : 20,
    flags: addr === 'CP1' ? (['scam'] as RiskFlag[]) : [],
  });

  const result = await service.runMultiHopIfNeeded(
    'ROOT',
    0,
    20,
    [],
    new Set<string>(['ROOT']),
    []
  );

  assert.equal(result.taintCalculationStats.counterpartyCacheHits, 1);
  assert.equal(result.taintCalculationStats.counterpartyCacheMisses, 1);
  assert.equal(result.taintCalculationStats.analyzedCounterparties, 2);
  assert.equal(result.riskyIncomingVolume, 60);
  assert.equal(result.taintPercent, 60);
}

async function testDustCounterpartiesDoNotAffectTaint(): Promise<void> {
  const service = await createServiceForRunMultiHopTests();
  service.transactionAnalyzer.fetchTRC20IncomingVolumes = async () => ({
    totalVolume: 100,
    volumeByCounterparty: new Map([
      ['DUST1', 0.001],
      ['DUST2', 0.005],
    ]),
    pagesFetched: 1,
    scannedTxCount: 2,
    stablecoinTxCount: 2,
    truncated: false,
  });
  service.analyzeAddressWithHops = async () => ({
    riskScore: 95,
    flags: ['scam'],
  });

  const result = await service.runMultiHopIfNeeded(
    'ROOT',
    0,
    20,
    [],
    new Set<string>(['ROOT']),
    []
  );

  assert.equal(result.taintCalculationStats.checkedCounterparties, 2);
  assert.equal(result.taintCalculationStats.analyzedCounterparties, 0);
  assert.equal(result.taintCalculationStats.skippedDust, 2);
  assert.equal(result.taintCalculationStats.counterpartyCacheHits, 0);
  assert.equal(result.taintCalculationStats.counterpartyCacheMisses, 0);
  assert.equal(result.topRiskyCounterparties.length, 0);
  assert.equal(result.riskyIncomingVolume, 0);
  assert.equal(result.taintPercent, 0);
}

async function testVisitedCounterpartiesAreSkipped(): Promise<void> {
  const service = await createServiceForRunMultiHopTests();
  service.transactionAnalyzer.fetchTRC20IncomingVolumes = async () => ({
    totalVolume: 100,
    volumeByCounterparty: new Map([
      ['VISITED_CP', 90],
      ['CP2', 10],
    ]),
    pagesFetched: 1,
    scannedTxCount: 2,
    stablecoinTxCount: 2,
    truncated: false,
  });
  service.analyzeAddressWithHops = async (addr: string) => ({
    riskScore: addr === 'CP2' ? 70 : 10,
    flags: [],
  });

  const result = await service.runMultiHopIfNeeded(
    'ROOT',
    0,
    20,
    [],
    new Set<string>(['ROOT', 'VISITED_CP']),
    []
  );

  assert.equal(result.taintCalculationStats.skippedVisited, 1);
  assert.equal(result.taintCalculationStats.analyzedCounterparties, 1);
}

async function run(): Promise<void> {
  await testCounterpartyCacheHitMissStats();
  await testDustCounterpartiesDoNotAffectTaint();
  await testVisitedCounterpartiesAreSkipped();
  // eslint-disable-next-line no-console
  console.log('service-regression tests passed');
}

void run();
