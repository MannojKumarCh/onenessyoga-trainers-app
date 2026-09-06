const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // IST has no DST, fixed UTC+5:30 offset

// Returns the [start, end) UTC instants corresponding to "today" (or the IST
// day containing `date`) in IST, regardless of the server's own timezone.
// Shared by every feature that needs a per-user daily usage cap keyed to the
// IST calendar day (aiScheduler.js, kidsYogaAgent.js).
function getIstDayBoundsUtc(date = new Date()) {
  const istNow = new Date(date.getTime() + IST_OFFSET_MS);
  const istMidnightUtcMs = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - IST_OFFSET_MS;
  return {
    startOfDayUtc: new Date(istMidnightUtcMs),
    endOfDayUtc: new Date(istMidnightUtcMs + 24 * 60 * 60 * 1000)
  };
}

// "YYYY-MM-DD" for the IST calendar day containing `date` - matches the
// scheduled_date string format used throughout Session/Sequence records.
function toIstDateString(date = new Date()) {
  const istNow = new Date(date.getTime() + IST_OFFSET_MS);
  return istNow.toISOString().split('T')[0];
}

module.exports = { IST_OFFSET_MS, getIstDayBoundsUtc, toIstDateString };
