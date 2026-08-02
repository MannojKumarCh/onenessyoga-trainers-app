import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { format } from 'date-fns';
import { ExclamationTriangleIcon, QueueListIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import SequenceFilters from '../../components/SequenceFilters';
import usePolling from '../../hooks/usePolling';
import { useToast } from '../../context/ToastContext';

export default function Sequences() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [sequences, setSequences] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState('');
  const [trainers, setTrainers] = useState([]);
  const [filters, setFilters] = useState({ search: '', trainerId: '', from: '', to: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const filtersActive = Boolean(filters.search || filters.trainerId || filters.from || filters.to);

  useEffect(() => {
    Promise.all([client.get('/sequences/weeks'), client.get('/users/trainers')]).then(([w, t]) => {
      setWeeks(w.data);
      setTrainers(t.data);
      if (w.data.length > 0) setSelectedWeek(w.data[0]);
      else setLoading(false);
    }).catch(() => { setError(true); setLoading(false); });
  }, []);

  const load = useCallback(() => {
    if (!filtersActive && !selectedWeek) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (filtersActive) {
      if (filters.search) params.set('topic', filters.search);
      if (filters.trainerId) params.set('trainer_id', filters.trainerId);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
    } else {
      params.set('week', selectedWeek);
    }
    client.get(`/sequences?${params.toString()}`).then(r => setSequences(r.data)).catch(() => setError(true)).finally(() => setLoading(false));
  }, [selectedWeek, filters, filtersActive]);

  useEffect(() => { load(); }, [load]);
  usePolling(load, 30000);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Sequences</h1>
      </div>

      <SequenceFilters
        trainers={trainers}
        values={filters}
        onChange={patch => setFilters(f => ({ ...f, ...patch }))}
        onClear={() => setFilters({ search: '', trainerId: '', from: '', to: '' })}
      />

      {!filtersActive && weeks.length > 0 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 16 }}>
          {weeks.map(w => (
            <button
              key={w}
              onClick={() => setSelectedWeek(w)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                background: selectedWeek === w ? 'var(--primary)' : 'var(--white)',
                color: selectedWeek === w ? '#fff' : 'var(--text)',
                border: '1.5px solid ' + (selectedWeek === w ? 'var(--primary)' : 'var(--border)'),
                cursor: 'pointer'
              }}
            >
              {format(new Date(w), 'd MMM')}
            </button>
          ))}
        </div>
      )}

      {loading ? <div className="loading">Loading…</div> : error ? (
        <div className="empty-state"><div style={{ display: 'flex', justifyContent: 'center' }}><ExclamationTriangleIcon style={{ width: 48, height: 48, color: 'var(--text-secondary)' }} /></div><p>Couldn't load sequences. Please try again.</p></div>
      ) : sequences.length === 0 ? (
        <div className="empty-state">
          <div style={{ display: 'flex', justifyContent: 'center' }}><QueueListIcon style={{ width: 48, height: 48, color: 'var(--text-secondary)' }} /></div>
          <p>{filtersActive ? 'No sequences match your filters' : 'No sequences for this week'}</p>
        </div>
      ) : sequences.map(seq => (
        <div key={seq.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => navigate(`/sequences/${seq.id}`)}>
          <div className="list-item-left">
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase' }}>{seq.status}</span>
            <div className="list-item-title">{seq.topic}</div>
            <div className="list-item-sub">{format(new Date(seq.scheduled_date), 'EEE, d MMM')} · {seq.trainer_name}</div>
          </div>
          <ChevronRightIcon style={{ width: 16, height: 16 }} />
        </div>
      ))}
    </div>
  );
}
