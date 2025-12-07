// ==========================================
// AYARLAR
// ==========================================
// Buraya kendi Google Apps Script Web App URL'inizi yapıştırın
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxpQIE8xgooCWRBMsKcyiqJn--dqA4pkLugUli8U7PiABweLn9hn_fc6Zg6Y9XoulW0/exec';

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
// BAŞLANGIÇ AYARLARI
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Eğer öğretmen ayarlar sayfasındaysa mevcut URL'i göster
    if (apiUrlInput) {
        // LocalStorage'da varsa onu kullan, yoksa varsayılanı
        const savedUrl = localStorage.getItem('attendance_api_url');
        apiUrlInput.value = savedUrl || DEFAULT_API_URL;
    }
});

// ==========================================
// 1. ÖĞRETMEN SAYFASI (QR OLUŞTURMA)
// ==========================================
if (generateBtn) {
    generateBtn.addEventListener('click', () => {
        const className = classInput.value.trim();

        if (!className) {
            alert('Lütfen bir ders adı girin (Örn: Matematik).');
            return;
        }

        // QR Konteynerini temizle ve göster
        qrContainer.innerHTML = '';
        qrContainer.style.display = 'block';

        // --- URL OLUŞTURMA MANTIĞI (DÜZELTİLDİ) ---
        // Şu anki tarayıcı adresini al (Örn: https://site.com/teacher.html)
        let currentUrl = window.location.href;

        // Eğer adresin sonunda teacher.html veya index.html varsa onları silip klasör yolunu bulalım
        let baseUrl = currentUrl.substring(0, currentUrl.lastIndexOf('/'));

        // Öğrenci sayfasının tam linkini oluştur ve ders adını ekle
        // Örn: https://site.com/student.html?class=Matematik
        const studentUrl = `${baseUrl}/student.html?class=${encodeURIComponent(className)}`;

        console.log("Oluşturulan Link:", studentUrl); // Kontrol için konsola yazdır

        // QR Kodu Oluştur
        new QRCode(qrContainer, {
            text: studentUrl,
            width: 250,
            height: 250,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    });

    // Ayarları Kaydet Butonu
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
// 2. ÖĞRENCİ SAYFASI (YOKLAMA GÖNDERME)
// ==========================================
if (attendanceForm) {
    // Sayfa yüklenince URL'deki ?class=... bilgisini oku
    const urlParams = new URLSearchParams(window.location.search);
    const classNameFromUrl = urlParams.get('class');

    // Eğer ders adı varsa ekrana yaz ve forma gizle
    if (classNameFromUrl) {
        // Öğrencinin gördüğü başlık
        document.getElementById('displayClassName').textContent = classNameFromUrl;
        // Google'a gönderilecek gizli veri
        document.getElementById('hiddenClassName').value = classNameFromUrl;
    } else {
        // Eğer QR ile değil direkt linkle geldiyse hata ver
        document.getElementById('displayClassName').textContent = 'Seçilmedi';
        statusMessage.innerHTML = '<div class="error-message">Hata: Ders bilgisi bulunamadı. Lütfen QR kodu tekrar okutun.</div>';
        attendanceForm.style.display = 'none'; // Formu gizle
    }

    // Form Gönderme İşlemi
    attendanceForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // API URL'ini belirle (Önce kayıtlara bak, yoksa kodun içindekini al)
        const storedUrl = localStorage.getItem('attendance_api_url');
        const apiUrl = storedUrl || DEFAULT_API_URL;

        if (!apiUrl || apiUrl.length < 10) {
            statusMessage.innerHTML = '<div class="error-message">Hata: Sunucu adresi (API URL) bulunamadı.</div>';
            return;
        }

        const submitBtn = attendanceForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Kaydediliyor...';

        // Gönderilecek verileri hazırla
        const formData = {
            name: document.getElementById('studentName').value,
            number: document.getElementById('studentNumber').value,
            className: document.getElementById('hiddenClassName').value // URL'den gelen ders adı
            // Tarih bilgisi Google Apps Script tarafında (new Date()) otomatik eklenir.
        };

        try {
            // Google Apps Script'e POST isteği at
            await fetch(apiUrl, {
                method: 'POST',
                mode: 'no-cors', // Google formlarına veri atarken no-cors zorunludur
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            // no-cors modunda hata yakalayamayız, işlem bitti varsayarız
            statusMessage.innerHTML = '<div class="success-message">✅ Yoklamanız başarıyla alındı!</div>';
            attendanceForm.reset(); // Formu temizle

            // Başarılı olduktan sonra tekrar gönderimi engellemek için butonu kapalı tutabilirsin
            // submitBtn.disabled = false; 
            submitBtn.textContent = 'Gönderildi';

        } catch (error) {
            console.error('Hata:', error);
            statusMessage.innerHTML = '<div class="error-message">Bağlantı hatası oluştu. İnternetinizi kontrol edin.</div>';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Tekrar Dene';
        }
    });
}