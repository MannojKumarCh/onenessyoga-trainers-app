import { useEffect, useState } from 'react';
import { CheckCircleIcon, ExclamationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';

export default function Toast({ message, type = 'success', onDismiss }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setExiting(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (exiting) {
      const timer = setTimeout(onDismiss, 300);
      return () => clearTimeout(timer);
    }
  }, [exiting, onDismiss]);

  const isError = type === 'error';
  const Icon = isError ? ExclamationCircleIcon : CheckCircleIcon;
  const bgColor = isError ? '#FEE2E2' : '#DCFCE7';
  const borderColor = isError ? '#FECACA' : '#BBF7D0';
  const iconColor = isError ? '#DC2626' : '#16A34A';
  const textColor = isError ? '#991B1B' : '#166534';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`toast ${exiting ? 'toast-exit' : ''}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', borderRadius: 'var(--radius)',
        background: bgColor, border: `1px solid ${borderColor}`,
        boxShadow: 'var(--shadow-lg)', maxWidth: 400, width: '100%'
      }}
    >
      <Icon style={{ width: 20, height: 20, color: iconColor, flexShrink: 0 }} />
      <span style={{ fontSize: 14, fontWeight: 600, color: textColor, flex: 1 }}>{message}</span>
      <button
        onClick={() => setExiting(true)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: textColor, opacity: 0.6 }}
        aria-label="Dismiss"
      >
        <XMarkIcon style={{ width: 16, height: 16 }} />
      </button>
    </div>
  );
}
