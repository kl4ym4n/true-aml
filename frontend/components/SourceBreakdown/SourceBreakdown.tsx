'use client';

import type { SourceBreakdown as SourceBreakdownType } from '@/lib/types';
import styles from './SourceBreakdown.module.css';

interface SourceBreakdownProps {
  sourceBreakdown: SourceBreakdownType;
}

export default function SourceBreakdown({ sourceBreakdown }: SourceBreakdownProps) {
  return (
    <div className={styles.sourceBreakdown}>
      <span className={styles.sourceBreakdownTitle}>Sources of funds</span>
      <div className={styles.sourceBreakdownGrid}>
        <div className={styles.sourceCategory}>
          <div className={styles.sourceCategoryHeader}>
            <span className={styles.sourceCategoryIcon} aria-hidden>✓</span>
            <span>Trusted sources</span>
          </div>
          <ul className={styles.sourceList}>
            {Object.entries(sourceBreakdown.trusted)
              .filter(([, pct]) => pct > 0)
              .map(([name, pct]) => (
              <li key={name} className={styles.sourceRow}>
                <span>{name}</span>
                <span>{pct.toFixed(2)}%</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.sourceCategorySuspicious}>
          <div className={styles.sourceCategoryHeader}>
            <span className={styles.sourceCategoryIconSuspicious} aria-hidden>⚠</span>
            <span>Suspicious sources</span>
          </div>
          <ul className={styles.sourceList}>
            {Object.entries(sourceBreakdown.suspicious)
              .filter(([, pct]) => pct > 0)
              .map(([name, pct]) => (
              <li key={name} className={styles.sourceRow}>
                <span>{name}</span>
                <span>{pct.toFixed(2)}%</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.sourceCategoryDangerous}>
          <div className={styles.sourceCategoryHeader}>
            <span className={styles.sourceCategoryIconDangerous} aria-hidden>●</span>
            <span>Dangerous sources</span>
          </div>
          <ul className={styles.sourceList}>
            {Object.entries(sourceBreakdown.dangerous)
              .filter(([, pct]) => pct > 0)
              .map(([name, pct]) => (
              <li key={name} className={styles.sourceRow}>
                <span>{name}</span>
                <span>{pct.toFixed(2)}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
