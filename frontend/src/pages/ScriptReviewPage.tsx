import { useCallback, useState } from 'react'
import { PRODUCT_NAME } from '../brand'
import { AccordionSection } from '../components/AccordionSection'
import { useReviewAnalysis } from '../contexts/ReviewAnalysisContext'

export function ScriptReviewPage() {
  const {
    reviewing,
    hasReviewOutput,
    openResultsModal,
    startScriptReview,
    invalidateReviewSession,
  } = useReviewAnalysis()

  const [sql, setSql] = useState('')
  const [label, setLabel] = useState('')
  const [openEditorPanel, setOpenEditorPanel] = useState(true)

  const onReview = useCallback(() => {
    startScriptReview(sql, label)
  }, [sql, label, startScriptReview])

  const canSubmit = sql.trim().length > 0 && !reviewing

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="mb-6 shrink-0">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
          {PRODUCT_NAME}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          SQL betiği incelemesi
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Veritabanından nesne seçmeden elinizdeki SQL betiğini yapıştırın;
          yayınlanmış kurallarınıza göre LLM ile inceleyin. Sonuçlar açılır
          pencerede gösterilir.
        </p>
      </header>

      <div className="mt-2 flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
        {hasReviewOutput ? (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200/90 bg-gradient-to-r from-emerald-50 to-teal-50/80 px-4 py-3 shadow-sm ring-1 ring-emerald-500/10 dark:border-emerald-800/50 dark:from-emerald-950/40 dark:to-teal-950/30 dark:ring-emerald-400/10">
            <p className="text-sm font-medium text-emerald-950 dark:text-emerald-100/95">
              Son inceleme tamamlandı. Ayrıntılar sonuç penceresinde.
            </p>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openResultsModal}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:focus-visible:outline-emerald-400"
              >
                Sonuçları aç
              </button>
              <button
                type="button"
                onClick={invalidateReviewSession}
                disabled={reviewing}
                className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900 shadow-sm hover:bg-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-700 dark:bg-rose-950/50 dark:text-rose-100 dark:hover:bg-rose-900/70 dark:focus-visible:outline-rose-500"
              >
                Sonuçları temizle
              </button>
            </div>
          </div>
        ) : null}

        <AccordionSection
          id="accordion-script"
          title="SQL betiği"
          subtitle={
            sql.trim()
              ? `${sql.trim().length.toLocaleString('tr-TR')} karakter`
              : 'Metin yok'
          }
          open={openEditorPanel}
          onToggle={() => setOpenEditorPanel((o) => !o)}
          fillHeight
        >
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3">
            <div className="shrink-0">
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Sonuçlarda görünecek ad (isteğe bağlı)
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Örn. staging_load_customer"
                disabled={reviewing}
                maxLength={200}
                className="w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-zinc-400 focus:ring-2 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950"
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-1.5">
              <label className="shrink-0 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                SQL
              </label>
              <textarea
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                disabled={reviewing}
                spellCheck={false}
                placeholder="CREATE PROCEDURE … veya SELECT …"
                className="min-h-[10rem] w-full flex-1 resize-y rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-sm leading-relaxed text-zinc-900 outline-none ring-zinc-400 focus:ring-2 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onReview}
                disabled={!canSubmit}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                {reviewing ? 'İnceleniyor…' : 'Kurallara göre incele'}
              </button>
              {reviewing ? (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  LLM yanıtı bekleniyor…
                </span>
              ) : null}
            </div>
          </div>
        </AccordionSection>
      </div>
    </div>
  )
}
