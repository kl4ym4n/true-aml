'use client';

import ResultCard from '@/components/ResultCard/ResultCard';
import RiskBadge from '@/components/RiskBadge/RiskBadge';
import CopyButton from '@/components/CopyButton/CopyButton';
import type { TransactionCheckResponse } from '@/lib/types';
import { toUppercaseRiskLevel } from '@/lib/types';
import styles from './TransactionResultCard.module.css';

function riskLevelFromScore(score: number): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= 80) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'MEDIUM';
  return 'LOW';
}

interface TransactionResultCardProps {
  result: TransactionCheckResponse;
}

export default function TransactionResultCard({ result }: TransactionResultCardProps) {
  const { details } = result;

  return (
    <ResultCard title="Analysis Result">
      <div className={styles.resultGrid}>
        {details.txHash && (
          <div className={styles.resultItem}>
            <span className={styles.label}>Transaction Hash</span>
            <div className={styles.addressRow}>
              <code className={styles.address}>{details.txHash}</code>
              <CopyButton text={details.txHash} />
            </div>
          </div>
        )}
        <div className={styles.resultItem}>
          <span className={styles.label}>Risk Score</span>
          <span className={styles.value}>{result.riskScore}</span>
        </div>
        <div className={styles.resultItem}>
          <span className={styles.label}>Risk Level</span>
          <RiskBadge level={toUppercaseRiskLevel(result.riskLevel)} />
        </div>
        {result.flags.length > 0 && (
          <div className={styles.resultItem}>
            <span className={styles.label}>Flags</span>
            <div className={styles.flags}>
              {result.flags.map((flag, idx) => (
                <span key={idx} className={styles.flag}>
                  {flag}
                </span>
              ))}
            </div>
          </div>
        )}
        {details.transferData && (
          <>
            <div className={styles.resultItem}>
              <span className={styles.label}>From</span>
              <div className={styles.addressRow}>
                <code className={styles.address}>{details.transferData.from}</code>
                <CopyButton text={details.transferData.from} />
              </div>
            </div>
            <div className={styles.resultItem}>
              <span className={styles.label}>To</span>
              <div className={styles.addressRow}>
                <code className={styles.address}>{details.transferData.to}</code>
                <CopyButton text={details.transferData.to} />
              </div>
            </div>
            <div className={styles.resultItem}>
              <span className={styles.label}>Amount</span>
              <span className={styles.value}>
                {details.transferData.amount}{' '}
                {details.transferData.tokenSymbol || 'TRC-20'}
              </span>
            </div>
          </>
        )}
        {details.tainting?.isTainted && (
          <div className={styles.resultItem}>
            <span className={styles.label}>1-Hop Taint</span>
            <span className={styles.warning}>
              Tainted from:{' '}
              {details.tainting.taintedFromAddress || 'Unknown'}
            </span>
          </div>
        )}
        {details.sender && (
          <div className={styles.resultItem}>
            <span className={styles.label}>Sender Risk</span>
            <RiskBadge level={riskLevelFromScore(details.sender.riskScore)} />
          </div>
        )}
        {details.receiver && (
          <div className={styles.resultItem}>
            <span className={styles.label}>Receiver Risk</span>
            <RiskBadge level={riskLevelFromScore(details.receiver.riskScore)} />
          </div>
        )}
        {details.timestamp && (
          <div className={styles.resultItem}>
            <span className={styles.label}>Timestamp</span>
            <span className={styles.value}>
              {new Date(details.timestamp).toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </ResultCard>
  );
}
