import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { getApiErrorMessage } from '../../utils/apiError';
import { useToast } from '../../context/ToastContext';
import { SparklesIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

// Narrative Background -> curated Primary Theme options for that background.
// Picking a background narrows the theme list to matching, on-theme stories.
const NARRATIVE_THEMES = {
  'Indian Mythology': [
    'The Journey of Hanuman',
    "Krishna's Playful Adventures",
    "Ganesha's Great Race",
    'The Churning of the Ocean',
    "Rama's Forest Adventure"
  ],
  Nature: [
    'The Magical Garden',
    'Journey Through the Seasons',
    'The Whispering Trees',
    'Sun, Moon & Stars Adventure'
  ],
  Animals: [
    'A Day at the Jungle Safari',
    "The Peacock's Dance",
    'Elephant March to the River',
    'Monkey Business in the Treetops'
  ],
  Forest: [
    'Lost in the Enchanted Forest',
    'The Secret of the Banyan Tree',
    'Forest Friends Rescue Mission'
  ],
  'School Life': [
    'A Day at the Indian Mela',
    'The Great Playground Adventure',
    'Recess Time Yoga Games'
  ],
  'Games/Adventure': [
    'Treasure Hunt Adventure',
    'The Obstacle Course Challenge',
    'Superhero Training Camp'
  ]
};

const NARRATIVE_BACKGROUNDS = Object.keys(NARRATIVE_THEMES);

const AGE_RANGES = ['3-5 years', '5-8 years', '8-10 years', '10-12 years'];

const YOGA_POSES = [
  'Tree Pose', 'Cobra Pose', 'Cat-Cow', 'Butterfly Pose', 'Downward Dog',
  "Child's Pose", 'Warrior Pose', "Lion's Breath", 'Camel Pose', 'Frog Pose',
  'Eagle Pose', 'Star Pose', 'Boat Pose'
];

const RELAXATION_SETTINGS = [
  'Peaceful Forest', 'Starry Night Sky', 'Himalayan Cave',
  'Floating on a Cloud', 'Beach at Sunset', 'Cozy Blanket Fort'
];

const CULTURAL_CONTEXTS = [
  'Diwali', 'Holi', 'Navratri', 'Onam', 'Pongal', 'Ganesh Chaturthi',
  'Raksha Bandhan', 'No Specific Festival', 'North Indian Folk Tales', 'South Indian Folk Tales'
];

const PHASES = [
  { key: 'opening', label: 'Opening (5 mins)' },
  { key: 'warmups', label: 'Warmups (10 mins)' },
  { key: 'narrative_sequence', label: 'The Narrative Sequence (20 mins)' },
  { key: 'closing_shanti', label: 'Closing / Shanti (5 mins)' }
];

const EMPTY_FORM = {
  scheduled_date: '',
  scheduled_time: '16:00',
  narrative_background: '',
  primary_theme: '',
  target_age_range: '',
  specific_yoga_poses: [],
  other_pose: '',
  relaxation_setting: '',
  cultural_context: ''
};

export default function NewKidsSession() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [usage, setUsage] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [freezingIndex, setFreezingIndex] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/kids-yoga/usage').then(r => setUsage(r.data)).catch(() => {});
  }, []);

  function togglePose(pose) {
    setForm(f => ({
      ...f,
      specific_yoga_poses: f.specific_yoga_poses.includes(pose)
        ? f.specific_yoga_poses.filter(p => p !== pose)
        : [...f.specific_yoga_poses, pose]
    }));
  }

  const formComplete = form.scheduled_date && form.scheduled_time && form.narrative_background
    && form.primary_theme && form.target_age_range && form.relaxation_setting && form.cultural_context;

  async function generate() {
    setError('');
    setGenerating(true);
    try {
      const poses = [...form.specific_yoga_poses, ...(form.other_pose.trim() ? [form.other_pose.trim()] : [])].join(', ');
      const { data } = await client.post('/kids-yoga/generate', {
        scheduled_date: form.scheduled_date,
        narrative_background: form.narrative_background,
        primary_theme: form.primary_theme,
        target_age_range: form.target_age_range,
        specific_yoga_poses: poses || undefined,
        relaxation_setting: form.relaxation_setting,
        cultural_context: form.cultural_context
      });
      setDrafts(d => [...d, data]);
      setUsage({ used: data.used, remaining: data.remaining, limit: data.limit });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to generate a lesson'));
    } finally {
      setGenerating(false);
    }
  }

  async function freeze(draft, index) {
    setError('');
    setFreezingIndex(index);
    try {
      const poses = [...form.specific_yoga_poses, ...(form.other_pose.trim() ? [form.other_pose.trim()] : [])].join(', ');
      const { data } = await client.post('/kids-yoga/freeze', {
        scheduled_date: form.scheduled_date,
        scheduled_time: form.scheduled_time,
        narrative_background: form.narrative_background,
        primary_theme: form.primary_theme,
        target_age_range: form.target_age_range,
        specific_yoga_poses: poses || undefined,
        relaxation_setting: form.relaxation_setting,
        cultural_context: form.cultural_context,
        opening: draft.opening,
        warmups: draft.warmups,
        narrative_sequence: draft.narrative_sequence,
        closing_shanti: draft.closing_shanti,
        summary: draft.summary
      });
      showToast('Kids Yoga Session Created');
      navigate(`/sessions/${data.session_id}`);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to freeze this session'));
      setFreezingIndex(null);
    }
  }

  const atCap = usage && usage.remaining <= 0;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">New Kids Yoga Session</h1>
      </div>

      <div className="card" style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="label" htmlFor="kids-date">Date</label>
            <input id="kids-date" className="input" type="date" value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="label" htmlFor="kids-time">Time</label>
            <input id="kids-time" className="input" type="time" value={form.scheduled_time} onChange={e => setForm(f => ({ ...f, scheduled_time: e.target.value }))} />
          </div>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="label" htmlFor="kids-narrative">Narrative Background</label>
          <select
            id="kids-narrative"
            className="input"
            value={form.narrative_background}
            onChange={e => setForm(f => ({ ...f, narrative_background: e.target.value, primary_theme: '' }))}
          >
            <option value="">Select…</option>
            {NARRATIVE_BACKGROUNDS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="label" htmlFor="kids-theme">Primary Theme</label>
          <select
            id="kids-theme"
            className="input"
            value={form.primary_theme}
            onChange={e => setForm(f => ({ ...f, primary_theme: e.target.value }))}
            disabled={!form.narrative_background}
          >
            <option value="">{form.narrative_background ? 'Select…' : 'Choose a Narrative Background first'}</option>
            {(NARRATIVE_THEMES[form.narrative_background] || []).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="label" htmlFor="kids-age">Target Age Range</label>
          <select id="kids-age" className="input" value={form.target_age_range} onChange={e => setForm(f => ({ ...f, target_age_range: e.target.value }))}>
            <option value="">Select…</option>
            {AGE_RANGES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="label">Specific Yoga Poses (Optional)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {YOGA_POSES.map(pose => (
              <button
                type="button"
                key={pose}
                onClick={() => togglePose(pose)}
                className={`btn ${form.specific_yoga_poses.includes(pose) ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '5px 10px', fontSize: 12 }}
              >
                {pose}
              </button>
            ))}
          </div>
          <input
            className="input"
            style={{ marginTop: 8 }}
            placeholder="Other pose(s), comma-separated…"
            value={form.other_pose}
            onChange={e => setForm(f => ({ ...f, other_pose: e.target.value }))}
          />
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="label" htmlFor="kids-relax">Relaxation Setting</label>
          <select id="kids-relax" className="input" value={form.relaxation_setting} onChange={e => setForm(f => ({ ...f, relaxation_setting: e.target.value }))}>
            <option value="">Select…</option>
            {RELAXATION_SETTINGS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="label" htmlFor="kids-culture">Cultural Context</label>
          <select id="kids-culture" className="input" value={form.cultural_context} onChange={e => setForm(f => ({ ...f, cultural_context: e.target.value }))}>
            <option value="">Select…</option>
            {CULTURAL_CONTEXTS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {error && <p className="error-text" style={{ margin: 0 }}>{error}</p>}

        <button
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          onClick={generate}
          disabled={!formComplete || generating || atCap}
        >
          <SparklesIcon style={{ width: 16, height: 16 }} />
          {generating ? 'Generating…' : atCap ? 'Daily Limit Reached' : `Generate${usage ? ` (${usage.remaining} left today)` : ''}`}
        </button>
      </div>

      {drafts.map((draft, i) => (
        <div key={i} className="card" style={{ marginBottom: 16 }}>
          <p style={{ fontWeight: 700, marginBottom: 4 }}>Draft {i + 1}</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, fontStyle: 'italic' }}>{draft.summary}</p>
          {PHASES.map(({ key, label }) => (
            <div key={key} style={{ marginBottom: 12 }}>
              <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{label}</p>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{draft[key]}</p>
            </div>
          ))}
          <button
            className="btn btn-primary btn-full"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            onClick={() => freeze(draft, i)}
            disabled={freezingIndex !== null}
          >
            <CheckCircleIcon style={{ width: 16, height: 16 }} />
            {freezingIndex === i ? 'Freezing…' : 'Freeze This One'}
          </button>
        </div>
      ))}
    </div>
  );
}
