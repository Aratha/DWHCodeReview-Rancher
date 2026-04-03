"""
SQL Server: sys.dm_sql_referenced_entities ile bağımlılık BFS'i her nesnenin bulunduğu
veritabanı bağlamında çalıştırır; kolon metadatasını sys.columns + sys.types ile
o nesnenin kendi veritabanından alır (cross-database: üç parça ad veya tarama ile çözüm).
"""

from __future__ import annotations

import logging
from collections import deque

from db.connection import get_connection
from services.database_catalog import list_databases

logger = logging.getLogger(__name__)

MAX_EXPANSION_DEPTH = 4
MAX_OBJECTS_WITH_COLUMNS = 48
MAX_OUTPUT_CHARS = 95_000
MAX_DATABASES_TO_SCAN = 48

_EXPAND_TYPES = frozenset({"V", "P", "FN", "IF", "TF", "SF"})
_METADATA_TYPES = frozenset({"U", "V", "TF", "IF", "SF"})


def _type_label(type_char: str) -> str:
    return {
        "U": "TABLE",
        "V": "VIEW",
        "TF": "FUNCTION_TABLE",
        "IF": "FUNCTION_INLINE",
        "SF": "FUNCTION_SQL_INLINE",
        "P": "PROCEDURE",
        "FN": "FUNCTION_SCALAR",
    }.get(type_char.upper(), type_char)


def _format_column_type(
    type_name: str,
    max_length: int | None,
    precision: int | None,
    scale: int | None,
) -> str:
    t = (type_name or "").strip().lower()
    ml = max_length if max_length is not None else 0
    if t in ("varchar", "varbinary", "char", "binary"):
        if ml < 0:
            return f"{type_name}(max)"
        return f"{type_name}({ml})"
    if t in ("nvarchar", "nchar"):
        if ml < 0:
            return f"{type_name}(max)"
        n = ml // 2 if ml > 0 else ml
        return f"{type_name}({n})"
    if t in ("decimal", "numeric"):
        return f"{type_name}({precision},{scale})"
    if t == "float":
        return f"{type_name}({precision})" if precision else type_name
    if t == "datetime2" and scale is not None and scale > 0:
        return f"{type_name}({scale})"
    return type_name


def _split_sql_identifiers(text: str) -> list[str]:
    """Köşeli parantez veya nokta ile ayrılmış identifier parçaları."""
    t = (text or "").strip()
    if not t:
        return []
    parts: list[str] = []
    i = 0
    n = len(t)
    while i < n:
        if t[i] in " \t\n\r":
            i += 1
            continue
        if t[i] == "[":
            j = i + 1
            while j < n and t[j] != "]":
                j += 1
            if j >= n:
                break
            parts.append(t[i + 1 : j].replace("]]", "]"))
            i = j + 1
            if i < n and t[i] == ".":
                i += 1
            continue
        j = i
        while j < n and t[j] != ".":
            j += 1
        parts.append(t[i:j].strip())
        i = j
        if i < n and t[i] == ".":
            i += 1
    return [p for p in parts if p]


def _try_parse_three_part(
    ref_schema: str, ref_name: str
) -> tuple[str, str, str] | None:
    """db.schema.object veya dört parçalı linked server db.schema.object."""
    for candidate in (
        ref_name,
        f"{ref_schema}.{ref_name}" if (ref_schema or "").strip() else ref_name,
    ):
        parts = _split_sql_identifiers(candidate)
        if len(parts) == 3:
            return parts[0], parts[1], parts[2]
        if len(parts) == 4:
            return parts[1], parts[2], parts[3]
        if len(parts) > 4:
            return parts[-3], parts[-2], parts[-1]
    return None


def _dm_referenced_rows(cursor, schema: str, name: str) -> list[tuple[str, str, int | None]]:
    fq = f"{schema}.{name}"
    try:
        cursor.execute(
            """
            SELECT referenced_schema_name, referenced_entity_name, referenced_id
            FROM sys.dm_sql_referenced_entities (?, 'OBJECT')
            """,
            fq,
        )
    except Exception as e:
        logger.warning("dm_sql_referenced_entities failed for %s: %s", fq, e)
        return []
    out: list[tuple[str, str, int | None]] = []
    for row in cursor.fetchall():
        rn = row[1]
        if rn is None or str(rn).strip() == "":
            continue
        rs = str(row[0] or "").strip() or "dbo"
        rn = str(rn).strip()
        rid = row[2]
        rid_i = int(rid) if rid is not None else None
        out.append((rs, rn, rid_i))
    return out


def _resolve_object(
    cursor, ref_schema: str, ref_name: str, ref_id: int | None
) -> tuple[int | None, str]:
    if ref_id is not None and ref_id > 0:
        cursor.execute(
            "SELECT object_id, RTRIM(type) FROM sys.objects WHERE object_id = ?",
            ref_id,
        )
        r = cursor.fetchone()
        if r:
            return int(r[0]), str(r[1] or "").strip().upper()
    cursor.execute(
        """
        SELECT o.object_id, RTRIM(o.type)
        FROM sys.objects o
        INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
        WHERE s.name = ? AND o.name = ?
        """,
        ref_schema,
        ref_name,
    )
    r = cursor.fetchone()
    if not r:
        return None, ""
    return int(r[0]), str(r[1] or "").strip().upper()


def _schema_name_for_object_id(cursor, object_id: int) -> tuple[str, str] | None:
    cursor.execute(
        """
        SELECT SCHEMA_NAME(o.schema_id), o.name
        FROM sys.objects o
        WHERE o.object_id = ?
        """,
        object_id,
    )
    r = cursor.fetchone()
    if not r:
        return None
    return str(r[0] or "dbo"), str(r[1] or "")


def _find_object_any_database(
    schema_name: str,
    object_name: str,
    db_names: list[str],
) -> tuple[str, int, str] | None:
    """referenced_id NULL ve iki parçalı ad için sunucudaki veritabanlarında ilk eşleşme."""
    rs = (schema_name or "").strip() or "dbo"
    rn = (object_name or "").strip()
    if not rn:
        return None
    n = 0
    for db_name in db_names:
        if n >= MAX_DATABASES_TO_SCAN:
            break
        n += 1
        try:
            with get_connection(db_name) as conn:
                cur = conn.cursor()
                oid, typ = _resolve_object(cur, rs, rn, None)
                if oid is not None and typ:
                    return db_name, oid, typ
        except Exception:
            continue
    return None


def _resolve_ref_target(
    context_db: str,
    cursor,
    ref_schema: str,
    ref_name: str,
    ref_id: int | None,
    db_names: list[str],
) -> tuple[str | None, int | None, str]:
    """
    Bağımlı nesnenin bulunduğu veritabanı + object_id + tip.
    context_db: dm çağrısının yapıldığı bağlantı veritabanı.
    """
    rs = (ref_schema or "").strip() or "dbo"
    rn = (ref_name or "").strip()
    if not rn:
        return None, None, ""

    if ref_id is not None and int(ref_id) > 0:
        cursor.execute(
            "SELECT object_id, RTRIM(type) FROM sys.objects WHERE object_id = ?",
            int(ref_id),
        )
        row = cursor.fetchone()
        if row:
            return context_db, int(row[0]), str(row[1] or "").strip().upper()

    oid, typ = _resolve_object(cursor, rs, rn, None)
    if oid is not None:
        return context_db, oid, typ

    t3 = _try_parse_three_part(rs, rn)
    if t3:
        db, sch, on = t3
        db_key = next((d for d in db_names if d.lower() == db.lower()), None)
        if db_key:
            try:
                with get_connection(db_key) as conn:
                    cur2 = conn.cursor()
                    oid2, typ2 = _resolve_object(cur2, sch, on, None)
                    if oid2 is not None:
                        return db_key, oid2, typ2
            except Exception as e:
                logger.debug("three-part resolve %s.%s.%s: %s", db, sch, on, e)

    found = _find_object_any_database(rs, rn, db_names)
    if found:
        dbn, oid3, typ3 = found
        return dbn, oid3, typ3

    return None, None, ""


def _collect_metadata_targets(
    database: str, root_schema: str, root_name: str
) -> list[tuple[str, int]]:
    """(veritabanı_adı, object_id) benzersiz liste — her oid kendi DB bağlamında."""
    db_names = [d for d in list_databases() if d.lower() != "tempdb"]

    seen_expand: set[tuple[str, str, str]] = set()
    seen_targets: set[tuple[str, int]] = set()
    ordered: list[tuple[str, int]] = []

    rs = (root_schema or "").strip()
    rn = (root_name or "").strip()
    queue: deque[tuple[str, str, str, int]] = deque()
    queue.append((database, rs, rn, 0))

    while queue and len(ordered) < MAX_OBJECTS_WITH_COLUMNS:
        db, sch, nm, depth = queue.popleft()
        ek = (db.lower(), sch.lower(), nm.lower())
        if ek in seen_expand:
            continue
        seen_expand.add(ek)

        try:
            with get_connection(db) as conn:
                cur = conn.cursor()
                refs = _dm_referenced_rows(cur, sch, nm)
                for ref_schema, ref_name, ref_id in refs:
                    try:
                        target_db, oid, typ = _resolve_ref_target(
                            db, cur, ref_schema, ref_name, ref_id, db_names
                        )
                    except Exception as e:
                        logger.debug("resolve ref in %s: %s", db, e)
                        continue

                    if oid is None or not typ or not target_db:
                        continue

                    tk = (target_db.lower(), oid)
                    if typ in _METADATA_TYPES and tk not in seen_targets:
                        seen_targets.add(tk)
                        ordered.append((target_db, oid))

                    if depth < MAX_EXPANSION_DEPTH and typ in _EXPAND_TYPES:
                        try:
                            with get_connection(target_db) as conn2:
                                cur2 = conn2.cursor()
                                names = _schema_name_for_object_id(cur2, oid)
                            if names:
                                nsch, nnm = names
                                nk = (target_db.lower(), nsch.lower(), nnm.lower())
                                if nk not in seen_expand:
                                    queue.append((target_db, nsch, nnm, depth + 1))
                        except Exception as e:
                            logger.debug("expand enqueue %s: %s", target_db, e)
        except Exception as e:
            logger.warning("dependency BFS skip %s.%s in DB %s: %s", sch, nm, db, e)

    return ordered


def _fetch_columns_blob(cursor, object_ids: list[int]) -> str:
    if not object_ids:
        return ""
    placeholders = ",".join("?" * len(object_ids))
    cursor.execute(
        f"""
        SELECT
            OBJECT_SCHEMA_NAME(c.object_id) AS sch,
            OBJECT_NAME(c.object_id) AS obj,
            RTRIM(o.type) AS obj_type,
            c.name AS col_name,
            t.name AS type_name,
            c.max_length,
            c.precision,
            c.scale,
            c.is_nullable,
            c.column_id
        FROM sys.columns c
        INNER JOIN sys.objects o ON o.object_id = c.object_id
        INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id IN ({placeholders})
        ORDER BY sch, obj, c.column_id
        """,
        object_ids,
    )
    rows = cursor.fetchall()
    by_obj: dict[tuple[str, str, str], list[str]] = {}
    for r in rows:
        sch = str(r[0] or "")
        obj = str(r[1] or "")
        otyp = str(r[2] or "").strip().upper()
        col = str(r[3] or "")
        tn = str(r[4] or "")
        max_len = r[5]
        prec = r[6]
        scale = r[7]
        is_null = r[8]
        key = (sch, obj, otyp)
        line = (
            f"  - {col} {_format_column_type(tn, max_len, prec, scale)} "
            f"{'NULL' if is_null else 'NOT NULL'}"
        )
        by_obj.setdefault(key, []).append(line)

    parts: list[str] = []
    for (sch, obj, otyp), lines in sorted(by_obj.items()):
        label = _type_label(otyp)
        parts.append(f"- {sch}.{obj} ({label})")
        parts.extend(lines)
        parts.append("")
    return "\n".join(parts).strip()


def _fetch_columns_multi_db(targets: list[tuple[str, int]]) -> str:
    """Nesne başına doğru veritabanından kolon özeti."""
    by_db: dict[str, list[int]] = {}
    for db, oid in targets:
        by_db.setdefault(db, []).append(oid)
    sections: list[str] = []
    for db in sorted(by_db.keys()):
        oids = by_db[db]
        try:
            with get_connection(db) as conn:
                cur = conn.cursor()
                blob = _fetch_columns_blob(cur, oids)
            if blob:
                sections.append(f"### Veritabanı: [{db}]\n{blob}")
        except Exception as e:
            logger.warning("column fetch failed for DB %s: %s", db, e)
    return "\n\n".join(sections).strip()


def fetch_dependency_metadata_context(
    database: str,
    schema_name: str,
    object_name: str,
) -> str:
    """
    Bağımlı nesnelerin kolon/tip özetini döndürür; her nesne kendi veritabanından okunur.
    """
    try:
        targets = _collect_metadata_targets(database, schema_name, object_name)
        if not targets:
            return ""
        blob = _fetch_columns_multi_db(targets)
    except Exception as e:
        logger.warning("fetch_dependency_metadata_context failed: %s", e)
        return ""

    if not blob:
        return ""

    header = (
        f"Analiz kökü veritabanı: {database}\n"
        f"Aşağıdaki kolon listeleri her nesnenin bulunduğu veritabanından "
        f"(sys.dm_sql_referenced_entities + sys.columns) alınmıştır; "
        f"en fazla {MAX_OBJECTS_WITH_COLUMNS} nesne, derinlik ≤ {MAX_EXPANSION_DEPTH}.\n\n"
    )
    text = header + blob
    if len(text) > MAX_OUTPUT_CHARS:
        text = text[: MAX_OUTPUT_CHARS - 80] + "\n\n[… metin uzunluk sınırı nedeniyle kesildi …]"
    return text
