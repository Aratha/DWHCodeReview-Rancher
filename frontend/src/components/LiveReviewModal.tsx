import { useEffect } from 'react'

import { GlobalReviewProgress } from './GlobalReviewProgress'
import { useReviewAnalysis } from '../contexts/ReviewAnalysisContext'

/** LLM analizi başlayınca açılan canlı takip popup’ı. */
export function LiveReviewModal() {
  const { liveTrackingOpen, reviewing, dismissLiveTracking } =
    useReviewAnalysis()

  useEffect(() => {
    if (!liveTrackingOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [liveTrackingOpen])

  useEffect(() => {
    if (!liveTrackingOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (reviewing) return
      dismissLiveTracking()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [liveTrackingOpen, reviewing, dismissLiveTracking])

  if (!liveTrackingOpen) return null

  const backdropClosable = !reviewing

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-review-modal-title"
      aria-busy={reviewing}
    >
      <button
        type="button"
        className={`absolute inset-0 bg-zinc-950/60 backdrop-blur-[2px] ${
          backdropClosable
            ? 'cursor-pointer'
            : 'cursor-not-allowed opacity-100'
        }`}
        aria-label={backdropClosable ? 'Kapat' : 'Analiz sürüyor'}
        onClick={backdropClosable ? () => dismissLiveTracking() : undefined}
        disabled={!backdropClosable}
      />
      {reviewing ? (
        <p className="pointer-events-none absolute bottom-6 left-1/2 z-[112] max-w-sm -translate-x-1/2 rounded-md bg-zinc-900/90 px-3 py-2 text-center text-xs text-zinc-100 shadow-lg dark:bg-zinc-800/95">
          Analiz devam ediyor; bu pencereyi kapatmak için işlemin bitmesini bekleyin.
        </p>
      ) : null}
      <div className="relative z-10 w-full max-w-[min(94vw,1440px)]">
        <h2 id="live-review-modal-title" className="sr-only">
          Canlı inceleme
        </h2>
        <GlobalReviewProgress />
      </div>
    </div>
  )
}
