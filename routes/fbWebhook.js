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

// Helper to map only required columns for Google Sheet
function mapLeadToSheetColumns(lead) {
  return {
    leadId: lead.leadId || '',
    project: normalizeProjectName(lead.project) || '',
    source: lead.source || '',
    name: lead.name || '',
    email: lead.email || '',
    phone: lead.phone || '',
    city: lead.city || ''
  };
}

router.post('/fb-webhook', async (req, res) => {
  try {
    console.log('📨 Webhook POST hit');
    console.log('📦 Raw Body:', JSON.stringify(req.body, null, 2));
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

            console.log('📥 New Lead ID:', leadId);
            console.log('📝 Form ID:', formId);
            console.log('📄 Page ID:', pageId);

            // Fix the project mapping (remove extra space)
            const getProjectName = (formId) => {
              const projectMap = {
                '376840518773731': 'Orchid Salisbury',
                '793235552669212': 'Orchid Platinum',
                '758750669703946': 'Orchid Life',
                '836984054637126': 'Orchid Bloomsberry',
                '655063727089499': 'Riviera Uno', // Removed extra space
                // Add more mappings as needed
              };
              return projectMap[formId] || 'Facebook Lead Form';
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
                    
                    // Also store with common variations for better mapping
                    const fieldName = f.name.toLowerCase();
                    if (fieldName.includes('name') && !lead.name) {
                      lead.name = f.values[0] || '';
                    }
                    if (fieldName.includes('email') && !lead.email) {
                      lead.email = f.values[0] || '';
                    }
                    if (fieldName.includes('phone') && !lead.phone) {
                      lead.phone = f.values[0] || '';
                    }
                    if (fieldName.includes('city') || fieldName.includes('location') && !lead.city) {
                      lead.city = f.values[0] || '';
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
          name: req.body.name || req.body.full_name || '',
          email: req.body.email || req.body.email_address || '',
          phone: req.body.phone || req.body.phone_number || '',
          city: req.body.city || req.body.location || '',
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

// Test endpoint to verify Google Sheets integration
// router.post('/test-webhook', async (req, res) => {
//   try {
//     console.log('🧪 Test webhook hit');
    
//     const testLead = {
//       leadId: `TEST-${Date.now()}`,
//       project: 'Test Project',
//       source: 'Test Webhook',
//       name: 'Test User',
//       email: 'test@example.com',
//       phone: '1234567890',
//       city: 'Test City',
//       message: 'This is a test lead from webhook',
//       created_time: new Date().toISOString(),
//       formId: 'TEST_FORM'
//     };
    
//     try {
//       const success = await appendLeadToSheetSimple(testLead);
//       if (success) {
//         console.log('✅ Test lead added successfully');
        
//         res.json({ 
//           success: true, 
//           message: 'Test lead added to Google Sheet',
//           leadId: testLead.leadId 
//         });
//       } else {
//         res.json({ 
//           success: false, 
//           message: 'Failed to add test lead to Google Sheet',
//           leadId: testLead.leadId 
//         });
//       }
//     } catch (err) {
//       console.error('❌ Test webhook error:', err.message);
//       res.status(500).json({ 
//         success: false, 
//         error: err.message 
//       });
//     }
//   } catch (err) {
//     console.error('❌ Test webhook error:', err.message);
//     res.status(500).json({ 
//       success: false, 
//       error: err.message 
//     });
//   }
// });

export default router;
