import { getSessionImageUrl } from '../config/sessionImages';

// Small square thumbnail for a topic/session-type, used in list rows.
// Renders nothing when the topic has no matching image (graceful, most
// free-text session_type values won't match).
export default function SessionThumb({ topic, size = 44 }) {
  const url = getSessionImageUrl(topic);
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      style={{ width: size, height: size, borderRadius: 'var(--radius-sm)', objectFit: 'cover', flexShrink: 0 }}
    />
  );
}
