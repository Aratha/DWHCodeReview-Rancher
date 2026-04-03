"""
LLM istek/yanıt günlüğü — JSON Lines (satır başına bir JSON nesnesi).
"""

from __future__ import annotations

import json
import logging
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from config import BACKEND_ROOT

logger = logging.getLogger(__name__)

_LOG_DIR = BACKEND_ROOT / "data" / "llm_logs"
_LOG_FILE = _LOG_DIR / "requests.jsonl"
_lock = threading.Lock()


def _utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _ensure_dir() -> None:
    _LOG_DIR.mkdir(parents=True, exist_ok=True)


def new_log_id() -> str:
    return str(uuid.uuid4())


def log_timestamp_iso() -> str:
    return _utc_iso()


def append_entry(entry: dict) -> None:
    """Dosyaya tek satır JSON ekler."""
    _ensure_dir()
    line = json.dumps(entry, ensure_ascii=False, default=str) + "\n"
    with _lock:
        with _LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(line)


def read_all_lines() -> list[str]:
    if not _LOG_FILE.is_file():
        return []
    try:
        text = _LOG_FILE.read_text(encoding="utf-8")
    except OSError as e:
        logger.warning("LLM log read failed: %s", e)
        return []
    return [ln for ln in text.splitlines() if ln.strip()]


def list_entries_meta(limit: int = 100) -> list[dict]:
    """Son N kayıt — özet (tam request/response gövdesi yok)."""
    lines = read_all_lines()
    tail = lines[-limit:] if len(lines) > limit else lines
    out: list[dict] = []
    for ln in tail:
        try:
            o = json.loads(ln)
        except json.JSONDecodeError:
            continue
        out.append(
            {
                "id": o.get("id", ""),
                "ts": o.get("ts", ""),
                "object_label": o.get("object_label", ""),
                "ok": bool(o.get("ok", False)),
                "error_preview": (str(o.get("error", ""))[:200] if o.get("error") else None),
            }
        )
    return list(reversed(out))


def get_entry_by_id(entry_id: str) -> dict | None:
    """Tam kayıt (request + response)."""
    for ln in read_all_lines():
        try:
            o = json.loads(ln)
        except json.JSONDecodeError:
            continue
        if str(o.get("id", "")) == entry_id:
            return o
    return None


def clear_log() -> None:
    with _lock:
        if _LOG_FILE.is_file():
            _LOG_FILE.unlink()
