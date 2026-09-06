const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const prisma = require('../db/db');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { uploadKidsYogaLessonFile } = require('../utils/sheets');
const {
  generateKidsLesson,
  getDailyUsage,
  logGeneration,
  getRecentSummaries,
  KidsLessonRateLimitError
} = require('../utils/kidsYogaAgent');

['get', 'post'].forEach(method => {
  const original = router[method].bind(router);
  router[method] = (path, ...handlers) => original(path, ...handlers.map(handler => asyncHandler(handler)));
});

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// cultural_context is deliberately not required - most days aren't tied to a
// specific festival, and forcing a choice every time would be noise.
const REQUIRED_INPUT_FIELDS = [
  'narrative_background', 'primary_theme', 'target_age_range', 'relaxation_setting'
];

function readInputs(body) {
  for (const field of REQUIRED_INPUT_FIELDS) {
    if (!body[field] || !String(body[field]).trim()) {
      throw httpError(400, `${field} is required`);
    }
  }
  return {
    narrativeBackground: body.narrative_background,
    primaryTheme: body.primary_theme,
    targetAgeRange: body.target_age_range,
    specificYogaPoses: body.specific_yoga_poses || null,
    relaxationSetting: body.relaxation_setting,
    culturalContext: body.cultural_context || null
  };
}

const kidsLessonLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many Kids Yoga generation requests, please try again later.' }
});

// Kids Yoga Trainer: how many generations they have left today (IST)
router.get('/usage', authenticate, requireRole('kids_yoga_trainer'), async (req, res) => {
  res.json(await getDailyUsage(req.user.id));
});

// Kids Yoga Trainer: generate one draft lesson (preview only - nothing is
// saved to Session/KidsYogaLesson until the trainer freezes a draft below).
router.post('/generate', authenticate, requireRole('kids_yoga_trainer'), kidsLessonLimiter, async (req, res) => {
  const { scheduled_date } = req.body;
  if (!scheduled_date) throw httpError(400, 'scheduled_date is required');

  const usage = await getDailyUsage(req.user.id);
  if (usage.remaining <= 0) {
    return res.status(429).json({ error: 'Daily limit of 3 Kids Yoga generations reached. Resets at midnight IST.', ...usage });
  }

  const inputs = readInputs(req.body);
  const avoidSummaries = await getRecentSummaries(req.user.id, scheduled_date);

  let result;
  try {
    result = await generateKidsLesson(inputs, avoidSummaries);
  } catch (err) {
    if (err instanceof KidsLessonRateLimitError) {
      return res.status(502).json({ error: err.message });
    }
    throw err;
  }
  if (!result.configured) {
    return res.status(503).json({ error: 'AI scheduling is not configured yet' });
  }

  await logGeneration(req.user.id, result.lesson.summary);
  res.json({ ...result.lesson, used: usage.used + 1, remaining: usage.remaining - 1, limit: usage.limit });
});

// Kids Yoga Trainer: freeze one previously-generated draft as the real class -
// exports the lesson to Google Drive (best-effort) and saves the
// KidsYogaLesson row. Two ways to call this:
// - `session_id`: attach to an already-scheduled session (the normal case -
//   Kids Yoga runs on a recurring Weekly Schedule slot, so the Session
//   already exists; the trainer is just filling in that day's content).
// - `scheduled_date`/`scheduled_time`: find-or-create a session for that
//   date (fallback for a one-off session outside the recurring schedule).
router.post('/freeze', authenticate, requireRole('kids_yoga_trainer'), async (req, res) => {
  const { session_id, scheduled_date, scheduled_time } = req.body;
  if (!session_id && (!scheduled_date || !scheduled_time)) {
    throw httpError(400, 'session_id, or scheduled_date and scheduled_time, are required');
  }

  const {
    narrative_background, primary_theme, target_age_range,
    specific_yoga_poses, relaxation_setting, cultural_context,
    opening, warmups, narrative_sequence, closing_shanti, summary
  } = req.body;

  for (const [field, value] of Object.entries({
    narrative_background, primary_theme, target_age_range, relaxation_setting,
    opening, warmups, narrative_sequence, closing_shanti, summary
  })) {
    if (!value || !String(value).trim()) throw httpError(400, `${field} is required`);
  }

  let session;
  if (session_id) {
    const target = await prisma.session.findUnique({
      where: { id: parseInt(session_id) },
      include: { kids_yoga_lesson: { select: { id: true } } }
    });
    if (!target || target.assigned_trainer_id !== req.user.id || target.session_type !== 'Kids Yoga') {
      throw httpError(404, 'Kids Yoga session not found');
    }
    if (target.kids_yoga_lesson) {
      throw httpError(409, 'This session already has a frozen lesson');
    }
    session = await prisma.session.update({ where: { id: target.id }, data: { title: primary_theme } });
  } else {
    const existing = await prisma.session.findFirst({
      where: { assigned_trainer_id: req.user.id, scheduled_date, session_type: 'Kids Yoga' },
      include: { kids_yoga_lesson: { select: { id: true } } }
    });
    if (existing?.kids_yoga_lesson) {
      throw httpError(409, 'A Kids Yoga session is already frozen for this date');
    }
    session = existing
      ? await prisma.session.update({ where: { id: existing.id }, data: { title: primary_theme, scheduled_time } })
      : await prisma.session.create({
          data: {
            title: primary_theme,
            scheduled_date,
            scheduled_time,
            session_type: 'Kids Yoga',
            assigned_trainer_id: req.user.id,
            created_by: req.user.id
          }
        });
  }

  const driveFile = await uploadKidsYogaLessonFile({
    scheduled_date: session.scheduled_date,
    primary_theme,
    narrative_background,
    target_age_range,
    specific_yoga_poses,
    relaxation_setting,
    cultural_context: cultural_context || null,
    opening_text: opening,
    warmups_text: warmups,
    narrative_text: narrative_sequence,
    closing_text: closing_shanti,
    summary
  });

  await prisma.kidsYogaLesson.create({
    data: {
      session_id: session.id,
      narrative_background,
      primary_theme,
      target_age_range,
      specific_yoga_poses,
      relaxation_setting,
      cultural_context: cultural_context || null,
      opening_text: opening,
      warmups_text: warmups,
      narrative_text: narrative_sequence,
      closing_text: closing_shanti,
      summary,
      drive_file_id: driveFile?.id ?? null,
      drive_file_link: driveFile?.webViewLink ?? null
    }
  });

  res.status(201).json({ session_id: session.id });
});

module.exports = router;
