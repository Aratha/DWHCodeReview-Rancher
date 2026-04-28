# Frontend

Frontend production build olarak nginx ile servis edilir.

`nginx.conf` icinde `/api` path'i cluster icindeki `backend:8000` servisine proxy edilir.

Lokal dev akisi yerine Kubernetes deployment hedeflenir.
