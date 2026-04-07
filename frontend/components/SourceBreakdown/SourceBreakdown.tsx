'use client';

import type { SourceBreakdown as SourceBreakdownType } from '@/lib/types';
import styles from './SourceBreakdown.module.css';

interface SourceBreakdownProps {
  sourceBreakdown: SourceBreakdownType;
  /** When the stablecoin sample is all “suspicious” but the wallet looks CEX-like overall. */
  walletContext?: {
    exchangeLikeWalletProfile: boolean;
    trustedContextOutsideSample: boolean;
    note?: string;
  };
}

function fundSourceInsight(s: {
  trusted: number;
  suspicious: number;
  dangerous: number;
}): string | null {
  const { trusted, suspicious, dangerous } = s;
  if (dangerous >= 12) {
    return 'A large share of inflow is flagged as high-risk (sanctions, scam, mixer, etc.). Prioritize reviewing counterparties and documentation.';
  }
  if (dangerous >= 4) {
    return 'There is a visible high-risk component in stablecoin inflow — worth validating source-of-funds.';
  }
  if (trusted >= 65 && dangerous < 3) {
    return 'Most analyzed inflow maps to trusted rails (e.g. exchanges). Residual risk is mainly behavioral or unknown peers.';
  }
  if (suspicious >= 55 && trusted < 35) {
    return 'Inflow is mostly “suspicious” in our model (unknown / DeFi / P2P-style) — typical for non-CEX wallets; compare with your expected profile.';
  }
  return null;
}

function sortEntriesDesc(entries: [string, number][]): [string, number][] {
  return [...entries].sort((a, b) => b[1] - a[1]);
}

export default function SourceBreakdown({
  sourceBreakdown,
  walletContext,
}: SourceBreakdownProps) {
  const s = sourceBreakdown.summary;
  const insight = s ? fundSourceInsight(s) : null;

  const t = s ? Math.max(0, s.trusted) : 0;
  const u = s ? Math.max(0, s.suspicious) : 0;
  const d = s ? Math.max(0, s.dangerous) : 0;

  const trustedRows = sortEntriesDesc(Object.entries(sourceBreakdown.trusted));
  const suspiciousRows = sortEntriesDesc(Object.entries(sourceBreakdown.suspicious));
  const dangerousRows = sortEntriesDesc(Object.entries(sourceBreakdown.dangerous));

  return (
    <div className={styles.sourceBreakdown}>
      <span className={styles.sourceBreakdownTitle}>Source of funds</span>
      {sourceBreakdown.sampleEmpty && (
        <div className={styles.profileBlock}>
          <p className={styles.profileCaption}>
            No USDT/USDC inflow in this sample — breakdown unavailable.
          </p>
          {sourceBreakdown.note && (
            <p className={styles.profileInsight}>{sourceBreakdown.note}</p>
          )}
        </div>
      )}
      {s && !sourceBreakdown.sampleEmpty && (
        <div className={styles.profileBlock}>
          <p className={styles.profileCaption}>
            USDT/USDC inflow by bucket (not all on-chain tokens).
          </p>
          <div
            className={styles.barTrack}
            role="img"
            aria-label={`Trusted ${t.toFixed(1)} percent, suspicious ${u.toFixed(1)} percent, dangerous ${d.toFixed(1)} percent`}
          >
            <div
              className={styles.barTrusted}
              style={{ width: `${t}%` }}
              title={`Trusted ${t.toFixed(1)}%`}
            />
            <div
              className={styles.barSuspicious}
              style={{ width: `${u}%` }}
              title={`Suspicious ${u.toFixed(1)}%`}
            />
            <div
              className={styles.barDangerous}
              style={{ width: `${d}%` }}
              title={`Dangerous ${d.toFixed(1)}%`}
            />
          </div>
          <ul className={styles.profileLegend}>
            <li>
              <span className={styles.legendSwatchTrusted} aria-hidden />
              Trusted <strong>{t.toFixed(0)}%</strong>
            </li>
            <li>
              <span className={styles.legendSwatchSuspicious} aria-hidden />
              Suspicious <strong>{u.toFixed(0)}%</strong>
            </li>
            <li>
              <span className={styles.legendSwatchDangerous} aria-hidden />
              Dangerous <strong>{d.toFixed(0)}%</strong>
            </li>
          </ul>
          {insight && <p className={styles.profileInsight}>{insight}</p>}
          {walletContext?.note && (
            <p className={styles.walletContextNote}>{walletContext.note}</p>
          )}
        </div>
      )}
      <div className={styles.sourceBreakdownGrid}>
        <div className={styles.sourceCategory}>
          <div className={styles.sourceCategoryHeader}>
            <span className={styles.sourceCategoryIcon} aria-hidden>✓</span>
            <span>Trusted</span>
          </div>
          <ul className={styles.sourceList}>
            {trustedRows
              .filter(([, pct]) => pct > 0)
              .map(([name, pct]) => (
                <li
                  key={name}
                  className={styles.sourceRow}
                  title={
                    t > 0
                      ? `${((pct / t) * 100).toFixed(0)}% of trusted bucket`
                      : undefined
                  }
                >
                  <span>{name}</span>
                  <span>{pct.toFixed(1)}%</span>
                </li>
              ))}
            {Object.values(sourceBreakdown.trusted).every(v => v <= 0) && (
              <li className={styles.sourceRowMuted}>—</li>
            )}
          </ul>
        </div>
        <div className={styles.sourceCategorySuspicious}>
          <div className={styles.sourceCategoryHeader}>
            <span className={styles.sourceCategoryIconSuspicious} aria-hidden>⚠</span>
            <span>Suspicious</span>
          </div>
          <ul className={styles.sourceList}>
            {suspiciousRows
              .filter(([, pct]) => pct > 0)
              .map(([name, pct]) => (
                <li
                  key={name}
                  className={styles.sourceRow}
                  title={
                    u > 0
                      ? `${((pct / u) * 100).toFixed(0)}% of suspicious bucket`
                      : undefined
                  }
                >
                  <span>{name}</span>
                  <span>{pct.toFixed(1)}%</span>
                </li>
              ))}
            {Object.values(sourceBreakdown.suspicious).every(v => v <= 0) && (
              <li className={styles.sourceRowMuted}>—</li>
            )}
          </ul>
        </div>
        <div className={styles.sourceCategoryDangerous}>
          <div className={styles.sourceCategoryHeader}>
            <span className={styles.sourceCategoryIconDangerous} aria-hidden>●</span>
            <span>Dangerous</span>
          </div>
          <ul className={styles.sourceList}>
            {dangerousRows
              .filter(([, pct]) => pct > 0)
              .map(([name, pct]) => (
                <li
                  key={name}
                  className={styles.sourceRow}
                  title={
                    d > 0
                      ? `${((pct / d) * 100).toFixed(0)}% of dangerous bucket`
                      : undefined
                  }
                >
                  <span>{name}</span>
                  <span>{pct.toFixed(1)}%</span>
                </li>
              ))}
            {Object.values(sourceBreakdown.dangerous).every(v => v <= 0) && (
              <li className={styles.sourceRowMuted}>—</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
