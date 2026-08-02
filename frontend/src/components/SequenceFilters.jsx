import { useState, useEffect } from 'react';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';

export default function SequenceFilters({ trainers, values, onChange, onClear }) {
  const [searchInput, setSearchInput] = useState(values.search);

  useEffect(() => setSearchInput(values.search), [values.search]);

  useEffect(() => {
    if (searchInput === values.search) return;
    const t = setTimeout(() => onChange({ search: searchInput }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const active = Boolean(values.search || values.trainerId || values.from || values.to);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
      <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
        <MagnifyingGlassIcon style={{ width: 16, height: 16, position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
        <input
          type="text"
          className="input"
          style={{ paddingLeft: 36 }}
          placeholder="Search by sequence name…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          aria-label="Search sequences by name"
        />
      </div>

      <select
        className="input"
        style={{ flex: '1 1 140px', minWidth: 130, width: 'auto' }}
        value={values.trainerId}
        onChange={e => onChange({ trainerId: e.target.value })}
        aria-label="Filter by trainer"
      >
        <option value="">All Trainers</option>
        {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>

      <input
        type="date"
        className="input"
        style={{ flex: '1 1 130px', minWidth: 130, width: 'auto' }}
        value={values.from}
        onChange={e => onChange({ from: e.target.value })}
        aria-label="From date"
      />
      <input
        type="date"
        className="input"
        style={{ flex: '1 1 130px', minWidth: 130, width: 'auto' }}
        value={values.to}
        onChange={e => onChange({ to: e.target.value })}
        aria-label="To date"
      />

      {active && (
        <button
          type="button"
          onClick={() => { setSearchInput(''); onClear(); }}
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px' }}
        >
          <XMarkIcon style={{ width: 14, height: 14 }} /> Clear
        </button>
      )}
    </div>
  );
}
