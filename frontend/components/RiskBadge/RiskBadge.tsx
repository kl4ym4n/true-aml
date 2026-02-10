import type { RiskLevel, RiskLevelUppercase } from '@/lib/types';
import styles from './RiskBadge.module.css';

interface RiskBadgeProps {
  level: RiskLevel | RiskLevelUppercase;
}

export default function RiskBadge({ level }: RiskBadgeProps) {
  const normalizedLevel = typeof level === 'string' ? level.toLowerCase() : level;
  return (
    <span className={`${styles.badge} ${styles[normalizedLevel]}`}>
      {typeof level === 'string' ? level.toUpperCase() : level}
    </span>
  );
}

