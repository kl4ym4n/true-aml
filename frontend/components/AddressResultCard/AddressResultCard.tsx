'use client';

import ResultCard from '@/components/ResultCard/ResultCard';
import RiskBadge from '@/components/RiskBadge/RiskBadge';
import CopyButton from '@/components/CopyButton/CopyButton';
import SourceBreakdown from '@/components/SourceBreakdown/SourceBreakdown';
import type { AddressCheckResponse } from '@/lib/types';
import { toUppercaseRiskLevel } from '@/lib/types';
import styles from './AddressResultCard.module.css';

interface AddressResultCardProps {
  result: AddressCheckResponse;
}

export default function AddressResultCard({ result }: AddressResultCardProps) {
  return (
    <ResultCard title="Analysis Result">
      <div className={styles.resultGrid}>
        {result.address && (
          <div className={styles.resultItem}>
            <span className={styles.label}>Address</span>
            <div className={styles.addressRow}>
              <code className={styles.address}>{result.address}</code>
              <CopyButton text={result.address} />
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
        {result.metadata.addressAgeDays !== null &&
          result.metadata.addressAgeDays !== undefined && (
            <div className={styles.resultItem}>
              <span className={styles.label}>Address Age</span>
              <span className={styles.value}>
                {result.metadata.addressAgeDays} days
              </span>
            </div>
          )}
        {result.metadata.isBlacklisted && (
          <div className={styles.resultItem}>
            <span className={styles.label}>Blacklist Status</span>
            <span className={styles.warning}>Blacklisted</span>
          </div>
        )}
        {result.metadata.sourceBreakdown && (
          <SourceBreakdown sourceBreakdown={result.metadata.sourceBreakdown} />
        )}
      </div>
    </ResultCard>
  );
}
