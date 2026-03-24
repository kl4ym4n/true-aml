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
  const { metadata } = result;
  const hasTaintData =
    metadata.taintPercent !== undefined ||
    metadata.totalIncomingVolume !== undefined ||
    metadata.riskyIncomingVolume !== undefined;

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
        {metadata.addressAgeDays !== null && metadata.addressAgeDays !== undefined && (
            <div className={styles.resultItem}>
              <span className={styles.label}>Address Age</span>
              <span className={styles.value}>{metadata.addressAgeDays} days</span>
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
            <div className={styles.kvGrid}>
              {metadata.taintPercent !== undefined && (
                <div className={styles.kvRow}>
                  <span>Taint Percent</span>
                  <strong>{metadata.taintPercent.toFixed(2)}%</strong>
                </div>
              )}
              {metadata.totalIncomingVolume !== undefined && (
                <div className={styles.kvRow}>
                  <span>Total Incoming</span>
                  <strong>{metadata.totalIncomingVolume.toFixed(2)}</strong>
                </div>
              )}
              {metadata.riskyIncomingVolume !== undefined && (
                <div className={styles.kvRow}>
                  <span>Risky Incoming</span>
                  <strong>{metadata.riskyIncomingVolume.toFixed(2)}</strong>
                </div>
              )}
            </div>
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
              <div className={styles.kvRow}>
                <span>Taint Score</span>
                <strong>{metadata.scoreBreakdown.taintScore.toFixed(2)}</strong>
              </div>
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
                      <th>Risky</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metadata.topRiskyCounterparties.map(cp => (
                      <tr key={cp.address}>
                        <td className={styles.mono}>{cp.address}</td>
                        <td>{cp.incomingVolume.toFixed(2)}</td>
                        <td>{cp.riskScore.toFixed(2)}</td>
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

        {metadata.taintCalculationStats && (
          <div className={styles.section}>
            <span className={styles.sectionTitle}>Taint Stats</span>
            <div className={styles.kvGrid}>
              <div className={styles.kvRow}>
                <span>Max Considered</span>
                <strong>{metadata.taintCalculationStats.maxConsidered}</strong>
              </div>
              <div className={styles.kvRow}>
                <span>Checked</span>
                <strong>{metadata.taintCalculationStats.checkedCounterparties}</strong>
              </div>
              <div className={styles.kvRow}>
                <span>Analyzed</span>
                <strong>{metadata.taintCalculationStats.analyzedCounterparties}</strong>
              </div>
              <div className={styles.kvRow}>
                <span>Skipped (visited)</span>
                <strong>{metadata.taintCalculationStats.skippedVisited}</strong>
              </div>
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
