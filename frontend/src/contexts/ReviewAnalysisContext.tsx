import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { appendAnalysisHistoryEntry } from '../analysisHistoryStorage'
import {
  createInitialLiveProgress,
  hydrateLiveProgressFromResults,
  mergeReviewProgressEvent,
  mergeRuleResultsIntoLiveProgress,
  type LiveProgressSnapshot,
} from '../reviewProgress'
import type { ObjectReviewResult } from '../services/api'
import {
  postReviewStream,
  postScriptReviewStream,
} from '../services/api'

/** Her seçim kendi catalog veritabanını taşır (çoklu DB analizi). */
export type DbObjectSelection = {
  schema: string
  name: string
  object_type: string
  database: string
}

/** Devam eden istek için kullanıcıya gösterilecek özet. */
export type ActiveReviewSummary =
  | { kind: 'db'; database: string; targets: string[] }
  | { kind: 'script'; label: string }

function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === 'AbortError') return true
  if (e instanceof Error && e.name === 'AbortError') return true
  return false
}

type ReviewAnalysisContextValue = {
  reviewing: boolean
  /** Analiz bitti; canlı modalda tamamlandı mesajı + Sonuçları göster bekleniyor. */
  analysisCompletePending: boolean
  /** Canlı takip popup açık (inceleme veya tamamlanmayı bekleme). */
  liveTrackingOpen: boolean
  activeReviewSummary: ActiveReviewSummary | null
  liveProgress: LiveProgressSnapshot | null
  reviewError: string | null
  results: ObjectReviewResult[]
  falsePositives: Record<string, boolean>
  hasReviewOutput: boolean
  resultsModalOpen: boolean
  openResultsModal: () => void
  closeResultsModal: () => void
  /** Sonuç modalından canlı tamamlanma ekranına döner (Sonuçları göster sonrası). */
  backToLiveFromResults: () => void
  /** Sonuç modalına geçilebilirken canlı oturumu korunuyor mu (geri düğmesi). */
  canReturnToLiveFromResults: boolean
  /** Canlı modalı kapatır, sonuç modalını açar. */
  showResultsFromLive: () => void
  /** Canlı modalı kapatır; sonuçlar state’te kalır (sonradan açılabilir). */
  dismissLiveTracking: () => void
  /** Devam eden SSE isteğini iptal eder (fetch abort). */
  cancelReview: () => void
  startReview: (selections: DbObjectSelection[]) => void
  startScriptReview: (sql: string, label?: string) => void
  invalidateReviewSession: () => void
  onFalsePositiveChange: (key: string, value: boolean) => void
}

const ReviewAnalysisContext = createContext<ReviewAnalysisContextValue | null>(
  null,
)

export function ReviewAnalysisProvider({ children }: { children: ReactNode }) {
  const generationRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [analysisCompletePending, setAnalysisCompletePending] = useState(false)
  const [liveTrackingOpen, setLiveTrackingOpen] = useState(false)
  const [activeReviewSummary, setActiveReviewSummary] =
    useState<ActiveReviewSummary | null>(null)
  const [liveProgress, setLiveProgress] =
    useState<LiveProgressSnapshot | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [results, setResults] = useState<ObjectReviewResult[]>([])
  const [falsePositives, setFalsePositives] = useState<Record<string, boolean>>(
    {},
  )
  const [resultsModalOpen, setResultsModalOpen] = useState(false)
  const [canReturnToLiveFromResults, setCanReturnToLiveFromResults] =
    useState(false)

  const hasReviewOutput = results.length > 0 || Boolean(reviewError)

  const openResultsModal = useCallback(() => {
    if (hasReviewOutput) {
      setCanReturnToLiveFromResults(false)
      setResultsModalOpen(true)
    }
  }, [hasReviewOutput])

  const closeResultsModal = useCallback(() => {
    setResultsModalOpen(false)
    setCanReturnToLiveFromResults((prev) => {
      if (prev) {
        setLiveProgress(null)
        setActiveReviewSummary(null)
        setAnalysisCompletePending(false)
      }
      return false
    })
  }, [])

  const backToLiveFromResults = useCallback(() => {
    setResultsModalOpen(false)
    setLiveTrackingOpen(true)
  }, [])

  const dismissLiveTracking = useCallback(() => {
    setLiveTrackingOpen(false)
    setAnalysisCompletePending(false)
    setLiveProgress(null)
    setActiveReviewSummary(null)
    setCanReturnToLiveFromResults(false)
  }, [])

  const cancelReview = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  const showResultsFromLive = useCallback(() => {
    if (!hasReviewOutput) return
    setCanReturnToLiveFromResults(true)
    setLiveTrackingOpen(false)
    setResultsModalOpen(true)
  }, [hasReviewOutput])

  const invalidateReviewSession = useCallback(() => {
    generationRef.current += 1
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setResults([])
    setReviewError(null)
    setFalsePositives({})
    setActiveReviewSummary(null)
    setLiveProgress(null)
    setReviewing(false)
    setAnalysisCompletePending(false)
    setLiveTrackingOpen(false)
    setResultsModalOpen(false)
    setCanReturnToLiveFromResults(false)
  }, [])

  const startReview = useCallback((selections: DbObjectSelection[]) => {
    if (selections.length === 0) return
    const gen = ++generationRef.current
    const uniqueDbs = [...new Set(selections.map((s) => s.database))]
    const databaseLabel =
      uniqueDbs.length === 1
        ? uniqueDbs[0]
        : `${uniqueDbs.length} veritabanı (${uniqueDbs.join(', ')})`
    const defaultDb = uniqueDbs.length === 1 ? uniqueDbs[0] : ''
    const targets = selections.map(
      (s) => `[${s.database}] ${s.schema}.${s.name} (${s.object_type})`,
    )
    const initial = createInitialLiveProgress({
      mode: 'db',
      database: databaseLabel,
      objectsTotal: selections.length,
    })
    setReviewError(null)
    setReviewing(true)
    setAnalysisCompletePending(false)
    setLiveTrackingOpen(true)
    setResultsModalOpen(false)
    setCanReturnToLiveFromResults(false)
    setActiveReviewSummary({ kind: 'db', database: databaseLabel, targets })
    setLiveProgress(initial)
    setFalsePositives({})
    abortControllerRef.current?.abort()
    const ac = new AbortController()
    abortControllerRef.current = ac
    void postReviewStream(
      defaultDb,
      selections,
      (ev) => {
        if (gen !== generationRef.current) return
        setLiveProgress((prev) =>
          mergeReviewProgressEvent(prev ?? initial, ev),
        )
      },
      ac.signal,
    )
      .then((res) => {
        if (gen !== generationRef.current) return
        setLiveProgress((prev) =>
          mergeRuleResultsIntoLiveProgress(
            hydrateLiveProgressFromResults(prev ?? initial, res),
            res,
          ),
        )
        setResults(res)
        setReviewError(null)
        appendAnalysisHistoryEntry({
          kind: 'db',
          database: databaseLabel,
          title: `${databaseLabel} · ${res.length} nesne`,
          subtitle:
            targets.length <= 3
              ? targets.join(', ')
              : `${targets.slice(0, 3).join(', ')} +${targets.length - 3}`,
          results: res,
          reviewError: null,
        })
      })
      .catch((e: unknown) => {
        if (gen !== generationRef.current) return
        if (isAbortError(e)) {
          setReviewError('İnceleme durduruldu.')
          setResults([])
          return
        }
        const msg = e instanceof Error ? e.message : 'İnceleme başarısız'
        setReviewError(msg)
        setResults([])
        appendAnalysisHistoryEntry({
          kind: 'db',
          database: databaseLabel,
          title: `${databaseLabel} · hata`,
          subtitle: targets.slice(0, 4).join(', '),
          results: [],
          reviewError: msg,
        })
      })
      .finally(() => {
        if (abortControllerRef.current === ac) abortControllerRef.current = null
        if (gen !== generationRef.current) return
        setReviewing(false)
        setAnalysisCompletePending(true)
      })
  }, [])

  const startScriptReview = useCallback((sql: string, label?: string) => {
    const trimmed = sql.trim()
    if (!trimmed) return
    const gen = ++generationRef.current
    const displayLabel = (label ?? '').trim() || 'Yapıştırılan SQL'
    const initial = createInitialLiveProgress({
      mode: 'script',
      database: '',
      scriptLabel: displayLabel,
      objectsTotal: 1,
    })
    setReviewError(null)
    setReviewing(true)
    setAnalysisCompletePending(false)
    setLiveTrackingOpen(true)
    setResultsModalOpen(false)
    setCanReturnToLiveFromResults(false)
    setActiveReviewSummary({ kind: 'script', label: displayLabel })
    setLiveProgress(initial)
    setFalsePositives({})
    abortControllerRef.current?.abort()
    const ac = new AbortController()
    abortControllerRef.current = ac
    void postScriptReviewStream(
      trimmed,
      label?.trim() || undefined,
      (ev) => {
        if (gen !== generationRef.current) return
        setLiveProgress((prev) =>
          mergeReviewProgressEvent(prev ?? initial, ev),
        )
      },
      ac.signal,
    )
      .then((res) => {
        if (gen !== generationRef.current) return
        setLiveProgress((prev) =>
          mergeRuleResultsIntoLiveProgress(
            hydrateLiveProgressFromResults(prev ?? initial, res),
            res,
          ),
        )
        setResults(res)
        setReviewError(null)
        appendAnalysisHistoryEntry({
          kind: 'script',
          title: displayLabel,
          results: res,
          reviewError: null,
        })
      })
      .catch((e: unknown) => {
        if (gen !== generationRef.current) return
        if (isAbortError(e)) {
          setReviewError('İnceleme durduruldu.')
          setResults([])
          return
        }
        const msg = e instanceof Error ? e.message : 'İnceleme başarısız'
        setReviewError(msg)
        setResults([])
        appendAnalysisHistoryEntry({
          kind: 'script',
          title: displayLabel,
          results: [],
          reviewError: msg,
        })
      })
      .finally(() => {
        if (abortControllerRef.current === ac) abortControllerRef.current = null
        if (gen !== generationRef.current) return
        setReviewing(false)
        setAnalysisCompletePending(true)
      })
  }, [])

  const onFalsePositiveChange = useCallback((key: string, value: boolean) => {
    setFalsePositives((prev) => ({ ...prev, [key]: value }))
  }, [])

  const value = useMemo(
    () => ({
      reviewing,
      analysisCompletePending,
      liveTrackingOpen,
      activeReviewSummary,
      liveProgress,
      reviewError,
      results,
      falsePositives,
      hasReviewOutput,
      resultsModalOpen,
      openResultsModal,
      closeResultsModal,
      backToLiveFromResults,
      canReturnToLiveFromResults,
      showResultsFromLive,
      dismissLiveTracking,
      cancelReview,
      startReview,
      startScriptReview,
      invalidateReviewSession,
      onFalsePositiveChange,
    }),
    [
      reviewing,
      analysisCompletePending,
      liveTrackingOpen,
      activeReviewSummary,
      liveProgress,
      reviewError,
      results,
      falsePositives,
      hasReviewOutput,
      resultsModalOpen,
      openResultsModal,
      closeResultsModal,
      backToLiveFromResults,
      canReturnToLiveFromResults,
      showResultsFromLive,
      dismissLiveTracking,
      cancelReview,
      startReview,
      startScriptReview,
      invalidateReviewSession,
      onFalsePositiveChange,
    ],
  )

  return (
    <ReviewAnalysisContext.Provider value={value}>
      {children}
    </ReviewAnalysisContext.Provider>
  )
}

export function useReviewAnalysis(): ReviewAnalysisContextValue {
  const ctx = useContext(ReviewAnalysisContext)
  if (!ctx) {
    throw new Error('useReviewAnalysis: ReviewAnalysisProvider gerekli')
  }
  return ctx
}
