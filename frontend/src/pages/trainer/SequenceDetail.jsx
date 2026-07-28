import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import client from '../../api/client';
import { format } from 'date-fns';
import Modal from '../../components/Modal';
import { getApiErrorMessage } from '../../utils/apiError';
import { ExclamationTriangleIcon, ArrowLeftIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import usePolling from '../../hooks/usePolling';
import { useToast } from '../../context/ToastContext';

const EMPTY_ITEM = { name: '', remarks: '', reference_url: '' };

const sheetHeaderCell = {
  padding: '8px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)',
  background: 'var(--bg)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)'
};

function sheetCell(isLastRow, isButton) {
  return {
    border: 'none', borderRight: '1px solid var(--border)',
    borderBottom: isLastRow ? 'none' : '1px solid var(--border)',
    borderRadius: 0, padding: '8px', fontSize: 13, background: 'var(--white)', outline: 'none',
    ...(isButton
      ? { display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', fontSize: 16, fontWeight: 700 }
      : {})
  };
}

export default function SequenceDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [seq, setSeq] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [link, setLink] = useState('');
  const [uploading, setUploading] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [msg, setMsg] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [showBuilder, setShowBuilder] = useState(false);
  const [builderItems, setBuilderItems] = useState([{ ...EMPTY_ITEM }]);
  const [builderSubmitting, setBuilderSubmitting] = useState(false);
  const [builderError, setBuilderError] = useState('');

  const load = useCallback(() => {
    client.get(`/sequences/${id}`).then(r => {
      setSeq(r.data);
      setLink(r.data.google_sheet_link || '');
    }).catch(() => setLoadError(true));
  }, [id]);

  useEffect(() => { load(); }, [load]);
  usePolling(load, 30000);

  function openUpload() {
    setUploadError('');
    setShowUpload(true);
  }

  async function upload(e) {
    e.preventDefault();
    if (!link.trim()) return;
    setUploading(true);
    try {
      await client.patch(`/sequences/${id}/upload`, { google_sheet_link: link.trim() });
      setShowUpload(false);
      showToast('Google Sheet Uploaded');
      load();
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function openBuilder() {
    setBuilderError('');
    setBuilderItems([{ ...EMPTY_ITEM }]);
    setShowBuilder(true);
  }

  function updateBuilderItem(index, field, value) {
    setBuilderItems(items => items.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }

  function addBuilderRow() {
    setBuilderItems(items => [...items, { ...EMPTY_ITEM }]);
  }

  function removeBuilderRow(index) {
    setBuilderItems(items => items.length > 1 ? items.filter((_, i) => i !== index) : items);
  }

  function isRowFilled(item) {
    return Boolean(item.name.trim() || item.remarks.trim() || item.reference_url.trim());
  }

  const builderHasInvalidRow = builderItems.some(item => isRowFilled(item) && !item.name.trim());
  const builderHasAnyFilledRow = builderItems.some(isRowFilled);
  const builderSubmitDisabled = builderSubmitting || !builderHasAnyFilledRow || builderHasInvalidRow;

  async function submitBuilder(e) {
    e.preventDefault();
    if (builderSubmitDisabled) return;
    const filteredItems = builderItems
      .filter(isRowFilled)
      .map(item => ({ name: item.name.trim(), remarks: item.remarks.trim(), reference_url: item.reference_url.trim() }));
    setBuilderSubmitting(true);
    setBuilderError('');
    try {
      await client.post(`/sequences/${id}/build`, { items: filteredItems });
      setShowBuilder(false);
      showToast('Sequence Saved Successfully');
      load();
    } catch (err) {
      setBuilderError(getApiErrorMessage(err, 'Failed to save sequence'));
    } finally {
      setBuilderSubmitting(false);
    }
  }

  async function notifyTeam() {
    setNotifying(true);
    try {
      await client.post(`/sequences/${id}/notify-team`);
      setMsg('Team notified!');
      showToast('Team Notified');
      load();
    } catch (err) {
      setMsg(err.response?.data?.error || 'Failed to notify');
    } finally {
      setNotifying(false);
    }
  }

  const isAssigned = String(seq?.assigned_trainer_id) === String(user?.id);

  if (loadError) return <div className="empty-state"><div style={{ display: 'flex', justifyContent: 'center' }}><ExclamationTriangleIcon style={{ width: 48, height: 48, color: 'var(--text-secondary)' }} /></div><p>Couldn't load this sequence. Please try again.</p></div>;
  if (!seq) return <div className="loading">Loading…</div>;

  return (
    <div className="page">
      <button onClick={() => navigate(-1)} style={{ color: 'var(--primary)', marginBottom: 16, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
        <ArrowLeftIcon style={{ width: 18, height: 18 }} /> Back
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 700 }}>{seq.topic}</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>{format(new Date(seq.scheduled_date), 'EEEE, d MMMM yyyy')}</p>

      <div className="card" style={{ marginTop: 20, marginBottom: 16 }}>
        {[
          ['Assigned Trainer', seq.trainer_name],
          ['Status', <span className={`badge badge-${seq.status}`}>{seq.status.charAt(0).toUpperCase() + seq.status.slice(1)}</span>],
          seq.google_sheet_link && ['Sheet Link', <a href={seq.google_sheet_link} target="_blank" rel="noreferrer" style={{ fontSize: 13, wordBreak: 'break-all' }}>Open Google Sheet</a>],
        ].filter(Boolean).map(([label, val]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 14, minWidth: 120 }}>{label}</span>
            <span style={{ fontWeight: 500, textAlign: 'right' }}>{val}</span>
          </div>
        ))}
      </div>

      {seq.instructions && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ fontWeight: 700, marginBottom: 8 }}>Instructions</p>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{seq.instructions}</p>
        </div>
      )}

      {msg && <p style={{ textAlign: 'center', color: 'var(--success)', marginBottom: 12, fontWeight: 600 }}>{msg}</p>}

      {isAssigned && seq.status === 'pending' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="btn btn-primary btn-full" onClick={openUpload}>Upload Google Sheet Link</button>
          <button className="btn btn-ghost btn-full" onClick={openBuilder}>Build Sequence</button>
        </div>
      )}

      {isAssigned && seq.status === 'uploaded' && !seq.notified_team_at && (
        <button className="btn btn-primary btn-full" onClick={notifyTeam} disabled={notifying}>
          {notifying ? 'Notifying…' : 'Notify Team'}
        </button>
      )}

      {seq.notified_team_at && (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}>
          Team notified on {format(new Date(seq.notified_team_at), 'd MMM, h:mm a')}
        </div>
      )}

      {showUpload && (
        <Modal title="Upload Sequence" onClose={() => setShowUpload(false)}>
            <form onSubmit={upload}>
              <div className="form-group">
                <label className="label" htmlFor="sheet-link">Google Sheet Link</label>
                <input id="sheet-link" className="input" type="url" placeholder="https://docs.google.com/…" value={link} onChange={e => setLink(e.target.value)} required />
              </div>
              {uploadError && <p className="error-text" style={{ marginBottom: 12 }}>{uploadError}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowUpload(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={uploading}>
                  {uploading ? 'Uploading…' : 'Confirm Upload'}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {showBuilder && (
        <Modal title="Build Sequence" onClose={() => setShowBuilder(false)}>
          <form onSubmit={submitBuilder}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="label" style={{ marginBottom: 0 }}>Sequence Items</span>
              <button
                type="button"
                onClick={addBuilderRow}
                aria-label="Add Row"
                title="Add Row"
                style={{
                  width: 28, height: 28, borderRadius: 6, border: '1px solid var(--primary)',
                  background: 'var(--primary-light)', color: 'var(--primary)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 0
                }}
              >
                <PlusIcon style={{ width: 16, height: 16 }} />
              </button>
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr 30px', minWidth: 460 }}>
                <div style={sheetHeaderCell}>Exercise</div>
                <div style={sheetHeaderCell}>Remarks</div>
                <div style={sheetHeaderCell}>Reference</div>
                <div style={{ ...sheetHeaderCell, borderRight: 'none' }} />

                {builderItems.map((item, index) => {
                  const isLast = index === builderItems.length - 1;
                  return (
                    <div key={index} style={{ display: 'contents' }}>
                      <input
                        aria-label={`Row ${index + 1} exercise name`}
                        style={sheetCell(isLast)}
                        type="text"
                        placeholder="e.g. Opening Prayer"
                        value={item.name}
                        onChange={e => updateBuilderItem(index, 'name', e.target.value)}
                      />
                      <input
                        aria-label={`Row ${index + 1} remarks`}
                        style={sheetCell(isLast)}
                        type="text"
                        placeholder="Optional"
                        value={item.remarks}
                        onChange={e => updateBuilderItem(index, 'remarks', e.target.value)}
                      />
                      <input
                        aria-label={`Row ${index + 1} reference url`}
                        style={sheetCell(isLast)}
                        type="url"
                        placeholder="Optional"
                        value={item.reference_url}
                        onChange={e => updateBuilderItem(index, 'reference_url', e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => removeBuilderRow(index)}
                        disabled={builderItems.length === 1}
                        aria-label={`Remove row ${index + 1}`}
                        title="Remove Row"
                        style={{
                          ...sheetCell(isLast, true), borderRight: 'none', color: 'var(--danger)',
                          cursor: builderItems.length === 1 ? 'not-allowed' : 'pointer',
                          opacity: builderItems.length === 1 ? 0.4 : 1
                        }}
                      >
                        <XMarkIcon style={{ width: 16, height: 16 }} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {builderHasInvalidRow && (
              <p className="error-text" style={{ marginBottom: 12 }}>Each row with any content must have an Exercise Name.</p>
            )}
            {builderError && <p className="error-text" style={{ marginBottom: 12 }}>{builderError}</p>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowBuilder(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={builderSubmitDisabled}>
                {builderSubmitting ? 'Saving…' : 'Save Sequence'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
