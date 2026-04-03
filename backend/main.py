import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

# config import edilmeden önce .env yüklensin (os.environ ile okuyan kodlar için)
load_dotenv(Path(__file__).resolve().parent / ".env")

from config import get_settings
from models.schemas import (
    DbObjectRow,
    LlmConfigResponse,
    LlmConfigUpdate,
    ObjectSelection,
    ReviewRequest,
    ReviewResponse,
    ScriptReviewRequest,
)
from services.database_catalog import list_databases
from services.object_catalog import list_objects
from services.review_orchestrator import review_pasted_sql, run_reviews
from services.llm_log import clear_log, get_entry_by_id, list_entries_meta
from services.llm_env import merge_llm_into_dotenv, read_llm_snapshot
from services.rules_store import RuleBundle, RulesState, load_state, publish_draft, save_draft

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    api_paths = sorted(
        {
            getattr(r, "path", "")
            for r in app.routes
            if getattr(r, "path", "").startswith("/api")
        }
    )
    logger.info(
        "SQL Code Review API — /api rotaları: %s",
        ", ".join(api_paths) if api_paths else "(yok)",
    )
    yield


def _cors_origins() -> list[str]:
    raw = get_settings().cors_origins
    return [o.strip() for o in raw.split(",") if o.strip()]


app = FastAPI(title="SQL Code Review API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    """Kök URL; tarayıcıda 8000 açıldığında 404 yerine yönlendirme bilgisi."""
    return {
        "service": "SQL Code Review API",
        "health": "/api/health",
        "databases": "/api/databases",
        "objects": "/api/objects?database=YOUR_DB",
        "rules": "/api/rules",
        "review_script": "/api/review/script",
        "review_stream": "/api/review/stream",
        "review_script_stream": "/api/review/script/stream",
        "llm_logs": "/api/llm-logs",
        "llm_config": "/api/llm-config",
        "docs": "/docs",
    }


@app.get("/api/health")
def health():
    """İstemcinin güncel API (kurallar uçları dahil) çalıştığını doğrulaması için."""
    return {"status": "ok", "rules_api": True}


@app.get("/api/databases")
def get_databases():
    try:
        return {"databases": list_databases()}
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        logger.exception("Failed to list databases")
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/objects", response_model=list[DbObjectRow])
def get_objects(
    database: str = Query(..., min_length=1, description="Catalog database name"),
    q: str | None = Query(None, description="Filter by schema, name, or type (substring)"),
    from_date: date | None = Query(
        None,
        description="ISO (YYYY-MM-DD): oluşturulma veya son değişiklik bu tarihte veya sonrası",
    ),
):
    try:
        return list_objects(database=database, filter_query=q, from_date=from_date)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        logger.exception("Failed to list objects")
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/rules", response_model=RulesState)
def get_rules():
    """Taslak ve yayınlanmış kural listesi (LLM yalnızca yayınlanmışı kullanır)."""
    return load_state()


@app.put("/api/rules/draft", response_model=RulesState)
def put_rules_draft(body: RuleBundle):
    """Taslağı kaydeder; LLM etkilenmez ta ki yayınlanana kadar."""
    return save_draft(body)


@app.post("/api/rules/publish", response_model=RulesState)
def post_rules_publish():
    """Taslağı yayınlar; sonraki incelemeler bu kuralları LLM'e gönderir."""
    return publish_draft()


@app.get("/api/llm-logs")
def get_llm_logs(limit: int = Query(100, ge=1, le=500)):
    """Son LLM istek/yanıt günlük kayıtları (özet)."""
    return {"items": list_entries_meta(limit)}


@app.get("/api/llm-logs/{entry_id}")
def get_llm_log_entry(entry_id: str):
    """Tek kayıt: tam request ve response gövdeleri."""
    entry = get_entry_by_id(entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Log entry not found")
    return entry


@app.delete("/api/llm-logs")
def delete_llm_logs():
    """Günlük dosyasını temizler."""
    clear_log()
    return {"ok": True}


@app.get("/api/llm-config", response_model=LlmConfigResponse)
def get_llm_config():
    """LLM uç noktası ve model ayarları (API anahtarı maskeli)."""
    return read_llm_snapshot()


@app.put("/api/llm-config", response_model=LlmConfigResponse)
def put_llm_config(body: LlmConfigUpdate):
    """backend/.env içindeki LLM alanlarını günceller; süreç içi ayarlar anında uygulanır."""
    patch = body.model_dump(exclude_unset=True)
    merge_llm_into_dotenv(patch)
    return read_llm_snapshot()


@app.post("/api/review", response_model=ReviewResponse)
async def post_review(body: ReviewRequest):
    if not body.selections:
        return ReviewResponse(results=[])
    try:
        results = await run_reviews(body.selections, body.database)
        return ReviewResponse(results=results)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        logger.exception("Review failed")
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/api/review/stream")
async def post_review_stream(body: ReviewRequest):
    """SSE: nesne ve kural düzeyinde canlı ilerleme + sonunda tam sonuç listesi."""

    async def event_gen():
        q: asyncio.Queue = asyncio.Queue()

        async def progress_cb(p: dict) -> None:
            await q.put(p)

        async def runner():
            try:
                if not body.selections:
                    await q.put({"phase": "complete", "results": []})
                else:
                    results = await run_reviews(
                        body.selections,
                        body.database,
                        progress=progress_cb,
                    )
                    await q.put(
                        {
                            "phase": "complete",
                            "results": [
                                r.model_dump(by_alias=True) for r in results
                            ],
                        }
                    )
            except ValueError as e:
                await q.put({"phase": "error", "message": str(e)})
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.exception("Review stream failed")
                await q.put({"phase": "error", "message": str(e)})
            finally:
                try:
                    await q.put(None)
                except Exception:
                    pass

        task = asyncio.create_task(runner())
        try:
            while True:
                item = await q.get()
                if item is None:
                    break
                yield f"data: {json.dumps(item, ensure_ascii=False)}\n\n"
        finally:
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/review/script", response_model=ReviewResponse)
async def post_review_script(body: ScriptReviewRequest):
    """Yapıştırılan SQL betiğini (DB nesne seçimi olmadan) yayınlanmış kurallara göre inceler."""
    sql = (body.sql or "").strip()
    if not sql:
        raise HTTPException(status_code=400, detail="SQL metni boş olamaz.")
    try:
        result = await review_pasted_sql(sql, body.label)
        return ReviewResponse(results=[result])
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        logger.exception("Script review failed")
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/api/review/script/stream")
async def post_review_script_stream(body: ScriptReviewRequest):
    """SSE: yapıştırılan SQL için kural düzeyinde ilerleme + sonuç."""

    sql = (body.sql or "").strip()
    if not sql:
        raise HTTPException(status_code=400, detail="SQL metni boş olamaz.")

    async def event_gen():
        q: asyncio.Queue = asyncio.Queue()

        async def progress_cb(p: dict) -> None:
            await q.put(p)

        async def runner():
            try:
                result = await review_pasted_sql(
                    sql, body.label, progress=progress_cb
                )
                await q.put(
                    {
                        "phase": "complete",
                        "results": [result.model_dump(by_alias=True)],
                    }
                )
            except ValueError as e:
                await q.put({"phase": "error", "message": str(e)})
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.exception("Script review stream failed")
                await q.put({"phase": "error", "message": str(e)})
            finally:
                try:
                    await q.put(None)
                except Exception:
                    pass

        task = asyncio.create_task(runner())
        try:
            while True:
                item = await q.get()
                if item is None:
                    break
                yield f"data: {json.dumps(item, ensure_ascii=False)}\n\n"
        finally:
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
