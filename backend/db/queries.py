# Catalog: user procedures, views, and T-SQL functions (scalar, inline, multi-statement table-valued)
LIST_OBJECTS_SQL = """
SELECT
    s.name AS schema_name,
    o.name AS object_name,
    o.type AS type_code,
    CASE o.type
        WHEN 'P' THEN 'PROCEDURE'
        WHEN 'V' THEN 'VIEW'
        WHEN 'FN' THEN 'FUNCTION_SCALAR'
        WHEN 'IF' THEN 'FUNCTION_INLINE'
        WHEN 'TF' THEN 'FUNCTION_TABLE'
        WHEN 'SF' THEN 'FUNCTION_SQL_INLINE'
        ELSE o.type
    END AS object_type,
    o.create_date AS create_date,
    o.modify_date AS last_modified
FROM sys.objects o
INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
WHERE o.type IN ('P', 'V', 'FN', 'IF', 'TF', 'SF')
  AND o.is_ms_shipped = 0
ORDER BY s.name, o.name;
"""

# Optional filter applied in Python or extend with dynamic WHERE — we use parameterized LIKE in service

GET_DEFINITION_SQL = """
SELECT OBJECT_DEFINITION(o.object_id) AS definition
FROM sys.objects o
INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
WHERE s.name = ? AND o.name = ? AND RTRIM(o.type) = ?;
"""
