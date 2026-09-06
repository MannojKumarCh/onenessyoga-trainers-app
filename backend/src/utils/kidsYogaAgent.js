const prisma = require('../db/db');
const Anthropic = require('@anthropic-ai/sdk');
const { getIstDayBoundsUtc } = require('./istDate');

// This is genuine creative long-form writing for children, not the trivial
// JSON the scheduler produces - gets its own, stronger model. Same
// per-feature-model convention as aiScheduler.js's ANTHROPIC_SCHEDULER_MODEL,
// sharing the one ANTHROPIC_API_KEY.
const ANTHROPIC_KIDS_LESSON_MODEL = process.env.ANTHROPIC_KIDS_LESSON_MODEL || 'claude-sonnet-5';
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

// Only one Kids Yoga Trainer exists today - capped low since this is real
// per-call cost (long-form narrative output), independent of the scheduler's
// own cap.
const DAILY_LIMIT = 3;
const RECENT_FROZEN_LOOKBACK = 3;

async function getDailyUsage(userId) {
  const { startOfDayUtc, endOfDayUtc } = getIstDayBoundsUtc();
  const used = await prisma.kidsLessonLog.count({
    where: { user_id: userId, created_at: { gte: startOfDayUtc, lt: endOfDayUtc } }
  });
  return { used, remaining: Math.max(0, DAILY_LIMIT - used), limit: DAILY_LIMIT };
}

// Logs one *generate* attempt (not a freeze) - this is what the daily cap
// counts against. Storing the summary here (not just a bare timestamp like
// AiScheduleLog) lets today's own earlier drafts feed the same-day
// anti-repetition check without a second table.
async function logGeneration(userId, summary) {
  await prisma.kidsLessonLog.create({ data: { user_id: userId, summary } });
}

// Gathers what the next generation should avoid repeating: the last few
// *frozen* (actually taught) lessons for this trainer excluding the date
// being generated for, plus any drafts already generated today that haven't
// been frozen yet. Returns a flat, deduplicated list of summary strings.
async function getRecentSummaries(userId, targetDate) {
  const { startOfDayUtc, endOfDayUtc } = getIstDayBoundsUtc();

  const [recentFrozen, todaysDrafts] = await Promise.all([
    prisma.kidsYogaLesson.findMany({
      where: {
        session: { assigned_trainer_id: userId, scheduled_date: { not: targetDate } }
      },
      select: { summary: true, session: { select: { scheduled_date: true } } },
      orderBy: { session: { scheduled_date: 'desc' } },
      take: RECENT_FROZEN_LOOKBACK
    }),
    prisma.kidsLessonLog.findMany({
      where: { user_id: userId, created_at: { gte: startOfDayUtc, lt: endOfDayUtc }, summary: { not: null } },
      select: { summary: true }
    })
  ]);

  const summaries = [
    ...recentFrozen.map(l => l.summary),
    ...todaysDrafts.map(l => l.summary)
  ].filter(Boolean);

  return [...new Set(summaries)];
}

// The user's C-O-S-T-A-R-S prompt, <INPUT_*> placeholders substituted with
// the six dropdown-selected values. Step 1 ("ask clarifying questions one at
// a time if anything is unclear") is deliberately dropped - it's a chat-agent
// instruction, and every input here is already a resolved dropdown
// selection, not ambiguous free text needing back-and-forth.
function buildPrompt(inputs, avoidSummaries = []) {
  const {
    narrativeBackground,
    primaryTheme,
    targetAgeRange,
    specificYogaPoses,
    relaxationSetting,
    culturalContext
  } = inputs;

  const posesText = specificYogaPoses && specificYogaPoses.trim()
    ? specificYogaPoses
    : '(none specified - choose poses that fit the story)';

  // Optional - most days aren't tied to a specific festival.
  const culturalContextText = culturalContext && culturalContext.trim()
    ? culturalContext
    : 'no specific festival or cultural theme - keep it general and fun';

  const avoidText = avoidSummaries.length > 0
    ? `\n\nIMPORTANT - AVOID REPETITION:\nThe following stories/themes were used in recent sessions for this same trainer. The new session's story, characters, and specific plot must be meaningfully different from all of them - do not reuse the same narrative even if it fits the inputs below:\n${avoidSummaries.map(s => `- ${s}`).join('\n')}`
    : '';

  const system = `### C - CONTEXT & O - OBJECTIVE
The goal is to design an immersive 40-minute yoga session tailored specifically for Indian children using a gamified, storytelling approach. You will integrate elements from ${narrativeBackground} to make the practice culturally resonant and physically engaging. The objective is to transform traditional yoga asanas into a playful adventure that maintains high energy and focus for the ${targetAgeRange}.

### S - STYLE
Act as a certified kids' yoga instructor and movement specialist who excels in gamified instruction and creative play. Your teaching style should be character-driven, where every movement serves a purpose within the story of ${primaryTheme}. You should use descriptive, vivid language that helps children visualize the world they are moving through.

### T - TONE
The tone must be energetic, encouraging, and filled with a sense of wonder. It should remain playful and adventurous throughout, using highly engaging language that invites children to participate actively. Ensure the tone is supportive, fostering a "can-do" attitude during more challenging poses.

### A - AUDIENCE
The primary audience consists of yoga teachers and educators looking for creative, structured ways to engage young Indian learners. The content should be professional enough for a teacher to follow as a lesson plan, yet imaginative enough to be spoken directly to children.`;

  const user = `### R - RESPONSE FORMAT
Deliver a structured 40-minute yoga lesson plan divided into four distinct phases:
1. Opening (5 mins): Narrative hook and centering.
2. Warmups (10 mins): Theme-aligned movements to prepare the body.
3. The Narrative Sequence (20 mins): The core story where poses drive the plot.
4. Closing/Shanti (5 mins): Guided relaxation based on ${relaxationSetting}.
Each section should include specific timing and instructions for the teacher.

Write tight and scannable, not flowing prose - a teacher needs to glance at this mid-class, not read a story. Use short cue lines (a timestamp/pose name followed by one or two punchy sentences of instruction or things to say), not paragraphs. Target roughly: Opening 80-120 words, Warmups 150-200 words, Narrative Sequence 300-400 words, Closing/Shanti 80-120 words. Be precise and to the point - cut anything that doesn't help a teacher run the class in the moment.

### STEPS
1. Introduce the session theme with a short, captivating story snippet based on ${primaryTheme} to grab the children's attention immediately.
2. Develop a series of warm-up movements that introduce the environment or the "journey" the children are about to embark on.
3. Create the main sequence by linking specific yoga poses to characters, actions, or elements in the story, ensuring a flow that makes sense within the ${narrativeBackground}.
4. Incorporate interactive sound effects, call-and-response chants, or simple mantras suited for ${culturalContextText} to maintain high engagement.
5. Conclude with a "Shanti" relaxation period, scripted as a peaceful themed rest (e.g. ${relaxationSetting}) to transition the kids back to a calm state.

Specific yoga poses to include if possible: ${posesText}${avoidText}

Respond with ONLY a JSON object (no prose, no markdown code fences) in this exact shape:
{"opening": "<full Opening section text, with timing and teacher instructions>", "warmups": "<full Warmups section text>", "narrative_sequence": "<full Narrative Sequence section text>", "closing_shanti": "<full Closing/Shanti section text>", "summary": "<1-2 sentence gist of this session's story/theme, written for a teacher checking it against future sessions to avoid repetition - not part of the lesson itself>"}`;

  return { system, user };
}

class KidsLessonRateLimitError extends Error {}

async function callClaude(prompt) {
  let response;
  try {
    response = await anthropic.messages.create({
      model: ANTHROPIC_KIDS_LESSON_MODEL,
      // The prompt's own word targets are what actually keep the output
      // concise - this is just a safety ceiling, kept generous because the
      // response has to fit the brevity target AND valid JSON escaping
      // (quotes, newlines) on top of it. A tight cap here risks silently
      // truncating mid-JSON, which surfaces as a confusing "not valid JSON"
      // error instead of the real cause.
      max_tokens: 3500,
      // Sonnet 5 runs adaptive extended thinking by default even without
      // asking for it, and thinking tokens count against max_tokens - on a
      // plain formulaic writing task like this (no real reasoning needed),
      // that silently ate into the budget meant for the actual answer and
      // caused truncation. Disabling it here frees the whole cap for content.
      thinking: { type: 'disabled' },
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }]
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      throw new KidsLessonRateLimitError('Anthropic API rate limit reached. Try again shortly.');
    }
    throw err;
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to generate a lesson');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('Claude response was cut off (hit the token limit) - try again');
  }

  const text = response.content.find(b => b.type === 'text')?.text;
  if (!text) {
    throw new Error('Claude response had no text content');
  }

  return text;
}

const REQUIRED_FIELDS = ['opening', 'warmups', 'narrative_sequence', 'closing_shanti', 'summary'];

function parseLessonResponse(content) {
  let cleaned = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

  // Defensive: if the model added any stray text before/after the object
  // despite being told to respond with only JSON, extract just the {...}
  // span rather than failing on the whole string.
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start > 0 || (end !== -1 && end < cleaned.length - 1)) {
    if (start !== -1 && end !== -1 && end > start) {
      cleaned = cleaned.slice(start, end + 1);
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    // Log a snippet so a future failure is diagnosable from server logs
    // alone, without needing to reproduce it with another paid API call.
    console.error('Kids Yoga lesson JSON parse failed. Response start:', cleaned.slice(0, 300), '... end:', cleaned.slice(-300));
    throw new Error('AI response was not valid JSON');
  }

  for (const field of REQUIRED_FIELDS) {
    if (typeof parsed[field] !== 'string' || !parsed[field].trim()) {
      throw new Error(`AI response is missing required field "${field}"`);
    }
  }

  return parsed;
}

// inputs: { narrativeBackground, primaryTheme, targetAgeRange, specificYogaPoses, relaxationSetting, culturalContext }
async function generateKidsLesson(inputs, avoidSummaries = []) {
  if (!anthropic) {
    return { configured: false };
  }

  const prompt = buildPrompt(inputs, avoidSummaries);
  const content = await callClaude(prompt);
  const lesson = parseLessonResponse(content);

  return { configured: true, lesson };
}

module.exports = {
  generateKidsLesson,
  getDailyUsage,
  logGeneration,
  getRecentSummaries,
  KidsLessonRateLimitError
};
