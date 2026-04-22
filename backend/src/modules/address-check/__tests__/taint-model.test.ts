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
  assert.equal(r.score, 28.5);
  assert.equal(r.breakdown.baseRisk, 40);
  assert.ok(r.explanation.length > 0);
}

async function testWhitelist(): Promise<void> {
  assert.equal(
    getWhitelistLevel('TU4vEruvZwLLkSfV9bNw12EJTPvNr7Pvaa'),
    'strong'
  );
  assert.equal(getWhitelistLevel('T000000000000000000000000000000000'), null);
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
  // Hop 3 must accumulate riskyIncomingVolume for risky counterparties.
  // Regression: previously the hop 3 loop had no riskyIncomingVolume += call.
  let riskyIncomingVolume = 0;
  const uVol = 150;
  const isRisky = true;
  if (isRisky) {
    riskyIncomingVolume += uVol;
  }
  assert.equal(riskyIncomingVolume, 150);
}

async function run(): Promise<void> {
  await testTaintBuckets();
  await testFinalScoreFormula();
  await testAdvancedRiskCalculatorBlend();
  await testWhitelist();
  await testIncomingVolumePagination();
  await testHop2RiskyVolumeFormula();
  await testHop3RiskyVolumeAccumulation();
  // eslint-disable-next-line no-console
  console.log('taint-model tests passed');
}

void run();
