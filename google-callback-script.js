// === Universal Gmail Lead Extractor ===
function extractLeadsFromGmail() {
  const threads = GmailApp.search(
    'is:unread subject:("Book an appointment" OR "Project enquiry" OR "Download Brochure")',
    0, 20
  );


  const sheet = SpreadsheetApp.openById("1KJB-28QU21Hg-IuavmkzdedxC8ycdguAgageFzYYfDo").getSheetByName("Leads");
  let newRow = sheet.getLastRow() + 1;


  const lastRowCheck = sheet.getLastRow();
  const existingFingerprints = lastRowCheck > 1
    ? sheet.getRange(2, 2, lastRowCheck - 1, 5).getValues().map(row => {
        const project = row[0]?.toLowerCase().trim();
        const name = row[1]?.toLowerCase().trim();
        const email = row[3]?.toLowerCase().trim();
        const phone = typeof row[4] === 'string' ? row[4].replace(/[^0-9+]/g, '') : '';
        return `${name}|${phone}|${email}|${project}`;
      })
    : [];


  let insertedFingerprints = [];


  threads.forEach(thread => {
    const messages = thread.getMessages();
    messages.forEach(message => {
      const subject = message.getSubject();
      const plainBody = message.getPlainBody();
      const htmlBody = message.getBody();
      let lead = {};


      // === Website Formats ===
      if (subject.includes("Book an appointment") && plainBody.includes("For Project Enquiry:")) {
        lead.source = "Website";
        lead.project = extract(plainBody, "For Project Enquiry:", "\n");
        lead.name = extract(plainBody, "Your Name:", "\n");
        lead.email = extract(plainBody, "Your Email Id:", "\n");
        lead.phone = extract(plainBody, "Mobile Number:", "\n");
        lead.city = extract(plainBody, "City(Residence):", "\n");


      } else if ((subject.includes("Project enquiry") || subject.includes("Write in to us")) && plainBody.includes("E-mail ID:")) {
        lead.source = "Website";
        lead.project = extract(plainBody, "For Project Enquiry:", "\n");
        lead.name = extract(plainBody, "Name:", "\n");
        lead.email = extract(plainBody, "E-mail ID:", "\n");
        lead.phone = extract(plainBody, "Mobile Number:", "\n");
        lead.city = "";


      } else if (subject.includes("Download Brochure") && plainBody.includes("Mobile Number:")) {
        lead.source = "Website";
        lead.project = extract(plainBody, "For Project Enquiry:", "\n");
        lead.name = extract(plainBody, "Name:", "\n");
        lead.phone = extract(plainBody, "Mobile Number:", "\n");
        lead.email = "";
        lead.city = "";


      } else {
        return;
      }


      const leadFingerprint = `${lead.name.toLowerCase().trim()}|${lead.phone}|${lead.email.toLowerCase().trim()}|${lead.project.toLowerCase().trim()}`;


      if (existingFingerprints.includes(leadFingerprint) || insertedFingerprints.includes(leadFingerprint)) {
        Logger.log("Duplicate lead detected (existing or session): " + leadFingerprint);
        message.markRead(); // ✅ mark as read even if duplicate
        return;
      }


      insertedFingerprints.push(leadFingerprint);


      const leadId = "LEAD-" + new Date().getTime();
      sheet.getRange(newRow, 1, 1, 7).setValues([[
        leadId,
        lead.project,
        lead.source,
        lead.name,
        lead.email,
        lead.phone,
        lead.city
      ]]);
      
      newRow++;
      message.markRead();
    });
  });
}


function extract(text, start, end) {
  try {
    const s = text.indexOf(start);
    if (s === -1) return "";
    const e = text.indexOf(end, s + start.length);
    return text.substring(s + start.length, e !== -1 ? e : undefined).trim();
  } catch (e) {
    return "";
  }
}


function onEdit(e) {
  const sheet = e.source.getActiveSheet();
  const sheetName = sheet.getName();
  const row = e.range.getRow();
  const col = e.range.getColumn();


  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const editedHeader = headers[col - 1];


  // === 1. LEAD ID Generation ===
  if (sheetName === "Leads") {
    const leadIdCol = 1; // Column A
    const nameCol = 4;   // Column D


    const leadIdCell = sheet.getRange(row, leadIdCol);
    const nameCell = sheet.getRange(row, nameCol);


    if (!leadIdCell.getValue() && nameCell.getValue()) {
      const timestamp = new Date().getTime();
      const leadId = "LEAD-" + timestamp;
      leadIdCell.setValue(leadId);
    }
  }


  // === 2. BREAK LOGIC for Live Status ===
  if (sheetName === "Live Status" && col === 3 && row > 1) {
    const name = sheet.getRange(row, 1).getValue();
    const email = sheet.getRange(row, 2).getValue();
    const status = sheet.getRange(row, 3).getValue().toLowerCase();
    const totalTodayCell = sheet.getRange(row, 4);
    const now = new Date();
    const today = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");


    const cache = CacheService.getScriptCache();
    const cacheKey = `break_${email}`;


    if (status === "break") {
      // Going on break → save time in cache
      cache.put(cacheKey, now.toString(), 21600); // 6 hours
    }


    if (status === "active") {
      const startTime = cache.get(cacheKey);
      if (startTime) {
        const start = new Date(startTime);
        const duration = Math.round((now - start) / 60000);


        // Append to Break Log sheet
        const breakSheet = e.source.getSheetByName("Break Log");
        breakSheet.appendRow([
          name,
          email,
          start,
          now,
          duration,
          today
        ]);


        // Update Total Break Today
        const prevTotal = parseFloat(totalTodayCell.getValue() || 0);
        totalTodayCell.setValue(prevTotal + duration);


        // Remove from cache
        cache.remove(cacheKey);
      }
    }
  }


  // === 3. Call Time Auto-Update on Called? = yes
  if (sheetName === "Leads" && col === 11 && row > 1) {
    const called = sheet.getRange(row, 11).getValue().toString().toLowerCase();
    const callTimeCell = sheet.getRange(row, 12);
    if (called === "yes" && !callTimeCell.getValue()) {
      callTimeCell.setValue(new Date());
    }
  }


  // === 4. Feedback Time Auto-Update ===
  if (sheetName === "Leads" && row > 1) {
    const feedbackToTimeMap = {
      "Feedback 1": "Time 1",
      "Feedback 2": "Time 2",
      "Feedback 3": "Time 3",
      "Feedback 4": "Time 4",
      "Feedback 5": "Time 5"
    };


    if (feedbackToTimeMap[editedHeader]) {
      const timeHeader = feedbackToTimeMap[editedHeader];
      const timeCol = headers.indexOf(timeHeader) + 1;
      if (timeCol > 0) {
        sheet.getRange(row, timeCol).setValue(new Date());
      }
    }
  }
}








function assignUnassignedLeadsWithTeamStatus() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Leads");
  const teamSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Team Status");


  // Get all team members marked as "Active"
  const teamData = teamSheet.getRange(2, 1, teamSheet.getLastRow() - 1, 3).getValues(); // Name, Email, Status
  const activeMembers = teamData.filter(row => row[2]?.toLowerCase() === "active");


  if (activeMembers.length === 0) {
    Logger.log("❌ No active team members available for assignment.");
    return;
  }


  const scriptProps = PropertiesService.getScriptProperties();
  let lastIndex = parseInt(scriptProps.getProperty("lastAssignedIndex")) || 0;


  const dataRange = sheet.getDataRange();
  const data = dataRange.getValues();


  for (let row = 1; row < data.length; row++) {
    const assignedTo = data[row][7]; // Column H
    const name = data[row][3];       // Column D


    if (!assignedTo && name) {
      const member = activeMembers[lastIndex % activeMembers.length];
      lastIndex++;
      scriptProps.setProperty("lastAssignedIndex", lastIndex.toString());


      // Assign values
      sheet.getRange(row + 1, 8).setValue(member[0]); // Assigned To
      sheet.getRange(row + 1, 9).setValue(member[1]); // Assigned Email
      sheet.getRange(row + 1, 10).setValue(new Date()); // Assigned Time


      sendAssignmentEmail(row + 1); // Instantly sends email


    }
  }
}


function markCallDelays() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Leads");
  const data = sheet.getDataRange().getValues();
  const now = new Date();


  for (let row = 1; row < data.length; row++) {
    const assignedTo = data[row][7];      // Column H
    const assignedTime = data[row][9];    // Column J
    const called = (data[row][10] || "").toString().toLowerCase(); // Column K
    const callDelayStatus = (data[row][12] || "").toString().toLowerCase(); // Column M


    if (!assignedTo || !assignedTime || !(assignedTime instanceof Date)) continue;


    const delayCell = sheet.getRange(row + 1, 13); // Column M
    const diffMins = (now - assignedTime) / 60000;


    // Skip if already marked
    if (callDelayStatus === "delayed" || callDelayStatus === "on time") continue;


    // Treat these values as on-time:
    const onTimeKeywords = ["yes", "incorrect", "not answered"];


    if (onTimeKeywords.includes(called)) {
      delayCell.setValue("On Time").setFontColor("green");
    } else if (diffMins >= 10) {
      delayCell.setValue("Delayed").setFontColor("red");
    }
  }
}




function logBreak() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const liveSheet = ss.getSheetByName("Live Status");
  const breakSheet = ss.getSheetByName("Break Log");


  const liveData = liveSheet.getDataRange().getValues();
  const now = new Date();
  const today = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");


  for (let i = 1; i < liveData.length; i++) {
    const name = liveData[i][0];
    const email = liveData[i][1];
    const status = liveData[i][2];
    const totalToday = parseFloat(liveData[i][3] || 0);


    const cache = CacheService.getScriptCache();
    const cacheKey = `break_${email}`;
    const startTime = cache.get(cacheKey);


    // If the person is now ACTIVE and was on BREAK earlier
    if (status.toLowerCase() === "active" && startTime) {
      const start = new Date(startTime);
      const duration = Math.round((now - start) / 60000); // in minutes


      // Log to Break Log
      breakSheet.appendRow([
        name,
        email,
        start,
        now,
        duration,
        today
      ]);


      // Update Total Break Today in Live Status
      liveSheet.getRange(i + 1, 4).setValue(totalToday + duration); // Column D


      // Clear cache
      cache.remove(cacheKey);
    }


    // If the person just went to break, store the start time
    if (status.toLowerCase() === "break" && !startTime) {
      cache.put(cacheKey, now.toString(), 21600); // store for 6 hours
    }
  }
}


function updatePerformanceTracker() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const leadSheet = ss.getSheetByName("Leads");
  const perfSheet = ss.getSheetByName("Performance Tracker");
  const liveSheet = ss.getSheetByName("Live Status");


  const leads = leadSheet.getDataRange().getValues();
  const live = liveSheet.getDataRange().getValues();
  const users = perfSheet.getRange(2, 1, perfSheet.getLastRow() - 1).getValues().map(row => row[0]); // Names


  const performance = {};


  // Initialize tracking object
  users.forEach(name => {
    performance[name] = {
      totalLeads: 0,
      delays: 0,
      siteVisits: 0,
      bookings: 0,
      breakMinutes: 0,
      score: 0
    };
  });


  // === Pull lead data
  for (let i = 1; i < leads.length; i++) {
    const assignedTo = leads[i][7];
    const delay = (leads[i][12] || "").toLowerCase();
    const siteVisit = (leads[i][13] || "").toLowerCase();
    const booked = (leads[i][14] || "").toLowerCase();


    if (assignedTo && performance[assignedTo] !== undefined) {
      performance[assignedTo].totalLeads++;


      if (delay === "delayed") performance[assignedTo].delays++;
      if (siteVisit === "yes") performance[assignedTo].siteVisits++;
      if (booked === "yes") performance[assignedTo].bookings++;
    }
  }


  // === Pull break data from Live Status
  for (let j = 1; j < live.length; j++) {
    const name = live[j][0];
    const breakMin = parseFloat(live[j][3] || 0);
    if (performance[name] !== undefined) {
      performance[name].breakMinutes = breakMin;
    }
  }


  // === Write everything to Performance Tracker
  for (let i = 0; i < users.length; i++) {
    const name = users[i];
    const perf = performance[name];


    const row = i + 2; // Because header is in row 1


    const score = (perf.bookings * 2) + (perf.siteVisits * 1) - (perf.delays * 0.25) - (perf.breakMinutes * 0.01);


    perfSheet.getRange(row, 2).setValue(perf.totalLeads);
    perfSheet.getRange(row, 3).setValue(perf.delays);
    perfSheet.getRange(row, 4).setValue(perf.delays); // Duplicate column in your sheet
    perfSheet.getRange(row, 5).setValue(perf.siteVisits);
    perfSheet.getRange(row, 6).setValue(perf.bookings);
    perfSheet.getRange(row, 7).setValue(perf.breakMinutes);
    perfSheet.getRange(row, 8).setValue(score.toFixed(2));
  }
}




function sendAssignmentEmail(row) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Leads");
  if (!sheet || !row || isNaN(row)) {
    Logger.log("❌ Invalid row passed to sendAssignmentEmail: " + row);
    return;
  }


  const data = sheet.getRange(row, 1, 1, 15).getValues()[0];


  const leadId = data[0];
  const project = data[1];
  const source = data[2];
  const name = data[3];
  const email = data[4];
  const phone = data[5];
  const city = data[6];
  const assignedTo = data[7];
  const assignedEmail = data[8];


  if (!assignedEmail) {
    Logger.log(`⚠️ No assigned email for lead in row ${row}`);
    return;
  }


  const subject = `🔔 New Lead Assigned: ${leadId}`;
  const body = `
Hi ${assignedTo},


A new lead has been assigned to you:


🧾 Lead ID: ${leadId}  
👤 Name: ${name}  
📞 Phone: ${phone}  
📧 Email: ${email}  
🏠 Project: ${project}  
🌐 Source: ${source}  
📍 City: ${city}


Please follow up within 10 minutes for best performance.


Regards,  
Titans
`;


  GmailApp.sendEmail(assignedEmail, subject, body);
}




function doGet(e) {
  try {
    const action = e.parameter.action || "getLeads";


    const actionsThatDontNeedEmail = [
  "addManualLead",
  "updateLead",
  "getTeamStatus",
  "updateTeamStatus",
  "getAdminStats",
  "updateManualLead",
  "getLeaderboard",
  "getDailyTip",
  "getProjectInfo"  // ✅ Add this line
];




    if (!e.parameter.email && !actionsThatDontNeedEmail.includes(action)) {
      throw new Error("Missing email parameter");
    }


    const email = (e.parameter.email || "").toLowerCase();
    const ss = SpreadsheetApp.getActiveSpreadsheet();


    // 🚀 Leads API
    if (action === "getLeads") {
      const sheet = ss.getSheetByName("Leads");
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const rows = data.slice(1);


      const assignedEmailCol = headers.indexOf("Assigned Email");
      if (assignedEmailCol === -1) throw new Error("Column 'Assigned Email' not found");


      const filtered = rows.filter(row =>
        (row[assignedEmailCol] || "").toLowerCase().includes(email)
      );


      const result = filtered.map(row => {
        const obj = {};
        headers.forEach((h, i) => obj[h] = row[i]);
        return obj;
      });


      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    }


    // ✅ Team Status
    if (action === "getTeamStatus") {
      const sheet = ss.getSheetByName("Team Status");
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const rows = data.slice(1);


      const result = rows.map(row => {
        const obj = {};
        headers.forEach((h, i) => obj[h] = row[i]);
        return obj;
      });


      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    }


    if (action === "updateTeamStatus") {
      const sheet = ss.getSheetByName("Team Status");
      const updateEmail = (e.parameter.email || "").toLowerCase();
      const newStatus = e.parameter.status;


      const data = sheet.getDataRange().getValues();
      const rowIndex = data.findIndex((row, i) => i > 0 && (row[1] || "").toLowerCase() === updateEmail);


      if (rowIndex === -1) throw new Error("Email not found in Team Status");


      sheet.getRange(rowIndex + 1, 3).setValue(newStatus);


      return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
    }


    // ⏱️ Break/Status API
    if (action === "getStatus" || action === "updateStatus") {
      const sheet = ss.getSheetByName("Live Status");
      const data = sheet.getDataRange().getValues();
      const rowIndex = data.findIndex((row, index) => index > 0 && row[1].toLowerCase() === email);
      if (rowIndex === -1) throw new Error("User not found in Live Status");


      const row = rowIndex + 1;


      if (action === "getStatus") {
        const status = sheet.getRange(row, 3).getValue();
        const breakMinutes = sheet.getRange(row, 4).getValue() || 0;
        return ContentService.createTextOutput(JSON.stringify({ status, breakMinutes })).setMimeType(ContentService.MimeType.JSON);
      }


      if (action === "updateStatus") {
        const statusRaw = (e.parameter.status || "").toLowerCase();
        const newStatus = statusRaw === "break" ? "Break" : "Active";


        const statusCell = sheet.getRange(row, 3);
        const breakStartCell = sheet.getRange(row, 5);
        const now = new Date();


        if (newStatus === "Break") {
          breakStartCell.setValue(now);
        }


        if (newStatus === "Active") {
          const start = breakStartCell.getValue();
          if (start instanceof Date) {
            const minutes = Math.floor((now - new Date(start)) / 60000);
            const totalBreakCell = sheet.getRange(row, 4);
            const existing = totalBreakCell.getValue() || 0;
            totalBreakCell.setValue(existing + minutes);
          }
          breakStartCell.setValue("");
        }


        statusCell.setValue(newStatus);
        return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
      }
    }


    // 📊 Performance API
    if (action === "getPerformance") {
      const leadsSheet = ss.getSheetByName("Leads");
      const statusSheet = ss.getSheetByName("Live Status");


      const leadsData = leadsSheet.getDataRange().getValues();
      const leadsHeaders = leadsData[0];
      const leadsRows = leadsData.slice(1);


      const assignedEmailCol = leadsHeaders.indexOf("Assigned Email");
      const calledCol = leadsHeaders.indexOf("Called?");
      const siteCol = leadsHeaders.indexOf("Site Visit?");
      const bookedCol = leadsHeaders.indexOf("Booked?");
      const delayCol = leadsHeaders.indexOf("Call Delay?");


      const userLeads = leadsRows.filter(row => (row[assignedEmailCol] || "").toLowerCase() === email);


      let totalCalls = 0, delays = 0, siteVisits = 0, bookings = 0;


      userLeads.forEach(row => {
        if (row[calledCol] === "Yes") totalCalls++;
        if (row[delayCol] === "Yes") delays++;
        if (row[siteCol] === "Yes") siteVisits++;
        if (row[bookedCol] === "Yes") bookings++;
      });


      const statusData = statusSheet.getDataRange().getValues();
      const statusRow = statusData.find(r => r[1].toLowerCase() === email);
      const breakMinutes = statusRow ? statusRow[3] || 0 : 0;


      const score = siteVisits * 1 + bookings * 2 - delays * 0.25 - breakMinutes * 0.01;


      return ContentService.createTextOutput(JSON.stringify({
        totalCalls,
        delays,
        siteVisits,
        bookings,
        breakMinutes,
        score: Math.round(score * 100) / 100
      })).setMimeType(ContentService.MimeType.JSON);
    }


    // 📋 Manual Leads - Fetch
  if (action === "getManualLeads") {
  const sheet = ss.getSheetByName("Manual Leads");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);


      const result = rows
        .filter(row => row.length > 1 && row[headers.indexOf("Assignee")].toLowerCase() === email)
      .map(row => {
        const obj = {};
        headers.forEach((h, i) => obj[h] = row[i]);
        return obj;
      });


  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}


    // 📋 Manual Leads - Add
    if (action === "addManualLead") {
      const sheet = ss.getSheetByName("Manual Leads");


      const leadId = e.parameter.leadId || "ML" + new Date().getTime().toString().slice(-6);
      const project = e.parameter.project || "";
      const name = e.parameter.name || "";
      const phone = e.parameter.phone || "";
      const lookingFor = e.parameter.lookingFor || "";
      const assignee = e.parameter.email || "";
      const siteVisit = e.parameter.siteVisit || "";
      const booked = e.parameter.booked || "";
      const feedback = e.parameter.feedback || "";


      sheet.appendRow([
        leadId,
        project,
        name,
        phone,
        lookingFor,
        assignee,
        siteVisit,
        booked,
        feedback
      ]);


      return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
    }


    // ✅ Auto Leads - Update with Feedback Time Logic
    if (action === "updateLead") {
      const sheet = ss.getSheetByName("Leads");
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const rows = data.slice(1);


      const leadId = e.parameter.leadId;
      const rowIndex = rows.findIndex(row => row[0] === leadId);
      if (rowIndex === -1) {
        return ContentService.createTextOutput(JSON.stringify({ error: "Lead ID not found" })).setMimeType(ContentService.MimeType.JSON);
      }


      const rowNum = rowIndex + 2;
      const now = new Date();


      const updates = {
        "Called?": e.parameter.called,
        "Site Visit?": e.parameter.siteVisit,
        "Booked?": e.parameter.booked,
        "Lead Quality": e.parameter.quality
      };


      for (const [key, value] of Object.entries(updates)) {
        const col = headers.indexOf(key) + 1;
        if (col > 0) {
          sheet.getRange(rowNum, col).setValue(value);
        }
      }


      for (let i = 1; i <= 5; i++) {
        const fbKey = `Feedback ${i}`;
        const timeKey = `Time ${i}`;
        const feedbackValue = e.parameter[`feedback${i}`];


        const fbCol = headers.indexOf(fbKey) + 1;
        const timeCol = headers.indexOf(timeKey) + 1;


        if (fbCol > 0) {
          sheet.getRange(rowNum, fbCol).setValue(feedbackValue);
          if (timeCol > 0 && feedbackValue) {
            sheet.getRange(rowNum, timeCol).setValue(now);
          }
        }
      }


      return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
    }




     // 📊 Admin Dashboard Analytics
if (action === "getAdminStats") {
  Logger.log("getAdminStats triggered with params: " + JSON.stringify(e.parameter));


  const project = e.parameter.project || "";
  const member = e.parameter.member || "";
  const dateRange = e.parameter.dateRange || "";


  const sheet = ss.getSheetByName("Leads");
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    

  const idx = (col) => headers.indexOf(col);


  // Validate required columns exist
  const requiredCols = ["Assigned Time", "Project", "Assigned Email", "Assigned To", "Called?", "Site Visit?", "Booked?", "Call Delay?", "Lead Quality"];
  for (let col of requiredCols) {
    if (idx(col) === -1) {
      throw new Error(`Missing required column: ${col}`);
    }
  }


  const now = new Date();
  let fromDate = new Date("2000-01-01");


  if (dateRange === "7d") fromDate.setDate(now.getDate() - 7);
  else if (dateRange === "30d") fromDate.setDate(now.getDate() - 30);
  else if (dateRange === "thisMonth") fromDate = new Date(now.getFullYear(), now.getMonth(), 1);


  const leads = data.slice(1).filter(row => {
    const timeStr = row[idx("Assigned Time")];
    if (!timeStr) return false;
    const assignedTime = new Date(timeStr);
    if (isNaN(assignedTime)) return false;


    const projMatch = !project || row[idx("Project")] === project;
    const memberMatch = !member || row[idx("Assigned To")] === member;
    const dateMatch = assignedTime >= fromDate;
    return projMatch && memberMatch && dateMatch;
  });


  Logger.log(`Filtered Leads Count: ${leads.length}`);


    const teamMap = {};


  leads.forEach(row => {
    const name = row[idx("Assigned To")] || "Unknown";
      if (!teamMap[name]) {
        teamMap[name] = {
          name,
          leads: 0,
          called: 0,
          siteVisits: 0,
          bookings: 0,
          callDelay: 0,
      };
    }


      teamMap[name].leads++;
    if (row[idx("Called?")] === "Yes") teamMap[name].called++;
    if (row[idx("Site Visit?")] === "Yes") teamMap[name].siteVisits++;
    if (row[idx("Booked?")] === "Yes") teamMap[name].bookings++;
    if (row[idx("Call Delay?")] === "Yes") teamMap[name].callDelay++;
  });


    const teamStats = Object.values(teamMap);


    const bookingTrendMap = {};
  leads.forEach(row => {
    const dt = new Date(row[idx("Assigned Time")]);
      const key = `${dt.getFullYear()}-${(dt.getMonth() + 1).toString().padStart(2, '0')}-${dt.getDate().toString().padStart(2, '0')}`;
      if (!bookingTrendMap[key]) bookingTrendMap[key] = 0;
    if (row[idx("Booked?")] === "Yes") bookingTrendMap[key]++;
    });


    const bookingTrend = Object.keys(bookingTrendMap).map(date => ({
      date,
      bookings: bookingTrendMap[date],
    }));


    const qualityMap = { WIP: 0, Warm: 0, Cold: 0 };
  leads.forEach(row => {
    const q = row[idx("Lead Quality")];
    if (q && qualityMap[q] !== undefined) {
      qualityMap[q]++;
    }
  });


    const qualityDistribution = Object.keys(qualityMap).map(k => ({
      name: k,
      value: qualityMap[k],
    }));


    const result = {
      teamStats,
      bookingTrend,
      qualityDistribution,
  };


  return ContentService.createTextOutput(JSON.stringify(result))
  .setMimeType(ContentService.MimeType.JSON);
}


if (action === "updateManualLead") {
  const sheet = ss.getSheetByName("Manual Leads");
  const leadId = e.parameter.leadId;
  const field = e.parameter.field;
  const value = e.parameter.value;


  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rowIndex = data.findIndex((row, i) => i > 0 && row[0] === leadId);
  if (rowIndex === -1) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Lead not found" })).setMimeType(ContentService.MimeType.JSON);
  }


  const colIndex = headers.indexOf(field);
  if (colIndex === -1) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Field not found" })).setMimeType(ContentService.MimeType.JSON);
  }


  sheet.getRange(rowIndex + 1, colIndex + 1).setValue(value);
  return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
}






  if (action === "getDailyTip") {
  const sheet = ss.getSheetByName("Daily Tips");
  const data = sheet.getDataRange().getValues();
  const today = new Date();
  const dayIndex = (today.getDate() - 1) % data.length; // Day 1 shows Row 2
  const tip = data[dayIndex][0] || "No tip available today.";
  return ContentService.createTextOutput(JSON.stringify({ tip }))
    .setMimeType(ContentService.MimeType.JSON);
}


if (action === "getLeaderboard") {
  const sheet = ss.getSheetByName("Leads");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);


  const idx = (col) => headers.indexOf(col);
  const map = {};


  rows.forEach(row => {
    const name = row[idx("Assigned To")] || "Unknown";
    const called = row[idx("Called?")] === "Yes" ? 1 : 0;
    const visit = row[idx("Site Visit?")] === "Yes" ? 1 : 0;
    const booked = row[idx("Booked?")] === "Yes" ? 1 : 0;


    if (!map[name]) {
      map[name] = { name, leads: 0, called: 0, siteVisits: 0, bookings: 0, score: 0 };
    }


    map[name].leads++;
    map[name].called += called;
    map[name].siteVisits += visit;
    map[name].bookings += booked;
  });


  // score: +1 for visit, +2 for booking
  for (let key in map) {
    const m = map[key];
    m.score = m.siteVisits * 1 + m.bookings * 2;
  }


  const result = Object.values(map).sort((a, b) => b.score - a.score);


  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}




if (action === "getUserTasks") {
  const sheet = ss.getSheetByName("Upcoming Tasks");
  const email = e.parameter.email?.toLowerCase();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);


  const result = rows
    .filter(row => row[0]?.toLowerCase() === email)
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });


  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}


// ✅ Add new task
if (action === "addUserTask") {
  const sheet = ss.getSheetByName("Upcoming Tasks");
  const email = e.parameter.email;
  const task = e.parameter.task;


  if (!email || !task) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Missing parameters" }))
      .setMimeType(ContentService.MimeType.JSON);
  }


  sheet.appendRow([email, task, "Pending", new Date()]);
  return ContentService.createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}


// ✅ Mark task as done
if (action === "markTaskDone") {
  const sheet = ss.getSheetByName("Upcoming Tasks");
  const email = e.parameter.email;
  const task = e.parameter.task;


  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  const taskIndex = rows.findIndex(row => row[0] === email && row[1] === task);


  if (taskIndex === -1) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Task not found" }))
      .setMimeType(ContentService.MimeType.JSON);
  }


  const rowNum = taskIndex + 2; // +1 for header, +1 for 0-index
  const statusCol = headers.indexOf("Status") + 1;
  sheet.getRange(rowNum, statusCol).setValue("Done");


  return ContentService.createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}


if (action === "getTasks") {
  const sheet = ss.getSheetByName("Tasks");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);


  const result = rows
    .filter(row => row[headers.indexOf("Email")].toLowerCase() === email)
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });


  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}


if (action === "getMonthlyChallenge") {
  const sheet = ss.getSheetByName("Monthly Challenge");
  const data = sheet.getDataRange().getValues();
  const today = new Date();
  const monthName = today.toLocaleString("default", { month: "long" }) + " " + today.getFullYear(); // e.g., May 2025


  Logger.log("Looking for challenge for: " + monthName);


  const headers = data[0];
  const rows = data.slice(1);


  const row = rows.find(r => r[0] === monthName);


  if (!row) {
    return ContentService.createTextOutput(JSON.stringify({ error: "No challenge set" })).setMimeType(ContentService.MimeType.JSON);
  }


  const siteVisitTarget = row[1];
  const bookingTarget = row[2];
  const prize = row[3] || "";


  const leadsSheet = ss.getSheetByName("Leads");
  const leads = leadsSheet.getDataRange().getValues();
  const h = leads[0];
  const r = leads.slice(1);


  const email = e.parameter.email?.toLowerCase();
  const idx = (col) => h.indexOf(col);
  const userRows = r.filter(row => (row[idx("Assigned Email")] || "").toLowerCase() === email);


  const visitDone = userRows.filter(row => row[idx("Site Visit?")] === "Yes").length;
  const bookedDone = userRows.filter(row => row[idx("Booked?")] === "Yes").length;


  const completed = visitDone >= siteVisitTarget && bookedDone >= bookingTarget;


  return ContentService.createTextOutput(JSON.stringify({
    month: monthName,
    siteVisitTarget,
    bookingTarget,
    prize,
    siteVisitDone: visitDone,
    bookingDone: bookedDone,
    completed
  })).setMimeType(ContentService.MimeType.JSON);
}


if (action === "getProjectInfo") {
  const brochureSheetId = "1s3j0Ngdrsk4r753jPl3DY5XCLFBeK7Zx1ck87WR-mec";
  const projectName = (e.parameter.project || "").trim().toLowerCase(); // 👈 lowercase here


  const ss = SpreadsheetApp.openById(brochureSheetId);
  const sheet = ss.getSheetByName("Sheet1"); // ✅ Use correct sheet tab name
  const data = sheet.getDataRange().getValues();
  const headers = data[0];


  const match = data.find((row, i) =>
    i > 0 && (row[0] || "").toString().trim().toLowerCase() === projectName // 👈 case-insensitive match
  );


  if (!match) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Project not found" }))
      .setMimeType(ContentService.MimeType.JSON);
  }


  const obj = {};
  headers.forEach((h, i) => obj[h] = match[i]);
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}










    // 🔚 Default fallback
    throw new Error("Invalid action");


  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ error: error.message })).setMimeType(ContentService.MimeType.JSON);
  }
}






















function doPost(e) {
  try {
    const { leadId, updates } = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Leads");
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const leadIdCol = headers.indexOf("Lead ID");


    if (leadIdCol === -1) throw new Error("Lead ID column not found");


    const rowIndex = data.findIndex((row, i) => i > 0 && row[leadIdCol] === leadId);
    if (rowIndex === -1) throw new Error("Lead not found");


    const actualRow = rowIndex + 1;


    for (const field in updates) {
      const colIndex = headers.indexOf(field);
      if (colIndex !== -1) {
        sheet.getRange(actualRow + 1, colIndex + 1).setValue(updates[field]);
      }
    }


    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);


  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

















