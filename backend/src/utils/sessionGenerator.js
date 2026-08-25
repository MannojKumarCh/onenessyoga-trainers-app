const prisma = require('../db/db');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // IST has no DST, fixed UTC+5:30 offset
const WINDOW_DAYS = 14;

function toIstDateString(date) {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().split('T')[0];
}

// Ensures the next WINDOW_DAYS days have real Session rows for every active
// SessionTemplate slot that applies to each date's weekday. Idempotent by
// construction (skips any date+time pair that already has a session), so
// it's safe to run repeatedly - on every server startup and once daily.
// Never updates an existing row, which is what makes a later template edit
// (e.g. changing a slot's dedicated trainer) apply only to sessions
// generated after the edit, not retroactively to ones already created.
async function generateUpcomingSessions(now = new Date()) {
  const todayIst = toIstDateString(now);
  const dates = Array.from({ length: WINDOW_DAYS }, (_, i) => {
    const d = new Date(`${todayIst}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().split('T')[0];
  });

  const templates = await prisma.sessionTemplate.findMany({ where: { is_active: true } });
  if (templates.length === 0) return { created: 0 };

  const existing = await prisma.session.findMany({
    where: { scheduled_date: { in: dates } },
    select: { scheduled_date: true, scheduled_time: true }
  });
  const existingKeys = new Set(existing.map(s => `${s.scheduled_date}|${s.scheduled_time}`));

  const toCreate = [];
  for (const date of dates) {
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    for (const t of templates) {
      if (!t.weekdays.includes(dow)) continue;
      const key = `${date}|${t.scheduled_time}`;
      if (existingKeys.has(key)) continue;
      toCreate.push({
        title: t.title,
        scheduled_date: date,
        scheduled_time: t.scheduled_time,
        session_type: t.session_type || 'BKP',
        assigned_trainer_id: t.dedicated_trainer_id,
        zoom_link: t.zoom_link || null
      });
      existingKeys.add(key);
    }
  }

  if (toCreate.length === 0) return { created: 0 };
  await prisma.session.createMany({ data: toCreate });
  return { created: toCreate.length };
}

module.exports = { generateUpcomingSessions };
