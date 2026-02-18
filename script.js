// ==========================================
// AYARLAR
// ==========================================
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbynBFhZqNKFRrcYHcaL2cVZmoauT4QOOCaeSevr7nFXWlQt-wy6PmiwcwCbs24P_JRz/exec';
const MAX_DISTANCE_METERS = 300;

// ==========================================
// ELEMENT SEÇİMLERİ & INIT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Shared Utils (if any)

    // Student Page Logic
    if (document.getElementById('attendanceForm')) {
        initStudentPage();
    }
});

function initStudentPage() {
    setupTabs();

    // URL Params
    const urlParams = new URLSearchParams(window.location.search);
    const className = urlParams.get('class');
    const teacherLat = urlParams.get('lat');
    const teacherLon = urlParams.get('lon');

    // Setup Attendance Form
    const form = document.getElementById('attendanceForm');
    const statusMsg = document.getElementById('statusMessage');

    if (className) {
        document.getElementById('displayClassName').textContent = className;
        document.getElementById('hiddenClassName').value = className;

        // Double Entry Check (Client Side)
        const todayKey = `attendance_${className}_${new Date().toLocaleDateString()}`;
        if (localStorage.getItem(todayKey)) {
            form.style.display = 'none';
            statusMsg.innerHTML = warningAlert('Bugün zaten yoklama verdiniz.');
        }
    } else {
        // If no class param, maybe they just want to check stats? 
        // Hide attendance tab content or show warning
        if (!document.getElementById('statsTab').classList.contains('active')) {
            document.getElementById('displayClassName').textContent = '-';
            statusMsg.innerHTML = infoAlert('Ders bilgisi bulunamadı. QR kodu okutarak tekrar deneyin veya devamsızlık sorgulayın.');
            form.style.display = 'none';
        }
    }

    // Handle Form Submit
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button');

        // Geolocation Check
        if (teacherLat && teacherLon) {
            btn.disabled = true;
            btn.textContent = 'Konum Doğrulanıyor...';
            try {
                const dist = await checkDistance(teacherLat, teacherLon);
                if (dist > MAX_DISTANCE_METERS) {
                    statusMsg.innerHTML = errorAlert(`Sınıftan çok uzaktasınız! (${Math.round(dist)}m)`);
                    btn.disabled = false;
                    btn.textContent = 'Yoklamayı Gönder';
                    return;
                }
            } catch (err) {
                statusMsg.innerHTML = errorAlert('Konum alınamadı. GPS izni verin.');
                btn.disabled = false;
                btn.textContent = 'Yoklamayı Gönder';
                return;
            }
        }

        // Submit
        btn.disabled = true;
        btn.textContent = 'Kaydediliyor...';

        const data = {
            name: document.getElementById('studentName').value,
            number: document.getElementById('studentNumber').value,
            course: document.getElementById('hiddenClassName').value // Backend expects "course"
        };

        callApi('recordAttendance', data)
            .then(res => {
                if (res.error) {
                    statusMsg.innerHTML = errorAlert(res.error);
                    btn.disabled = false;
                    btn.textContent = 'Tekrar Dene';
                } else if (res.result === 'already_recorded') {
                    statusMsg.innerHTML = warningAlert('Daha önce kaydedilmiş.');
                    localStorage.setItem(`attendance_${data.course}_${new Date().toLocaleDateString()}`, 'true');
                } else {
                    let msg = 'Yoklama başarıyla alındı!';
                    if (res.stats) {
                        const percent = res.stats.total > 0 ? Math.round((res.stats.attended / res.stats.total) * 100) : 0;
                        msg += `<br><span style="font-size:0.9rem; opacity:0.9;">Katılım Durumu: %${percent} (${res.stats.attended}/${res.stats.total})</span>`;
                    }
                    statusMsg.innerHTML = successAlert(msg);
                    localStorage.setItem(`attendance_${data.course}_${new Date().toLocaleDateString()}`, 'true');
                    form.reset();
                    form.style.display = 'none';
                }
            })
            .catch(err => {
                statusMsg.innerHTML = errorAlert('Bağlantı hatası.');
                btn.disabled = false;
                btn.textContent = 'Tekrar Dene';
            });
    });

    // Setup Stats
    document.getElementById('checkStatsBtn').addEventListener('click', handleCheckStats);
}

// --- TABS ---
function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    if (tabs.length === 0) return;

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const target = tab.getAttribute('data-tab');
            if (target === 'attendance') {
                document.getElementById('attendanceTab').classList.add('active');
            } else {
                document.getElementById('statsTab').classList.add('active');
            }
        });
    });
}

// --- STATS ---
function handleCheckStats() {
    const number = document.getElementById('statsStudentNumber').value;
    const resDiv = document.getElementById('statsResult');
    const btn = document.getElementById('checkStatsBtn');

    if (!number) { alert('Numara girin'); return; }

    btn.disabled = true;
    btn.textContent = 'Sorgulanıyor...';
    resDiv.innerHTML = '<div class="loading">Yükleniyor...</div>';
    resDiv.classList.remove('hidden');

    callApi('getStudentStats', { number: number }, 'GET')
        .then(data => {
            resDiv.innerHTML = '';
            btn.disabled = false;
            btn.textContent = 'Sorgula';

            if (data.stats && data.stats.length > 0) {
                let html = '<div class="cards-grid">';
                data.stats.forEach(s => {
                    const percent = s.total > 0 ? Math.round((s.attended / s.total) * 100) : 0;
                    let color = percent < 70 ? 'var(--danger-color)' : 'var(--success-color)';

                    html += `
                    <div class="card">
                        <h3>${s.course}</h3>
                        <p>Katılım: <strong>${s.attended} / ${s.total}</strong> hafta</p>
                        <div style="background: rgba(255,255,255,0.1); border-radius: 4px; height: 10px; width: 100%;">
                            <div style="background: ${color}; width: ${percent}%; height: 100%; border-radius: 4px;"></div>
                        </div>
                        <p style="margin-top: 5px; font-size: 0.8rem; text-align: right;">%${percent}</p>
                    </div>`;
                });
                html += '</div>';
                resDiv.innerHTML = html;
            } else {
                resDiv.innerHTML = '<p>Kayıt bulunamadı.</p>';
            }
        })
        .catch(err => {
            resDiv.innerHTML = errorAlert('Hata oluştu.');
            btn.disabled = false;
            btn.textContent = 'Sorgula';
        });
}

// --- UTILS ---

async function callApi(action, data = {}, method = 'POST') {
    let url = localStorage.getItem('attendance_api_url');
    if (!url) url = DEFAULT_API_URL;

    if (method === 'GET') {
        const params = new URLSearchParams(data);
        params.append('action', action);
        const res = await fetch(url + '?' + params.toString());
        return await res.json();
    } else {
        const payload = { ...data, action };
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        return await res.json();
    }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

function checkDistance(lat, lon) {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) reject('No Geo');
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const d = calculateDistance(lat, lon, pos.coords.latitude, pos.coords.longitude);
                resolve(d);
            },
            (err) => reject(err)
        );
    });
}

function errorAlert(msg) {
    return `<div class="error-message">⛔ ${msg}</div>`;
}
function warningAlert(msg) {
    return `<div class="error-message" style="background: rgba(245, 158, 11, 0.2); border-color: var(--warning-color); color: var(--warning-color);">⚠️ ${msg}</div>`;
}
function successAlert(msg) {
    return `<div class="success-message">✅ ${msg}</div>`;
}
function infoAlert(msg) {
    return `<div class="success-message" style="background: rgba(59, 130, 246, 0.2); border-color: #3b82f6; color: #60a5fa;">ℹ️ ${msg}</div>`;
}