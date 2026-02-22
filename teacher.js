const API_URL_KEY = 'attendance_api_url';
let currentCourse = null;

// Initialize when ready
document.addEventListener('DOMContentLoaded', () => {
    try {
        checkLogin();
        setupTabs();
        setupForms();
    } catch (e) {
        console.error("Init Error:", e);
        alert("Başlatma hatası: " + e.message);
    }
});

// --- AUTHENTICATION ---

function checkLogin() {
    const isLoggedIn = localStorage.getItem('teacher_logged_in');
    const teacherName = localStorage.getItem('teacher_name');
    const modal = document.getElementById('loginModal');
    const db = document.getElementById('dashboard');

    if (isLoggedIn) {
        modal.style.display = 'none';
        db.classList.remove('hidden');
        if (teacherName) {
            // User requested to see Email, not Name (especially to avoid 'System Admin')
            const email = localStorage.getItem('teacher_email');
            document.getElementById('teacherNameDisplay').textContent = email || teacherName;
        }
        loadCourses();
        loadRosterCourses();
    } else {
        modal.style.display = 'flex'; // Explicitly show as flex
        db.classList.add('hidden');
    }

    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('teacher_logged_in');
        localStorage.removeItem('teacher_email');
        localStorage.removeItem('teacher_name');
        window.location.reload();
    });
}

function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('emailInput').value;
    const password = document.getElementById('passwordInput').value;
    const errorMsg = document.getElementById('loginError');

    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Giriş Yapılıyor...';

    callApi('login', { email: email, password: password })
        .then(data => {
            if (data.error) {
                errorMsg.textContent = "Hatalı e-posta veya şifre!";
                errorMsg.classList.remove('hidden');
            } else {
                localStorage.setItem('teacher_logged_in', 'true');
                localStorage.setItem('teacher_email', data.email);
                localStorage.setItem('teacher_name', data.name);
                window.location.reload();
            }
        })
        .catch(err => {
            console.error(err);
            errorMsg.textContent = "Bağlantı hatası: " + err.message;
            errorMsg.classList.remove('hidden');
        })
        .finally(() => {
            btn.disabled = false;
            btn.textContent = 'Giriş';
        });
}

// --- TABS ---


function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const target = tab.getAttribute('data-tab');

            if (target === 'courses') {
                document.getElementById('coursesList').style.display = 'grid';
                document.getElementById('sessionView').classList.add('hidden');
                document.getElementById('coursesTab').classList.add('active');
                loadCourses();
            } else if (target === 'create') {
                document.getElementById('createTab').classList.add('active');
            } else if (target === 'roster') {
                document.getElementById('rosterTab').classList.add('active');
                loadRosterCourses();
            } else if (target === 'settings') {
                document.getElementById('settingsTab').classList.add('active');
            }
        });
    });
}

// --- COURSES ---

function loadCourses() {
    const list = document.getElementById('coursesList');
    list.innerHTML = '<div class="loading">Yükleniyor...</div>';

    // Pass teacher email to filter courses
    const email = localStorage.getItem('teacher_email');

    callApi('getCourses', { email: email }, 'GET')
        .then(data => {
            list.innerHTML = '';
            if (data.courses && data.courses.length > 0) {
                data.courses.forEach(course => {
                    const card = document.createElement('div');
                    card.className = 'card';
                    card.innerHTML = `
                        <h3>${course.name}</h3>
                        <p>${new Date(course.start).toLocaleDateString()} - ${new Date(course.end).toLocaleDateString()}</p>
                        <button class="btn-sm" onclick="viewCourse('${course.name}')">Yönet</button>
                    `;
                    list.appendChild(card);
                });
            } else {
                list.innerHTML = '<p>Henüz dersiniz yok. "Ders Oluştur" sekmesinden yeni bir ders ekleyin.</p>';
            }
        });
}

function handleCreateCourse(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const status = document.getElementById('createStatus');

    btn.disabled = true;
    btn.textContent = "Oluşturuluyor...";

    const data = {
        name: document.getElementById('newCourseName').value,
        start: document.getElementById('termStart').value,
        end: document.getElementById('termEnd').value,
        day: document.getElementById('classDay').value,
        teacherEmail: localStorage.getItem('teacher_email')
    };

    callApi('createCourse', data)
        .then(res => {
            if (res.error) throw new Error(res.error);
            alert('Ders başarıyla oluşturuldu!');
            e.target.reset();
            loadCourses();
        })
        .catch(err => {
            alert('Hata: ' + err.message);
        })
        .finally(() => {
            btn.disabled = false;
            btn.textContent = "Oluştur";
        });
}

// --- SESSIONS ---

window.viewCourse = function (courseName) {
    currentCourse = courseName;
    document.getElementById('coursesList').style.display = 'none';
    document.getElementById('sessionView').classList.remove('hidden');
    document.getElementById('currentCourseTitle').textContent = courseName;

    loadSessions(courseName);

    const qrContainer = document.getElementById('courseQr');
    qrContainer.innerHTML = '';

    document.getElementById('showQrBtn').onclick = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => {
                generateQrWithLoc(courseName, pos.coords.latitude, pos.coords.longitude);
            }, () => {
                alert("Konum alınamadı, konumsuz QR oluşturuluyor.");
                generateQrWithLoc(courseName, null, null);
            });
        } else {
            generateQrWithLoc(courseName, null, null);
        }
    };
};

function generateQrWithLoc(courseName, lat, lon) {
    const qrContainer = document.getElementById('courseQr');
    qrContainer.style.display = 'block';
    qrContainer.innerHTML = '';

    let url = window.location.href.substring(0, window.location.href.lastIndexOf('/')) +
        `/student.html?class=${encodeURIComponent(courseName)}`;

    if (lat && lon) {
        url += `&lat=${lat}&lon=${lon}`;
    }

    console.log("Generating QR for:", url);

    if (typeof QRCode === 'undefined') {
        alert("QRCode kütüphanesi yüklenemedi!");
        return;
    }

    try {
        new QRCode(qrContainer, {
            text: url,
            width: 200,
            height: 200,
            correctLevel: QRCode.CorrectLevel.L // Low error correction to fit longer URLs (like local file paths)
        });



    } catch (e) {
        console.error("QR Error:", e);
        alert("QR Oluşturma Hatası: " + e.message);
    }
}

function loadSessions(courseName) {
    const tbody = document.querySelector('#sessionsTable tbody');
    tbody.innerHTML = '<tr><td colspan="3">Yükleniyor...</td></tr>';

    callApi('getSessions', { course: courseName }, 'GET')
        .then(data => {
            tbody.innerHTML = '';
            if (data.sessions && data.sessions.length > 0) {
                data.sessions.forEach(session => {
                    const row = document.createElement('tr');
                    // Handle date parsing safely
                    let dateDisplay = session.date;
                    try {
                        dateDisplay = new Date(session.date).toLocaleDateString();
                    } catch (e) { console.error("Date parse error", e); }

                    let statusClass = (session.status === 'Active' || session.status === 'Aktif') ? 'status-active' : 'status-inactive';
                    let displayStatus = (session.status === 'Active') ? 'Aktif' : (session.status === 'Cancelled' ? 'İptal' : session.status);

                    row.innerHTML = `
                        <td>${dateDisplay}</td>
                        <td><span class="badge ${statusClass}">${displayStatus}</span></td>
                        <td>
                             <button class="btn-xs" onclick="viewAttendance('${courseName}', '${session.date}')">Yoklama</button>
                             <button class="btn-xs warning" onclick="updateSession('${courseName}', '${session.date}', 'Aktif')">Aktif</button>
                             <button class="btn-xs danger" onclick="updateSession('${courseName}', '${session.date}', 'İptal')">İptal</button>
                        </td>
                    `;
                    tbody.appendChild(row);
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="3">Oturum bulunamadı.</td></tr>';
            }
        })
        .catch(err => {
            console.error(err);
            tbody.innerHTML = `<tr><td colspan="3" style="color:red;">Hata: Veri çekilemedi. (${err.message}). Lütfen sayfayı yenileyin veya tekrar giriş yapın.</td></tr>`;
        });
}

// --- ATTENDANCE MANAGEMENT ---

// --- ATTENDANCE MANAGEMENT ---

window.viewAttendance = function (course, date) {
    document.getElementById('attendanceModal').style.display = 'flex';
    document.getElementById('attModalTitle').textContent = `Yoklama: ${date}`;
    const tbody = document.getElementById('attTableBody');
    const loading = document.getElementById('attListLoading');

    tbody.innerHTML = '';
    loading.classList.remove('hidden');

    callApi('getSessionAttendance', { course: course, date: date }, 'GET')
        .then(res => {
            if (res.students) {
                res.students.forEach(s => {
                    const tr = document.createElement('tr');

                    // Logic for 2 states: Present (Var) vs Absent (Yok)
                    // Treat 'Excused' as Present for the toggle, or essentially ignore it since we are moving away from it.
                    // If status is 'Present' or 'Excused', show as Var (Green). Else Yok (Red).

                    let isPresent = (s.status === 'Present' || s.status === 'Excused');
                    let btnClass = isPresent ? 'success' : 'danger';
                    let btnText = isPresent ? 'Var' : 'Yok';

                    tr.innerHTML = `
                        <td>${s.number}</td>
                        <td>${s.name}</td>
                        <td>
                            <button class="btn-xs ${btnClass}" 
                                onclick="toggleAttendance('${course}', '${date}', '${s.number}', '${s.name}', '${isPresent ? 'Present' : 'Absent'}')">
                                ${btnText}
                            </button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="3">Liste alınamadı.</td></tr>';
            }
        })
        .catch(err => {
            console.error(err);
            tbody.innerHTML = `<tr><td colspan="3" style="color:red;">Hata: ${err.message}</td></tr>`;
        })
        .finally(() => {
            loading.classList.add('hidden');
        });
};

window.toggleAttendance = function (course, date, number, name, currentStatus) {
    // Cycle: Present <-> Absent
    // Incoming currentStatus is the state we are interacting WITH.
    // If it says 'Present', we want to toggle to 'Absent'.
    // If it says 'Absent', we want to toggle to 'Present'.

    let newStatus = (currentStatus === 'Present' || currentStatus === 'Excused') ? 'Absent' : 'Present';

    callApi('updateAttendanceManually', {
        course: course,
        date: date,
        number: number,
        name: name,
        status: newStatus
    })
        .then(res => {
            if (res.error) {
                alert(res.error);
            } else {
                // Refresh list to show correct state
                viewAttendance(course, date);
            }
        })
        .catch(err => alert("Bağlantı hatası: " + err.message));
};


window.closeAttendanceModal = function () {
    document.getElementById('attendanceModal').style.display = 'none';
};

window.updateSession = function (course, date, status) {
    if (!confirm(`${date} tarihli dersi "${status}" olarak işaretlemek istiyor musunuz?`)) return;

    callApi('updateSessionStatus', { course, date, status })
        .then(res => {
            if (res.error) alert('Hata: ' + res.error);
            else loadSessions(course);
        });
};

document.getElementById('backToCourses').addEventListener('click', () => {
    document.getElementById('sessionView').classList.add('hidden');
    document.getElementById('coursesList').style.display = 'grid';
});

// --- ROSTER ---

function loadRosterCourses() {
    const select = document.getElementById('rosterCourseSelect');
    select.innerHTML = '<option>Yükleniyor...</option>';

    // Pass email here too if we want to only allow adding roster to OWN courses
    const email = localStorage.getItem('teacher_email');

    callApi('getCourses', { email: email }, 'GET')
        .then(data => {
            select.innerHTML = '';
            if (data.courses) {
                data.courses.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.name;
                    opt.textContent = c.name;
                    select.appendChild(opt);
                });
            }
        });
}

function handleUploadRoster() {
    const course = document.getElementById('rosterCourseSelect').value;
    const jsonStr = document.getElementById('rosterJson').value;

    try {
        const roster = JSON.parse(jsonStr);
        if (!Array.isArray(roster)) throw new Error("JSON bir dizi (array) olmalı.");

        callApi('uploadRoster', { class: course, roster: roster })
            .then(res => {
                alert('Liste yüklendi!');
                document.getElementById('rosterJson').value = '';
            });
    } catch (e) {
        alert('Geçersiz JSON formatı! ' + e.message);
    }
}

// --- SETUP FORMS ---

// --- EXCEL HANDLING ---

function setupExcelHandlers() {
    // Template Download
    document.getElementById('downloadTemplateBtn').addEventListener('click', () => {
        const wb = XLSX.utils.book_new();
        const ws_data = [
            ["Öğrenci Numarası", "Ad", "Soyad"],
            ["101", "Ahmet", "Yılmaz"],
            ["102", "Ayşe", "Demir"]
        ];
        const ws = XLSX.utils.aoa_to_sheet(ws_data);
        XLSX.utils.book_append_sheet(wb, ws, "Öğrenci Listesi");
        XLSX.writeFile(wb, "ogrenci_listesi_sablon.xlsx");
    });

    // File Input Trigger
    document.getElementById('selectFileBtn').addEventListener('click', () => {
        document.getElementById('rosterFile').click();
    });

    // File Parsing
    document.getElementById('rosterFile').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        document.getElementById('fileNameDisplay').textContent = file.name;

        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            const processed = [];
            if (jsonData.length > 1) {
                for (let i = 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    // Expecting Row[0]=Number, Row[1]=Name, Row[2]=Surname
                    if (row[0] && row[1]) {
                        const fullName = String(row[1]).trim() + (row[2] ? ' ' + String(row[2]).trim() : '');
                        processed.push({
                            name: fullName,
                            number: String(row[0]).trim()
                        });
                    }
                }
            }

            document.getElementById('rosterJson').value = JSON.stringify(processed, null, 2);
            alert(`${processed.length} öğrenci listeden okundu.`);
        };
        reader.readAsArrayBuffer(file);
    });
}

// --- SETUP FORMS ---

function setupForms() {
    document.getElementById('createCourseForm').addEventListener('submit', handleCreateCourse);
    document.getElementById('uploadRosterBtn').addEventListener('click', handleUploadRoster);

    setupExcelHandlers();

    const savedUrl = localStorage.getItem(API_URL_KEY);
    if (savedUrl) document.getElementById('apiUrl').value = savedUrl;

    document.getElementById('saveSettingsBtn').addEventListener('click', () => {
        const url = document.getElementById('apiUrl').value;
        if (url) {
            localStorage.setItem(API_URL_KEY, url);
            alert('Ayarlar kaydedildi.');
        }
    });
}

// --- API HELPER ---

async function callApi(action, data = {}, method = 'POST') {
    // FORCE USE THE CORRECT URL FOR DEBUGGING
    let url = 'https://script.google.com/macros/s/AKfycbynBFhZqNKFRrcYHcaL2cVZmoauT4QOOCaeSevr7nFXWlQt-wy6PmiwcwCbs24P_JRz/exec';

    // Ensure no whitespace
    url = url.trim();

    console.log("Fetching URL:", url, "Action:", action);
    localStorage.setItem(API_URL_KEY, url);

    if (method === 'GET') {
        const params = new URLSearchParams(data);
        params.append('action', action);
        const res = await fetch(url + '?' + params.toString());
        return await res.json();
    } else {
        const payload = { ...data, action: action };

        // Simplify headers to avoid browser quirks
        const res = await fetch(url, {
            method: 'POST',
            body: JSON.stringify(payload)
            // standard fetch defaults to text/plain if not set, 
            // but let's be explicit and simple if needed. 
            // actually, omitting headers completely is often safest for GAS simple post.
        });
        return await res.json();
    }
}
