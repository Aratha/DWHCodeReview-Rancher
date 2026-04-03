import re

import pyodbc

from config import get_settings


def connection_string_with_database(base: str, database: str) -> str:
    """Mevcut ODBC dizesinden Database= kısmını çıkarıp seçilen veritabanını ekler."""
    db = database.strip()
    if not db:
        raise ValueError("Veritabanı adı boş olamaz")
    escaped = db.replace("}", "}}")
    db_segment = f"Database={{{escaped}}};"
    cleaned = re.sub(r"(?i);?\s*Database\s*=\s*[^;]+", "", base)
    cleaned = cleaned.strip().rstrip(";")
    if cleaned:
        return f"{cleaned};{db_segment}"
    return db_segment


def get_connection(database: str | None = None) -> pyodbc.Connection:
    settings = get_settings()
    if not settings.mssql_connection_string.strip():
        raise ValueError(
            "MSSQL_CONNECTION_STRING is empty or missing. "
            "Copy backend/.env.example to backend/.env and set MSSQL_CONNECTION_STRING "
            "to your ODBC connection string, then restart the API."
        )
    conn_str = (
        connection_string_with_database(
            settings.mssql_connection_string, database
        )
        if database
        else settings.mssql_connection_string
    )
    return pyodbc.connect(conn_str, timeout=30)
