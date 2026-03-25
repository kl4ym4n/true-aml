import assert from 'node:assert/strict';
import type { IBlockchainClient } from '../../../lib/blockchain-client.interface';
import { TransactionAnalyzer } from '../address-check.transaction-analyzer';
import { getFinalRiskScore, getTaintScore } from '../address-check.utils';
import { getWhitelistLevel } from '../address-check.utils';

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
  const mockClient: Pick<IBlockchainClient, 'getTransactions'> = {
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

async function run(): Promise<void> {
  await testTaintBuckets();
  await testFinalScoreFormula();
  await testWhitelist();
  await testIncomingVolumePagination();
  // eslint-disable-next-line no-console
  console.log('taint-model tests passed');
}

void run();
