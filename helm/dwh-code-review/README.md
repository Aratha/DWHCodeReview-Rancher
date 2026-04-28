# Helm Chart: dwh-code-review

Bu chart, uygulamayi Rancher/Helm ile kurmak icin hazirdir.

## Kurulum

```powershell
helm upgrade --install dwh-code-review ./helm/dwh-code-review --namespace dwh-code-review --create-namespace
```

## Hedeflenen Kurulum Modeli

- Rancher tarafinda Helm chart install/upgrade
- Backend + Web deployment
- Ingress uzerinden tek hosttan erisim
- ConfigMap + Secret ile ortam yonetimi

## Registry Hazirlama (Adim adim)

1. GHCR image isimlerini belirle:
   - `ghcr.io/aratha/dwh-code-review-backend:latest`
   - `ghcr.io/aratha/dwh-code-review-web:latest`
2. GitHub Actions workflow'unu calistir:
   ```powershell
   gh workflow run "Build and Push GHCR Images" --repo Aratha/DWHCodeReview-Rancher
   ```
3. Workflow sonucunu kontrol et (`completed success` beklenir):
   ```powershell
   gh run list --repo Aratha/DWHCodeReview-Rancher --workflow "Build and Push GHCR Images" --limit 1
   ```
4. Helm values'ta image alanlarini ayarla (gerekirse SHA tag kullan):
   - `backend.image.repository`, `backend.image.tag`
   - `web.image.repository`, `web.image.tag`
5. Cluster pull hatasi verirse `imagePullSecrets` bolumundeki adimlari uygula.

## Siklikla Degisen Alanlar

- `backend.image.repository`
- `backend.image.tag`
- `web.image.repository`
- `web.image.tag`
- `ingress.hosts[0].host`
- `backendConfig.CORS_ORIGINS`
- `backendSecret.data.*`

## Hızlı values override

`my-values.yaml`:

```yaml
backend:
  image:
    repository: ghcr.io/aratha/dwh-code-review-backend
    tag: latest

web:
  image:
    repository: ghcr.io/aratha/dwh-code-review-web
    tag: latest

ingress:
  hosts:
    - host: dwh.company.internal
      paths:
        - path: /
          pathType: Prefix

backendConfig:
  CORS_ORIGINS: "https://dwh.company.internal"
  LLM_BASE_URL: "http://llm-service.ai.svc.cluster.local:1234/v1"
```

Deploy:

```powershell
helm upgrade --install dwh-code-review ./helm/dwh-code-review -n dwh-code-review -f .\my-values.yaml --create-namespace
```

## Secret Yonetimi

Varsayilan olarak chart secret olusturur (`backendSecret.create=true`).

Var olan bir secret kullanmak icin:

```yaml
backendSecret:
  create: false
  name: existing-backend-secret
```

## Private Registry (imagePullSecrets)

Private registry kullanacaksaniz namespace icinde pull secret olusturun:

```powershell
kubectl -n dwh-code-review create secret docker-registry ghcr-pull-secret `
  --docker-server=ghcr.io `
  --docker-username=<github-username> `
  --docker-password=<github-token> `
  --docker-email=<email>
```

Sonra Helm values icinde aktif edin:

```yaml
imagePullSecrets:
  - name: ghcr-pull-secret
```

## Dogrulama

```powershell
kubectl -n dwh-code-review get pods,svc,ingress
kubectl -n dwh-code-review rollout status deploy/dwh-code-review-backend
kubectl -n dwh-code-review rollout status deploy/dwh-code-review-web
kubectl -n dwh-code-review logs deploy/dwh-code-review-backend --tail=200
```

## Upgrade / Rollback

```powershell
helm -n dwh-code-review history dwh-code-review
helm -n dwh-code-review rollback dwh-code-review 1
```

## Dry Run

```powershell
helm template dwh-code-review ./helm/dwh-code-review
```
