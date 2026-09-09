import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import client from '../../api/client';
import { format } from 'date-fns';
import Modal from '../../components/Modal';
import { getApiErrorMessage } from '../../utils/apiError';
import { ExclamationTriangleIcon, ArrowLeftIcon, PlusIcon, XMarkIcon, ArrowUpIcon } from '@heroicons/react/24/outline';
import usePolling from '../../hooks/usePolling';
import { useRegisterPullRefresh } from '../../hooks/usePullToRefresh';
import { useToast } from '../../context/ToastContext';
import { getSessionImageUrl } from '../../config/sessionImages';
import SequenceItemsView from '../../components/SequenceItemsView';

const EMPTY_ITEM = { name: '', remarks: '', reference_url: '', is_heading: false };
const AUTOSAVE_DELAY_MS = 3000;

// Resizes/compresses a pasted or picked image before it's stored as a data:
// URL (reused as-is by SequenceItemsView/the Sheet export) - keeps the DB
// row and the app payload small instead of storing a multi-MB photo as-is.
function fileToCompressedDataUrl(file, maxDim = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

const sheetHeaderCell = {
  padding: '8px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)',
  background: 'var(--bg)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)'
};

const rowActionBtn = {
  width: 20, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', background: 'none', fontSize: 10, cursor: 'pointer', padding: 0
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
  const [autosaveStatus, setAutosaveStatus] = useState('idle'); // idle | saving | saved
  const [previewImage, setPreviewImage] = useState(null);
  const builderSnapshotRef = useRef(''); // last-loaded/saved items, to skip a no-op autosave right after opening

  const load = useCallback(() => {
    return client.get(`/sequences/${id}`).then(r => {
      setSeq(r.data);
      setLink(r.data.google_sheet_link || '');
    }).catch(() => setLoadError(true));
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useRegisterPullRefresh(load);
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
    setAutosaveStatus('idle');
    const initial = seq.items && seq.items.length > 0
      ? seq.items.map(it => ({ name: it.name, remarks: it.remarks || '', reference_url: it.reference_url || '', is_heading: !!it.is_heading }))
      : [{ ...EMPTY_ITEM }];
    setBuilderItems(initial);
    builderSnapshotRef.current = JSON.stringify(initial);
    setShowBuilder(true);
  }

  function updateBuilderItem(index, field, value) {
    setBuilderItems(items => items.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }

  function toggleBuilderHeading(index) {
    setBuilderItems(items => items.map((item, i) => i === index ? { ...item, is_heading: !item.is_heading } : item));
  }

  function addBuilderRow(is_heading = false) {
    setBuilderItems(items => [...items, { ...EMPTY_ITEM, is_heading }]);
  }

  function insertBuilderRowAbove(index) {
    setBuilderItems(items => [...items.slice(0, index), { ...EMPTY_ITEM }, ...items.slice(index)]);
  }

  function removeBuilderRow(index) {
    setBuilderItems(items => items.length > 1 ? items.filter((_, i) => i !== index) : items);
  }

  async function pickBuilderImage(index, file) {
    if (!file) return;
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      updateBuilderItem(index, 'reference_url', dataUrl);
    } catch {
      setBuilderError('Failed to read that image - try another file.');
    }
  }

  function handleReferencePaste(index, e) {
    const imageItem = [...e.clipboardData.items].find(it => it.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    pickBuilderImage(index, imageItem.getAsFile());
  }

  function isRowFilled(item) {
    return Boolean(item.name.trim() || item.remarks.trim() || item.reference_url.trim());
  }

  const builderHasInvalidRow = builderItems.some(item => isRowFilled(item) && !item.name.trim());
  const builderHasAnyFilledRow = builderItems.some(isRowFilled);
  const builderSubmitDisabled = builderSubmitting || !builderHasAnyFilledRow || builderHasInvalidRow;

  async function saveBuilder(closeAfter) {
    const filteredItems = builderItems
      .filter(isRowFilled)
      .map(item => ({
        name: item.name.trim(),
        is_heading: !!item.is_heading,
        remarks: item.is_heading ? '' : item.remarks.trim(),
        reference_url: item.is_heading ? '' : item.reference_url.trim()
      }));
    setBuilderError('');
    if (closeAfter) setBuilderSubmitting(true); else setAutosaveStatus('saving');
    try {
      await client.post(`/sequences/${id}/build`, { items: filteredItems });
      builderSnapshotRef.current = JSON.stringify(builderItems);
      if (closeAfter) {
        setShowBuilder(false);
        showToast('Sequence Saved Successfully');
      } else {
        setAutosaveStatus('saved');
      }
      load();
    } catch (err) {
      if (closeAfter) setBuilderError(getApiErrorMessage(err, 'Failed to save sequence'));
      else setAutosaveStatus('idle');
    } finally {
      if (closeAfter) setBuilderSubmitting(false);
    }
  }

  async function submitBuilder(e) {
    e.preventDefault();
    if (builderSubmitDisabled) return;
    await saveBuilder(true);
  }

  // Auto-save to the Google Sheet a moment after the trainer stops typing,
  // so "Save Sequence" is a safety net rather than the only way content
  // reaches the Sheet.
  useEffect(() => {
    if (!showBuilder || builderSubmitDisabled) return;
    if (JSON.stringify(builderItems) === builderSnapshotRef.current) return;
    const timer = setTimeout(() => saveBuilder(false), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builderItems, showBuilder]);

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

      {getSessionImageUrl(seq.topic) && (
        <img
          src={getSessionImageUrl(seq.topic)}
          alt=""
          style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 'var(--radius-sm)', marginBottom: 16 }}
        />
      )}
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

      {seq.items && seq.items.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ fontWeight: 700, marginBottom: 12 }}>Sequence Content</p>
          <SequenceItemsView items={seq.items} />
        </div>
      )}

      {msg && <p style={{ textAlign: 'center', color: 'var(--success)', marginBottom: 12, fontWeight: 600 }}>{msg}</p>}

      {isAssigned && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="btn btn-primary btn-full" onClick={openBuilder}>
            {seq.status === 'pending' ? 'Build Sequence' : 'Edit Sequence'}
          </button>
          <button className="btn btn-ghost btn-full" onClick={openUpload}>
            {seq.status === 'pending' ? 'Upload Google Sheet Link' : 'Edit Google Sheet Link'}
          </button>
        </div>
      )}

      {isAssigned && seq.status === 'uploaded' && !seq.notified_team_at && (
        <button className="btn btn-primary btn-full" onClick={notifyTeam} disabled={notifying} style={{ marginTop: 10 }}>
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
        <Modal title="Build Sequence" onClose={() => setShowBuilder(false)} size="lg">
          <form onSubmit={submitBuilder}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
              <span className="label" style={{ marginBottom: 0 }}>Sequence Items</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {autosaveStatus !== 'idle' && (
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {autosaveStatus === 'saving' ? 'Saving…' : 'Saved to Sheet ✓'}
                  </span>
                )}
                <button type="button" className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => addBuilderRow(true)}>
                  + Sub-heading
                </button>
                <button
                  type="button"
                  onClick={() => addBuilderRow(false)}
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
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr 34px', minWidth: 480 }}>
                <div style={sheetHeaderCell}>Exercise</div>
                <div style={sheetHeaderCell}>Remarks</div>
                <div style={sheetHeaderCell}>Reference</div>
                <div style={{ ...sheetHeaderCell, borderRight: 'none' }} />

                {builderItems.map((item, index) => {
                  const isLast = index === builderItems.length - 1;
                  const rowActions = (
                    <div style={{ ...sheetCell(isLast), display: 'flex', borderRight: 'none', flexDirection: 'column', gap: 2, padding: 4 }}>
                      <button type="button" onClick={() => insertBuilderRowAbove(index)} aria-label={`Insert row above ${index + 1}`} title="Insert Row Above" style={rowActionBtn}>
                        <ArrowUpIcon style={{ width: 12, height: 12 }} />
                      </button>
                      <button type="button" onClick={() => toggleBuilderHeading(index)} aria-label={`Toggle heading for row ${index + 1}`} title="Toggle Sub-heading" style={{ ...rowActionBtn, fontWeight: 700, color: item.is_heading ? 'var(--primary)' : 'var(--text-secondary)' }}>
                        H
                      </button>
                      <button
                        type="button"
                        onClick={() => removeBuilderRow(index)}
                        disabled={builderItems.length === 1}
                        aria-label={`Remove row ${index + 1}`}
                        title="Remove Row"
                        style={{ ...rowActionBtn, color: 'var(--danger)', cursor: builderItems.length === 1 ? 'not-allowed' : 'pointer', opacity: builderItems.length === 1 ? 0.4 : 1 }}
                      >
                        <XMarkIcon style={{ width: 12, height: 12 }} />
                      </button>
                    </div>
                  );

                  if (item.is_heading) {
                    return (
                      <div key={index} style={{ display: 'contents' }}>
                        <input
                          aria-label={`Row ${index + 1} sub-heading`}
                          style={{ ...sheetCell(isLast), gridColumn: 'span 3', fontWeight: 700, background: 'var(--bg)' }}
                          type="text"
                          placeholder="Section heading, e.g. Warm-Up"
                          value={item.name}
                          onChange={e => updateBuilderItem(index, 'name', e.target.value)}
                        />
                        {rowActions}
                      </div>
                    );
                  }

                  const isImage = item.reference_url.startsWith('data:image/');
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
                      <div style={{ ...sheetCell(isLast), display: 'flex', alignItems: 'center', gap: 6, padding: isImage ? 6 : 8 }}>
                        {isImage ? (
                          <>
                            <img
                              src={item.reference_url}
                              alt=""
                              onClick={() => setPreviewImage(item.reference_url)}
                              style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, cursor: 'zoom-in' }}
                            />
                            <button type="button" onClick={() => updateBuilderItem(index, 'reference_url', '')} title="Remove Image" style={{ color: 'var(--danger)', fontSize: 11 }}>
                              Remove
                            </button>
                          </>
                        ) : (
                          <>
                            <input
                              aria-label={`Row ${index + 1} reference`}
                              style={{ border: 'none', outline: 'none', fontSize: 13, flex: 1, minWidth: 0, background: 'transparent' }}
                              type="text"
                              placeholder="Link, text, or paste an image"
                              value={item.reference_url}
                              onChange={e => updateBuilderItem(index, 'reference_url', e.target.value)}
                              onPaste={e => handleReferencePaste(index, e)}
                            />
                            <label title="Attach Image" style={{ cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>
                              📎
                              <input
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={e => pickBuilderImage(index, e.target.files[0])}
                              />
                            </label>
                          </>
                        )}
                      </div>
                      {rowActions}
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

      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out'
          }}
        >
          <img src={previewImage} alt="" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}
