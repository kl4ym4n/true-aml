import assert from 'node:assert/strict';
import { PatternAnalyzer } from '../address-check.pattern-analyzer';
import type { Transaction } from '../address-check.transaction-analyzer';

function makeTx(
  ts: number,
  from: string,
  to: string,
  amount: number
): Transaction {
  return {
    block_timestamp: ts,
    from,
    to,
    amount,
    tokenInfo: {
      symbol: 'USDT',
      address: 'TUSDT',
      decimals: 6,
      name: 'Tether USD',
    },
  };
}

async function testFastCashOutHeuristic(): Promise<void> {
  const analyzer = new PatternAnalyzer();
  const subject = 'TSUBJECT';

  const positive = analyzer.analyzeTransactionPatterns(
    [
      makeTx(1_700_000_000_000, 'TIN1', subject, 100),
      // 5 min later, outgoing >=70% from incoming -> should trigger
      makeTx(1_700_000_300_000, subject, 'TOUT1', 80),
    ],
    { address: subject, balance: '0' },
    null,
    null,
    subject
  );
  assert.equal(positive.hasFastCashOut, true);

  const negativeSmallIncoming = analyzer.analyzeTransactionPatterns(
    [
      makeTx(1_700_000_000_000, 'TIN1', subject, 5),
      makeTx(1_700_000_300_000, subject, 'TOUT1', 5),
    ],
    { address: subject, balance: '0' },
    null,
    null,
    subject
  );
  assert.equal(negativeSmallIncoming.hasFastCashOut, false);

  const negativeLateOutgoing = analyzer.analyzeTransactionPatterns(
    [
      makeTx(1_700_000_000_000, 'TIN1', subject, 100),
      // >10 min window
      makeTx(1_700_000_700_000, subject, 'TOUT1', 90),
    ],
    { address: subject, balance: '0' },
    null,
    null,
    subject
  );
  assert.equal(negativeLateOutgoing.hasFastCashOut, false);
}

async function testFanInHeuristic(): Promise<void> {
  const analyzer = new PatternAnalyzer();
  const subject = 'TSUBJECT2';
  const txs: Transaction[] = [];

  // 12 incoming transactions from unique senders, skewed amounts to satisfy avg/max stabilizer
  for (let i = 0; i < 12; i++) {
    const amt = i === 0 ? 20 : 10;
    txs.push(makeTx(1_700_000_000_000 + i * 1_000, `TIN${i}`, subject, amt));
  }
  // outgoing 20 -> 20/130 <= 0.3
  txs.push(makeTx(1_700_000_100_000, subject, 'TOUT', 20));

  const positive = analyzer.analyzeTransactionPatterns(
    txs,
    { address: subject, balance: '0' },
    null,
    null,
    subject
  );
  assert.equal(positive.isFanIn, true);

  const notEnoughIncoming = analyzer.analyzeTransactionPatterns(
    txs.slice(0, 10),
    { address: subject, balance: '0' },
    null,
    null,
    subject
  );
  assert.equal(notEnoughIncoming.isFanIn, false);
}

async function run(): Promise<void> {
  const originalLog = console.log;
  try {
    console.log = () => undefined;
    await testFastCashOutHeuristic();
    await testFanInHeuristic();
  } finally {
    console.log = originalLog;
  }
  // eslint-disable-next-line no-console
  console.log('pattern-heuristics tests passed');
}

void run();
