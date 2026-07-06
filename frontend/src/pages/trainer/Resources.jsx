import { useState, useEffect } from 'react';
import client from '../../api/client';

export default function Resources() {
  const [data, setData] = useState({ items: [], breadcrumb: [] });
  const [loading, setLoading] = useState(true);
  const [folderId, setFolderId] = useState(null);

  function load(parentId) {
    setLoading(true);
    const q = parentId ? `?parent_id=${parentId}` : '';
    client.get(`/resources${q}`).then(r => setData(r.data)).finally(() => setLoading(false));
  }

  useEffect(() => { load(folderId); }, [folderId]);

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
              <span style={{ color: 'var(--text-secondary)' }}>›</span>
              {i < data.breadcrumb.length - 1 ? (
                <button onClick={() => goBack(b.id)} style={{ color: 'var(--primary)', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer' }}>{b.name}</button>
              ) : (
                <span style={{ fontSize: 14, fontWeight: 600 }}>{b.name}</span>
              )}
            </span>
          ))}
        </div>
      )}

      {loading ? <div className="loading">Loading…</div> : data.items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📚</div>
          <p>Nothing here yet</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {data.items.map(item => (
            item.type === 'folder' ? (
              <div key={item.id} className="card" style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => openFolder(item.id)}>
                {item.thumbnail_url
                  ? <img src={item.thumbnail_url} alt={item.name} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 'var(--radius-sm)', marginBottom: 8 }} />
                  : <div style={{ fontSize: 40, marginBottom: 8 }}>📁</div>}
                <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Folder</div>
              </div>
            ) : (
              <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="card" style={{ textAlign: 'center', display: 'block' }}>
                {item.thumbnail_url
                  ? <img src={item.thumbnail_url} alt={item.name} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 'var(--radius-sm)', marginBottom: 8 }} />
                  : <div style={{ fontSize: 40, marginBottom: 8 }}>🔗</div>}
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
