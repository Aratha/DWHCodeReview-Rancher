import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from models.schemas import ObjectReviewResult, ObjectSelection
from services.dependency_metadata import fetch_dependency_metadata_context
from services.llm_review import review_sql
from services.rules_store import bundle_needs_catalog_metadata, published_bundle
from services.sql_fetcher import fetch_definition

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[dict[str, Any]], Awaitable[None]] | None

_TYPE_LABEL: dict[str, str] = {
    "P": "PROCEDURE",
    "V": "VIEW",
    "FN": "FUNCTION_SCALAR",
    "IF": "FUNCTION_INLINE",
    "TF": "FUNCTION_TABLE",
    "SF": "FUNCTION_SQL_INLINE",
}


def _display_type(type_code: str) -> str:
    tc = (type_code or "").strip().upper()
    return _TYPE_LABEL.get(tc, tc)


async def _review_one(
    sel: ObjectSelection,
    database: str,
    *,
    object_index: int = 0,
    objects_total: int = 1,
    progress: ProgressCallback = None,
) -> ObjectReviewResult:
    display_t = _display_type(sel.type_code)
    label = f"[{database}] {sel.schema_name}.{sel.object_name} ({display_t})"

    async def emit(extra: dict[str, Any]) -> None:
        if progress:
            await progress(
                {
                    "database": database,
                    "object_index": object_index,
                    "objects_total": objects_total,
                    "object_label": label,
                    "schema": sel.schema_name,
                    "name": sel.object_name,
                    "type_code": sel.type_code,
                    **extra,
                }
            )

    await emit({"phase": "object_start"})

    sql: str | None = None
    try:
        await emit({"phase": "definition_fetch"})
        sql = fetch_definition(
            sel.schema_name, sel.object_name, sel.type_code, database
        )
    except Exception as e:
        logger.exception("Definition fetch failed for %s", label)
        await emit({"phase": "object_error", "error": str(e)})
        return ObjectReviewResult(
            schema_name=sel.schema_name,
            object_name=sel.object_name,
            object_type=display_t,
            database=database,
            rule_checks=[],
            violations=[],
            error=f"Database error: {e}",
        )

    if not sql or not sql.strip():
        await emit({"phase": "object_error", "error": "No definition returned"})
        return ObjectReviewResult(
            schema_name=sel.schema_name,
            object_name=sel.object_name,
            object_type=display_t,
            database=database,
            rule_checks=[],
            violations=[],
            error="No definition returned (object missing or permissions).",
        )

    await emit({"phase": "sql_ready", "sql_length": len(sql)})

    bundle = published_bundle()
    metadata_ctx: str | None = None
    if bundle_needs_catalog_metadata(bundle):
        await emit({"phase": "metadata_fetch"})
        try:
            metadata_ctx = fetch_dependency_metadata_context(
                database,
                sel.schema_name,
                sel.object_name,
            )
        except Exception as e:
            logger.exception("Dependency metadata fetch failed for %s", label)
            metadata_ctx = ""
        await emit({"phase": "metadata_ready"})

    async def rule_progress(p: dict[str, Any]) -> None:
        if progress:
            await progress(
                {
                    "database": database,
                    "object_index": object_index,
                    "objects_total": objects_total,
                    "object_label": label,
                    "schema": sel.schema_name,
                    "name": sel.object_name,
                    "type_code": sel.type_code,
                    **p,
                }
            )

    rule_checks, violations, parse_warning = await review_sql(
        sql,
        label,
        metadata_context=metadata_ctx,
        progress=rule_progress if progress else None,
    )

    await emit({"phase": "object_done"})
    return ObjectReviewResult(
        schema_name=sel.schema_name,
        object_name=sel.object_name,
        object_type=display_t,
        database=database,
        rule_checks=rule_checks,
        violations=violations,
        error=None,
        parse_warning=parse_warning,
    )


async def run_reviews(
    selections: list[ObjectSelection],
    default_database: str,
    *,
    progress: ProgressCallback = None,
) -> list[ObjectReviewResult]:
    n = len(selections)
    root = (default_database or "").strip()
    coros = []
    for i, s in enumerate(selections):
        db = (s.database or root).strip()
        if not db:
            raise ValueError(
                f"Seçim {i + 1} ({s.schema_name}.{s.object_name}) için catalog veritabanı yok; "
                "istekte database veya seçimde database alanı gerekir."
            )
        coros.append(
            _review_one(
                s,
                db,
                object_index=i,
                objects_total=n,
                progress=progress,
            )
        )
    return await asyncio.gather(*coros)


def _sanitize_paste_label(raw: str | None) -> str:
    s = (raw or "").strip()
    if not s:
        return "Yapıştırılan SQL"
    return s[:200]


async def review_pasted_sql(
    sql: str,
    label: str | None = None,
    *,
    progress: ProgressCallback = None,
) -> ObjectReviewResult:
    """Veritabanı tanımı olmadan tek bir SQL metnini yayınlanmış kurallara göre inceler."""
    display = _sanitize_paste_label(label)
    llm_label = f"{display} (SCRIPT)"

    async def wrap(p: dict[str, Any]) -> None:
        if progress:
            await progress(
                {
                    "database": "",
                    "object_index": 0,
                    "objects_total": 1,
                    "object_label": llm_label,
                    "schema": "sql",
                    "name": display,
                    "type_code": "SCRIPT",
                    "kind": "script",
                    **p,
                }
            )

    await wrap({"phase": "object_start"})
    await wrap({"phase": "sql_ready", "sql_length": len(sql)})
    rule_checks, violations, parse_warning = await review_sql(
        sql, llm_label, progress=wrap if progress else None
    )
    await wrap({"phase": "object_done"})
    return ObjectReviewResult(
        schema_name="sql",
        object_name=display,
        object_type="SCRIPT",
        database="",
        rule_checks=rule_checks,
        violations=violations,
        error=None,
        parse_warning=parse_warning,
    )
