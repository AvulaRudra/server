import express from 'express';
import axios from 'axios';
import { appendLeadToSheet } from '../services/googleSheetsService.js';

const router = express.Router();

const VERIFY_TOKEN = 'goyalco_verify';
const PAGE_ACCESS_TOKEN = 'EAATT84b6A0MBPU8UxXAKMHauyhK17X9tUINdjaNqg9N9WCs7vMWlVUwjxmtb8bVmPbQ2KTw8vFhroQB0vQIrLAmZB6ubxSau7PNGemgCwGhauUIqFnD9kz2e9Nl0QIVm262ju85jC0nVJqOIwTtJcp2WuVXY9DsCteUu9ZCAo5erE0Cc66php2n8JRWH80csbBQCgs';

// Google Sheets API integration using service account
async function appendLeadToSheetSimple(lead) {
try {
const spreadsheetId = '1KJB-28QU21Hg-IuavmkzdedxC8ycdguAgageFzYYfDo';
const success = await appendLeadToSheet(mapLeadToSheetColumns(lead), spreadsheetId);

if (success) {
console.log('✅ Lead added to Google Sheet via API');
return true;
} else {
console.error('❌ Google Sheets API error');
return false;
}
} catch (error) {
console.error('❌ Failed to send to Google Sheets:', error.message);
return false;
}
}

// Helper to normalize project names across all sources
function normalizeProjectName(projectName) {
if (!projectName) return '';

// Remove extra spaces and trim
let normalized = projectName.trim();

// Convert to title case (first letter of each word capitalized)
normalized = normalized.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());

// Handle specific project name mappings
const projectMappings = {
'RIVIERA UNO': 'Riviera Uno',
'Riviera Uno ': 'Riviera Uno', // Remove extra space
'ORCHID SALISBURY': 'Orchid Salisbury',
'ORCHID PLATINUM': 'Orchid Platinum',
'ORCHID LIFE': 'Orchid Life',
'ORCHID BLOOMSBERRY': 'Orchid Bloomsberry'
};

return projectMappings[normalized] || normalized;
}

// Helper to normalize field names for consistent mapping
function normalizeFieldName(fieldName) {
  if (!fieldName) return '';
  return fieldName.toString()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')  // Remove all non-alphanumeric characters
    .trim();
}

// Helper to map only required columns for Google Sheet
function mapLeadToSheetColumns(lead) {
return {
leadId: lead.leadId || '',
project: normalizeProjectName(lead.project) || '',
source: lead.source || '',
name: lead.name || '',
email: lead.email || '',
phone: lead.phone || '',
city: lead.city || '',
size: lead.size || '',
budget: lead.budget || '',
purpose: lead.purpose || '',
priority: lead.priority || '',
workLocation: lead.workLocation || ''
};
}

// Webhook verification endpoint
router.get('/fb-webhook', (req, res) => {
  // Parse the query params
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Check if a token and mode were sent
  if (mode && token) {
    // Check the mode and token sent are correct
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      // Respond with 200 OK and challenge token from the request
      console.log('✅ Webhook verified successfully');
      return res.status(200).send(challenge);
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      console.error('❌ Verification failed. Tokens do not match.');
      return res.sendStatus(403);
    }
  } else {
    console.error('❌ Missing verify token or mode');
    return res.sendStatus(400);
  }
});

// Webhook POST endpoint
router.post('/fb-webhook', async (req, res) => {
try {
console.log('📨 Webhook POST hit');
console.log('📦 Raw Body:', JSON.stringify(req.body, null, 2));
console.log('🔍 Raw form ID from webhook (raw):', req.body?.entry?.[0]?.changes?.[0]?.value?.form_id);
console.log('🔍 Raw form ID type:', typeof req.body?.entry?.[0]?.changes?.[0]?.value?.form_id);
console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
console.log('🔍 Body type:', typeof req.body);
console.log('🔍 Body keys:', Object.keys(req.body || {}));

let leadsAdded = 0;

// Handle different webhook formats
if (req.body.entry && Array.isArray(req.body.entry)) {
// Facebook leadgen webhook format
console.log('📥 Processing Facebook leadgen webhook format');
for (const entry of req.body.entry) {
for (const change of entry.changes || []) {
if (change.field === 'leadgen') {
const leadId = change.value.leadgen_id;
const formId = change.value.form_id;
const pageId = change.value.page_id;

console.log('🔍 Form ID from webhook:', formId);
console.log('🔍 Known project mappings:', JSON.stringify({
'2394313481022296': 'Orchid Salisbury',
'1672153646791838': 'Orchid Platinum',
'2808675605994341': 'Orchid Bloomsberry',
'756944660385195': 'Orchid Life',
'775382491742653': 'Riviera Uno'
}, null, 2));

console.log('📥 New Lead ID:', leadId);
console.log('📝 Form ID:', formId);
console.log('📄 Page ID:', pageId);

// Fix the project mapping (remove extra space)
const getProjectName = (formId) => {
// Convert formId to string to ensure consistent type comparison
const formIdStr = String(formId).trim();

const projectMap = {
'2394313481022296': 'Orchid Salisbury',
'1672153646791838': 'Orchid Platinum',
'2808675605994341': 'Orchid Bloomsberry',
'756944660385195': 'Orchid Life',
'775382491742653': 'Riviera Uno',
// Add new form ID mappings here as needed
// Format: 'FORM_ID': 'Project Name'
};

// Debug: Check for direct match and partial matches
const debugInfo = {
receivedFormId: formId,
normalizedFormId: formIdStr,
typeOfFormId: typeof formId,
availableFormIds: Object.keys(projectMap),
exactMatch: projectMap[formIdStr] ? 'Yes' : 'No',
matchedProject: projectMap[formIdStr] || 'None'
};

// Check for exact match first
if (projectMap[formIdStr]) {
console.log('✅ Exact match found for form ID:', debugInfo);
return projectMap[formIdStr];
}

// If no exact match, check for partial matches (in case of extra characters)
const matchedKey = Object.keys(projectMap).find(key => 
formIdStr.includes(key) || key.includes(formIdStr)
);

if (matchedKey) {
console.log('🔍 Partial match found for form ID:', {
...debugInfo,
matchedKey,
project: projectMap[matchedKey]
});
return projectMap[matchedKey];
}

console.log('❌ No match found for form ID:', debugInfo);
return 'Facebook Lead Form';
};

let lead = {
leadId,
project: getProjectName(formId),
source: 'Facebook',
formId: formId,
pageId: pageId,
created_time: new Date().toISOString(),
};

// ✅ Try fetching lead details from FB
try {
const response = await axios.get(
`https://graph.facebook.com/v19.0/${leadId}`,
{
params: {
access_token: PAGE_ACCESS_TOKEN,
fields: 'field_data,created_time'
}
}
);
console.log('✅ Full Lead Data:', JSON.stringify(response.data, null, 2));

const fields = response.data.field_data;
if (Array.isArray(fields)) {
fields.forEach(f => {
if (f.name && Array.isArray(f.values)) {
// Store the field value
lead[f.name] = f.values[0] || '';

// Enhanced field mapping with comprehensive aliases and normalization
const fieldName = f.name.toLowerCase();
const normalizedFieldName = normalizeFieldName(f.name);
const fieldValue = f.values[0] || '';

// Name field mapping
if ((fieldName.includes('name') || fieldName.includes('full_name') || normalizedFieldName.includes('fullname')) && !lead.name) {
  lead.name = fieldValue;
}

// Email field mapping
if ((fieldName.includes('email') || normalizedFieldName.includes('emailaddress')) && !lead.email) {
  lead.email = fieldValue;
}

// Phone field mapping
if ((fieldName.includes('phone') || fieldName.includes('mobile') || normalizedFieldName.includes('phonenumber')) && !lead.phone) {
  lead.phone = fieldValue;
}

// City/Location field mapping
if ((fieldName.includes('city') || fieldName.includes('location')) && !lead.city) {
  lead.city = fieldValue;
}

// Size field mapping
if ((fieldName.includes('size') || fieldName.includes('preferred') || normalizedFieldName.includes('yourpreferredsize')) && !lead.size) {
  lead.size = fieldValue;
}

// Budget field mapping
if ((fieldName.includes('budget') || fieldName.includes('dropdown') || normalizedFieldName.includes('budgetdropdown') || normalizedFieldName.includes('budgetabove48cr')) && !lead.budget) {
  lead.budget = fieldValue;
}

// Purpose field mapping
if (fieldName.includes('purpose') && !lead.purpose) {
  lead.purpose = fieldValue;
}

// Priority field mapping
if ((fieldName.includes('priority') || fieldName.includes('lifestyle') || fieldName.includes('connectivity') || fieldName.includes('amenities') || normalizedFieldName.includes('toppriority')) && !lead.priority) {
  lead.priority = fieldValue;
}

// Work Location field mapping
if ((fieldName.includes('work') && fieldName.includes('location')) || normalizedFieldName.includes('worklocation') && !lead.workLocation) {
if (((fieldName.includes('work') && fieldName.includes('location')) || normalizedFieldName.includes('worklocation')) && !lead.workLocation) {
  lead.workLocation = fieldValue;
}
}
});
}

// Add created_time from Facebook if available
if (response.data.created_time) {
lead.created_time = response.data.created_time;
}
} catch (err) {
console.error('❌ Lead fetch failed:', err.message, err.response?.data || '');
}

// ✅ Always try to send to Google Sheets via HTTP API
try {
const success = await appendLeadToSheetSimple(mapLeadToSheetColumns(lead));
if (success) {
leadsAdded++;
console.log('✅ Lead successfully added to Google Sheet:', lead.leadId);
}
} catch (sheetErr) {
console.error('❌ Failed to append to Google Sheet:', sheetErr.message);
}
} else {
console.log('⚠️ Skipping non-leadgen field:', change?.field);
}
}
}
} else if (req.body.object === 'page' || req.body.object === 'application') {
// Handle page webhook verification or other formats
console.log('📥 Processing page/application webhook format');
console.log('📋 Webhook object:', req.body.object);

// If it's a test webhook or verification, just respond
if (req.body.mode === 'test' || req.body.challenge) {
console.log('✅ Webhook verification/test received');
res.sendStatus(200);
return;
}

// Process any lead data in this format
if (req.body.entry) {
for (const entry of req.body.entry) {
if (entry.messaging || entry.changes) {
console.log('📥 Processing messaging/changes entry');
// Add processing logic here if needed
}
}
}
} else {
// Handle direct lead data or other formats
console.log('📥 Processing direct lead data format');
console.log('📋 Processing body as direct lead data');

// Try to process the body as a direct lead
if (req.body && typeof req.body === 'object') {
const lead = {
leadId: req.body.leadId || req.body.id || `LEAD-${Date.now()}`,
project: normalizeProjectName(getProjectName(req.body.formId)),
source: req.body.source || 'Webhook',
name: req.body.name || req.body.full_name || req.body['Full name'] || '',
email: req.body.email || req.body.email_address || req.body['Email address'] || req.body['Email'] || '',
phone: req.body.phone || req.body.phone_number || req.body['Phone number'] || '',
city: req.body.city || req.body.location || '',
size: req.body.size || req.body['Your preferred size?'] || req.body.preferred_size || '',
budget: req.body.budget || req.body['Budget Dropdown'] || req.body['Budget (Above 4.8Cr)'] || req.body.budget_dropdown || '',
purpose: req.body.purpose || req.body['Purpose'] || '',
priority: req.body.priority || req.body['Top Priority ( Lifestyle / Connectivity / Amenities etc)'] || req.body.top_priority || '',
workLocation: req.body.workLocation || req.body['Work Location'] || req.body.work_location || '',
created_time: new Date().toISOString(),
formId: req.body.formId || '',
...req.body // Include all other fields
};

try {
const success = await appendLeadToSheetSimple(mapLeadToSheetColumns(lead));
if (success) {
leadsAdded++;
console.log('✅ Direct lead successfully added to Google Sheet:', lead.leadId);
}
} catch (sheetErr) {
console.error('❌ Failed to append direct lead to Google Sheet:', sheetErr.message);
}
}
}

console.log(`✅ Leads added to sheet: ${leadsAdded}`);
res.sendStatus(200);
} catch (err) {
console.error('❌ Webhook error:', err.message);
console.error('❌ Error stack:', err.stack);
res.sendStatus(500);
}
});
