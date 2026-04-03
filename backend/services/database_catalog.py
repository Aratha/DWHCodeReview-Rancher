from db.connection import get_connection

LIST_DATABASES_SQL = """
SELECT name
FROM sys.databases
WHERE state = 0
ORDER BY name;
"""


def list_databases() -> list[str]:
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(LIST_DATABASES_SQL)
        return [str(r[0]) for r in cur.fetchall()]
