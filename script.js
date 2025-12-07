// ==========================================
// AYARLAR
// ==========================================
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxpQIE8xgooCWRBMsKcyiqJn--dqA4pkLugUli8U7PiABweLn9hn_fc6Zg6Y9XoulW0/exec'; 
const MAX_DISTANCE_METERS = 300; // Öğrenci en fazla kaç metre uzakta olabilir? (GPS sapması için 300m iyidir)

// ==========================================
// ELEMENT SEÇİMLERİ
// ==========================================
const generateBtn = document.getElementById('generateBtn');
const classInput = document.getElementById('className');
const qrContainer = document.getElementById('qrcode');
const attendanceForm = document.getElementById('attendanceForm');
const statusMessage = document.getElementById('statusMessage');
const apiUrlInput = document.getElementById('apiUrl');
const saveSettingsBtn = document.getElementById('saveSettings');

// ==========================================
// YARDIMCI FONKSİYONLAR
// ==========================================

// İki koordinat arası mesafeyi hesaplar (Haversine Formülü)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Dünya yarıçapı (metre)
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Metre cinsinden mesafe
}

// ==========================================
// BAŞLANGIÇ AYARLARI
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    if (apiUrlInput) {
        const savedUrl = localStorage.getItem('attendance_api_url');
        apiUrlInput.value = savedUrl || DEFAULT_API_URL;
    }
});

// ==========================================
// 1. ÖĞRETMEN SAYFASI (QR OLUŞTURMA + KONUM)
// ==========================================
if (generateBtn) {
    generateBtn.addEventListener('click', () => {
        const className = classInput.value.trim();
        
        if (!className) {
            alert('Lütfen bir ders adı girin.');
            return;
        }

        // Butonu geçici olarak devre dışı bırak ve bilgi ver
        generateBtn.disabled = true;
        generateBtn.textContent = "Konum Alınıyor...";
        qrContainer.innerHTML = '';

        // Konum izni iste ve QR oluştur
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    // Başarılı olursa
                    const lat = position.coords.latitude.toFixed(6);
                    const lon = position.coords.longitude.toFixed(6);
                    createQR(className, lat, lon);
                    generateBtn.disabled = false;
                    generateBtn.textContent = "QR Kod Oluştur";
                },
                (error) => {
                    // Konum alınamazsa uyar ama yine de QR oluştur (Konumsuz)
                    alert("Konum alınamadı! QR kod konum doğrulaması olmadan oluşturuluyor. (Tarayıcı izinlerini kontrol edin)");
                    createQR(className, null, null);
                    generateBtn.disabled = false;
                    generateBtn.textContent = "QR Kod Oluştur";
                }
            );
        } else {
            alert("Tarayıcınız konum özelliğini desteklemiyor.");
            createQR(className, null, null);
        }
    });

    function createQR(className, lat, lon) {
        qrContainer.style.display = 'block';
        
        let currentUrl = window.location.href;
        let baseUrl = currentUrl.substring(0, currentUrl.lastIndexOf('/'));
        
        // Linke Lat ve Lon parametrelerini ekle
        let studentUrl = `${baseUrl}/student.html?class=${encodeURIComponent(className)}`;
        if (lat && lon) {
            studentUrl += `&lat=${lat}&lon=${lon}`;
        }
        
        console.log("Oluşturulan Link:", studentUrl);

        new QRCode(qrContainer, {
            text: studentUrl,
            width: 250,
            height: 250,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    }

    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', () => {
            const url = apiUrlInput.value.trim();
            if (url) {
                localStorage.setItem('attendance_api_url', url);
                alert('API URL kaydedildi!');
            }
        });
    }
}

// ==========================================
// 2. ÖĞRENCİ SAYFASI (KONTROLLER)
// ==========================================
if (attendanceForm) {
    const urlParams = new URLSearchParams(window.location.search);
    const classNameFromUrl = urlParams.get('class');
    const teacherLat = urlParams.get('lat');
    const teacherLon = urlParams.get('lon');

    // --- KONTROL 1: ÇİFT GİRİŞ ENGELLEME ---
    // Bugünün tarihini oluştur (Örn: "attendance_Matematik_2023-12-07")
    const todayKey = `attendance_${classNameFromUrl}_${new Date().toLocaleDateString()}`;
    const alreadySubmitted = localStorage.getItem(todayKey);

    if (classNameFromUrl) {
        document.getElementById('displayClassName').textContent = classNameFromUrl;
        document.getElementById('hiddenClassName').value = classNameFromUrl;

        // Eğer daha önce girmişse formu gizle ve uyarı ver
        if (alreadySubmitted) {
            attendanceForm.style.display = 'none';
            statusMessage.innerHTML = `
                <div class="error-message" style="background: rgba(255, 193, 7, 0.2); border-color: #ffc107; color: #fbbf24;">
                    ⚠️ Bu ders için bugün zaten yoklama verdiniz.
                </div>`;
        }

    } else {
        document.getElementById('displayClassName').textContent = 'Seçilmedi';
        statusMessage.innerHTML = '<div class="error-message">Hata: Ders bilgisi yok. QR kodu tekrar okutun.</div>';
        attendanceForm.style.display = 'none';
    }

    // Form Gönderme
    attendanceForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = attendanceForm.querySelector('button[type="submit"]');

        // --- KONTROL 2: KONUM DOĞRULAMASI ---
        if (teacherLat && teacherLon) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Konum Doğrulanıyor...';

            if (!navigator.geolocation) {
                alert("Cihazınız konum servisini desteklemiyor.");
                submitBtn.disabled = false; 
                submitBtn.textContent = 'Yoklamayı Gönder';
                return;
            }

            // Öğrencinin konumunu al (Promise yapısı ile bekle)
            try {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject);
                });

                const studentLat = position.coords.latitude;
                const studentLon = position.coords.longitude;

                // Mesafeyi hesapla
                const distance = calculateDistance(teacherLat, teacherLon, studentLat, studentLon);
                console.log(`Mesafe: ${distance.toFixed(2)} metre`);

                if (distance > MAX_DISTANCE_METERS) {
                    statusMessage.innerHTML = `
                        <div class="error-message">
                            ⛔ Sınıftan çok uzaktasınız! <br>
                            Sınıfa olan uzaklığınız: ${Math.round(distance)} metre.<br>
                            Lütfen sınıfa girip tekrar deneyin.
                        </div>`;
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Yoklamayı Gönder';
                    return; // İşlemi durdur
                }

                // Mesafe uygunsa devam et...
                
            } catch (error) {
                console.error(error);
                statusMessage.innerHTML = '<div class="error-message">Konum alınamadı. Lütfen GPS izni verin.</div>';
                submitBtn.disabled = false;
                submitBtn.textContent = 'Yoklamayı Gönder';
                return;
            }
        }

        // --- VERİ GÖNDERME ---
        submitBtn.disabled = true;
        submitBtn.textContent = 'Kaydediliyor...';

        const storedUrl = localStorage.getItem('attendance_api_url');
        const apiUrl = storedUrl || DEFAULT_API_URL;

        const formData = {
            name: document.getElementById('studentName').value,
            number: document.getElementById('studentNumber').value,
            className: document.getElementById('hiddenClassName').value
        };

        try {
            await fetch(apiUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            // Başarılı olursa LocalStorage'a kaydet (Çift giriş engellemek için)
            localStorage.setItem(todayKey, 'true');

            statusMessage.innerHTML = '<div class="success-message">✅ Yoklamanız başarıyla alındı!</div>';
            attendanceForm.reset();
            attendanceForm.style.display = 'none'; // Formu gizle
            submitBtn.textContent = 'Gönderildi';

        } catch (error) {
            statusMessage.innerHTML = '<div class="error-message">Bağlantı hatası.</div>';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Tekrar Dene';
        }
    });
}
