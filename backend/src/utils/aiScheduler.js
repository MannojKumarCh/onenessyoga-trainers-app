const prisma = require('../db/db');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free';
const OPENROUTER_TIMEOUT_MS = 60 * 1000;

const DAILY_LIMIT = 5;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // IST has no DST, fixed UTC+5:30 offset

// Returns the [start, end) UTC instants corresponding to "today" in IST,
// regardless of the server's own timezone.
function getIstDayBoundsUtc(date = new Date()) {
  const istNow = new Date(date.getTime() + IST_OFFSET_MS);
  const istMidnightUtcMs = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - IST_OFFSET_MS;
  return {
    startOfDayUtc: new Date(istMidnightUtcMs),
    endOfDayUtc: new Date(istMidnightUtcMs + 24 * 60 * 60 * 1000)
  };
}

async function getDailyUsage(userId) {
  const { startOfDayUtc, endOfDayUtc } = getIstDayBoundsUtc();
  const used = await prisma.aiScheduleLog.count({
    where: { user_id: userId, created_at: { gte: startOfDayUtc, lt: endOfDayUtc } }
  });
  return { used, remaining: Math.max(0, DAILY_LIMIT - used), limit: DAILY_LIMIT };
}

async function logSuccessfulGeneration(userId) {
  await prisma.aiScheduleLog.create({ data: { user_id: userId } });
}

const SESSION_TYPES = {
  'Regular Sessions': [
    'Chandra Namaskar + Yoga',
    'Pilates',
    'Surya Namaskar + Yoga',
    'Traditional Yoga',
    'Yoga - Balancing',
    'Yoga - Chest Opening',
    'Yoga - Hip Openers',
    'Yoga - Holdings',
    'Yoga - Repetition',
    'Yoga - Strengthening',
    'Yoga - Stretching',
    'Yoga - Weight Loss',
    'Yoga - Women Health',
    'Yoga + Face Yoga',
    'Yoga with property - Belt/Chunni/Strap',
    'Yoga with property - Blocks/Bottle',
    'Yoga with property - Chair',
    'Yoga with property - Wall'
  ],
  'Restorative Sequences': [
    'Meditation',
    'Pranayama - Bandhas',
    'Pranayama - Cooling Techniques',
    'Pranayama - Jasmine Breathing',
    'Pranayama - Multiple',
    'Pranayama - Pranava',
    'Yin Yoga',
    'Yoga + Mudita',
    'Yoga Nidra'
  ],
  'Intense Sessions': [
    '21 Sets Surya Namaskaras',
    'Intense Yoga',
    'Vinyasa Yoga',
    'Power Yoga',
    '100 Asanas'
  ]
};

const ALL_SESSION_TYPES = new Set(Object.values(SESSION_TYPES).flat());

const RULES = `1. Every week, we need to have 1 mandatory pilates session.
2. The session on the next day to pilates should be from the list of restorative sequences.
3. 1 session of the week needs to be from the list of Intense sessions.
4. In case the Pilates session is on Saturday, the restorative session can be on any other day of the week.
5. We need to have "Surya Namaskar + Yoga" or "Chandra Namaskar + Yoga" as a mandate for 1 day in the given week.
6. "Yoga + Face Yoga" session should be scheduled once in 3 weeks and should not be in consecutive weeks.
7. The sessions of "Yoga with property" need to be scheduled once in 2 weeks with a different property every 2 weeks and should not be part of consecutive weeks.
8. Please avoid repeating the same sequence within the same week.
9. We need to schedule 1 type of session per day, and the same type will be repeated in all the sessions for a given day.
10. Please don't freeze any session to any particular day of the week. It should be random.
11. Shuffle session distribution randomly every week.
12. If a type of session is done this week, same type of session should not be repeated in the next week.
13. Pilates should not come on the same day of the week in consecutive weeks.

Note: festival/special-day detection is intentionally not part of this version - do not include festival notes in your response.`;

function pad(n) {
  return String(n).padStart(2, '0');
}

function toDateString(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getNextWeekRange() {
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayOfWeek = today.getDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dayOfWeek + 6) % 7; // Mon=0..Sun=6
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - daysSinceMonday);

  const nextMonday = new Date(thisMonday);
  nextMonday.setDate(thisMonday.getDate() + 7);

  const days = dayNames.map((day, i) => {
    const d = new Date(nextMonday);
    d.setDate(nextMonday.getDate() + i);
    return { day, date: toDateString(d) };
  });

  return { week_start_date: toDateString(nextMonday), days };
}

function buildPrompt({ days, history }) {
  const sessionTypeText = Object.entries(SESSION_TYPES)
    .map(([group, items]) => `${group}:\n${items.map(t => `- ${t}`).join('\n')}`)
    .join('\n\n');

  const historyText = history.length > 0
    ? history.map(h => `- ${h.scheduled_date}: ${h.topic}`).join('\n')
    : '(no sequences found in the last 3 weeks)';

  const targetDaysText = days.map(d => `- ${d.day} (${d.date})`).join('\n');

  const system = `You are an expert scheduler who creates a proper schedule for the week for Yoga sessions from the list of options given. Act as one scheduler who creates a schedule for the week with the options given.`;

  const user = `Type of Sequence:

${sessionTypeText}

Rules:
${RULES}

Sequences created over the last 3 weeks (for reference, to help you follow the rules above about repetition/consecutive weeks):
${historyText}

Please prepare the schedule for the following week:
${targetDaysText}

Respond with ONLY a JSON array (no prose, no markdown code fences) of exactly 6 objects, one per day above, in this exact shape:
[{"day": "Monday", "date": "YYYY-MM-DD", "session_type": "<one of the session names listed above, verbatim>"}, ...]`;

  return { system, user };
}

class OpenRouterRateLimitError extends Error {}

// One bounded attempt. Returns the content string, or null if the model
// replied successfully but with no content (caller decides whether to retry).
async function callOpenRouterOnce(prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

  let response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user }
        ],
        temperature: 0.7
      }),
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`OpenRouter request timed out after ${OPENROUTER_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 429) {
    throw new OpenRouterRateLimitError("OpenRouter's free-tier rate limit was reached. Try again later, or add credits to the OpenRouter account to raise the limit.");
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`OpenRouter request failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || null;
}

async function callOpenRouter(prompt) {
  if (!OPENROUTER_API_KEY) {
    console.warn('OPENROUTER_API_KEY not configured — AI scheduling unavailable');
    return null;
  }

  // Some free-tier "reasoning" models occasionally spend their whole budget
  // thinking and return an empty final answer - one retry usually succeeds.
  let content = await callOpenRouterOnce(prompt);
  if (!content) {
    content = await callOpenRouterOnce(prompt);
  }
  if (!content) {
    throw new Error('OpenRouter response had no content (after retry)');
  }

  return content;
}

function parseScheduleResponse(content, expectedDays) {
  const cleaned = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error('AI response was not valid JSON');
  }

  if (!Array.isArray(parsed) || parsed.length !== expectedDays.length) {
    throw new Error(`AI response did not contain exactly ${expectedDays.length} schedule entries`);
  }

  parsed.forEach((entry, i) => {
    if (!entry || typeof entry.day !== 'string' || typeof entry.date !== 'string' || typeof entry.session_type !== 'string') {
      throw new Error(`AI response entry ${i} is missing required fields`);
    }
    if (!ALL_SESSION_TYPES.has(entry.session_type)) {
      throw new Error(`AI response entry ${i} used an unrecognized session type: "${entry.session_type}"`);
    }
  });

  return parsed;
}

async function generateWeeklySchedule() {
  if (!OPENROUTER_API_KEY) {
    return { configured: false };
  }

  const { week_start_date, days } = getNextWeekRange();

  const historyStart = new Date(`${week_start_date}T00:00:00`);
  historyStart.setDate(historyStart.getDate() - 21);

  const history = await prisma.sequence.findMany({
    where: {
      scheduled_date: { gte: toDateString(historyStart), lt: week_start_date }
    },
    select: { topic: true, scheduled_date: true },
    orderBy: { scheduled_date: 'asc' }
  });

  const prompt = buildPrompt({ days, history });
  const content = await callOpenRouter(prompt);
  const schedule = parseScheduleResponse(content, days);

  return { configured: true, week_start_date, days: schedule };
}

module.exports = { generateWeeklySchedule, getDailyUsage, logSuccessfulGeneration, SESSION_TYPES, DAILY_LIMIT, OpenRouterRateLimitError };
