# Sistem Yöneticisi Kılavuzu

Kurulum, güvenlik, LLM ve veritabanı erişimi bu kapsamdadır.

## Sorumluluklar

| Alan | Yönetici görevi |
|------|------------------|
| SQL Server | ODBC sürücüsü, bağlantı dizesi, firewall |
| Backend | Python venv, `backend/.env`, servis çalıştırma |
| LLM | LM Studio veya uyumlu sunucu, ağ erişimi, model yükleme |
| Güvenlik | `API_ACCESS_TOKEN`, `LLM_ENFORCE_PRIVATE_NETWORK`, log ayarları |

## Menü (Sistem bölümü)

| Menü | Açıklama |
|------|----------|
| **Kurallar** | Yayınlanmış inceleme kurallarını düzenleyin (taslak / yayın). |
| **LLM ayarları** | Model, URL, eşzamanlılık ve güvenlik bayrakları. |

## Kritik ortam değişkenleri

- `MSSQL_CONNECTION_STRING` — uygulamanın bağlandığı SQL Server.
- `LLM_BASE_URL` / `LLM_CHAT_URL` — LLM HTTP uç noktası.
- `LLM_ENFORCE_PRIVATE_NETWORK=true` — kurumsal politikaya uygun çıkış kontrolü.
- `LLM_LOG_FULL_PAYLOADS=false` — üretimde ham payload loglamayı kapatır.
- `API_ACCESS_TOKEN` — doluysa `/api/*` için `X-API-Key` zorunludur (`/api/health` hariç).
- `API_ADMIN_TOKEN` — doluysa yönetim uçları (`/api/rules`, `/api/llm-config`, `/api/llm-logs`) için `X-Admin-Key` zorunludur.
- `API_RATE_LIMIT_ENABLED=true` — review uçlarında hız limiti aktif.
- `API_RATE_LIMIT_WINDOW_SECONDS` / `API_RATE_LIMIT_REVIEW_MAX` — IP başına pencere limit ayarları.
- `SQL_REVIEW_MAX_CONCURRENT_RULES` — LM Studio yükünü dengelemek için (ör. 4–8).
- `LLM_HTTP_USER_AGENT` — (isteğe bağlı) LLM HTTP isteklerinde User-Agent; kurumsal log/DLP filtreleri için.

## Sağlık kontrolü

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/api/health
```

Beklenen: `{"status":"ok","rules_api":true}`

## Kurumsal kontrollerle uyum (EDR, DLP)

| Konu | Not |
|------|-----|
| **Ağ** | LLM çağrıları yapılandırmadaki hedefe gider. `LLM_ENFORCE_PRIVATE_NETWORK=true` iken public LLM çıkışı uygulama tarafından reddedilir; gerekirse `LLM_ALLOW_PUBLIC_HOSTS` ile hostname istisnası. |
| **Proxy / SSL inspection** | Kurumsal proxy kullanılıyorsa `LLM_HTTP_TRUST_ENV=true` ve ortam `HTTP_PROXY` / `HTTPS_PROXY`. Yerel LAN LLM için genelde `false`. |
| **Log / korelasyon** | LLM istekleri sabit **User-Agent** ile gider (`LLM_HTTP_USER_AGENT`). |
| **API** | `API_ACCESS_TOKEN` / `API_ADMIN_TOKEN` ile uçlar korunabilir. |
| **Veri minimizasyonu** | `LLM_LOG_FULL_PAYLOADS=false` iken ham SQL/model gövdesi LLM günlük dosyasına yazılmaz. |
| **DLP** | İnceleme sırasında SQL ve şema özeti, yapılandırmadaki LLM sunucusuna HTTP(S) ile iletilir; kurum DLP politikasına göre değerlendirilir. |
| **EDR** | Backend: `python` / `uvicorn`; geliştirme ön yüzü: `node` / `vite`. Dosya erişimi çoğunlukla `backend/data` ve isteğe bağlı `backend/logs/llm`. |

## Sorun giderme

- **LLM timeout / ReadTimeout:** Eşzamanlılığı düşürün; LM Studio’da modelin bellekte olduğundan emin olun; ağ gecikmesini kontrol edin.
- **Bağlantı reddedildi:** Tailscale/firewall; LM Studio’nun doğru arayüzde dinlemesi.
- **Eski API:** Eski `uvicorn` süreci kalmış olabilir; port 8000’i temizleyip `.\start.ps1` ile yeniden başlatın.

Tam kurulum adımları için `README.md` ve operasyon onayı için `docs/KURULUM_CHECKLIST.md` dosyalarına bakın.
