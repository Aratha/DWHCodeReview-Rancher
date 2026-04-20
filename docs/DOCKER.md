# Docker ile yerel çalıştırma

Ön koşul: [Docker Desktop](https://www.docker.com/products/docker-desktop/) kurulu ve çalışır durumda.

## 1) Ortam dosyası

`backend/.env` dosyanız hazır olmalı (`backend/.env.example` ile oluşturup doldurun).

**Konteyner içinden Windows’taki SQL Server veya LM Studio’ya bağlanıyorsanız** bağlantı dizesinde ve LLM URL’de sunucu adı olarak `host.docker.internal` kullanın (Docker Desktop bu adı ana makineye yönlendirir).

Örnek (özet):

```env
MSSQL_CONNECTION_STRING=Driver={ODBC Driver 18 for SQL Server};Server=host.docker.internal,1433;Database=YourDb;...
LLM_BASE_URL=http://host.docker.internal:1234/v1
```

`LLM_ENFORCE_PRIVATE_NETWORK=true` iken `host.docker.internal` genelde private IP’ye çözülür ve politika buna izin verir. Cloud LLM kullanıyorsanız `LLM_ALLOW_PUBLIC_HOSTS` ve ilgili ayarlara bakın (`docs/ADMIN_GUIDE.md`).

## 2) Derleme ve başlatma

Depo kökünde:

```powershell
docker compose up --build
```

- Arayüz (nginx + statik build): **http://localhost:8080**
- API doğrudan: **http://localhost:8000** (ör. `/api/health`, `/docs`)

Durdurmak: terminalde `Ctrl+C`, ardından `docker compose down`.

## 3) Sorun giderme

| Sorun | Olası neden |
|--------|-------------|
| ODBC / pyodbc hatası | İmajda ODBC 18 yüklü; bağlantı dizesindeki sürücü adı `ODBC Driver 18 for SQL Server` ile uyumlu olsun |
| SQL’e bağlanamıyor | `Server=` kısmında `host.docker.internal` ve doğru port; Windows firewall SQL’e izin veriyor mu |
| LLM timeout | LM Studio `0.0.0.0` veya makine IP’sinde dinliyor olmalı; URL’de `host.docker.internal` |
| Ön yüz 502 | `backend` konteyneri ayakta mı: `docker compose ps`, log: `docker compose logs backend` |

## 4) Not

Geliştirme modundaki `npm run dev` (Vite) ile bu kurulum aynı değildir; burada ön yüz **production build** + nginx ile servis edilir. API ile aynı origin üzerinden `/api` proxy edilir.
