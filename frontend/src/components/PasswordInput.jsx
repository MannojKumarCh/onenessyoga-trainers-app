import { useState } from 'react';

export default function PasswordInput({ id, value, onChange, ...rest }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        className="input"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        style={{ paddingRight: 44 }}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        style={{
          position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', fontSize: 18,
          padding: 8, lineHeight: 1, color: 'var(--text-secondary)'
        }}
      >
        {show ? '🙈' : '👁️'}
      </button>
    </div>
  );
}
