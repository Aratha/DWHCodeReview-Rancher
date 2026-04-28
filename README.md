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
- `docs/`: Operasyon notlari

## Hemen Baslat (Rancher)

1. Image'lari registry'ye push et:
   - `REGISTRY/dwh-code-review-backend:latest`
   - `REGISTRY/dwh-code-review-web:latest`
2. `k8s/backend-secret.example.yaml` dosyasini `k8s/backend-secret.yaml` olarak kopyala ve doldur.
3. `k8s/*.yaml` dosyalarini uygula.

Detayli adimlar icin: `k8s/README.md`.

## Ortam Degiskenleri

Backend tum ayarlari Kubernetes `ConfigMap` ve `Secret` kaynaklarindan alir:

- `k8s/backend-configmap.yaml`
- `k8s/backend-secret.yaml`

## Notlar

- Lokal `uvicorn` / `npm dev` / `docker compose` akisi bu repoda hedeflenmez.
- Uretim standardi olarak Ingress uzerinden servis edilir.
