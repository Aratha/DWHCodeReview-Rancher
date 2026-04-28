from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# .env yerel kopyasi olsa da Kubernetes env degiskenleri oncelikli kullanilir.
BACKEND_ROOT = Path(__file__).resolve().parent
_ENV_FILE = BACKEND_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    mssql_connection_string: str = ""
    llm_base_url: str = "http://llm-service.ai.svc.cluster.local:1234/v1"
    # openai: POST .../v1/chat/completions + messages[] | api_v1_chat: POST .../api/v1/chat + system_prompt + input
    llm_chat_api: str = "api_v1_chat"
    llm_chat_url: str = ""
    # Genel model adi
    llm_model: str = "openai/gpt-oss-120b"
    # Bu doluysa her zaman kullanilir (SQL_REVIEW_LLM_MODEL)
    sql_review_llm_model: str = ""
    llm_api_key: str = ""
    # httpx: True ise sistem HTTP(S)_PROXY kullanilir.
    llm_http_trust_env: bool = False
    # LLM HTTP isteklerinde User-Agent
    llm_http_user_agent: str = "DWHCodeReview-Backend/1.0 (internal SQL review; httpx)"
    # Kurumsal guvenlik: varsayilan olarak LLM hedefi private/Tailscale aginda olmali.
    llm_enforce_private_network: bool = True
    # Istisna hostname listesi (virgulle)
    llm_allow_public_hosts: str = ""
    # LLM gunluklerinde ham request/response govdelerini sakla mi? (oneri: false)
    llm_log_full_payloads: bool = False
    # LLM timeout riskini azaltmak icin eszamanli kural sayisi
    sql_review_max_concurrent_rules: int = 6
    # httpx okuma zaman asimi (saniye)
    llm_read_timeout_seconds: float = 900.0
    # ReadTimeout / ConnectTimeout sonrasi ek deneme sayisi
    llm_request_retries: int = 2
    # SQL bu karakter sayisini asinca nesne iki parcada analiz edilir
    sql_review_two_part_threshold_chars: int = 45000
    cors_origins: str = "https://dwh.example.com"
    # Bos degilse /api uclari X-API-Key ile korunur.
    api_access_token: str = ""
    # Bos degilse yonetim uclari (rules/llm-config/llm-logs) X-Admin-Key ister.
    api_admin_token: str = ""
    # Review uclarinda basit hiz limiti (IP basina pencere bazli).
    api_rate_limit_enabled: bool = True
    api_rate_limit_window_seconds: int = 60
    api_rate_limit_review_max: int = 30


def get_settings() -> Settings:
    return Settings()


def resolved_llm_model(settings: Settings) -> str:
    """Oncelik: SQL_REVIEW_LLM_MODEL; yoksa LLM_MODEL (env + .env)."""
    s = (settings.sql_review_llm_model or "").strip()
    return s if s else settings.llm_model
