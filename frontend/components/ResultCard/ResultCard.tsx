import { ReactNode } from 'react';
import styles from './ResultCard.module.css';

interface ResultCardProps {
  title?: string;
  children: ReactNode;
}

export default function ResultCard({ title, children }: ResultCardProps) {
  return (
    <div className={styles.card}>
      {title && <h3 className={styles.title}>{title}</h3>}
      <div className={styles.content}>{children}</div>
    </div>
  );
}

