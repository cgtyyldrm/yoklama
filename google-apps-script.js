/**
 * QR Attendance System - Google Apps Script (Multi-Teacher Remodel)
 *
 * SHEETS STRUCTURE:
 * 1. Teachers: [Email, Password, Name, Created At]
 * 2. Courses: [Course Name, Term Start, Term End, Class Day, Created At, Teacher Email]
 * 3. Sessions: [Course Name, Date, Status]
 * 4. Rosters: [Course Name, Student Name, Student Number]
 * 5. Attendance: [Timestamp, Course Name, Student Name, Student Number, Session Date]
 */

function doPost(e) {
    var params = e.parameter || {};
    var postData = JSON.parse(e.postData.contents || '{}');
    var action = params.action || postData.action;

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // --- TEACHER ACTIONS ---

    if (action === 'login') {
        return handleLogin(ss, postData);
    }

    if (action === 'createCourse') {
        return handleCreateCourse(ss, postData);
    }

    if (action === 'updateSessionStatus') {
        return handleUpdateSessionStatus(ss, postData);
    }

    if (action === 'uploadRoster') {
        return handleUploadRoster(ss, postData);
    }

    // --- STUDENT ACTIONS ---

    if (action === 'recordAttendance') {
        return handleRecordAttendance(ss, postData);
    }

    if (action === 'updateAttendanceManually') {
        return handleUpdateAttendanceManually(ss, postData);
    }

    return responseError('Invalid action');
}

function handleUpdateAttendanceManually(ss, data) {
    var course = data.course;
    var dateStr = data.date;
    var studentNumber = String(data.number).trim();
    var status = data.status; // true (Present) or false (Absent)
    var studentName = data.name || 'Unknown'; // Optional if removing

    var attSheet = getOrCreateSheet(ss, 'Attendance', ['Timestamp', 'Course Name', 'Student Name', 'Student Number', 'Session Date', 'Status']);
    var values = attSheet.getDataRange().getValues();

    // Normalize target values for comparison
    var targetCourse = String(course).trim();
    var targetNum = studentNumber.toLowerCase();

    // If setting to ABSENT, we REMOVE the row.
    if (status === 'Absent' || status === 'false' || status === false) {
        var newValues = [values[0]]; // keep header
        var rowsDeleted = 0;

        for (var i = 1; i < values.length; i++) {
            var rowDate = formatDateISO(values[i][4]);
            var rowCourse = String(values[i][1]).trim();
            var rowNum = String(values[i][3]).trim().toLowerCase();

            // Match Logic: Same Course + Same Student + Same Date
            if (rowCourse === targetCourse && rowNum === targetNum && rowDate === dateStr) {
                rowsDeleted++;
            } else {
                newValues.push(values[i]);
            }
        }

        if (rowsDeleted > 0) {
            attSheet.clearContents();
            if (newValues.length > 0) {
                attSheet.getRange(1, 1, newValues.length, newValues[0].length).setValues(newValues);
            }
        }
        return responseSuccess({ message: 'Removed', status: 'Absent' });
    }

    // If setting to PRESENT or EXCUSED
    else {
        var foundIndex = -1;
        for (var i = 1; i < values.length; i++) {
            var rowDate = formatDateISO(values[i][4]);
            var rowCourse = String(values[i][1]).trim();
            var rowNum = String(values[i][3]).trim().toLowerCase();

            if (rowCourse === targetCourse && rowNum === targetNum && rowDate === dateStr) {
                foundIndex = i;
                break;
            }
        }

        if (foundIndex !== -1) {
            // Update existing row's Status column (Index 5 -> Column 6)
            var range = attSheet.getRange(foundIndex + 1, 6);
            range.setValue(status);
            return responseSuccess({ message: 'Updated', status: status });
        } else {
            // Append new record
            attSheet.appendRow([new Date(), course, studentName, studentNumber, dateStr, status]);
            return responseSuccess({ message: 'Added', status: status });
        }
    }
}

function doGet(e) {
    var params = e.parameter || {};
    var action = params.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === 'getCourses') {
        return handleGetCourses(ss, params);
    }

    if (action === 'getSessions') {
        return handleGetSessions(ss, params);
    }

    if (action === 'getStudentStats') {
        return handleGetStudentStats(ss, params);
    }

    if (action === 'getRoster') {
        return handleGetRoster(ss, params);
    }

    if (action === 'getSessionAttendance') {
        return handleGetSessionAttendance(ss, params);
    }

    return responseError('Invalid action');
}

// --- EXTENDED HANDLERS ---

function handleGetSessionAttendance(ss, params) {
    var course = params.course;
    var dateStr = params.date; // YYYY-MM-DD

    // Get Roster
    var rosterSheet = getOrCreateSheet(ss, 'Rosters', ['Course Name', 'Student Name', 'Student Number']);
    var rValues = rosterSheet.getDataRange().getValues();
    var students = [];

    // Normalize string comparisons
    for (var i = 1; i < rValues.length; i++) {
        if (rValues[i][0] === course) {
            students.push({
                name: rValues[i][1],
                number: String(rValues[i][2]).trim()
            });
        }
    }

    // Get Attendance
    var attSheet = getOrCreateSheet(ss, 'Attendance', ['Timestamp', 'Course Name', 'Student Name', 'Student Number', 'Session Date', 'Status']);
    var aValues = attSheet.getDataRange().getValues();

    // Create map for quick lookup: number -> status
    var statusMap = {};
    for (var i = 1; i < aValues.length; i++) {
        var rowDate = formatDateISO(aValues[i][4]);
        // Compare Course (Trimmed), Date, and Number
        if (String(aValues[i][1]).trim() === String(course).trim() && rowDate === dateStr) {
            var num = String(aValues[i][3]).trim().toLowerCase();
            // Default to 'Present' if column 6 is missing/empty
            var stat = (aValues[i][5] && String(aValues[i][5]).trim() !== "") ? aValues[i][5] : 'Present';
            statusMap[num] = stat;
        }
    }

    // Merge
    var result = students.map(function (s) {
        var stat = statusMap[s.number.toLowerCase()] || 'Absent';
        return {
            name: s.name,
            number: s.number,
            status: stat // 'Present', 'Absent', 'Excused'
        };
    });

    // Sort by Number
    result.sort(function (a, b) { return a.number.localeCompare(b.number); });

    return responseSuccess({ students: result });
}

function handleGetSessions(ss, params) {
    var course = params.course;
    var sheet = getOrCreateSheet(ss, 'Sessions', ['Course Name', 'Date', 'Status']);
    var values = sheet.getDataRange().getValues();
    var sessions = [];
    for (var i = 1; i < values.length; i++) {
        if (values[i][0] === course) {
            var d = values[i][1];
            sessions.push({ date: (d instanceof Date ? formatDateISO(d) : d), status: values[i][2] });
        }
    }
    sessions.sort(function (a, b) { return new Date(a.date) - new Date(b.date) });
    return responseSuccess({ sessions: sessions });
}

// --- HANDLERS ---

function handleLogin(ss, data) {
    var email = data.email;
    var password = data.password;

    if (!email || !password) return responseError('Email and password required');

    var teachersSheet = getOrCreateSheet(ss, 'Teachers', ['Email', 'Password', 'Name', 'Created At']);
    var values = teachersSheet.getDataRange().getValues();

    // Create default admin if sheet is empty (excluding header)
    if (values.length <= 1) {
        teachersSheet.appendRow(['admin@test.com', 'admin', 'System Admin', new Date()]);
        values = teachersSheet.getDataRange().getValues(); // refresh
    }

    for (var i = 1; i < values.length; i++) {
        if (String(values[i][0]).toLowerCase() === String(email).toLowerCase() &&
            String(values[i][1]) === String(password)) {
            return responseSuccess({ message: 'Login successful', name: values[i][2], email: values[i][0] });
        }
    }

    return responseError('Invalid email or password');
}

function handleCreateCourse(ss, data) {
    var name = data.name;
    var startStr = data.start;
    var endStr = data.end;
    var dayOfWeek = parseInt(data.day);
    var teacherEmail = data.teacherEmail;

    if (!name || !startStr || !endStr || isNaN(dayOfWeek) || !teacherEmail) {
        return responseError('Missing details');
    }

    // Use "Course Name" as unique ID logic for now, but really we should check if exists for THIS teacher or globally? 
    // Let's assume Course Names are unique globally to avoid confusion in student app.

    var coursesSheet = getOrCreateSheet(ss, 'Courses', ['Course Name', 'Term Start', 'Term End', 'Class Day', 'Created At', 'Teacher Email']);
    // Check duplicate
    var saved = coursesSheet.getDataRange().getValues();
    for (var i = 1; i < saved.length; i++) {
        if (saved[i][0] === name) return responseError('Course name already exists. Please choose a unique name.');
    }

    coursesSheet.appendRow([name, startStr, endStr, dayOfWeek, new Date(), teacherEmail]);

    // Generate Sessions
    var sessionsSheet = getOrCreateSheet(ss, 'Sessions', ['Course Name', 'Date', 'Status']);
    var startDate = new Date(startStr);
    var endDate = new Date(endStr);
    var updates = [];

    var d = new Date(startDate);
    while (d.getDay() !== dayOfWeek) {
        d.setDate(d.getDate() + 1);
    }

    while (d <= endDate) {
        updates.push([name, formatDateISO(d), 'Active']);
        d.setDate(d.getDate() + 7);
    }

    if (updates.length > 0) {
        sessionsSheet.getRange(sessionsSheet.getLastRow() + 1, 1, updates.length, 3).setValues(updates);
    }

    return responseSuccess({ message: 'Course created', count: updates.length });
}

function handleUpdateSessionStatus(ss, data) {
    var course = data.course;
    var dateStr = data.date;
    var status = data.status;

    var sessionsSheet = getOrCreateSheet(ss, 'Sessions', ['Course Name', 'Date', 'Status']);
    var values = sessionsSheet.getDataRange().getValues();

    for (var i = 1; i < values.length; i++) {
        var rowDate = values[i][1];
        var rowDateStr = (rowDate instanceof Date) ? formatDateISO(rowDate) : rowDate;

        if (values[i][0] === course && rowDateStr === dateStr) {
            sessionsSheet.getRange(i + 1, 3).setValue(status);
            return responseSuccess({ message: 'Updated' });
        }
    }
    return responseError('Session not found');
}

function handleUploadRoster(ss, data) {
    var className = data.class;
    var roster = data.roster || [];
    var rosterSheet = getOrCreateSheet(ss, 'Rosters', ['Course Name', 'Student Name', 'Student Number']);

    // naive overwrite for this class
    var values = rosterSheet.getDataRange().getValues();
    var newValues = [values[0]];

    for (var i = 1; i < values.length; i++) {
        if (values[i][0] !== className) newValues.push(values[i]);
    }

    roster.forEach(function (r) {
        newValues.push([className, r.name, r.number]);
    });

    rosterSheet.clearContents();
    rosterSheet.getRange(1, 1, newValues.length, newValues[0].length).setValues(newValues);
    return responseSuccess({ message: 'Roster saved' });
}

function handleRecordAttendance(ss, data) {
    var course = data.course;
    var name = data.name;
    var number = String(data.number).trim(); // Normalize

    // --- VALIDATION: Check Roster ---
    var rosterSheet = getOrCreateSheet(ss, 'Rosters', ['Course Name', 'Student Name', 'Student Number']);
    var rValues = rosterSheet.getDataRange().getValues();
    var isEnrolled = false;
    var targetNum = number.toLowerCase();

    for (var i = 1; i < rValues.length; i++) {
        // Course Name match AND Student Number match
        if (rValues[i][0] === course && String(rValues[i][2]).trim().toLowerCase() === targetNum) {
            isEnrolled = true;
            break;
        }
    }

    if (!isEnrolled) {
        return responseError('Derse kayıtlı değilsiniz.');
    }
    // --------------------------------
    var todayStr = formatDateISO(new Date());

    var sessionsSheet = getOrCreateSheet(ss, 'Sessions', ['Course Name', 'Date', 'Status']);
    var sValues = sessionsSheet.getDataRange().getValues();

    // Check for active session
    var activeSessionExists = false;
    for (var i = 1; i < sValues.length; i++) {
        var d = sValues[i][1];
        var dStr = (d instanceof Date) ? formatDateISO(d) : d;
        if (sValues[i][0] === course && dStr === todayStr && sValues[i][2] === 'Active') {
            activeSessionExists = true; break;
        }
    }

    // Default status for QR scan is 'Present'
    // Update headers to include Status
    var attSheet = getOrCreateSheet(ss, 'Attendance', ['Timestamp', 'Course Name', 'Student Name', 'Student Number', 'Session Date', 'Status']);
    var aValues = attSheet.getDataRange().getValues();

    // Check if already exists (duplicate)
    for (var i = 1; i < aValues.length; i++) {
        var rowDate = (aValues[i][4] instanceof Date) ? formatDateISO(aValues[i][4]) : aValues[i][4];
        if (aValues[i][1] === course && String(aValues[i][3]).toLowerCase() === number.toLowerCase() && rowDate === todayStr) {
            // Already recorded
            var stats = calculateSingleStudentStats(ss, course, number);
            return responseSuccess({ result: 'already_recorded', stats: stats });
        }
    }

    // Append with Status 'Present'
    attSheet.appendRow([new Date(), course, name, number, todayStr, 'Present']);

    // Calculate stats for return
    var stats = calculateSingleStudentStats(ss, course, number);

    return responseSuccess({ result: 'success', stats: stats });
}

function calculateSingleStudentStats(ss, course, studentNumber) {
    var sessionsSheet = getOrCreateSheet(ss, 'Sessions', ['Course Name', 'Date', 'Status']);
    var sValues = sessionsSheet.getDataRange().getValues();
    var attSheet = getOrCreateSheet(ss, 'Attendance', ['Timestamp', 'Course Name', 'Student Name', 'Student Number', 'Session Date']);
    var aValues = attSheet.getDataRange().getValues();

    var total = 0;
    var now = new Date();
    now.setHours(23, 59, 59, 999);

    // Calculate Total Sessions for this Course
    for (var k = 1; k < sValues.length; k++) {
        if (sValues[k][0] === course && sValues[k][2] === 'Active') {
            var sd = (sValues[k][1] instanceof Date) ? sValues[k][1] : new Date(sValues[k][1]);
            if (sd <= now) total++;
        }
    }

    // Calculate Attended
    var attended = 0;
    for (var k = 1; k < aValues.length; k++) {
        // Case insensitive number check
        if (aValues[k][1] === course && String(aValues[k][3]).toLowerCase() === String(studentNumber).toLowerCase()) {
            attended++;
        }
    }

    return { attended: attended, total: total };
}

function handleGetCourses(ss, params) {
    // ... (existing)
    var teacherEmail = params.email;
    var sheet = getOrCreateSheet(ss, 'Courses', ['Course Name', 'Term Start', 'Term End', 'Class Day', 'Created At', 'Teacher Email']);
    var values = sheet.getDataRange().getValues();
    var courses = [];

    for (var i = 1; i < values.length; i++) {
        if (teacherEmail && String(values[i][5]).toLowerCase() === String(teacherEmail).toLowerCase()) {
            courses.push({
                name: values[i][0],
                start: values[i][1],
                end: values[i][2],
                day: values[i][3]
            });
        }
    }
    return responseSuccess({ courses: courses });
}
// (Keeping other handlers as they were, they are fine or not touched by this request)

function handleGetStudentStats(ss, params) {
    var studentNumber = String(params.number).trim().toLowerCase(); // Normalize
    var rosterSheet = getOrCreateSheet(ss, 'Rosters', ['Course Name', 'Student Name', 'Student Number']);
    var rValues = rosterSheet.getDataRange().getValues();
    var enrolled = [];

    // Case insensitive enrollment check
    for (var i = 1; i < rValues.length; i++) {
        if (String(rValues[i][2]).toLowerCase() === studentNumber) {
            enrolled.push(rValues[i][0]);
        }
    }

    var stats = [];
    // Reuse calculateSingleStudentStats logic? It's per course. 
    // To minimize changes let's specific loop here but assume helper logic is similar.
    // Actually, let's just loop enrolled courses and call helper

    enrolled.forEach(function (courseName) {
        var s = calculateSingleStudentStats(ss, courseName, studentNumber);
        stats.push({ course: courseName, total: s.total, attended: s.attended });
    });

    return responseSuccess({ stats: stats });
}

// --- HELPERS ---
function getOrCreateSheet(ss, name, headers) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
        sheet = ss.insertSheet(name);
        sheet.appendRow(headers);
    }
    return sheet;
}

function responseSuccess(data) {
    return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
function responseError(msg) {
    return ContentService.createTextOutput(JSON.stringify({ error: msg })).setMimeType(ContentService.MimeType.JSON);
}
// Helper to safely convert any date input to YYYY-MM-DD String
function formatDateISO(date) {
    if (!date) return "";
    // If it's already a string like "2024-02-18", just return it (or first 10 chars)
    if (typeof date === 'string') return date.substring(0, 10);

    // If it's a Date object, use getFullYear/Month/Date which uses local script time.
    // Ensure we pad with 0
    var d = new Date(date);
    var m = '' + (d.getMonth() + 1), dy = '' + d.getDate(), y = d.getFullYear();
    if (m.length < 2) m = '0' + m;
    if (dy.length < 2) dy = '0' + dy;
    return [y, m, dy].join('-');
}
