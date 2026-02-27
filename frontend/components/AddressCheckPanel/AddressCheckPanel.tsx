'use client';

import { useState } from 'react';
import CheckForm from '@/components/CheckForm/CheckForm';
import ErrorMessage from '@/components/ErrorMessage/ErrorMessage';
import Loader from '@/components/Loader/Loader';
import AddressResultCard from '@/components/AddressResultCard/AddressResultCard';
import { api, ApiError } from '@/lib/api';
import { useApiKey } from '@/lib/useApiKey';
import type { AddressCheckResponse } from '@/lib/types';
import styles from './AddressCheckPanel.module.css';

type ErrorType = 'auth' | 'rateLimit' | 'server' | 'general' | null;

export default function AddressCheckPanel() {
  const { apiKey } = useApiKey();
  const [addressInput, setAddressInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<ErrorType>(null);
  const [addressResult, setAddressResult] = useState<AddressCheckResponse | null>(null);

  const handleSubmit = async () => {
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
        label="TRON Address"
        inputId="address-input"
        placeholder="TExample1234567890123456789012345678"
        value={addressInput}
        onChange={setAddressInput}
        buttonLabel="Check address"
        onSubmit={handleSubmit}
        disabled={loading}
      />
      {error && <ErrorMessage message={error} type={errorType} />}
      {loading && <Loader />}
      {addressResult && <AddressResultCard result={addressResult} />}
      {!loading && !addressResult && !error && (
        <div className={styles.emptyState}>
          Enter a TRON address to check for AML risk
        </div>
      )}
    </div>
  );
}
