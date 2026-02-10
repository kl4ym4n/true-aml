'use client';

import { useState, useEffect } from 'react';
import { useApiKey } from '@/lib/useApiKey';
import styles from './Header.module.css';

export default function Header() {
  const { apiKey, setApiKey, isLoaded } = useApiKey();
  const [localApiKey, setLocalApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Sync local state with hook when loaded
  useEffect(() => {
    if (isLoaded) {
      setLocalApiKey(apiKey);
      setIsEditing(!apiKey);
    }
  }, [apiKey, isLoaded]);

  const handleSave = () => {
    setApiKey(localApiKey.trim());
    setIsEditing(false);
  };

  const handleCancel = () => {
    setLocalApiKey(apiKey);
    setIsEditing(false);
    setShowApiKey(false);
  };

  const handleClear = () => {
    setLocalApiKey('');
    setApiKey('');
    setIsEditing(false);
    setShowApiKey(false);
  };

  if (!isLoaded) {
    return null;
  }

  return (
    <header className={styles.header}>
      <div className={styles.headerContent}>
        <h1 className={styles.logo}>True AML</h1>
        
        <div className={styles.apiKeySection}>
          {!isEditing ? (
            <div className={styles.apiKeyDisplay}>
              <span className={styles.apiKeyLabel}>API Key:</span>
              {apiKey ? (
                <>
                  <span className={styles.apiKeyValue}>
                    {showApiKey ? apiKey : '•'.repeat(Math.min(apiKey.length, 20))}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className={styles.toggleButton}
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showApiKey ? '👁️' : '👁️‍🗨️'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className={styles.editButton}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={handleClear}
                    className={styles.clearButton}
                  >
                    Clear
                  </button>
                </>
              ) : (
                <>
                  <span className={styles.noApiKey}>Not set</span>
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className={styles.addButton}
                  >
                    Add API Key
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className={styles.apiKeyInput}>
              <input
                type={showApiKey ? 'text' : 'password'}
                value={localApiKey}
                onChange={(e) => setLocalApiKey(e.target.value)}
                placeholder="Enter API key"
                className={styles.input}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className={styles.toggleButton}
                aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
              >
                {showApiKey ? '👁️' : '👁️‍🗨️'}
              </button>
              <button
                type="button"
                onClick={handleSave}
                className={styles.saveButton}
                disabled={!localApiKey.trim()}
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className={styles.cancelButton}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

