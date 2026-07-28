import { useState, useEffect, useCallback } from 'react';
import client from '../../api/client';
import { ExclamationTriangleIcon, BookOpenIcon, FolderIcon, LinkIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import usePolling from '../../hooks/usePolling';
import { useToast } from '../../context/ToastContext';

export default function Resources() {
  const { showToast } = useToast();
  const [data, setData] = useState({ items: [], breadcrumb: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [folderId, setFolderId] = useState(null);

  const load = useCallback((parentId) => {
    setLoading(true);
    setError(false);
    const q = parentId ? `?parent_id=${parentId}` : '';
    client.get(`/resources${q}`).then(r => setData(r.data)).catch(() => setError(true)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(folderId); }, [folderId, load]);

  const pollLoad = useCallback(() => {
    client.get(`/resources${folderId ? `?parent_id=${folderId}` : ''}`).then(r => setData(r.data));
  }, [folderId]);

  usePolling(pollLoad, 30000);

  function openFolder(id) { setFolderId(id); }
  function goBack(id) { setFolderId(id || null); }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Resources</h1>
      </div>

      {/* Breadcrumb */}
      {data.breadcrumb.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={() => goBack(null)} style={{ color: 'var(--primary)', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer' }}>Home</button>
          {data.breadcrumb.map((b, i) => (
            <span key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ChevronRightIcon style={{ width: 14, height: 14, color: 'var(--text-secondary)' }} />
              {i < data.breadcrumb.length - 1 ? (
                <button onClick={() => goBack(b.id)} style={{ color: 'var(--primary)', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer' }}>{b.name}</button>
              ) : (
                <span style={{ fontSize: 14, fontWeight: 600 }}>{b.name}</span>
              )}
            </span>
          ))}
        </div>
      )}

      {loading ? <div className="loading">Loading…</div> : error ? (
        <div className="empty-state"><div style={{ display: 'flex', justifyContent: 'center' }}><ExclamationTriangleIcon style={{ width: 48, height: 48, color: 'var(--text-secondary)' }} /></div><p>Couldn't load resources. Please try again.</p></div>
      ) : data.items.length === 0 ? (
        <div className="empty-state">
          <div style={{ display: 'flex', justifyContent: 'center' }}><BookOpenIcon style={{ width: 48, height: 48, color: 'var(--text-secondary)' }} /></div>
          <p>Nothing Here Yet</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          {data.items.map(item => (
            item.type === 'folder' ? (
              <div key={item.id} className="card" style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => openFolder(item.id)}>
                {item.thumbnail_url
                  ? <img src={item.thumbnail_url} alt={item.name} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 'var(--radius-sm)', marginBottom: 8 }} />
                  : <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><FolderIcon style={{ width: 40, height: 40, color: 'var(--text-secondary)' }} /></div>}
                <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Folder</div>
              </div>
            ) : (
              <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="card" style={{ textAlign: 'center', display: 'block' }}>
                {item.thumbnail_url
                  ? <img src={item.thumbnail_url} alt={item.name} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 'var(--radius-sm)', marginBottom: 8 }} />
                  : <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><LinkIcon style={{ width: 40, height: 40, color: 'var(--text-secondary)' }} /></div>}
                <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                <div style={{ fontSize: 12, color: 'var(--primary)' }}>Open Link</div>
              </a>
            )
          ))}
        </div>
      )}
    </div>
  );
}
