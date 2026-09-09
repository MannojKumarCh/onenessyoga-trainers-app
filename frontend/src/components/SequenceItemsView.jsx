import { useState } from 'react';

function isLikelyUrl(value) {
  return /^https?:\/\//i.test(value.trim());
}

function isImageData(value) {
  return value.startsWith('data:image/');
}

function truncateUrl(value, max = 40) {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

// Read-only rendering of a sequence's item list - shared by SessionDetail
// (a session's linked sequence) and SequenceDetail (the sequence itself), so
// heading rows and pasted-image thumbnails render identically everywhere.
export default function SequenceItemsView({ items }) {
  const [lightbox, setLightbox] = useState(null);

  if (!items || items.length === 0) return null;

  // Numbering skips heading rows and keeps counting across them, rather than
  // resetting per section.
  let number = 0;

  return (
    <>
      {items.map((item, i) => item.is_heading ? (
        <div key={item.id} style={{ padding: '10px 0 6px', fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>
          {item.name}
        </div>
      ) : (
        <div
          key={item.id}
          style={{ padding: '10px 0', borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none' }}
        >
          <div style={{ fontWeight: 600, fontSize: 14 }}>{++number}. {item.name}</div>
          {item.remarks && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{item.remarks}</div>
          )}
          {item.reference_url && (
            isImageData(item.reference_url) ? (
              <img
                src={item.reference_url}
                alt=""
                onClick={() => setLightbox(item.reference_url)}
                style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, marginTop: 6, cursor: 'zoom-in', border: '1px solid var(--border)' }}
              />
            ) : isLikelyUrl(item.reference_url) ? (
              <a
                href={item.reference_url}
                target="_blank"
                rel="noreferrer"
                title={item.reference_url}
                style={{ fontSize: 12, wordBreak: 'break-all', display: 'inline-block', marginTop: 2 }}
              >
                {truncateUrl(item.reference_url)}
              </a>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', wordBreak: 'break-word', marginTop: 2 }}>
                Reference: {item.reference_url}
              </div>
            )
          )}
        </div>
      ))}

      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out'
          }}
        >
          <img src={lightbox} alt="" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
        </div>
      )}
    </>
  );
}
