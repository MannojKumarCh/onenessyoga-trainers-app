const { google } = require('googleapis');
const prisma = require('../db/db');

const OWNER_EMAIL = 'mannoj@onenessyoga.in';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'];

function buildClient() {
  try {
    const decoded = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf8');
    const credentials = JSON.parse(decoded);
    const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
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
  const createResp = await sheetsClient.sheets.spreadsheets.create({
    requestBody: {
      properties: { title }
    }
  });
  const spreadsheetId = createResp.data.spreadsheetId;

  const approvedTrainers = await prisma.user.findMany({
    where: { role: 'trainer', google_link_status: 'approved' },
    select: { email: true }
  });

  const emailsToShare = [OWNER_EMAIL, ...approvedTrainers.map(t => t.email)];
  await Promise.allSettled(
    emailsToShare.map(email =>
      sheetsClient.drive.permissions.create({
        fileId: spreadsheetId,
        sendNotificationEmail: false,
        requestBody: { role: 'writer', type: 'user', emailAddress: email }
      })
    )
  );

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

async function appendTrainerSection(spreadsheetId, tabTitle, sequence, items) {
  const range = `'${tabTitle}'!A:C`;
  const existing = await sheetsClient.sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rowCount = (existing.data.values || []).length;
  const startRow = rowCount + 1; // 1-indexed, one blank row spacer

  const trainerName = sequence.assigned_trainer?.name || '';
  const subHeader = [`${trainerName} - ${sequence.topic}`, '', ''];
  const itemRows = items.map(it => [it.name, it.remarks || '', it.reference_url || '']);

  await sheetsClient.sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabTitle}'!A${startRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [subHeader, ...itemRows]
    }
  });
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

    await appendTrainerSection(spreadsheetId, tabTitle, sequence, items);

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
    await sheetsClient.drive.permissions.create({
      fileId: spreadsheetId,
      sendNotificationEmail: false,
      requestBody: { role: 'writer', type: 'user', emailAddress: email }
    });
    return true;
  } catch (err) {
    console.error('Failed to share spreadsheet with', email, err);
    return null;
  }
}

module.exports = { upsertSequenceInSheet, shareSpreadsheetWithTrainer };
