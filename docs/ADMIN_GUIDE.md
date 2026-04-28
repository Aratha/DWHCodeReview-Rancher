# Admin Guide (Rancher)

Bu kilavuz yalnizca Rancher operasyonu icindir.

## Sorumluluklar

- Kubernetes namespace, deployment, service, ingress yonetimi
- Secret ve ConfigMap yonetimi
- SQL Server ve LLM erisim ag kontrolleri
- API anahtar rotasyonu

## Kritik Ayarlar

- `MSSQL_CONNECTION_STRING`
- `LLM_BASE_URL` veya `LLM_CHAT_URL`
- `LLM_ENFORCE_PRIVATE_NETWORK=true`
- `LLM_LOG_FULL_PAYLOADS=false`
- `API_ACCESS_TOKEN`
- `API_ADMIN_TOKEN`

## Operasyon Komutlari

```powershell
kubectl -n dwh-code-review get pods,svc,ingress
kubectl -n dwh-code-review logs deploy/backend --tail=200
kubectl -n dwh-code-review rollout status deploy/backend
kubectl -n dwh-code-review rollout status deploy/web
```

## Saglik Dogrulama

- Ingress host: `https://<your-host>/`
- API health: `https://<your-host>/api/health`

Beklenen: `{"status":"ok", ... }`
