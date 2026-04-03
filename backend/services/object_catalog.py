from datetime import date, datetime, time

from db.connection import get_connection
from db.queries import LIST_OBJECTS_SQL
from models.schemas import DbObjectRow


def _cutoff_datetime(d: date) -> datetime:
    """Kullanıcının seçtiği günün başlangıcı (yerel/yarım gece)."""
    return datetime.combine(d, time.min)


def list_objects(
    database: str,
    filter_query: str | None = None,
    from_date: date | None = None,
) -> list[DbObjectRow]:
    with get_connection(database) as conn:
        cur = conn.cursor()
        cur.execute(LIST_OBJECTS_SQL)
        rows: list[DbObjectRow] = []
        fq = (filter_query or "").strip().lower()
        cutoff = _cutoff_datetime(from_date) if from_date else None
        for r in cur.fetchall():
            schema_name = r.schema_name
            object_name = r.object_name
            type_code = (r.type_code or "").strip()
            object_type = r.object_type
            last_modified = r.last_modified
            created_at = r.create_date
            if cutoff is not None:
                after_create = created_at is not None and created_at >= cutoff
                after_modify = last_modified is not None and last_modified >= cutoff
                if not (after_create or after_modify):
                    continue
            if fq:
                hay = f"{schema_name} {object_name} {object_type}".lower()
                if fq not in hay:
                    continue
            rows.append(
                DbObjectRow(
                    schema_name=schema_name,
                    object_name=object_name,
                    object_type=object_type,
                    type_code=type_code,
                    created_at=created_at,
                    last_modified=last_modified,
                )
            )
        return rows
