# DWH Code Review - Rancher Edition

Bu proje yalnizca Rancher/Kubernetes uzerinde calisacak sekilde duzenlenmistir.

## Mimari

- `backend`: FastAPI + pyodbc (SQL Server) + LLM baglantisi
- `web`: Nginx uzerinden React build servisi
- `ingress`: Dis erisim

Frontend, `/api` isteklerini cluster icindeki `backend` servisine yonlendirir.

## Klasorler

- `backend/`: API servisi
- `frontend/`: UI + nginx config
- `k8s/`: Rancher/Kubernetes manifestleri
- `helm/dwh-code-review/`: Helm chart
- `docs/`: Operasyon notlari

## Gereksinimler

- Kubernetes cluster (Rancher ile yonetilen)
- Cluster'a erisim icin `kubectl` ve (Helm yontemi icin) `helm`
- `ghcr.io` ulasimi (node seviyesinde egress acik olmali)
- SQL Server erisimi ve LLM endpoint erisimi

## Registry ve Image Akisi

Varsayilan image'lar:

- `ghcr.io/aratha/dwh-code-review-backend:latest`
- `ghcr.io/aratha/dwh-code-review-web:latest`

Repo icindeki GitHub Actions workflow'u `main` branch push'larinda bu image'lari GHCR'a build/push eder:

- `.github/workflows/build-and-push-ghcr.yml`

### Adim adim: Image Registry (GHCR)

1. **Repo public oldugunu dogrula**  
   Repo private ise package cekimi icin secret zorunlu olur.
   ```powershell
   gh repo view Aratha/DWHCodeReview-Rancher --json visibility,url
   ```

2. **Workflow ile image build/push tetikle**  
   `main` push'unda otomatik calisir; manuel tetiklemek icin:
   ```powershell
   gh workflow run "Build and Push GHCR Images" --repo Aratha/DWHCodeReview-Rancher
   gh run list --repo Aratha/DWHCodeReview-Rancher --workflow "Build and Push GHCR Images" --limit 1
   ```

3. **Build basarisini kontrol et**  
   Son run `completed success` olmali.
   ```powershell
   gh run list --repo Aratha/DWHCodeReview-Rancher --workflow "Build and Push GHCR Images" --limit 1
   ```

4. **Deploy'da kullanilacak image adlarini sabitle**
   - `ghcr.io/aratha/dwh-code-review-backend:latest`
   - `ghcr.io/aratha/dwh-code-review-web:latest`
   - Istersen daha guvenli deploy icin SHA tag kullan: `:<git-sha>`

5. **Cluster cekebiliyor mu test et**
   - Pod `ImagePullBackOff` veriyorsa package visibility veya secret ayari eksiktir.
   ```powershell
   kubectl -n dwh-code-review get pods
   kubectl -n dwh-code-review describe pod <pod-adi>
   ```

6. **Private registry senaryosu (gerekirse)**
   - Namespace icinde pull secret olustur:
   ```powershell
   kubectl -n dwh-code-review create secret docker-registry ghcr-pull-secret `
     --docker-server=ghcr.io `
     --docker-username=<github-username> `
     --docker-password=<github-token> `
     --docker-email=<email>
   ```
   - Helm values:
   ```yaml
   imagePullSecrets:
     - name: ghcr-pull-secret
   ```

## Hemen Baslat (Helm - Onerilen)

1. `values.yaml` icinde en az su alanlari ortamina gore duzenle:
   - `ingress.hosts[0].host`
   - `backendConfig.CORS_ORIGINS`
   - `backendSecret.data.MSSQL_CONNECTION_STRING`
   - `backendConfig.LLM_BASE_URL` veya `backendConfig.LLM_CHAT_URL`
2. Helm deploy:

```powershell
helm upgrade --install dwh-code-review ./helm/dwh-code-review --namespace dwh-code-review --create-namespace
```

3. Rollout ve servis kontrolu:

```powershell
kubectl -n dwh-code-review get pods,svc,ingress
kubectl -n dwh-code-review rollout status deploy/dwh-code-review-backend
kubectl -n dwh-code-review rollout status deploy/dwh-code-review-web
```

## Helm ile Kurulum

Helm chart hazirdir:

```powershell
helm upgrade --install dwh-code-review ./helm/dwh-code-review --namespace dwh-code-review --create-namespace
```

Detayli chart kullanimi: `helm/dwh-code-review/README.md`.

## Values Override Ornegi

`my-values.yaml`:

```yaml
ingress:
  hosts:
    - host: dwh.company.internal
      paths:
        - path: /
          pathType: Prefix

backendConfig:
  CORS_ORIGINS: "https://dwh.company.internal"
  LLM_BASE_URL: "http://llm-service.ai.svc.cluster.local:1234/v1"

backendSecret:
  data:
    MSSQL_CONNECTION_STRING: "Driver={ODBC Driver 18 for SQL Server};Server=sql.company.internal,1433;Database=DWH;Trusted_Connection=yes;Encrypt=yes;TrustServerCertificate=yes;"
```

Uygulama:

```powershell
helm upgrade --install dwh-code-review ./helm/dwh-code-review -n dwh-code-review -f .\my-values.yaml --create-namespace
```

## Ortam Degiskenleri

Backend tum ayarlari Kubernetes `ConfigMap` ve `Secret` kaynaklarindan alir:

- `k8s/backend-configmap.yaml`
- `k8s/backend-secret.yaml`

Helm kullaniminda ayni ayarlar su alanlardan gelir:

- `values.yaml` -> `backendConfig`
- `values.yaml` -> `backendSecret.data`

## Troubleshooting

- `ImagePullBackOff`: GHCR package gorunurlugunu veya `imagePullSecrets` ayarini kontrol et.
- `CrashLoopBackOff` backend: `MSSQL_CONNECTION_STRING` ve `LLM_*` degiskenlerini kontrol et.
- `/api` 404: Ingress host/path ve service adlarini dogrula.
- CORS hatasi: `backendConfig.CORS_ORIGINS` degerini ingress host ile esitle.

## Notlar

- Lokal `uvicorn` / `npm dev` / `docker compose` akisi bu repoda hedeflenmez.
- Uretim standardi olarak Ingress uzerinden servis edilir.
