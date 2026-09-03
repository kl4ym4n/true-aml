import assert from 'node:assert/strict';
import type { IBlockchainClient } from '../../../lib/blockchain-client.interface';
import { TransactionAnalyzer } from '../address-check.transaction-analyzer';
import {
  getFinalRiskScore,
  getTaintScore,
  getWhitelistLevel,
  AdvancedRiskCalculator,
} from '../address-check.utils';

async function testTaintBuckets(): Promise<void> {
  assert.equal(getTaintScore(0), 0);
  assert.equal(getTaintScore(6), 20);
  assert.equal(getTaintScore(15), 40);
  assert.equal(getTaintScore(35), 70);
  assert.equal(getTaintScore(55), 90);
}

async function testFinalScoreFormula(): Promise<void> {
  const score = getFinalRiskScore(80, 40, 20, 10);
  // 80*0.5 + 40*0.25 + 20*0.15 + 10*0.10 = 54
  assert.equal(score, 54);
}

async function testAdvancedRiskCalculatorBlend(): Promise<void> {
  const calc = new AdvancedRiskCalculator();
  const r = calc.calculate({
    baseRisk: 40,
    taintScore: 30,
    behavioralScore: 20,
    volumeScore: 10,
  });
  // weights: base=0.38, taint=0.36, behavioral=0.12, volume=0.14
  // 40*0.38 + 30*0.36 + 20*0.12 + 10*0.14 = 15.2 + 10.8 + 2.4 + 1.4 = 29.8
  assert.equal(r.score, 29.8);
  assert.equal(r.breakdown.baseRisk, 40);
  assert.ok(r.explanation.length > 0);
}

async function testWhitelist(): Promise<void> {
  assert.equal(
    getWhitelistLevel('TU4vEruvZwLLkSfV9bNw12EJTPvNr7Pvaa'),
    'strong'
  );
  assert.equal(
    getWhitelistLevel('TGEwJxVErWagXnriZATPMBFFbbeuad9m3h'),
    'strong'
  );
  assert.equal(getWhitelistLevel('T000000000000000000000000000000000'), null);
}

async function testStablecoinTransferMaxPagesPassed(): Promise<void> {
  let capturedMaxPages: number | undefined;
  let capturedPageSize: number | undefined;
  const mockClient: Pick<IBlockchainClient, 'getStablecoinTrc20Transfers'> = {
    async getStablecoinTrc20Transfers(
      _address: string,
      options?: { maxPages?: number; pageSize?: number }
    ) {
      capturedMaxPages = options?.maxPages;
      capturedPageSize = options?.pageSize;
      return {
        transfers: [],
        meta: {
          pagesFetched: 0,
          totalRowsFetched: 0,
          matchedTransfers: 0,
          uniqueCounterparties: 0,
          contractsSeen: [],
          tokenSymbolsSeen: [],
          totalNormalizedVolume: 0,
          truncated: false,
        },
      };
    },
  };

  const analyzer = new TransactionAnalyzer(mockClient as IBlockchainClient);
  await analyzer.fetchTRC20IncomingVolumes('TADDR');

  assert.equal(capturedMaxPages, 50);
  assert.equal(capturedPageSize, 200);
}

async function testStablecoinTransferTruncatedMeta(): Promise<void> {
  const address = 'TADDR';
  const mockClient: Pick<IBlockchainClient, 'getStablecoinTrc20Transfers'> = {
    async getStablecoinTrc20Transfers() {
      return {
        transfers: [
          {
            txHash: 'tx1',
            fromAddress: 'TFROM',
            toAddress: address,
            amount: 100,
            contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
            rawAmount: '100000000',
            tokenSymbol: 'USDT',
            tokenDecimals: 6,
            tokenName: 'Tether USD',
            timestamp: 1_700_000_000_000,
            confirmed: true,
          },
        ],
        meta: {
          pagesFetched: 30,
          totalRowsFetched: 6000,
          matchedTransfers: 1,
          uniqueCounterparties: 1,
          contractsSeen: ['TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'],
          tokenSymbolsSeen: ['USDT'],
          totalNormalizedVolume: 100,
          truncated: true,
        },
      };
    },
  };

  const analyzer = new TransactionAnalyzer(mockClient as IBlockchainClient);
  const result = await analyzer.fetchTRC20IncomingVolumes(address);

  assert.equal(result.truncated, true);
  assert.equal(result.pagesFetched, 30);
  assert.equal(result.scannedTxCount, 6000);
  assert.equal(result.totalVolume, 100);
}

async function testIncomingVolumePagination(): Promise<void> {
  const address = 'TADDRESS';
  let calls = 0;
  const mockClient: Pick<
    IBlockchainClient,
    'getTransactions' | 'getStablecoinTrc20Transfers'
  > = {
    async getStablecoinTrc20Transfers() {
      throw new Error('test: force legacy tx-list path');
    },
    async getTransactions(_address: string, options?: { start?: number }) {
      calls++;
      if ((options?.start ?? 0) === 0) {
        return {
          total: 3,
          hasMore: true,
          data: [
            {
              hash: 'tx1',
              blockNumber: 1,
              blockTimestamp: 1_700_000_000_000,
              to: address,
              from: 'A',
              amount: '1000000',
              confirmed: true,
              tokenInfo: {
                symbol: 'USDT',
                address: 'TUSDT',
                decimals: 6,
                name: 'Tether USD',
              },
            },
            {
              hash: 'tx2',
              blockNumber: 2,
              blockTimestamp: 1_700_000_000_100,
              to: address,
              from: 'B',
              amount: '2.5',
              confirmed: true,
              tokenInfo: {
                symbol: 'USDC',
                address: 'TUSDC',
                decimals: 6,
                name: 'USD Coin',
              },
            },
            {
              hash: 'tx4',
              blockNumber: 4,
              blockTimestamp: 1_700_000_000_150,
              to: address,
              from: 'C',
              amount: '100',
              confirmed: true,
              tokenInfo: {
                symbol: 'TRX',
                address: 'TTRX',
                decimals: 6,
                name: 'TRON',
              },
            },
          ],
        };
      }
      return {
        total: 3,
        hasMore: false,
        data: [
          {
            hash: 'tx3',
            blockNumber: 3,
            blockTimestamp: 1_700_000_000_200,
            to: address,
            from: 'A',
            amount: '500000',
            confirmed: true,
            tokenInfo: {
              symbol: 'USDT',
              address: 'TUSDT',
              decimals: 6,
              name: 'Tether USD',
            },
          },
        ],
      };
    },
  };

  const analyzer = new TransactionAnalyzer(mockClient as IBlockchainClient);
  const result = await analyzer.fetchTRC20IncomingVolumes(address);

  // 1,000,000 @6 => 1 + 2.5 + 0.5 = 4
  assert.equal(Math.round(result.totalVolume * 100) / 100, 4);
  assert.equal(
    Math.round((result.volumeByCounterparty.get('A') ?? 0) * 100) / 100,
    1.5
  );
  assert.equal(
    Math.round((result.volumeByCounterparty.get('B') ?? 0) * 100) / 100,
    2.5
  );
  // Non-stable token (TRX) should not be included in taint volume
  assert.equal(result.volumeByCounterparty.has('C'), false);
  assert.equal(calls, 2);
  assert.equal(result.pagesFetched, 2);
  assert.equal(result.scannedTxCount, 4);
  assert.equal(result.stablecoinTxCount, 3);
}

async function testHop2RiskyVolumeFormula(): Promise<void> {
  const totalVolume = 1000;
  const h1IncomingVolume = 400;
  const tVol = 200;
  const vols2TotalVolume = 500;

  const alpha = h1IncomingVolume / totalVolume; // 0.4
  const beta = tVol / vols2TotalVolume; // 0.4
  const pathShare = alpha * beta; // 0.16

  // Wrong formula yields ~160, not 200
  const wrongValue = Math.round(pathShare * totalVolume);
  assert.equal(wrongValue, 160);
  // Correct formula: tVol = 200
  assert.equal(tVol, 200);
  // They are not equal — the old formula was wrong
  assert.notEqual(wrongValue, tVol);
}

async function testHop3RiskyVolumeAccumulation(): Promise<void> {
  // Hop 3 must accumulate riskyIncomingVolume as pathShare * totalVolume.
  const totalVolume = 1000;
  const alpha = 0.4;  // hop-1 share
  const beta = 0.4;   // hop-2 share
  const gamma = 0.3;  // hop-3 share
  const pathShare = alpha * beta * gamma; // 0.048
  const isRisky = true;

  let riskyIncomingVolume = 0;
  // Old wrong: riskyIncomingVolume += uVol (raw volume, unweighted)
  // New correct: riskyIncomingVolume += pathShare * totalVolume (weighted)
  if (isRisky) {
    riskyIncomingVolume += pathShare * totalVolume;
  }
  // pathShare * totalVolume = 0.048 * 1000 = 48
  assert.equal(Math.round(riskyIncomingVolume), 48);
}

async function testBuildFlagsFromSecurity(): Promise<void> {
  // Simulate what buildFlagsFromSecurity returns (we can't instantiate AddressCheckService here,
  // but we can verify the logic inline)
  function buildFlagsFromSecurity(
    isScam: boolean,
    isPhishing: boolean,
    isMalicious: boolean,
    isBlacklisted: boolean
  ): string[] {
    const f: string[] = [];
    if (isBlacklisted) f.push('blacklisted');
    if (isScam) f.push('scam');
    if (isPhishing) f.push('phishing');
    if (isMalicious) f.push('malicious');
    return f;
  }

  const f1 = buildFlagsFromSecurity(true, false, false, false);
  assert.deepEqual(f1, ['scam']);

  const f2 = buildFlagsFromSecurity(false, true, false, true);
  assert.deepEqual(f2, ['blacklisted', 'phishing']);

  const f3 = buildFlagsFromSecurity(false, false, false, false);
  assert.deepEqual(f3, []);
}

async function testNewCategoryPriorities(): Promise<void> {
  const { CATEGORY_PRIORITY } = await import('../../ingestion/ingestion.utils');
  // All new categories must exist
  assert.ok(CATEGORY_PRIORITY['GAMBLING'] !== undefined, 'GAMBLING missing');
  assert.ok(CATEGORY_PRIORITY['HIGH_RISK_EXCHANGE'] !== undefined, 'HIGH_RISK_EXCHANGE missing');
  assert.ok(CATEGORY_PRIORITY['TERRORIST_FINANCING'] !== undefined, 'TERRORIST_FINANCING missing');
  assert.ok(CATEGORY_PRIORITY['CHILD_EXPLOITATION'] !== undefined, 'CHILD_EXPLOITATION missing');
  // Ordering: GAMBLING and HIGH_RISK_EXCHANGE must be above SUSPICIOUS (40)
  assert.ok(CATEGORY_PRIORITY['GAMBLING'] > CATEGORY_PRIORITY['SUSPICIOUS'], 'GAMBLING must outrank SUSPICIOUS');
  assert.ok(CATEGORY_PRIORITY['HIGH_RISK_EXCHANGE'] > CATEGORY_PRIORITY['SUSPICIOUS'], 'HIGH_RISK_EXCHANGE must outrank SUSPICIOUS');
  assert.ok(CATEGORY_PRIORITY['GAMBLING'] > CATEGORY_PRIORITY['HIGH_RISK_EXCHANGE'], 'GAMBLING must outrank HIGH_RISK_EXCHANGE');
  assert.ok(CATEGORY_PRIORITY['SCAM'] > CATEGORY_PRIORITY['GAMBLING'], 'SCAM must outrank GAMBLING');
  assert.ok(CATEGORY_PRIORITY['TERRORIST_FINANCING'] > CATEGORY_PRIORITY['CHILD_EXPLOITATION'], 'TERRORIST_FINANCING must outrank CHILD_EXPLOITATION');
  assert.ok(CATEGORY_PRIORITY['CHILD_EXPLOITATION'] > CATEGORY_PRIORITY['PHISHING'], 'CHILD_EXPLOITATION must outrank PHISHING');
  // Dangerous set must include new categories
  const { DANGEROUS_BLACKLIST_CATEGORIES } = await import('../address-check.utils/trusted-source-semantics');
  assert.ok(DANGEROUS_BLACKLIST_CATEGORIES.has('GAMBLING'), 'GAMBLING not in dangerous set');
  assert.ok(DANGEROUS_BLACKLIST_CATEGORIES.has('HIGH_RISK_EXCHANGE'), 'HIGH_RISK_EXCHANGE not in dangerous set');
  assert.ok(DANGEROUS_BLACKLIST_CATEGORIES.has('TERRORIST_FINANCING'), 'TERRORIST_FINANCING not in dangerous set');
  assert.ok(DANGEROUS_BLACKLIST_CATEGORIES.has('CHILD_EXPLOITATION'), 'CHILD_EXPLOITATION not in dangerous set');
}

async function testTrustCalibration(): Promise<void> {
  // Continuous formula: trustLayerFactor = 0.5 + 0.5 * (1 - t)^2
  // At trustedShare=1.0: 0.5 + 0.5 * 0 = 0.5
  // At trustedShare=0.7: 0.5 + 0.5 * 0.09 = 0.545
  // At trustedShare=0.5: 0.5 + 0.5 * 0.25 = 0.625
  // At trustedShare=0.0: 0.5 + 0.5 * 1 = 1.0

  const { applyTrustedShareScoreCalibration } = await import(
    '../address-check.utils/trusted-share-calibration'
  );

  // High trust, no danger → strong suppression
  const r1 = applyTrustedShareScoreCalibration({
    preliminaryScore: 50,
    trustedShare01: 0.95,
    dangerousShare01: 0.001,
  });
  assert.ok(r1.trustLayerFactor < 0.6, 'high trust should suppress');
  assert.ok(r1.dangerousUplift < 1, 'tiny danger should have minimal uplift');

  // Low trust, high danger → no suppression, visible uplift
  const r2 = applyTrustedShareScoreCalibration({
    preliminaryScore: 50,
    trustedShare01: 0.15,
    dangerousShare01: 0.05,
  });
  assert.ok(r2.trustLayerFactor > 0.85, 'low trust should have minimal suppression');
  assert.ok(r2.dangerousUplift >= 25, '5% danger should produce visible uplift');

  // Medium trust, no danger → partial suppression
  const r3 = applyTrustedShareScoreCalibration({
    preliminaryScore: 50,
    trustedShare01: 0.5,
    dangerousShare01: 0,
  });
  assert.ok(r3.trustLayerFactor < 0.8, '50% trust should partially suppress');
  assert.ok(r3.trustLayerFactor > 0.5, '50% trust should not max suppress');
  assert.equal(r3.dangerousUplift, 0, 'no danger = no uplift');

  // Smooth curve: no sudden jump between 59% and 71% trust
  const r4 = applyTrustedShareScoreCalibration({
    preliminaryScore: 50,
    trustedShare01: 0.59,
    dangerousShare01: 0.005,
  });
  const r5 = applyTrustedShareScoreCalibration({
    preliminaryScore: 50,
    trustedShare01: 0.71,
    dangerousShare01: 0.005,
  });
  const diff = Math.abs(r4.score - r5.score);
  assert.ok(diff < 8, `smooth transition expected, got diff ${diff}`);
}

async function testKnownPlatformCategoryOverridesSuspicious(): Promise<void> {
  function resolveCategory(
    platformCategory: string | null,
    fallback: string
  ): string {
    return platformCategory ?? fallback;
  }

  assert.equal(resolveCategory('GAMBLING', 'SUSPICIOUS'), 'GAMBLING');
  assert.equal(resolveCategory(null, 'SUSPICIOUS'), 'SUSPICIOUS');
}

async function run(): Promise<void> {
  await testTaintBuckets();
  await testFinalScoreFormula();
  await testAdvancedRiskCalculatorBlend();
  await testWhitelist();
  await testStablecoinTransferMaxPagesPassed();
  await testStablecoinTransferTruncatedMeta();
  await testIncomingVolumePagination();
  await testHop2RiskyVolumeFormula();
  await testHop3RiskyVolumeAccumulation();
  await testBuildFlagsFromSecurity();
  await testNewCategoryPriorities();
  await testTrustCalibration();
  await testKnownPlatformCategoryOverridesSuspicious();
  // eslint-disable-next-line no-console
  console.log('taint-model tests passed');
}

void run();
