"""backend/.env içinde LLM anahtarlarını okur/yazar; os.environ güncellenir."""

from __future__ import annotations

import os
import re
from pathlib import Path

from config import BACKEND_ROOT, Settings

_ENV_PATH = BACKEND_ROOT / ".env"

FIELD_TO_ENV = {
    "llm_chat_api": "LLM_CHAT_API",
    "llm_base_url": "LLM_BASE_URL",
    "llm_chat_url": "LLM_CHAT_URL",
    "llm_model": "LLM_MODEL",
    "sql_review_llm_model": "SQL_REVIEW_LLM_MODEL",
    "llm_api_key": "LLM_API_KEY",
    "llm_http_trust_env": "LLM_HTTP_TRUST_ENV",
    "sql_review_max_concurrent_rules": "SQL_REVIEW_MAX_CONCURRENT_RULES",
}

_LINE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$")


def _bool_env(v: bool) -> str:
    return "true" if v else "false"


def read_llm_snapshot() -> dict:
    s = Settings()
    return {
        "llm_chat_api": s.llm_chat_api,
        "llm_base_url": s.llm_base_url,
        "llm_chat_url": s.llm_chat_url,
        "llm_model": s.llm_model,
        "sql_review_llm_model": s.sql_review_llm_model,
        "llm_http_trust_env": s.llm_http_trust_env,
        "sql_review_max_concurrent_rules": s.sql_review_max_concurrent_rules,
        "api_key_set": bool((s.llm_api_key or "").strip()),
    }


def merge_llm_into_dotenv(updates: dict[str, str | bool | int | None]) -> None:
    """
    updates: pydantic alan adı -> değer. None = atla.
    llm_api_key boş string = satırı sil, ortamdan kaldır.
    """
    path = _ENV_PATH
    lines: list[str] = []
    if path.is_file():
        lines = path.read_text(encoding="utf-8").splitlines()

    env_patch: dict[str, str] = {}
    remove_api_key = False

    for field, env_upper in FIELD_TO_ENV.items():
        if field not in updates:
            continue
        val = updates[field]
        if val is None:
            continue
        if field == "llm_api_key":
            assert isinstance(val, str)
            if not val.strip():
                remove_api_key = True
                continue
            env_patch[env_upper] = val
        elif field == "llm_http_trust_env":
            assert isinstance(val, bool)
            env_patch[env_upper] = _bool_env(val)
        elif field == "sql_review_max_concurrent_rules":
            assert isinstance(val, int)
            env_patch[env_upper] = str(val)
        else:
            assert isinstance(val, str)
            env_patch[env_upper] = val

    if not env_patch and not remove_api_key:
        return

    out: list[str] = []
    seen = set()

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            out.append(line)
            continue
        m = _LINE.match(line)
        if not m:
            out.append(line)
            continue
        key = m.group(1)
        if remove_api_key and key == FIELD_TO_ENV["llm_api_key"]:
            continue
        if key in env_patch:
            out.append(f"{key}={env_patch[key]}")
            seen.add(key)
        else:
            out.append(line)

    api_key_upper = FIELD_TO_ENV["llm_api_key"]
    for key, sval in env_patch.items():
        if key in seen:
            continue
        out.append(f"{key}={sval}")

    text = "\n".join(out)
    if text and not text.endswith("\n"):
        text += "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")

    for key, sval in env_patch.items():
        os.environ[key] = sval

    if remove_api_key:
        os.environ.pop(api_key_upper, None)
