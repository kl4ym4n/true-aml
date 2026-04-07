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
  const stablecoinIncoming =
    metadata.stablecoinIncomingVolume ?? metadata.totalIncomingVolume;

  const hasTaintData =
    isPositiveNumber(metadata.taintPercent) ||
    isPositiveNumber(stablecoinIncoming) ||
    isPositiveNumber(metadata.riskyIncomingVolume);

  return (
    <ResultCard title="Result">
      <div className={styles.resultGrid}>
        {result.address && (
          <div className={styles.resultItem}>
            <span className={styles.label}>Wallet</span>
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
            <span className={styles.label}>Security</span>
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
            <span className={styles.label}>Blacklist</span>
            <span className={styles.warning}>Yes</span>
          </div>
        )}
        {hasTaintData && (
          <div className={styles.section}>
            <span className={styles.sectionTitle}>Taint (USDT/USDC)</span>
            {metadata.stablecoinSofWarning && (
              <div className={styles.hint}>{metadata.stablecoinSofWarning}</div>
            )}
            <div className={styles.kvGrid}>
              {isPositiveNumber(metadata.taintPercent) && (
                <div className={styles.kvRow}>
                  <span>Taint</span>
                  <strong>{metadata.taintPercent!.toFixed(1)}%</strong>
                </div>
              )}
              {isPositiveNumber(stablecoinIncoming) && (
                <div className={styles.kvRow}>
                  <span>Inflow</span>
                  <strong>{stablecoinIncoming!.toFixed(2)}</strong>
                </div>
              )}
              {isPositiveNumber(metadata.riskyIncomingVolume) && (
                <div className={styles.kvRow}>
                  <span>Risky inflow</span>
                  <strong>{metadata.riskyIncomingVolume!.toFixed(2)}</strong>
                </div>
              )}
            </div>
          </div>
        )}

        {metadata.explanation && metadata.explanation.length > 0 && (
          <div className={styles.section}>
            <span className={styles.sectionTitle}>Explanation</span>
            <ul className={styles.explanationList}>
              {metadata.explanation.map((line, idx) => (
                <li key={idx}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        {metadata.scoreBreakdown && (
          <div className={styles.section}>
            <span className={styles.sectionTitle}>Score</span>
            <div className={styles.kvGrid}>
              <div className={styles.kvRow}>
                <span>Base</span>
                <strong>{metadata.scoreBreakdown.baseRiskScore.toFixed(1)}</strong>
              </div>
              {Math.abs(metadata.scoreBreakdown.taintScore) > 1e-9 && (
                <div className={styles.kvRow}>
                  <span>Taint</span>
                  <strong>{metadata.scoreBreakdown.taintScore.toFixed(1)}</strong>
                </div>
              )}
              <div className={styles.kvRow}>
                <span>Behavior</span>
                <strong>{metadata.scoreBreakdown.behavioralScore.toFixed(1)}</strong>
              </div>
              <div className={styles.kvRow}>
                <span>Volume</span>
                <strong>{metadata.scoreBreakdown.volumeScore.toFixed(1)}</strong>
              </div>
              <div className={styles.kvRow}>
                <span>Before WL</span>
                <strong>{metadata.scoreBreakdown.preWhitelistScore.toFixed(1)}</strong>
              </div>
              <div className={styles.kvRow}>
                <span>After WL</span>
                <strong>{metadata.scoreBreakdown.postWhitelistScore.toFixed(1)}</strong>
              </div>
              {metadata.scoreBreakdown.whitelistLevel && (
                <div className={styles.kvRow}>
                  <span>WL</span>
                  <strong>{metadata.scoreBreakdown.whitelistLevel}</strong>
                </div>
              )}
            </div>
          </div>
        )}

        {metadata.topRiskyCounterparties &&
          metadata.topRiskyCounterparties.length > 0 && (
            <div className={styles.section}>
              <span className={styles.sectionTitle}>Counterparties</span>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Address</th>
                      <th>Vol.</th>
                      <th>Scr.</th>
                      <th>Type</th>
                      <th>Risk</th>
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

        {metadata.sourceBreakdown && (
          <SourceBreakdown
            sourceBreakdown={metadata.sourceBreakdown}
            walletContext={metadata.walletContext}
          />
        )}
      </div>
    </ResultCard>
  );
}
