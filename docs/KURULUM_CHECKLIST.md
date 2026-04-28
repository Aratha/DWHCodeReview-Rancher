# Rancher Kurulum Checklist

## 1) Registry

- [ ] Backend image push edildi
- [ ] Web image push edildi
- [ ] Manifestlerde image adlari guncel

## 2) Konfigurasyon

- [ ] `backend-configmap.yaml` ortama gore duzenlendi
- [ ] `backend-secret.yaml` olusturuldu
- [ ] `MSSQL_CONNECTION_STRING` dogru
- [ ] `LLM_BASE_URL` veya `LLM_CHAT_URL` dogru
- [ ] `CORS_ORIGINS` ingress host ile uyumlu

## 3) Kubernetes Kaynaklari

- [ ] Namespace olustu
- [ ] Backend deployment hazir
- [ ] Web deployment hazir
- [ ] Service endpointleri olustu
- [ ] Ingress hazir

## 4) Fonksiyonel Dogrulama

- [ ] `/api/health` 200 donuyor
- [ ] UI aciliyor
- [ ] Veritabani listeleme calisiyor
- [ ] Inceleme tetiklenebiliyor
- [ ] Sonuc exportlari calisiyor

## 5) Guvenlik

- [ ] `LLM_ENFORCE_PRIVATE_NETWORK=true`
- [ ] `LLM_LOG_FULL_PAYLOADS=false`
- [ ] API/Admin token aktif
