import { useEffect, useRef } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export default function Modal({ title, onClose, children, size }) {
  const dialogRef = useRef(null);
  const triggerRef = useRef(document.activeElement);

  useEffect(() => {
    dialogRef.current?.querySelector('input, textarea, select, button')?.focus();
    const trigger = triggerRef.current;
    return () => trigger?.focus?.();
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll('input, textarea, select, button, a[href]');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal${size === 'lg' ? ' modal--lg' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={dialogRef} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              padding: 4, color: 'var(--text-secondary)', display: 'flex',
              borderRadius: 'var(--radius-xs)', transition: 'all 0.15s'
            }}
          >
            <XMarkIcon style={{ width: 20, height: 20 }} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
