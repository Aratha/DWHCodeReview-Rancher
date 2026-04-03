import { useEffect } from 'react'
import { ExportMenu } from './ExportMenu'
import { ReviewResults } from './ReviewResults'
import { useReviewAnalysis } from '../contexts/ReviewAnalysisContext'

/** Tüm inceleme sonuçları (veritabanı nesneleri veya yapıştırılan SQL) bu modalda gösterilir. */
export function ReviewResultsModal() {
  const {
    resultsModalOpen,
    closeResultsModal,
    backToLiveFromResults,
    canReturnToLiveFromResults,
    reviewError,
    results,
    falsePositives,
    onFalsePositiveChange,
  } = useReviewAnalysis()

  const hasContent = results.length > 0 || Boolean(reviewError)

  useEffect(() => {
    if (!resultsModalOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [resultsModalOpen])

  useEffect(() => {
    if (!resultsModalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeResultsModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [resultsModalOpen, closeResultsModal])

  if (!resultsModalOpen || !hasContent) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-results-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-zinc-950/60 backdrop-blur-[2px]"
        aria-label="Kapat"
        onClick={closeResultsModal}
      />
      <div className="relative z-10 flex max-h-[min(96vh,1400px)] w-full max-w-[min(94vw,1440px)] flex-col overflow-hidden rounded-xl border border-zinc-300 bg-white shadow-2xl dark:border-zinc-600 dark:bg-zinc-900">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            {canReturnToLiveFromResults ? (
              <button
                type="button"
                onClick={backToLiveFromResults}
                className="shrink-0 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                ← Canlı analiz
              </button>
            ) : null}
            <h2
              id="review-results-modal-title"
              className="min-w-0 truncate text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              İnceleme sonuçları
            </h2>
          </div>
          <button
            type="button"
            onClick={closeResultsModal}
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            Kapat
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {reviewError ? (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {reviewError}
            </div>
          ) : null}
          {results.length > 0 ? (
            <ReviewResults
              results={results}
              falsePositives={falsePositives}
              onFalsePositiveChange={onFalsePositiveChange}
              showHeading={false}
            />
          ) : !reviewError ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Sonuç yok.
            </p>
          ) : null}
        </div>

        {results.length > 0 ? (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
            <ExportMenu results={results} falsePositives={falsePositives} />
          </footer>
        ) : null}
      </div>
    </div>
  )
}
