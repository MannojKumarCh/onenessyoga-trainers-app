import { useState, useEffect, useCallback } from 'react';
import client from '../../api/client';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { getApiErrorMessage } from '../../utils/apiError';
import { ExclamationTriangleIcon, FolderIcon, LinkIcon, ChevronRightIcon, PlusIcon } from '@heroicons/react/24/outline';
import usePolling from '../../hooks/usePolling';
import { useToast } from '../../context/ToastContext';

export default function AdminResources() {
  const [data, setData] = useState({ items: [], breadcrumb: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [folderId, setFolderId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'folder', url: '', thumbnail_url: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState(null);

  const { showToast } = useToast();

  const load = useCallback((parentId) => {
    setLoading(true);
    setLoadError(false);
    const q = parentId ? `?parent_id=${parentId}` : '';
    client.get(`/resources${q}`).then(r => setData(r.data)).catch(() => setLoadError(true)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(folderId); }, [folderId, load]);

  const pollLoad = useCallback(() => {
    const q = folderId ? `?parent_id=${folderId}` : '';
    client.get(`/resources${q}`).then(r => setData(r.data));
  }, [folderId]);

  usePolling(pollLoad, 30000);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await client.post('/resources', { ...form, parent_id: folderId });
      showToast('Resource Added Successfully');
      setShowForm(false);
      setForm({ name: '', type: 'folder', url: '', thumbnail_url: '' });
      load(folderId);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteItem(id) {
    setDeleteId(null);
    setError('');
    try {
      await client.delete(`/resources/${id}`);
      showToast('Resource Deleted');
      load(folderId);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to delete item'));
    }
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="page-title">Resources</h1>
        <button className="btn btn-primary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowForm(true)}><PlusIcon style={{ width: 16, height: 16 }} /> Add Resource</button>
      </div>

      {error && !showForm && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}

      {data.breadcrumb.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={() => setFolderId(null)} style={{ color: 'var(--primary)', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer' }}>Home</button>
          {data.breadcrumb.map((b, i) => (
            <span key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}><ChevronRightIcon style={{ width: 14, height: 14 }} /></span>
              {i < data.breadcrumb.length - 1
                ? <button onClick={() => setFolderId(b.id)} style={{ color: 'var(--primary)', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer' }}>{b.name}</button>
                : <span style={{ fontSize: 14, fontWeight: 600 }}>{b.name}</span>}
            </span>
          ))}
        </div>
      )}

      {loading ? <div className="loading">Loading…</div> : loadError ? (
        <div className="empty-state"><div className="empty-state-icon"><ExclamationTriangleIcon style={{ width: 20, height: 20 }} /></div><p>Couldn't load resources. Please try again.</p></div>
      ) : data.items.length === 0 ? (
        <div className="empty-state"><div style={{ display: 'flex', justifyContent: 'center', margin: '0 auto 12px' }}><FolderIcon style={{ width: 48, height: 48, color: 'var(--text-secondary)' }} /></div><p>Empty folder</p></div>
      ) : data.items.map(item => (
        <div key={item.id} className="list-item" style={{ cursor: item.type === 'folder' ? 'pointer' : 'default' }}
          onClick={() => item.type === 'folder' && setFolderId(item.id)}>
          <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>{item.type === 'folder' ? <FolderIcon style={{ width: 24, height: 24 }} /> : <LinkIcon style={{ width: 24, height: 24 }} />}</span>
          <div className="list-item-left" style={{ minWidth: 0 }}>
            <div className="list-item-title">{item.name}</div>
            {item.type === 'folder' ? (
              <div className="list-item-sub">Folder</div>
            ) : (
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                onClick={e => e.stopPropagation()}
                className="list-item-sub"
                style={{ display: 'block', wordBreak: 'break-all', color: 'var(--primary)' }}
              >
                {item.url}
              </a>
            )}
          </div>
          <button onClick={(e) => { e.stopPropagation(); setDeleteId(item.id); }} style={{ color: 'var(--danger)', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
        </div>
      ))}

      {showForm && (
        <Modal title="Add Item" onClose={() => setShowForm(false)}>
            <form onSubmit={submit}>
              <div className="form-group">
                <label className="label" htmlFor="resource-type">Type</label>
                <select id="resource-type" className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="folder">Folder</option>
                  <option value="link">Link</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label" htmlFor="resource-name">Name</label>
                <input id="resource-name" className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              {form.type === 'link' && (
                <div className="form-group">
                  <label className="label" htmlFor="resource-url">URL</label>
                  <input id="resource-url" className="input" type="url" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} required placeholder="https://…" />
                </div>
              )}
              <div className="form-group">
                <label className="label" htmlFor="resource-thumb">Thumbnail URL (Optional)</label>
                <input id="resource-thumb" className="input" type="url" value={form.thumbnail_url} onChange={e => setForm(f => ({ ...f, thumbnail_url: e.target.value }))} placeholder="https://…" />
              </div>
              {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>
                  {submitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {deleteId != null && (
        <ConfirmDialog
          title="Delete Item"
          message="Delete this item? Subfolders will also be deleted."
          confirmLabel="Delete"
          danger
          onCancel={() => setDeleteId(null)}
          onConfirm={() => deleteItem(deleteId)}
        />
      )}
    </div>
  );
}
