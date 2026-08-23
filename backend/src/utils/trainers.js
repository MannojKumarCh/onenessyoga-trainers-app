const prisma = require('../db/db');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Validates a single (already-parsed) trainer id. `null`/`undefined` pass
// through unchanged (i.e. "no trainer") - only a non-null value is checked
// against the database.
async function ensureTrainerExists(trainerId, fieldName = 'assigned_trainer_id') {
  if (trainerId === null || trainerId === undefined) return trainerId ?? null;

  const trainer = await prisma.user.findUnique({
    where: { id: trainerId },
    select: { id: true, roles: true }
  });

  if (!trainer || !trainer.roles.includes('trainer')) {
    throw httpError(400, `${fieldName} must reference an existing trainer`);
  }

  return trainerId;
}

// Validates a list of (already-parsed) trainer ids all exist and hold the
// trainer role. Throws once if any id is missing/invalid.
async function ensureTrainersExist(trainerIds, fieldName = 'assigned_trainer_id') {
  const uniqueIds = [...new Set(trainerIds)];
  const trainers = await prisma.user.findMany({
    where: { id: { in: uniqueIds }, roles: { has: 'trainer' } },
    select: { id: true }
  });
  if (trainers.length !== uniqueIds.length) {
    throw httpError(400, `${fieldName} must reference an existing trainer`);
  }
}

module.exports = { ensureTrainerExists, ensureTrainersExist };
