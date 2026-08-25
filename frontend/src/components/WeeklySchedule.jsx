import { useState, useEffect, useCallback } from 'react';
import client from '../api/client';
import TopicSelect from './TopicSelect';
import { getApiErrorMessage } from '../utils/apiError';
import { useToast } from '../context/ToastContext';

function TemplateRow({ template, trainers, onSaved }) {
  const [form, setForm] = useState({
    scheduled_time: template.scheduled_time,
    session_type: template.session_type || '',
    dedicated_trainer_id: template.dedicated_trainer_id || '',
    is_active: template.is_active,
    zoom_link: template.zoom_link || ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();

  const dirty = form.scheduled_time !== template.scheduled_time
    || form.session_type !== (template.session_type || '')
    || String(form.dedicated_trainer_id || '') !== String(template.dedicated_trainer_id || '')
    || form.is_active !== template.is_active
    || form.zoom_link !== (template.zoom_link || '');

  async function save() {
    const nextTrainerId = form.dedicated_trainer_id ? Number(form.dedicated_trainer_id) : null;
    if (nextTrainerId && template.dedicated_trainer_id && nextTrainerId !== template.dedicated_trainer_id) {
      const nextName = trainers.find(t => t.id === nextTrainerId)?.name || 'this trainer';
      const confirmed = window.confirm(
        `${template.label} is currently defaulted to ${template.dedicated_trainer_name}. Reassign the default to ${nextName}? This won't change sessions already generated for other trainers.`
      );
      if (!confirmed) return;
    }
    setSaving(true);
    setError('');
    try {
      await client.put(`/session-templates/${template.id}`, {
        scheduled_time: form.scheduled_time,
        session_type: form.session_type,
        dedicated_trainer_id: form.dedicated_trainer_id ? Number(form.dedicated_trainer_id) : null,
        is_active: form.is_active,
        zoom_link: form.zoom_link || null
      });
      showToast('Schedule Slot Updated');
      onSaved();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to save slot'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="list-item" style={{ flexWrap: 'wrap', opacity: form.is_active ? 1 : 0.55 }}>
      <div className="list-item-left" style={{ flex: '1 1 100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 14, minWidth: 70 }}>{template.label}</span>
          <input
            type="time"
            className="input"
            style={{ width: 110 }}
            value={form.scheduled_time}
            onChange={e => setForm(f => ({ ...f, scheduled_time: e.target.value }))}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
            />
            Active
          </label>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 220, flex: 1 }}>
            <TopicSelect value={form.session_type} onChange={v => setForm(f => ({ ...f, session_type: v }))} />
          </div>
          <select
            className="input"
            style={{ minWidth: 180, flex: 1 }}
            value={form.dedicated_trainer_id}
            onChange={e => setForm(f => ({ ...f, dedicated_trainer_id: e.target.value }))}
          >
            <option value="">Unassigned</option>
            {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="url"
            className="input"
            style={{ minWidth: 240, flex: 1 }}
            placeholder="Default Zoom Link for this slot — https://…"
            value={form.zoom_link}
            onChange={e => setForm(f => ({ ...f, zoom_link: e.target.value }))}
          />
          <button
            className="btn btn-primary"
            style={{ padding: '8px 16px', fontSize: 13 }}
            disabled={!dirty || saving}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {error && <p className="error-text" style={{ margin: 0 }}>{error}</p>}
      </div>
    </div>
  );
}

export default function WeeklySchedule({ trainers }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    client.get('/session-templates').then(r => setTemplates(r.data)).catch(() => setLoadError(true)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="loading">Loading…</div>;
  if (loadError) return <p className="error-text">Couldn't load the weekly schedule. Please try again.</p>;

  const weekdaySlots = templates.filter(t => t.weekdays.includes(1));
  const saturdaySlots = templates.filter(t => t.weekdays.includes(6) && !t.weekdays.includes(1));

  return (
    <div>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
        These slots repeat automatically every week — the app keeps the next 14 days of sessions filled in from them. Changing a slot's Zoom Link here updates every upcoming session for that slot, except any session where the link was set individually on the Sessions tab.
      </p>

      <p className="section-title">Monday – Friday</p>
      {weekdaySlots.map(t => (
        <TemplateRow key={t.id} template={t} trainers={trainers} onSaved={load} />
      ))}

      <p className="section-title" style={{ marginTop: 20 }}>Saturday</p>
      {saturdaySlots.map(t => (
        <TemplateRow key={t.id} template={t} trainers={trainers} onSaved={load} />
      ))}
    </div>
  );
}
