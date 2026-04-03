# AI SQL Code Review

A minimal full-stack app: **FastAPI** connects to **Microsoft SQL Server**, lists procedures/views/functions, sends definitions to an **OpenAI-compatible** LLM (for example [LM Studio](https://lmstudio.ai/)), and shows structured findings in a **React + Vite + Tailwind** UI with export to JSON and HTML.

## Prerequisites

- Python 3.10 or newer
- Node.js 18 or newer
- **ODBC Driver 17 or 18 for SQL Server** installed on the machine running the backend
- A reachable SQL Server database
- An OpenAI-compatible HTTP API (local LM Studio is typical)

## Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Edit `backend/.env`:

| Variable | Purpose |
|----------|---------|
| `MSSQL_CONNECTION_STRING` | ODBC connection string to your database (see [Microsoft ODBC documentation](https://learn.microsoft.com/en-us/sql/connect/odbc/microsoft-odbc-driver-for-sql-server)). |
| `LLM_BASE_URL` | Chat API base, e.g. `http://127.0.0.1:1234/api/v1` (POST `{base}/chat` with `model`, `system_prompt`, `input`). Optional: set `LLM_CHAT_URL` to the full chat URL. |
| `LLM_MODEL` | Model id as exposed by the server (LM Studio: load a model and copy its identifier). |
| `LLM_API_KEY` | API key if required; LM Studio often accepts any non-empty placeholder. |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API (include your frontend URL in production). |

Start the API:

```powershell
cd backend
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Endpoints: `GET /api/health`, `GET /api/objects`, `POST /api/review`.

## Frontend

```powershell
cd frontend
npm install
npm run dev
```

Development uses Vite’s proxy so the browser calls `/api/...` on the same origin; requests are forwarded to `http://127.0.0.1:8000`.

For a production build served separately from the API, set `VITE_API_PREFIX` to the full API origin (for example `https://api.example.com`) so the client targets the correct host.

```powershell
cd frontend
npm run build
```

Static output is in `frontend/dist/`.

## LM Studio

1. Download and install LM Studio.
2. Load a model and start the local server with the OpenAI-compatible API enabled (default port is often **1234**).
3. Set `LLM_BASE_URL` to `http://127.0.0.1:1234/api/v1` (or `LLM_CHAT_URL` to `http://127.0.0.1:1234/api/v1/chat`) and `LLM_MODEL` to the server’s model id (for example `qwen/qwen3-coder-next`).

## Workflow

1. Configure the database connection and LLM in `backend/.env`.
2. Run the backend and frontend dev servers.
3. In the UI, search and multi-select objects, then **Review selected**.
4. Expand each object, filter or search findings, mark **False positive** where needed.
5. Use **Export JSON** or **Export HTML** for a report that includes violations and marked false positives.
