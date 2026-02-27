'use client';

import styles from './CheckForm.module.css';

interface CheckFormProps {
  label: string;
  inputId: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  buttonLabel: string;
  onSubmit: () => void;
  disabled?: boolean;
}

export default function CheckForm({
  label,
  inputId,
  placeholder,
  value,
  onChange,
  buttonLabel,
  onSubmit,
  disabled = false,
}: CheckFormProps) {
  return (
    <div className={styles.form}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      <div className={styles.inputGroup}>
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={styles.input}
          disabled={disabled}
        />
        <button
          onClick={onSubmit}
          disabled={disabled}
          className={styles.button}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
