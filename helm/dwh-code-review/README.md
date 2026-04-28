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

## Dry Run

```powershell
helm template dwh-code-review ./helm/dwh-code-review
```
