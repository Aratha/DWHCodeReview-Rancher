#!/usr/bin/env bash
# DWH Code Review — API + Vite; her çalıştırmada önce 8000/5173 temizlenir (yeniden başlatma).
# Kullanım: ./start.sh  (ilk kez: chmod +x start.sh)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo ""
echo "=== Yeniden başlatma: önceki süreçler temizleniyor ==="

kill_listeners_on_port() {
  local port=$1
  if [[ -n "${WINDIR:-}" ]] && command -v netstat >/dev/null 2>&1 && command -v taskkill >/dev/null 2>&1; then
    netstat -ano 2>/dev/null | grep LISTENING | grep ":${port}" | awk '{print $NF}' | sort -u | while read -r pid; do
      [[ "$pid" =~ ^[0-9]+$ ]] || continue
      taskkill //F //PID "$pid" 2>/dev/null || true
    done
  elif command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti:"$port" 2>/dev/null || true)
    if [[ -n "${pids:-}" ]]; then
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
    fi
  elif command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" 2>/dev/null || true
  fi
}

set +e
kill_listeners_on_port 8000
kill_listeners_on_port 5173
set -e
sleep 0.5

echo "=== SQL Code Review başlatılıyor ==="

if [[ ! -f "$ROOT/backend/.env" ]]; then
  echo "Uyarı: backend/.env yok. Örnek: cp backend/.env.example backend/.env"
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Hata: npm bulunamadı. Node.js LTS kurun." >&2
  exit 1
fi

if [[ ! -f "$ROOT/backend/.venv/Scripts/activate" ]] && [[ ! -f "$ROOT/backend/.venv/bin/activate" ]]; then
  echo "backend/.venv oluşturuluyor..."
  if command -v python3 >/dev/null 2>&1; then
    python3 -m venv "$ROOT/backend/.venv"
  else
    python -m venv "$ROOT/backend/.venv"
  fi
fi
if [[ -f "$ROOT/backend/.venv/Scripts/activate" ]]; then
  # shellcheck source=/dev/null
  source "$ROOT/backend/.venv/Scripts/activate"
elif [[ -f "$ROOT/backend/.venv/bin/activate" ]]; then
  # shellcheck source=/dev/null
  source "$ROOT/backend/.venv/bin/activate"
else
  echo "Hata: backend/.venv aktif edilemedi." >&2
  exit 1
fi

if [[ ! -f "$ROOT/backend/.venv/.deps_installed" ]] || [[ "$ROOT/backend/requirements.txt" -nt "$ROOT/backend/.venv/.deps_installed" ]]; then
  pip install --upgrade pip -q
  pip install -r "$ROOT/backend/requirements.txt"
  touch "$ROOT/backend/.venv/.deps_installed"
fi

uvicorn main:app --app-dir "$ROOT/backend" --reload --reload-dir "$ROOT/backend" --host 127.0.0.1 --port 8000 &
BACK_PID=$!

cleanup() {
  echo ""
  echo "Sunucular durduruluyor..."
  if kill -0 "$BACK_PID" 2>/dev/null; then
    kill "$BACK_PID" 2>/dev/null || true
    wait "$BACK_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

cd "$ROOT/frontend"
if [[ ! -d node_modules ]]; then
  echo "node_modules yok; npm install çalıştırılıyor..."
  npm install
fi

echo ""
echo "  API:    http://127.0.0.1:8000"
echo "  Arayüz: http://localhost:5173"
echo "  Durdurmak için: Ctrl+C"
echo ""

npm run dev
