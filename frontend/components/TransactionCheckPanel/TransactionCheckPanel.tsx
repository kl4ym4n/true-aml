'use client';

import { useState } from 'react';
import CheckForm from '@/components/CheckForm/CheckForm';
import ErrorMessage from '@/components/ErrorMessage/ErrorMessage';
import Loader from '@/components/Loader/Loader';
import TransactionResultCard from '@/components/TransactionResultCard/TransactionResultCard';
import { api, ApiError } from '@/lib/api';
import { useApiKey } from '@/lib/useApiKey';
import type { TransactionCheckResponse } from '@/lib/types';
import styles from './TransactionCheckPanel.module.css';

type ErrorType = 'auth' | 'rateLimit' | 'server' | 'general' | null;

export default function TransactionCheckPanel() {
  const { apiKey } = useApiKey();
  const [txHashInput, setTxHashInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<ErrorType>(null);
  const [transactionResult, setTransactionResult] =
    useState<TransactionCheckResponse | null>(null);

  const handleSubmit = async () => {
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
        if (err.isAuthError) setErrorType('auth');
        else if (err.isRateLimitError) setErrorType('rateLimit');
        else if (err.statusCode === 500) setErrorType('server');
        else setErrorType('general');
      } else {
        setError('An unexpected error occurred');
        setErrorType('general');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.panel}>
      <CheckForm
        label="Transaction Hash"
        inputId="txhash-input"
        placeholder="abc123def456..."
        value={txHashInput}
        onChange={setTxHashInput}
        buttonLabel="Check transaction"
        onSubmit={handleSubmit}
        disabled={loading}
      />
      {error && <ErrorMessage message={error} type={errorType} />}
      {loading && <Loader />}
      {transactionResult && <TransactionResultCard result={transactionResult} />}
      {!loading && !transactionResult && !error && (
        <div className={styles.emptyState}>
          Enter a transaction hash to check for AML risk
        </div>
      )}
    </div>
  );
}
