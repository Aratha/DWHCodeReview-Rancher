from db.connection import get_connection
from db.queries import GET_DEFINITION_SQL


def fetch_definition(
    schema_name: str,
    object_name: str,
    type_code: str,
    database: str,
) -> str | None:
    tc = (type_code or "").strip()
    with get_connection(database) as conn:
        cur = conn.cursor()
        cur.execute(GET_DEFINITION_SQL, (schema_name, object_name, tc))
        row = cur.fetchone()
        if not row or row.definition is None:
            return None
        return str(row.definition)
