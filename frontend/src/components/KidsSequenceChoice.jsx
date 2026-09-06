import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { getApiErrorMessage } from '../utils/apiError';
import { SparklesIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import KidsLessonGenerator from './KidsLessonGenerator';

// Kids Yoga trainer's two ways to put together a day's session content:
// AI-generated (KidsLessonGenerator, freezes into a KidsYogaLesson) or a
// manually-built Sequence, same as the regular trainer flow. This component
// is only rendered while neither exists yet for the session (see
// SessionDetail.jsx) - once one path is chosen, its content takes over.
export default function KidsSequenceChoice({ session, onFrozen }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState(null); // null | 'ai' | 'manual'
  const [topic, setTopic] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function createManually(e) {
    e.preventDefault();
    if (!topic.trim()) return;
    setCreating(true);
    setError('');
    try {
      const { data } = await client.post('/sequences/kids-yoga', { session_id: session.id, topic: topic.trim() });
      navigate(`/sequences/${data.id}`);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to create sequence'));
      setCreating(false);
    }
  }

  if (mode === 'ai') return <KidsLessonGenerator session={session} onFrozen={onFrozen} />;

  if (mode === 'manual') {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ fontWeight: 700, marginBottom: 12 }}>Create Sequence Manually</p>
        <form onSubmit={createManually}>
          <div className="form-group">
            <label className="label" htmlFor="manual-topic">Topic</label>
            <input
              id="manual-topic"
              className="input"
              placeholder="e.g. Animal Yoga Fun"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              required
            />
          </div>
          {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setMode(null); setError(''); }}>
              Back
            </button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={creating || !topic.trim()}>
              {creating ? 'Creating…' : 'Create & Continue'}
            </button>
          </div>
        </form>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12 }}>
          You'll add poses and details next, on the Sequence page — the same way sequences are built for regular sessions.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <p style={{ fontWeight: 700, marginBottom: 4 }}>Create Today's Kids Yoga Session</p>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
        Choose how you'd like to put together this session's content.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          className="btn btn-primary btn-full"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          onClick={() => setMode('ai')}
        >
          <SparklesIcon style={{ width: 16, height: 16 }} /> Generate with AI
        </button>
        <button
          className="btn btn-outline btn-full"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          onClick={() => setMode('manual')}
        >
          <PencilSquareIcon style={{ width: 16, height: 16 }} /> Create Manually
        </button>
      </div>
    </div>
  );
}
