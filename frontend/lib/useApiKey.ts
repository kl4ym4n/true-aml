'use client';

import { useState, useEffect, useCallback } from 'react';

const API_KEY_STORAGE_KEY = 'aml_api_key';

export function useApiKey() {
  const [apiKey, setApiKeyState] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);

  // Load API key from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(API_KEY_STORAGE_KEY);
      if (stored) {
        setApiKeyState(stored);
      }
      setIsLoaded(true);
    }
  }, []);

  // Save API key to localStorage
  const setApiKey = useCallback((key: string) => {
    setApiKeyState(key);
    if (typeof window !== 'undefined') {
      if (key) {
        localStorage.setItem(API_KEY_STORAGE_KEY, key);
      } else {
        localStorage.removeItem(API_KEY_STORAGE_KEY);
      }
    }
  }, []);

  // Clear API key
  const clearApiKey = useCallback(() => {
    setApiKey('');
  }, [setApiKey]);

  return {
    apiKey,
    setApiKey,
    clearApiKey,
    isLoaded,
  };
}

