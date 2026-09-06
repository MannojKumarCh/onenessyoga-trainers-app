import { useState, useEffect } from 'react';
import client from '../api/client';
import { getApiErrorMessage } from '../utils/apiError';
import { useToast } from '../context/ToastContext';
import { SparklesIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

// Narrative Background -> curated Primary Theme options for that background.
// Picking a background narrows the theme list to matching, on-theme stories.
const NARRATIVE_THEMES = {
  'Indian Mythology': [
    'The Journey of Hanuman',
    "Krishna's Playful Adventures",
    "Ganesha's Great Race",
    'The Churning of the Ocean',
    "Rama's Forest Adventure",
    "Durga's Battle Against Mahishasura"
  ],
  Nature: [
    'The Magical Garden',
    'Journey Through the Seasons',
    'The Whispering Trees',
    'Sun, Moon & Stars Adventure',
    "The River's Long Journey",
    'Rainbow After the Rain'
  ],
  Animals: [
    'A Day at the Jungle Safari',
    "The Peacock's Dance",
    'Elephant March to the River',
    'Monkey Business in the Treetops',
    'The Tortoise and the Hare Race',
    'Lion King of the Jungle'
  ],
  Forest: [
    'Lost in the Enchanted Forest',
    'The Secret of the Banyan Tree',
    'Forest Friends Rescue Mission',
    'The Talking Trees of the Jungle',
    'Fireflies in the Moonlit Woods',
    "The Wise Old Owl's Lesson"
  ],
  'School Life': [
    'A Day at the Indian Mela',
    'The Great Playground Adventure',
    'Recess Time Yoga Games',
    'The School Sports Day Challenge',
    'Show and Tell Adventure',
    'The Class Picnic Surprise'
  ],
  'Games/Adventure': [
    'Treasure Hunt Adventure',
    'The Obstacle Course Challenge',
    'The Relay Race Challenge',
    'The Great Kite Festival Race',
    'Hide and Seek in the Kingdom',
    'The Puzzle Palace Mystery'
  ],
  'Ocean & Underwater': [
    "The Little Fish's Big Journey",
    'Diving with Dolphins',
    "The Mermaid's Coral Kingdom",
    'Treasure of the Sunken Ship',
    "The Octopus's Eight Adventures",
    "Turtle's Race to the Shore"
  ],
  'Space & Galaxy': [
    'Rocket Ride to the Moon',
    'Dancing Among the Stars',
    "The Friendly Alien's Visit",
    'Racing Past the Planets',
    'The Sun and Its Sleepy Planets',
    'Astronaut Training Academy'
  ],
  'Village Life': [
    'A Day at the Village Fair',
    'Helping on the Farm',
    "The Potter's Wheel Adventure",
    'Market Day Adventure',
    'Wishes at the Village Well',
    'Harvest Festival Fun'
  ],
  Superheroes: [
    'Superhero Training Camp',
    'Saving the City with Yoga Powers',
    "The Flying Hero's Mission",
    'Super Strength Squad',
    "The Invisible Hero's Challenge",
    'Team of Super Kids'
  ],
  'Fairy Tales': [
    "The Sleeping Princess's Garden",
    'Jack and the Magic Beanstalk',
    "The Three Little Pigs' Houses",
    "Cinderella's Midnight Adventure",
    "The Frog Prince's Pond",
    'Goldilocks and the Three Bears'
  ],
  'Farm Life': [
    'A Morning on the Farm',
    'The Cow and the Milkmaid',
    'Chasing Chickens in the Yard',
    "The Scarecrow's Secret",
    'Horse Gallop Adventure',
    "The Farmer's Big Harvest"
  ],
  'Circus & Carnival': [
    'Under the Big Top',
    "The Tightrope Walker's Balance",
    'Juggling with the Clowns',
    "The Lion Tamer's Courage",
    'Trapeze Flying Adventure',
    'The Carnival Parade'
  ],
  'Pirates & Treasure Hunt': [
    'Sailing the Seven Seas',
    'The Map to Hidden Treasure',
    'Pirate Ship Balancing Act',
    'Island of the Lost Gold',
    "The Captain's Brave Crew",
    'Battling the Sea Storm'
  ],
  'Music & Dance': [
    'The Rhythm of the Dhol',
    "Dancing Peacock's Melody",
    "The Magic Flute's Journey",
    'Bollywood Dance Adventure',
    'The Singing Birds of the Forest',
    'Drumbeats of the Jungle'
  ]
};

const NARRATIVE_BACKGROUNDS = Object.keys(NARRATIVE_THEMES);

const AGE_RANGES = ['3-5 years', '6-10 years', '11-13 years'];

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
  'Raksha Bandhan', 'North Indian Folk Tales', 'South Indian Folk Tales'
];

const PHASES = [
  { key: 'opening', label: 'Opening (5 mins)' },
  { key: 'warmups', label: 'Warmups (10 mins)' },
  { key: 'narrative_sequence', label: 'The Narrative Sequence (20 mins)' },
  { key: 'closing_shanti', label: 'Closing / Shanti (5 mins)' }
];

const EMPTY_FORM = {
  narrative_background: '',
  primary_theme: '',
  target_age_range: '',
  specific_yoga_poses: [],
  other_pose: '',
  relaxation_setting: '',
  cultural_context: '',
  other_cultural_context: ''
};

// Generates and freezes a Kids Yoga lesson for a specific, already-scheduled
// session (Kids Yoga runs on a recurring daily Weekly Schedule slot - the
// Session itself already exists; this is what fills in that day's content).
export default function KidsLessonGenerator({ session, onFrozen }) {
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

  const formComplete = form.narrative_background && form.primary_theme
    && form.target_age_range && form.relaxation_setting;

  function combinedPoses() {
    return [...form.specific_yoga_poses, ...(form.other_pose.trim() ? [form.other_pose.trim()] : [])].join(', ');
  }

  function effectiveCulturalContext() {
    return form.cultural_context === '__other__' ? form.other_cultural_context.trim() : form.cultural_context;
  }

  async function generate() {
    setError('');
    setGenerating(true);
    try {
      const { data } = await client.post('/kids-yoga/generate', {
        scheduled_date: session.scheduled_date,
        narrative_background: form.narrative_background,
        primary_theme: form.primary_theme,
        target_age_range: form.target_age_range,
        specific_yoga_poses: combinedPoses() || undefined,
        relaxation_setting: form.relaxation_setting,
        cultural_context: effectiveCulturalContext() || undefined
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
      await client.post('/kids-yoga/freeze', {
        session_id: session.id,
        narrative_background: form.narrative_background,
        primary_theme: form.primary_theme,
        target_age_range: form.target_age_range,
        specific_yoga_poses: combinedPoses() || undefined,
        relaxation_setting: form.relaxation_setting,
        cultural_context: effectiveCulturalContext() || undefined,
        opening: draft.opening,
        warmups: draft.warmups,
        narrative_sequence: draft.narrative_sequence,
        closing_shanti: draft.closing_shanti,
        summary: draft.summary
      });
      showToast('Kids Yoga Lesson Saved');
      onFrozen();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to freeze this lesson'));
      setFreezingIndex(null);
    }
  }

  const atCap = usage && usage.remaining <= 0;

  return (
    <div className="card" style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontWeight: 700, margin: 0 }}>Generate Kids Yoga Lesson</p>

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
        <label className="label" htmlFor="kids-culture">Cultural Context (Optional)</label>
        <select id="kids-culture" className="input" value={form.cultural_context} onChange={e => setForm(f => ({ ...f, cultural_context: e.target.value }))}>
          <option value="">None / No specific festival</option>
          {CULTURAL_CONTEXTS.map(c => <option key={c} value={c}>{c}</option>)}
          <option value="__other__">Other (specify)…</option>
        </select>
        {form.cultural_context === '__other__' && (
          <input
            className="input"
            style={{ marginTop: 8 }}
            placeholder="e.g. a specific festival or auspicious day…"
            value={form.other_cultural_context}
            onChange={e => setForm(f => ({ ...f, other_cultural_context: e.target.value }))}
          />
        )}
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

      {drafts.map((draft, i) => (
        <div key={i} style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
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
            {freezingIndex === i ? 'Saving…' : 'Freeze This One'}
          </button>
        </div>
      ))}
    </div>
  );
}
