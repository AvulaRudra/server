import express from 'express';
import axios from 'axios';
import { appendLeadToSheet } from '../services/googleSheetsService.js';

const router = express.Router();

const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN || 'goyalco_verify';
const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN || ''; // ✅ move to env

// ✅ Project map in top-scope (so it works everywhere)
const projectMap = {
  '2394313481022296': 'Orchid Salisbury',
  '1672153646791838': 'Orchid Platinum',
  '2808675605994341': 'Orchid Bloomsberry',
  '756944660385195': 'Orchid Life',
  '775382491742653': 'Riviera Uno',
};

function getProjectName(formId) {
  const formIdStr = String(formId || '').trim();

  if (projectMap[formIdStr]) return projectMap[formIdStr];

  const matchedKey = Object.keys(projectMap).find(
    key => formIdStr.includes(key) || key.includes(formIdStr)
  );

  return matchedKey ? projectMap[matchedKey] : 'Facebook Lead Form';
}

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

// ✅ Improved normalizeProjectName (your previous mapping wouldn’t match after title-casing)
function normalizeProjectName(projectName) {
  if (!projectName) return '';

  const raw = String(projectName).trim();
  const upper = raw.toUpperCase();

  const projectMappings = {
    'RIVIERA UNO': 'Riviera Uno',
    'ORCHID SALISBURY': 'Orchid Salisbury',
    'ORCHID PLATINUM': 'Orchid Platinum',
    'ORCHID LIFE': 'Orchid Life',
    'ORCHID BLOOMSBERRY': 'Orchid Bloomsberry',
  };

  if (projectMappings[upper]) return projectMappings[upper];

  // Default: Title Case
  return raw.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
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

// ✅ Webhook verification endpoint (GET)
router.get('/fb-webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified successfully');
    return res.status(200).type('text/plain').send(String(challenge)); // ✅ plain text
  }

  console.error('❌ Verification failed');
  return res.sendStatus(403);
});

// Webhook POST endpoint
router.post('/fb-webhook', async (req, res) => {
  try {
    console.log('📨 Webhook POST hit');
    console.log('📦 Raw Body:', JSON.stringify(req.body, null, 2));
    console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));

    let leadsAdded = 0;

    // Handle Facebook leadgen webhook format
    if (req.body.entry && Array.isArray(req.body.entry)) {
      console.log('📥 Processing Facebook leadgen webhook format');

      for (const entry of req.body.entry) {
        for (const change of entry.changes || []) {
          if (change.field === 'leadgen') {
            const leadId = change.value.leadgen_id;
            const formId = change.value.form_id;
            const pageId = change.value.page_id;

            console.log('📥 New Lead ID:', leadId);
            console.log('📝 Form ID:', formId);
            console.log('📄 Page ID:', pageId);

            let lead = {
              leadId,
              project: getProjectName(formId),
              source: 'Facebook',
              formId,
              pageId,
              created_time: new Date().toISOString(),
            };

            // ✅ Try fetching lead details from FB
            try {
              if (!PAGE_ACCESS_TOKEN) {
                console.warn('⚠️ FB_PAGE_ACCESS_TOKEN is missing. Skipping FB lead fetch.');
              } else {
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
                      lead[f.name] = f.values[0] || '';

                      const fieldName = f.name.toLowerCase();
                      const normalizedFieldName = normalizeFieldName(f.name);
                      const fieldValue = f.values[0] || '';

                      // Name
                      if ((fieldName.includes('name') || fieldName.includes('full_name') || normalizedFieldName.includes('fullname')) && !lead.name) {
                        lead.name = fieldValue;
                      }

                      // Email
                      if ((fieldName.includes('email') || normalizedFieldName.includes('emailaddress')) && !lead.email) {
                        lead.email = fieldValue;
                      }

                      // Phone
                      if ((fieldName.includes('phone') || fieldName.includes('mobile') || normalizedFieldName.includes('phonenumber')) && !lead.phone) {
                        lead.phone = fieldValue;
                      }

                      // City
                      if ((fieldName.includes('city') || fieldName.includes('location')) && !lead.city) {
                        lead.city = fieldValue;
                      }

                      // Size
                      if ((fieldName.includes('size') || fieldName.includes('preferred') || normalizedFieldName.includes('yourpreferredsize')) && !lead.size) {
                        lead.size = fieldValue;
                      }

                      // Budget
                      if ((fieldName.includes('budget') || fieldName.includes('dropdown') || normalizedFieldName.includes('budgetdropdown') || normalizedFieldName.includes('budgetabove48cr')) && !lead.budget) {
                        lead.budget = fieldValue;
                      }

                      // Purpose
                      if (fieldName.includes('purpose') && !lead.purpose) {
                        lead.purpose = fieldValue;
                      }

                      // Priority
                      if ((fieldName.includes('priority') || fieldName.includes('lifestyle') || fieldName.includes('connectivity') || fieldName.includes('amenities') || normalizedFieldName.includes('toppriority')) && !lead.priority) {
                        lead.priority = fieldValue;
                      }

                      // Work Location
                      if (((fieldName.includes('work') && fieldName.includes('location')) || normalizedFieldName.includes('worklocation')) && !lead.workLocation) {
                        lead.workLocation = fieldValue;
                      }
                    }
                  });
                }

                if (response.data.created_time) {
                  lead.created_time = response.data.created_time;
                }
              }
            } catch (err) {
              console.error('❌ Lead fetch failed:', err.message, err.response?.data || '');
            }

            // ✅ Always try to send to Google Sheets
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
      console.log('📥 Processing page/application webhook format');

      // Test webhook format
      if (req.body.mode === 'test' || req.body.challenge) {
        console.log('✅ Webhook test received');
        res.sendStatus(200);
        return;
      }

    } else {
      console.log('📥 Processing direct lead data format');

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
          ...req.body
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

export default router;
