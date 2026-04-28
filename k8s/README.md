# Rancher/Kubernetes Deployment

Bu klasor, uygulamayi Rancher uzerinde calistirmak icin temel Kubernetes manifestlerini icerir.

## Icerik

- `namespace.yaml`: Opsiyonel namespace tanimi
- `backend-configmap.yaml`: Hassas olmayan backend env degiskenleri
- `backend-secret.example.yaml`: Hassas env degiskenleri icin Secret sablonu
- `backend-deployment.yaml`: Backend Deployment + Service
- `web-deployment.yaml`: Frontend (nginx) Deployment + Service
- `ingress.yaml`: Dis erisim (Ingress)

## 1) Image'lari build/push et

Varsayilan registry: GitHub Container Registry (GHCR):

- `ghcr.io/aratha/dwh-code-review-backend:latest`
- `ghcr.io/aratha/dwh-code-review-web:latest`

Ornek:

```powershell
docker build -t ghcr.io/aratha/dwh-code-review-backend:latest ./backend
docker push ghcr.io/aratha/dwh-code-review-backend:latest

docker build -t ghcr.io/aratha/dwh-code-review-web:latest ./frontend
docker push ghcr.io/aratha/dwh-code-review-web:latest
```

Not: Bu makinede Docker daemon kapaliysa image push icin GitHub Actions workflow'unu kullanin.

## 2) Secret dosyasini hazirla

`backend-secret.example.yaml` dosyasini `backend-secret.yaml` olarak kopyalayip degerleri doldurun.

```powershell
copy .\k8s\backend-secret.example.yaml .\k8s\backend-secret.yaml
```

## 3) Uygula

```powershell
kubectl apply -f .\k8s\namespace.yaml
kubectl apply -f .\k8s\backend-configmap.yaml
kubectl apply -f .\k8s\backend-secret.yaml
kubectl apply -f .\k8s\backend-deployment.yaml
kubectl apply -f .\k8s\web-deployment.yaml
kubectl apply -f .\k8s\ingress.yaml
```

## 4) Kontrol

```powershell
kubectl -n dwh-code-review get pods,svc,ingress
kubectl -n dwh-code-review get endpoints backend web
```

`ingress.yaml` icindeki host adini kendi domain'inize gore guncelleyin.
