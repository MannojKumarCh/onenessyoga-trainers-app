const { google } = require('googleapis');
const prisma = require('../db/db');

const OWNER_EMAIL = 'mannoj@onenessyoga.in';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'];
// Service accounts have no Drive storage of their own — new spreadsheets must be created
// inside a folder owned by a real account (shared with the service account as Editor),
// otherwise Google rejects file creation with a generic 403 "forbidden".
const SEQUENCES_FOLDER_ID = process.env.GOOGLE_SEQUENCES_FOLDER_ID;

function buildClient() {
  try {
    const decoded = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf8');
    const credentials = JSON.parse(decoded);
    // Domain-wide delegation: impersonate a real Workspace account so created files are
    // owned by a real user (with real storage quota) instead of the service account itself.
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: SCOPES,
      subject: OWNER_EMAIL
    });
    return {
      sheets: google.sheets({ version: 'v4', auth }),
      drive: google.drive({ version: 'v3', auth })
    };
  } catch (err) {
    console.warn('Failed to initialize Google Sheets client from GOOGLE_SERVICE_ACCOUNT_KEY:', err.message);
    return null;
  }
}

const sheetsClient = process.env.GOOGLE_SERVICE_ACCOUNT_KEY ? buildClient() : null;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// scheduled_date is expected as "YYYY-MM-DD"
function parseDateParts(scheduled_date) {
  const [y, m, d] = String(scheduled_date).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return { y, m, d, date };
}

function yearMonthOf(scheduled_date) {
  const { y, m } = parseDateParts(scheduled_date);
  return `${y}-${String(m).padStart(2, '0')}`;
}

function monthTitleOf(scheduled_date) {
  const { y, m } = parseDateParts(scheduled_date);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function dayTabTitleOf(scheduled_date) {
  const { d, date } = parseDateParts(scheduled_date);
  const monthName = MONTH_NAMES[date.getUTCMonth()];
  const dayName = DAY_NAMES[date.getUTCDay()];
  return `${d} ${monthName} - ${dayName}`;
}

async function findOrCreateMonthlySheet(year_month, scheduled_date) {
  let monthlySheet = await prisma.monthlySheet.findUnique({ where: { year_month } });
  if (monthlySheet) return monthlySheet;

  const title = `Oneness Yoga Sequences - ${monthTitleOf(scheduled_date)}`;
  const createResp = await sheetsClient.drive.files.create({
    requestBody: {
      name: title,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      ...(SEQUENCES_FOLDER_ID ? { parents: [SEQUENCES_FOLDER_ID] } : {})
    },
    fields: 'id',
    supportsAllDrives: true
  });
  const spreadsheetId = createResp.data.id;

  const approvedTrainers = await prisma.user.findMany({
    where: { role: 'trainer', google_link_status: 'approved' },
    select: { email: true }
  });

  // Only the studio owner account can edit the master sheet; trainers get read-only
  // access so they can reference it, but the app (not manual sheet edits) stays the
  // single source of truth.
  await Promise.allSettled([
    sheetsClient.drive.permissions.create({
      fileId: spreadsheetId,
      sendNotificationEmail: false,
      requestBody: { role: 'writer', type: 'user', emailAddress: OWNER_EMAIL }
    }),
    ...approvedTrainers.map(t =>
      sheetsClient.drive.permissions.create({
        fileId: spreadsheetId,
        sendNotificationEmail: false,
        requestBody: { role: 'reader', type: 'user', emailAddress: t.email }
      })
    )
  ]);

  monthlySheet = await prisma.monthlySheet.create({
    data: { year_month, spreadsheet_id: spreadsheetId }
  });
  return monthlySheet;
}

async function findOrCreateDayTab(spreadsheetId, scheduled_date) {
  const tabTitle = dayTabTitleOf(scheduled_date);
  const getResp = await sheetsClient.sheets.spreadsheets.get({ spreadsheetId });
  const existing = getResp.data.sheets.find(s => s.properties.title === tabTitle);
  if (existing) {
    return existing.properties.sheetId;
  }

  const addResp = await sheetsClient.sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        { addSheet: { properties: { title: tabTitle } } }
      ]
    }
  });
  const newSheetId = addResp.data.replies[0].addSheet.properties.sheetId;

  await sheetsClient.sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          mergeCells: {
            range: { sheetId: newSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 3 },
            mergeType: 'MERGE_ALL'
          }
        },
        {
          repeatCell: {
            range: { sheetId: newSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 3 },
            cell: {
              userEnteredValue: { stringValue: tabTitle },
              userEnteredFormat: {
                backgroundColor: { red: 1, green: 0.76, blue: 0.03 },
                textFormat: { bold: true },
                horizontalAlignment: 'CENTER'
              }
            },
            fields: 'userEnteredValue,userEnteredFormat'
          }
        },
        {
          updateCells: {
            range: { sheetId: newSheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 3 },
            rows: [{
              values: [
                { userEnteredValue: { stringValue: 'Exercise' }, userEnteredFormat: { textFormat: { bold: true } } },
                { userEnteredValue: { stringValue: 'Remarks' }, userEnteredFormat: { textFormat: { bold: true } } },
                { userEnteredValue: { stringValue: 'Reference' }, userEnteredFormat: { textFormat: { bold: true } } }
              ]
            }],
            fields: 'userEnteredValue,userEnteredFormat'
          }
        }
      ]
    }
  });

  return newSheetId;
}

// Rebuilds the day tab's body (everything below the title + column-header rows) from scratch,
// reading the current state of every sequence scheduled that day from the DB. This is
// idempotent — re-running it after an edit never leaves stale/duplicate sections behind,
// and naturally handles multiple trainers' sequences stacking within the same day's tab.
async function rewriteDayTabContent(spreadsheetId, tabTitle, scheduled_date) {
  const sequences = await prisma.sequence.findMany({
    where: { scheduled_date },
    include: { assigned_trainer: { select: { name: true } }, items: { orderBy: { sort_order: 'asc' } } },
    orderBy: { id: 'asc' }
  });

  const rows = [];
  for (const seq of sequences) {
    if (!seq.items || seq.items.length === 0) continue;
    const trainerName = seq.assigned_trainer?.name || '';
    rows.push([`${trainerName} - ${seq.topic}`, '', '']);
    for (const it of seq.items) {
      rows.push([it.name, it.remarks || '', it.reference_url || '']);
    }
    rows.push(['', '', '']); // spacer between trainer sections
  }
  if (rows.length > 0) rows.pop(); // drop trailing spacer

  await sheetsClient.sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${tabTitle}'!A3:C10000`
  });

  if (rows.length > 0) {
    await sheetsClient.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabTitle}'!A3`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows }
    });
  }
}

async function upsertSequenceInSheet(sequence, items) {
  if (!sheetsClient) {
    console.warn('GOOGLE_SERVICE_ACCOUNT_KEY not configured — skipping Google Sheet sync for sequence', sequence.id);
    return null;
  }

  try {
    const year_month = yearMonthOf(sequence.scheduled_date);
    const monthlySheet = await findOrCreateMonthlySheet(year_month, sequence.scheduled_date);
    const spreadsheetId = monthlySheet.spreadsheet_id;
    const tabSheetId = await findOrCreateDayTab(spreadsheetId, sequence.scheduled_date);
    const tabTitle = dayTabTitleOf(sequence.scheduled_date);

    await rewriteDayTabContent(spreadsheetId, tabTitle, sequence.scheduled_date);

    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${tabSheetId}`;
  } catch (err) {
    console.error('Failed to upsert sequence into Google Sheet:', err);
    return null;
  }
}

async function shareSpreadsheetWithTrainer(spreadsheetId, email) {
  if (!sheetsClient) {
    console.warn('GOOGLE_SERVICE_ACCOUNT_KEY not configured — skipping spreadsheet share with', email);
    return null;
  }

  try {
    // Read-only — only the studio owner account (OWNER_EMAIL) gets edit access.
    await sheetsClient.drive.permissions.create({
      fileId: spreadsheetId,
      sendNotificationEmail: false,
      requestBody: { role: 'reader', type: 'user', emailAddress: email }
    });
    return true;
  } catch (err) {
    console.error('Failed to share spreadsheet with', email, err);
    return null;
  }
}

module.exports = { upsertSequenceInSheet, shareSpreadsheetWithTrainer };
