'use client';

import { useState } from 'react';
import Tabs from '@/components/Tabs/Tabs';
import RiskBadge from '@/components/RiskBadge/RiskBadge';
import ResultCard from '@/components/ResultCard/ResultCard';
import Loader from '@/components/Loader/Loader';
import CopyButton from '@/components/CopyButton/CopyButton';
import { api, ApiError } from '@/lib/api';
import { useApiKey } from '@/lib/useApiKey';
import type {
  AddressCheckResponse,
  TransactionCheckResponse,
} from '@/lib/types';
import { toUppercaseRiskLevel } from '@/lib/types';
import styles from './page.module.css';

export default function Home() {
  const { apiKey } = useApiKey();
  const [activeTab, setActiveTab] = useState('address');
  const [addressInput, setAddressInput] = useState('');
  const [txHashInput, setTxHashInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'auth' | 'rateLimit' | 'server' | 'general' | null>(null);
  const [addressResult, setAddressResult] =
    useState<AddressCheckResponse | null>(null);
  const [transactionResult, setTransactionResult] =
    useState<TransactionCheckResponse | null>(null);

  const handleAddressCheck = async () => {
    if (!addressInput.trim()) {
      setError('Please enter a TRON address');
      return;
    }

    setLoading(true);
    setError(null);
    setErrorType(null);
    setAddressResult(null);

    try {
      const result = await api.checkAddress(addressInput.trim(), apiKey || undefined);
      setAddressResult(result);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.isAuthError) {
          setErrorType('auth');
        } else if (err.isRateLimitError) {
          setErrorType('rateLimit');
        } else if (err.statusCode === 500) {
          setErrorType('server');
        } else {
          setErrorType('general');
        }
      } else {
        setError('An unexpected error occurred');
        setErrorType('general');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTransactionCheck = async () => {
    if (!txHashInput.trim()) {
      setError('Please enter a transaction hash');
      return;
    }

    setLoading(true);
    setError(null);
    setErrorType(null);
    setTransactionResult(null);

    try {
      const result = await api.checkTransaction(txHashInput.trim(), apiKey || undefined);
      setTransactionResult(result);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.isAuthError) {
          setErrorType('auth');
        } else if (err.isRateLimitError) {
          setErrorType('rateLimit');
        } else if (err.statusCode === 500) {
          setErrorType('server');
        } else {
          setErrorType('general');
        }
      } else {
        setError('An unexpected error occurred');
        setErrorType('general');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.dashboard}>
      <div className={styles.card}>
        <Tabs
          tabs={[
            { id: 'address', label: 'Address Check' },
            { id: 'transaction', label: 'Transaction Check' },
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        >
          {activeTab === 'address' && (
            <div className={styles.tabPanel}>
              <div className={styles.form}>
                <label htmlFor="address-input" className={styles.label}>
                  TRON Address
                </label>
                <div className={styles.inputGroup}>
                  <input
                    id="address-input"
                    type="text"
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value)}
                    placeholder="TExample1234567890123456789012345678"
                    className={styles.input}
                    disabled={loading}
                  />
                  <button
                    onClick={handleAddressCheck}
                    disabled={loading}
                    className={styles.button}
                  >
                    Check address
                  </button>
                </div>
              </div>

              {error && (
                <div className={`${styles.error} ${errorType ? styles[errorType] : ''}`}>
                  {error}
                </div>
              )}

              {loading && <Loader />}

              {addressResult && (
                <ResultCard title="Analysis Result">
                  <div className={styles.resultGrid}>
                    {addressResult.address && (
                      <div className={styles.resultItem}>
                        <span className={styles.label}>Address</span>
                        <div className={styles.addressRow}>
                          <code className={styles.address}>
                            {addressResult.address}
                          </code>
                          <CopyButton text={addressResult.address} />
                        </div>
                      </div>
                    )}
                    <div className={styles.resultItem}>
                      <span className={styles.label}>Risk Score</span>
                      <span className={styles.value}>{addressResult.riskScore}</span>
                    </div>
                    <div className={styles.resultItem}>
                      <span className={styles.label}>Risk Level</span>
                      <RiskBadge level={toUppercaseRiskLevel(addressResult.riskLevel)} />
                    </div>
                    {addressResult.flags.length > 0 && (
                      <div className={styles.resultItem}>
                        <span className={styles.label}>Flags</span>
                        <div className={styles.flags}>
                          {addressResult.flags.map((flag, idx) => (
                            <span key={idx} className={styles.flag}>
                              {flag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {addressResult.metadata.addressAgeDays !== null && addressResult.metadata.addressAgeDays !== undefined && (
                      <div className={styles.resultItem}>
                        <span className={styles.label}>Address Age</span>
                        <span className={styles.value}>
                          {addressResult.metadata.addressAgeDays} days
                        </span>
                      </div>
                    )}
                    {addressResult.metadata.isBlacklisted && (
                      <div className={styles.resultItem}>
                        <span className={styles.label}>Blacklist Status</span>
                        <span className={styles.warning}>
                          Blacklisted
                        </span>
                      </div>
                    )}
                    {addressResult.metadata.sourceBreakdown && (
                      <div className={styles.sourceBreakdown}>
                        <span className={styles.sourceBreakdownTitle}>
                          Sources of funds
                        </span>
                        <div className={styles.sourceBreakdownGrid}>
                          <div className={styles.sourceCategory}>
                            <div className={styles.sourceCategoryHeader}>
                              <span className={styles.sourceCategoryIcon} aria-hidden>✓</span>
                              <span>Trusted sources</span>
                            </div>
                            <ul className={styles.sourceList}>
                              {Object.entries(addressResult.metadata.sourceBreakdown.trusted).map(([name, pct]) => (
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
                              {Object.entries(addressResult.metadata.sourceBreakdown.suspicious).map(([name, pct]) => (
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
                              {Object.entries(addressResult.metadata.sourceBreakdown.dangerous).map(([name, pct]) => (
                                <li key={name} className={styles.sourceRow}>
                                  <span>{name}</span>
                                  <span>{pct.toFixed(2)}%</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </ResultCard>
              )}

              {!loading && !addressResult && !error && (
                <div className={styles.emptyState}>
                  Enter a TRON address to check for AML risk
                </div>
              )}
            </div>
          )}

          {activeTab === 'transaction' && (
            <div className={styles.tabPanel}>
              <div className={styles.form}>
                <label htmlFor="txhash-input" className={styles.label}>
                  Transaction Hash
                </label>
                <div className={styles.inputGroup}>
                  <input
                    id="txhash-input"
                    type="text"
                    value={txHashInput}
                    onChange={(e) => setTxHashInput(e.target.value)}
                    placeholder="abc123def456..."
                    className={styles.input}
                    disabled={loading}
                  />
                  <button
                    onClick={handleTransactionCheck}
                    disabled={loading}
                    className={styles.button}
                  >
                    Check transaction
                  </button>
                </div>
              </div>

              {error && (
                <div className={`${styles.error} ${errorType ? styles[errorType] : ''}`}>
                  {error}
                </div>
              )}

              {loading && <Loader />}

              {transactionResult && (
                <ResultCard title="Analysis Result">
                  <div className={styles.resultGrid}>
                    {transactionResult.details.txHash && (
                      <div className={styles.resultItem}>
                        <span className={styles.label}>Transaction Hash</span>
                        <div className={styles.addressRow}>
                          <code className={styles.address}>
                            {transactionResult.details.txHash}
                          </code>
                          <CopyButton text={transactionResult.details.txHash} />
                        </div>
                      </div>
                    )}
                    <div className={styles.resultItem}>
                      <span className={styles.label}>Risk Score</span>
                      <span className={styles.value}>
                        {transactionResult.riskScore}
                      </span>
                    </div>
                    <div className={styles.resultItem}>
                      <span className={styles.label}>Risk Level</span>
                      <RiskBadge level={toUppercaseRiskLevel(transactionResult.riskLevel)} />
                    </div>
                    {transactionResult.flags.length > 0 && (
                      <div className={styles.resultItem}>
                        <span className={styles.label}>Flags</span>
                        <div className={styles.flags}>
                          {transactionResult.flags.map((flag, idx) => (
                            <span key={idx} className={styles.flag}>
                              {flag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {transactionResult.details.transferData && (
                      <>
                        <div className={styles.resultItem}>
                          <span className={styles.label}>From</span>
                          <div className={styles.addressRow}>
                            <code className={styles.address}>
                              {transactionResult.details.transferData.from}
                            </code>
                            <CopyButton
                              text={transactionResult.details.transferData.from}
                            />
                          </div>
                        </div>
                        <div className={styles.resultItem}>
                          <span className={styles.label}>To</span>
                          <div className={styles.addressRow}>
                            <code className={styles.address}>
                              {transactionResult.details.transferData.to}
                            </code>
                            <CopyButton
                              text={transactionResult.details.transferData.to}
                            />
                          </div>
                        </div>
                        <div className={styles.resultItem}>
                          <span className={styles.label}>Amount</span>
                          <span className={styles.value}>
                            {transactionResult.details.transferData.amount}{' '}
                            {transactionResult.details.transferData.tokenSymbol ||
                              'TRC-20'}
                          </span>
                        </div>
                      </>
                    )}
                    {transactionResult.details.tainting?.isTainted && (
                      <div className={styles.resultItem}>
                        <span className={styles.label}>1-Hop Taint</span>
                        <span className={styles.warning}>
                          Tainted from:{' '}
                          {transactionResult.details.tainting.taintedFromAddress || 'Unknown'}
                        </span>
                      </div>
                    )}
                    {transactionResult.details.sender && (
                      <div className={styles.resultItem}>
                        <span className={styles.label}>Sender Risk</span>
                        <RiskBadge
                          level={
                            transactionResult.details.sender.riskScore >= 80
                              ? 'CRITICAL'
                              : transactionResult.details.sender.riskScore >= 50
                              ? 'HIGH'
                              : transactionResult.details.sender.riskScore >= 25
                              ? 'MEDIUM'
                              : 'LOW'
                          }
                        />
                      </div>
                    )}
                    {transactionResult.details.receiver && (
                      <div className={styles.resultItem}>
                        <span className={styles.label}>Receiver Risk</span>
                        <RiskBadge
                          level={
                            transactionResult.details.receiver.riskScore >= 80
                              ? 'CRITICAL'
                              : transactionResult.details.receiver.riskScore >= 50
                              ? 'HIGH'
                              : transactionResult.details.receiver.riskScore >= 25
                              ? 'MEDIUM'
                              : 'LOW'
                          }
                        />
                      </div>
                    )}
                    {transactionResult.details.timestamp && (
                      <div className={styles.resultItem}>
                        <span className={styles.label}>Timestamp</span>
                        <span className={styles.value}>
                          {new Date(transactionResult.details.timestamp).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                </ResultCard>
              )}

              {!loading && !transactionResult && !error && (
                <div className={styles.emptyState}>
                  Enter a transaction hash to check for AML risk
                </div>
              )}
            </div>
          )}
        </Tabs>
      </div>
    </div>
  );
}

