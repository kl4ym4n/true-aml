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

function isPositiveNumber(n: number | undefined): boolean {
  return n !== undefined && Number.isFinite(n) && n > 0;
}

export default function AddressResultCard({ result }: AddressResultCardProps) {
  const { metadata } = result;

  const hasTaintData =
    isPositiveNumber(metadata.taintPercent) ||
    isPositiveNumber(metadata.totalIncomingVolume) ||
    isPositiveNumber(metadata.riskyIncomingVolume);

  const taintStats = metadata.taintCalculationStats;
  const hasMeaningfulTaintStats =
    taintStats != null &&
    (taintStats.maxConsidered > 0 ||
      taintStats.checkedCounterparties > 0 ||
      taintStats.analyzedCounterparties > 0 ||
      (taintStats.skippedVisited ?? 0) > 0 ||
      (taintStats.skippedDust ?? 0) > 0 ||
      (taintStats.counterpartyCacheHits ?? 0) > 0 ||
      (taintStats.counterpartyCacheMisses ?? 0) > 0);

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
        {metadata.addressSecurity?.riskLevel && (
          <div className={styles.resultItem}>
            <span className={styles.label}>Security Provider Level</span>
            <span className={styles.value}>{metadata.addressSecurity.riskLevel}</span>
          </div>
        )}
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
        {metadata.isBlacklisted && (
          <div className={styles.resultItem}>
            <span className={styles.label}>Blacklist Status</span>
            <span className={styles.warning}>Blacklisted</span>
          </div>
        )}
        {hasTaintData && (
          <div className={styles.section}>
            <span className={styles.sectionTitle}>Taint Analysis</span>
            <div className={styles.hint}>
              Taint is computed from <strong>incoming USDT/USDC only</strong> (same basis as “Stablecoin
              Incoming”).
            </div>
            <div className={styles.kvGrid}>
              {isPositiveNumber(metadata.taintPercent) && (
                <div className={styles.kvRow}>
                  <span>Taint Percent</span>
                  <strong>{metadata.taintPercent!.toFixed(2)}%</strong>
                </div>
              )}
              {isPositiveNumber(metadata.totalIncomingVolume) && (
                <div className={styles.kvRow}>
                  <span>Stablecoin Incoming (USDT/USDC)</span>
                  <strong>{metadata.totalIncomingVolume!.toFixed(2)}</strong>
                </div>
              )}
              {isPositiveNumber(metadata.riskyIncomingVolume) && (
                <div className={styles.kvRow}>
                  <span>Risky Stablecoin Incoming</span>
                  <strong>{metadata.riskyIncomingVolume!.toFixed(2)}</strong>
                </div>
              )}
            </div>
          </div>
        )}

        {metadata.explanation && metadata.explanation.length > 0 && (
          <div className={styles.section}>
            <span className={styles.sectionTitle}>AML Explanation</span>
            <ul className={styles.explanationList}>
              {metadata.explanation.map((line, idx) => (
                <li key={idx}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        {metadata.scoreBreakdown && (
          <div className={styles.section}>
            <span className={styles.sectionTitle}>Score Breakdown</span>
            <div className={styles.kvGrid}>
              <div className={styles.kvRow}>
                <span>Base Risk</span>
                <strong>{metadata.scoreBreakdown.baseRiskScore.toFixed(2)}</strong>
              </div>
              {Math.abs(metadata.scoreBreakdown.taintScore) > 1e-9 && (
                <div className={styles.kvRow}>
                  <span>Taint Score</span>
                  <strong>{metadata.scoreBreakdown.taintScore.toFixed(2)}</strong>
                </div>
              )}
              <div className={styles.kvRow}>
                <span>Behavior Score</span>
                <strong>{metadata.scoreBreakdown.behavioralScore.toFixed(2)}</strong>
              </div>
              <div className={styles.kvRow}>
                <span>Volume Score</span>
                <strong>{metadata.scoreBreakdown.volumeScore.toFixed(2)}</strong>
              </div>
              <div className={styles.kvRow}>
                <span>Pre-Whitelist</span>
                <strong>{metadata.scoreBreakdown.preWhitelistScore.toFixed(2)}</strong>
              </div>
              <div className={styles.kvRow}>
                <span>Post-Whitelist</span>
                <strong>{metadata.scoreBreakdown.postWhitelistScore.toFixed(2)}</strong>
              </div>
              {metadata.scoreBreakdown.whitelistLevel && (
                <div className={styles.kvRow}>
                  <span>Whitelist Level</span>
                  <strong>{metadata.scoreBreakdown.whitelistLevel}</strong>
                </div>
              )}
            </div>
          </div>
        )}

        {metadata.topRiskyCounterparties &&
          metadata.topRiskyCounterparties.length > 0 && (
            <div className={styles.section}>
              <span className={styles.sectionTitle}>Top Counterparties</span>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Address</th>
                      <th>Volume</th>
                      <th>Score</th>
                      <th>Entity</th>
                      <th>Risky</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metadata.topRiskyCounterparties.map(cp => (
                      <tr key={cp.address}>
                        <td className={styles.mono}>{cp.address}</td>
                        <td>{cp.incomingVolume.toFixed(2)}</td>
                        <td>{cp.riskScore.toFixed(2)}</td>
                        <td>{cp.entityType ?? '—'}</td>
                        <td>
                          <span className={cp.risky ? styles.badgeRisky : styles.badgeSafe}>
                            {cp.risky ? 'Yes' : 'No'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        {hasMeaningfulTaintStats && taintStats && (
          <div className={styles.section}>
            <span className={styles.sectionTitle}>Taint Stats</span>
            <div className={styles.kvGrid}>
              {taintStats.maxConsidered > 0 && (
                <div className={styles.kvRow}>
                  <span>Max Considered</span>
                  <strong>{taintStats.maxConsidered}</strong>
                </div>
              )}
              {taintStats.checkedCounterparties > 0 && (
                <div className={styles.kvRow}>
                  <span>Checked</span>
                  <strong>{taintStats.checkedCounterparties}</strong>
                </div>
              )}
              {taintStats.analyzedCounterparties > 0 && (
                <div className={styles.kvRow}>
                  <span>Analyzed</span>
                  <strong>{taintStats.analyzedCounterparties}</strong>
                </div>
              )}
              {(taintStats.skippedVisited ?? 0) > 0 && (
                <div className={styles.kvRow}>
                  <span>Skipped (visited)</span>
                  <strong>{taintStats.skippedVisited}</strong>
                </div>
              )}
              {(taintStats.skippedDust ?? 0) > 0 && (
                <div className={styles.kvRow}>
                  <span>Skipped (dust)</span>
                  <strong>{taintStats.skippedDust}</strong>
                </div>
              )}
              {(taintStats.counterpartyCacheHits ?? 0) > 0 && (
                <div className={styles.kvRow}>
                  <span>Cache hits</span>
                  <strong>{taintStats.counterpartyCacheHits}</strong>
                </div>
              )}
              {(taintStats.counterpartyCacheMisses ?? 0) > 0 && (
                <div className={styles.kvRow}>
                  <span>Cache misses</span>
                  <strong>{taintStats.counterpartyCacheMisses}</strong>
                </div>
              )}
            </div>
          </div>
        )}

        {metadata.sourceBreakdown && (
          <SourceBreakdown sourceBreakdown={metadata.sourceBreakdown} />
        )}
      </div>
    </ResultCard>
  );
}
