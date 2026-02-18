// Helper to get API URL from localStorage or default
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxpQIE8xgooCWRBMsKcyiqJn--dqA4pkLugUli8U7PiABweLn9hn_fc6Zg6Y9XoulW0/exec';

function getApiUrl() {
    return localStorage.getItem('attendance_api_url') || DEFAULT_API_URL;
}

function parseCsv(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length);
    const rows = lines.map(line => {
        const parts = line.split(',');
        return { name: parts[0].trim(), number: (parts[1] || '').trim() };
    });
    return rows;
}

document.getElementById('uploadRosterBtn').addEventListener('click', async () => {
    const className = document.getElementById('classNameRoster').value.trim();
    const csv = document.getElementById('rosterCsv').value;
    if (!className) return alert('Lütfen ders adı girin.');
    if (!csv) return alert('Lütfen roster CSV içeriğini yapıştırın.');

    const roster = parseCsv(csv);
    const apiUrl = getApiUrl() + `?action=uploadRoster&class=${encodeURIComponent(className)}`;

    try {
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roster })
        });
        const data = await res.json();
        if (data.result === 'roster_saved') {
            alert('Roster kaydedildi.');
        } else {
            alert('Beklenmeyen cevap: ' + JSON.stringify(data));
        }
    } catch (err) {
        console.error(err);
        alert('Roster yüklenirken hata oluştu.');
    }
});

document.getElementById('checkAttendanceBtn').addEventListener('click', async () => {
    const className = document.getElementById('classNameRoster').value.trim();
    const start = document.getElementById('startDate').value;
    const end = document.getElementById('endDate').value;
    const results = document.getElementById('results');
    results.innerHTML = '';
    if (!className) return alert('Lütfen ders adı girin.');
    if (!start || !end) return alert('Başlangıç ve bitiş tarihlerini seçin.');

    const apiUrlBase = getApiUrl();

    try {
        // 1) get roster
        const rosterRes = await fetch(apiUrlBase + `?action=getRoster&class=${encodeURIComponent(className)}`);
        const rosterData = await rosterRes.json();
        const roster = rosterData.roster || [];

        // 2) get attendance in date range
        const attendanceRes = await fetch(apiUrlBase + `?action=getAttendance&class=${encodeURIComponent(className)}&start=${start}&end=${end}`);
        const attendanceData = await attendanceRes.json();
        const rows = attendanceData.rows || [];

        // Build map of present student numbers or names
        const presentByNumber = {};
        rows.forEach(r => {
            if (r.number) presentByNumber[r.number] = true;
            else presentByNumber[r.name] = true;
        });

        // Prepare result HTML
        let html = '<h3>Sonuçlar</h3>';
        html += `<p>Ders: <strong>${className}</strong> — ${start} → ${end}</p>`;
        html += '<ul>';
        roster.forEach(s => {
            const key = s.number || s.name;
            const present = !!presentByNumber[key];
            html += `<li>${s.name} (${s.number}) — ${present ? '<strong style="color:green">Geldi</strong>' : '<strong style="color:red">Gelmedi</strong>'}</li>`;
        });
        html += '</ul>';

        // Also show any attendees not in roster
        const extras = rows.filter(r => !roster.some(s => s.number === r.number || s.name === r.name));
        if (extras.length) {
            html += '<h4>Rosterda olmayan kayıtlar</h4><ul>';
            extras.forEach(e => { html += `<li>${e.name} (${e.number}) — ${new Date(e.timestamp).toLocaleString()}</li>` });
            html += '</ul>';
        }

        results.innerHTML = html;

    } catch (err) {
        console.error(err);
        alert('Veri alınırken hata oluştu.');
    }
});
