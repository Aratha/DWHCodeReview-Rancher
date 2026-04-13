# DWHCodeReview Kurulum Checklist (PDF Hazir)

Bu dokuman IT/operasyon ekipleri icin kurulum-onay formu olarak tasarlanmistir.

---

## A) Sistem Bilgileri

- Sunucu/Makine Adi: ........................................
- Isletim Sistemi: ..........................................
- Kurulum Tarihi: ...........................................
- Kurulumu Yapan: ...........................................

---

## B) Onkosul Kontrolu

- [ ] Python 3.10+ kurulu
- [ ] Node.js 18+ kurulu
- [ ] npm calisiyor
- [ ] ODBC Driver 17/18 kurulu
- [ ] SQL Server erisimi mevcut
- [ ] LLM endpoint erisimi mevcut

Notlar:
- ................................................................
- ................................................................

---

## C) Konfigurasyon Kontrolu (`backend/.env`)

- [ ] `MSSQL_CONNECTION_STRING` girildi
- [ ] `LLM_CHAT_API` dogru secildi (`api_v1_chat` / `openai`)
- [ ] `LLM_BASE_URL` veya `LLM_CHAT_URL` girildi
- [ ] `LLM_MODEL` girildi
- [ ] `SQL_REVIEW_LLM_MODEL` girildi
- [ ] `LLM_HTTP_TRUST_ENV=false`
- [ ] `LLM_HTTP_USER_AGENT` (isteğe bağlı; kurumsal log/DLP için)
- [ ] `LLM_ENFORCE_PRIVATE_NETWORK=true`
- [ ] `LLM_LOG_FULL_PAYLOADS=false`
- [ ] `SQL_REVIEW_MAX_CONCURRENT_RULES=6` (veya kurum standardi)
- [ ] `API_ACCESS_TOKEN` (gerekiyorsa) girildi

---

## D) Kurulum ve Baslatma

- [ ] Proje kokunde `.\start.ps1` calistirildi
- [ ] Backend ayaga kalkti (`/api/health`)
- [ ] Frontend ayaga kalkti (`http://localhost:5173`)
- [ ] Port 8000 dinlemede
- [ ] Port 5173 dinlemede

---

## E) Fonksiyonel Test

- [ ] Veritabani listesi geliyor
- [ ] Nesne secimi yapilabiliyor
- [ ] Inceleme baslatilabiliyor
- [ ] Canli ilerleme ekrani geliyor
- [ ] Sonuc modalinda kural kartlari gorunuyor
- [ ] `CSV indir` calisiyor
- [ ] `SQL indir` calisiyor
- [ ] SQL dosyasi basinda duzeltme yorum blogu var

---

## F) Guvenlik Testi

- [ ] LLM hedefi private/Tailscale aginda
- [ ] Public/cloud cikis engeli dogrulandi
- [ ] API key korumasi beklenen sekilde calisiyor
- [ ] Loglarda hassas payload tutulmuyor
- [ ] CORS sadece izinli originler

---

## G) Hata Durumu Kaydi

- Hata var mi?: [ ] Yok  [ ] Var
- Hata Ozeti:
  - ................................................................
  - ................................................................
- Alinan Aksiyon:
  - ................................................................
  - ................................................................

---

## H) Onay

- Kurulum Sonucu: [ ] Basarili  [ ] Kosullu Basarili  [ ] Basarisiz
- Teknik Onay Veren: ........................................
- Is Birimi Onayi: ...........................................
- Tarih: ....................................................

---

## Ek: Hizli Komutlar

```powershell
# Baslatma
.\start.ps1

# Backend health
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/api/health

# Port kontrol
netstat -ano | findstr :8000
netstat -ano | findstr :5173
```

