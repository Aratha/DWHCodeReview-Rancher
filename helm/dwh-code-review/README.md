# Helm Chart: dwh-code-review

Bu chart, uygulamayi Rancher/Helm ile kurmak icin hazirdir.

## Kurulum

```powershell
helm upgrade --install dwh-code-review ./helm/dwh-code-review --namespace dwh-code-review --create-namespace
```

## Siklikla Degisen Alanlar

- `backend.image.repository`
- `backend.image.tag`
- `web.image.repository`
- `web.image.tag`
- `ingress.hosts[0].host`
- `backendConfig.CORS_ORIGINS`
- `backendSecret.data.*`

## Secret Yonetimi

Varsayilan olarak chart secret olusturur (`backendSecret.create=true`).

Var olan bir secret kullanmak icin:

```yaml
backendSecret:
  create: false
  name: existing-backend-secret
```

## Dry Run

```powershell
helm template dwh-code-review ./helm/dwh-code-review
```
