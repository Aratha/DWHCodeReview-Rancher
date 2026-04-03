import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  ANALYSIS_HISTORY_CHANGED,
  clearAnalysisHistory,
  loadAnalysisHistory,
  removeAnalysisHistoryEntry,
  updateAnalysisHistoryFalsePositives,
  type AnalysisHistoryEntry,
} from '../analysisHistoryStorage'
import { PRODUCT_NAME } from '../brand'
import { ReviewResults } from '../components/ReviewResults'

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function AnalysisHistoryPage() {
  const [entries, setEntries] = useState<AnalysisHistoryEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(() => {
    setEntries(loadAnalysisHistory())
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const on = () => load()
    window.addEventListener(ANALYSIS_HISTORY_CHANGED, on)
    return () => window.removeEventListener(ANALYSIS_HISTORY_CHANGED, on)
  }, [load])

  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId],
  )

  const [fp, setFp] = useState<Record<string, boolean>>({})
  useEffect(() => {
    setFp(selected?.falsePositives ?? {})
  }, [selectedId, selected])

  const onFalsePositiveChange = useCallback(
    (key: string, value: boolean) => {
      setFp((prev) => {
        const next = { ...prev, [key]: value }
        if (selectedId) {
          updateAnalysisHistoryFalsePositives(selectedId, next)
        }
        return next
      })
    },
    [selectedId],
  )

  const onClearAll = useCallback(() => {
    if (!window.confirm('Tüm analiz geçmişi silinsin mi?')) return
    clearAnalysisHistory()
    setSelectedId(null)
    load()
  }, [load])

  const onRemoveOne = useCallback(
    (id: string) => {
      if (!window.confirm('Bu kayıt silinsin mi?')) return
      removeAnalysisHistoryEntry(id)
      if (selectedId === id) setSelectedId(null)
      load()
    },
    [load, selectedId],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {PRODUCT_NAME} — Analiz geçmişi
          </h1>
          <p className="mt-1 max-w-3xl text-xs text-zinc-500">
            Tamamlanan incelemelerin sonuçları tarayıcınızda saklanır (bu
            bilgisayar). Yeni analiz bittiğinde kayıt otomatik eklenir.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          >
            Yenile
          </button>
          <button
            type="button"
            onClick={() => void onClearAll()}
            disabled={entries.length === 0}
            className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          >
            Tümünü sil
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-300 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-none">
          <div className="border-b border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            Kayıtlar ({entries.length})
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {entries.length === 0 ? (
              <p className="p-4 text-sm text-zinc-500">
                Henüz kayıtlı analiz yok. İnceleme veya SQL yapıştır sekmesinde
                analiz tamamlayınca sonuçlar burada listelenir.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-700/80">
                {entries.map((row) => (
                  <li key={row.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      className={`w-full px-3 py-2.5 pr-10 text-left text-sm transition hover:bg-zinc-100/90 dark:hover:bg-zinc-800/80 ${
                        selectedId === row.id
                          ? 'bg-zinc-200/60 dark:bg-zinc-800/70'
                          : ''
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                            row.kind === 'db'
                              ? 'bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200'
                              : 'bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-200'
                          }`}
                        >
                          {row.kind === 'db' ? 'db' : 'sql'}
                        </span>
                        <span className="text-[11px] text-zinc-500">
                          {formatWhen(row.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs font-medium text-zinc-800 dark:text-zinc-100">
                        {row.title}
                      </p>
                      {row.subtitle ? (
                        <p className="mt-0.5 line-clamp-2 font-mono text-[10px] text-zinc-500">
                          {row.subtitle}
                        </p>
                      ) : null}
                      {row.reviewError ? (
                        <p className="mt-1 line-clamp-2 text-[11px] text-red-600 dark:text-red-400">
                          {row.reviewError}
                        </p>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      title="Kaydı sil"
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemoveOne(row.id)
                      }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 text-zinc-400 opacity-0 hover:bg-zinc-200 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-zinc-700 dark:hover:text-red-400"
                    >
                      <span className="sr-only">Sil</span>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-zinc-300 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-none">
          <div className="border-b border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            Sonuçlar
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {!selectedId && (
              <p className="text-sm text-zinc-500">
                Soldan bir analiz seçin.
              </p>
            )}
            {selected && (
              <>
                {selected.reviewError ? (
                  <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                    {selected.reviewError}
                  </div>
                ) : null}
                {selected.results.length > 0 ? (
                  <ReviewResults
                    results={selected.results}
                    falsePositives={fp}
                    onFalsePositiveChange={onFalsePositiveChange}
                    showHeading={false}
                  />
                ) : !selected.reviewError ? (
                  <p className="text-sm text-zinc-500">Sonuç yok.</p>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
