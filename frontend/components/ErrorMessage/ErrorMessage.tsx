'use client';

import styles from './ErrorMessage.module.css';

type ErrorType = 'auth' | 'rateLimit' | 'server' | 'general' | null;

interface ErrorMessageProps {
  message: string;
  type?: ErrorType;
}

export default function ErrorMessage({ message, type }: ErrorMessageProps) {
  return (
    <div className={`${styles.error} ${type ? styles[type] : ''}`}>
      {message}
    </div>
  );
}
