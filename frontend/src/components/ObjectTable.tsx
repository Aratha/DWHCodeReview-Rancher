import { useMemo, useRef, useState } from 'react'
import type { DbObject } from '../services/api'

type Props = {
  objects: DbObject[]
  loading: boolean
  selectedKeys: Set<string>
  onToggle: (key: string, selected: boolean) => void
  onToggleAll: (keys: string[], selected: boolean) => void
  /** Tüm satır seçimlerini kaldırır (çoklu veritabanı seçimleri dahil) */
  onClearSelection?: () => void
  onReview: () => void
  reviewing: boolean
  /** Varsayılan: şema|ad|tür; çoklu DB için catalog ile birleşik anahtar verin */
  getRowKey?: (o: DbObject) => string
  /** Akordiyon içi: dış çerçeveyi kaldırır */
  embedded?: boolean
  /** YYYY-MM-DD; boşsa API tarih filtresi uygulanmaz */
  fromDate?: string
  onFromDateChange?: (value: string) => void
  className?: string
}

function rowKey(o: DbObject) {
  return `${o.schema}|${o.name}|${o.type_code}`
}

export function ObjectTable({
  objects,
  loading,
  selectedKeys,
  onToggle,
  onToggleAll,
  onClearSelection,
  onReview,
  reviewing,
  getRowKey = rowKey,
  embedded = false,
  fromDate = '',
  onFromDateChange,
  className = '',
}: Props) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const fromDateInputRef = useRef<HTMLInputElement>(null)

  const openFromDatePicker = () => {
    const el = fromDateInputRef.current
    if (!el) return
    try {
      el.showPicker()
    } catch {
      el.focus()
    }
  }

  const types = useMemo(() => {
    const s = new Set(objects.map((o) => o.type))
    return ['ALL', ...Array.from(s).sort()]
  }, [objects])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return objects.filter((o) => {
      if (typeFilter !== 'ALL' && o.type !== typeFilter) return false
      if (!q) return true
      const hay = `${o.schema} ${o.name} ${o.type}`.toLowerCase()
      return hay.includes(q)
    })
  }, [objects, search, typeFilter])

  const allFilteredKeys = useMemo(
    () => filtered.map(getRowKey),
    [filtered, getRowKey],
  )

  const allSelected =
    filtered.length > 0 &&
    allFilteredKeys.every((k) => selectedKeys.has(k))

  const { selectionCount, distinctDatabaseCount } = useMemo(() => {
    const n = selectedKeys.size
    const dbs = new Set<string>()
    for (const k of selectedKeys) {
      if (k.includes('\x1f')) {
        const db = k.split('\x1f')[0]
        if (db) dbs.add(db)
      }
    }
    return {
      selectionCount: n,
      distinctDatabaseCount: dbs.size,
    }
  }, [selectedKeys])

  return (
    <section
      className={`flex min-h-0 flex-col ${
        embedded
          ? 'min-h-0 flex-1 rounded-none border-0 bg-transparent shadow-none'
          : 'flex-1 rounded-xl border border-zinc-300 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900'
      } ${className}`.trim()}
    >
      <div
        className={`flex shrink-0 flex-wrap items-center gap-3 px-4 py-3 ${
          embedded
            ? 'border-b border-zinc-200/80 bg-zinc-100/90 dark:border-zinc-700/70 dark:bg-zinc-950/50'
            : 'border-b border-zinc-200 dark:border-zinc-700'
        }`}
      >
        <div className="min-w-[180px] flex-1">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Şema, ad, tür…"
            aria-label="Şema, ad veya türe göre ara"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950"
          />
        </div>
        <div className="w-44">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Nesne türüne göre filtrele"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {t === 'ALL' ? 'Tüm türler' : t}
              </option>
            ))}
          </select>
        </div>
        {onFromDateChange ? (
          <div className="w-44 min-w-[11rem]">
            <input
              ref={fromDateInputRef}
              id="review-object-from-date"
              type="date"
              value={fromDate}
              onChange={(e) => onFromDateChange(e.target.value)}
              onClick={() => openFromDatePicker()}
              className="w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              title="Bu tarihte veya sonrasında oluşturulan veya güncellenen nesneler listelenir; boş bırakılırsa tümü."
              aria-label="En erken oluşturma veya güncelleme tarihi; bu tarihten bugüne"
            />
          </div>
        ) : null}
        <div className="ml-auto flex min-w-0 shrink-0 flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:gap-3">
          {distinctDatabaseCount > 1 && (
            <p
              className="whitespace-nowrap text-right text-xs tabular-nums text-zinc-600 dark:text-zinc-400 sm:text-sm"
              aria-live="polite"
            >
              {`${selectionCount} seçili · ${distinctDatabaseCount} veritabanı`}
            </p>
          )}
          {onClearSelection ? (
            <button
              type="button"
              onClick={onClearSelection}
              disabled={selectedKeys.size === 0}
              aria-label="Tüm tablo seçimlerini temizle"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Tablo seçimlerini temizle
            </button>
          ) : null}
          <button
            type="button"
            onClick={onReview}
            disabled={reviewing || selectedKeys.size === 0}
            aria-label={
              selectionCount === 0
                ? 'İnceleme için en az bir nesne seçin'
                : `Seçilen ${selectionCount} nesneyi incele`
            }
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {reviewing
              ? 'İnceleniyor…'
              : selectionCount > 0
                ? `Seçilenleri İncele (${selectionCount})`
                : 'Seçilenleri İncele'}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-100/95 backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95">
            <tr className="text-xs uppercase text-zinc-600 dark:text-zinc-400">
              <th className="w-10 px-4 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) =>
                    onToggleAll(allFilteredKeys, e.target.checked)
                  }
                  aria-label="Görünenlerin tümünü seç"
                />
              </th>
              <th className="px-2 py-2 font-medium">Şema</th>
              <th className="px-2 py-2 font-medium">Ad</th>
              <th className="px-2 py-2 font-medium">Tür</th>
              <th className="px-2 py-2 font-medium">Oluşturulma</th>
              <th className="px-2 py-2 font-medium">Son değişiklik</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-zinc-500">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
                    Nesneler yükleniyor…
                  </span>
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                  Filtrelere uyan nesne yok.
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((o) => {
                const k = getRowKey(o)
                const checked = selectedKeys.has(k)
                return (
                  <tr
                    key={k}
                    onClick={() => onToggle(k, !checked)}
                    className={`cursor-pointer border-b border-zinc-200/90 transition-colors last:border-0 hover:bg-zinc-100/90 dark:border-zinc-700/70 dark:hover:bg-zinc-800/70 ${
                      checked
                        ? 'bg-zinc-200/70 dark:bg-zinc-800/60'
                        : ''
                    }`}
                    title="Satıra tıklayarak seç / kaldır"
                  >
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => onToggle(k, e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${o.schema}.${o.name}`}
                      />
                    </td>
                    <td className="px-2 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      {o.schema}
                    </td>
                    <td className="px-2 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                      {o.name}
                    </td>
                    <td className="px-2 py-2 text-zinc-600 dark:text-zinc-400">
                      {o.type}
                    </td>
                    <td className="px-2 py-2 text-zinc-500">
                      {o.created_at
                        ? new Date(o.created_at).toLocaleString()
                        : '—'}
                    </td>
                    <td className="px-2 py-2 text-zinc-500">
                      {o.last_modified
                        ? new Date(o.last_modified).toLocaleString()
                        : '—'}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export { rowKey }
