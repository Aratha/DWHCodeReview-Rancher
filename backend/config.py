from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Proje kökünden veya backend klasöründen uvicorn çalışsa da .env bulunsun
BACKEND_ROOT = Path(__file__).resolve().parent
_ENV_FILE = BACKEND_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    mssql_connection_string: str = ""
    llm_base_url: str = "http://100.121.222.80:1234/v1"
    # openai: POST .../v1/chat/completions + messages[] | api_v1_chat: POST .../api/v1/chat + system_prompt + input
    llm_chat_api: str = "api_v1_chat"
    llm_chat_url: str = ""
    # Genel isim; Windows ortaminda LLM_MODEL baska araclarca set edilebilir ve .env'i ezer.
    llm_model: str = "qwen/qwen3-coder-next"
    # Bu doluysa her zaman kullanilir (SQL_REVIEW_LLM_MODEL=.env) — model secimini garanti eder.
    sql_review_llm_model: str = ""
    llm_api_key: str = ""
    # httpx: True ise sistem HTTP(S)_PROXY kullanilir. Ağdaki LLM (LAN IP) için False önerilir — aksi halde
    # "All connection attempts failed" sık görülür. Kurumsal proxy üzerinden bulut API ise true yapin.
    llm_http_trust_env: bool = False
    # Eski ayar; artık kullanılmıyor (tüm kural istekleri paralel). Geriye dönük uyumluluk için tutulur.
    sql_review_max_concurrent_rules: int = 32
    # SQL bu karakter sayısını aşınca nesne iki parçada analiz edilir (bağlam taşması riskini azaltır).
    sql_review_two_part_threshold_chars: int = 45000
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"


def get_settings() -> Settings:
    return Settings()


def resolved_llm_model(settings: Settings) -> str:
    """Oncelik: SQL_REVIEW_LLM_MODEL; yoksa LLM_MODEL (env + .env)."""
    s = (settings.sql_review_llm_model or "").strip()
    return s if s else settings.llm_model
