import type { ObjectReviewResult } from './services/api'

const STORAGE_KEY = 'dwh-code-review-analysis-history-v1'
const MAX_ENTRIES = 50

export const ANALYSIS_HISTORY_CHANGED = 'dwh-analysis-history-changed'

export type AnalysisHistoryEntry = {
  id: string
  createdAt: string
  kind: 'db' | 'script'
  database?: string
  title: string
  subtitle?: string
  results: ObjectReviewResult[]
  reviewError: string | null
  falsePositives: Record<string, boolean>
}

function safeParse(raw: string | null): AnalysisHistoryEntry[] {
  if (!raw) return []
  try {
    const j = JSON.parse(raw) as unknown
    if (!Array.isArray(j)) return []
    return j.filter(
      (x) =>
        x &&
        typeof x === 'object' &&
        typeof (x as AnalysisHistoryEntry).id === 'string',
    ) as AnalysisHistoryEntry[]
  } catch {
    return []
  }
}

export function loadAnalysisHistory(): AnalysisHistoryEntry[] {
  try {
    return safeParse(localStorage.getItem(STORAGE_KEY))
  } catch {
    return []
  }
}

function saveAnalysisHistory(entries: AnalysisHistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    /* quota / private mode */
  }
  window.dispatchEvent(new Event(ANALYSIS_HISTORY_CHANGED))
}

export function appendAnalysisHistoryEntry(
  entry: Omit<AnalysisHistoryEntry, 'id' | 'createdAt' | 'falsePositives'> & {
    id?: string
    falsePositives?: Record<string, boolean>
  },
): void {
  const list = loadAnalysisHistory()
  const item: AnalysisHistoryEntry = {
    ...entry,
    id: entry.id ?? crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    falsePositives: entry.falsePositives ?? {},
  }
  const next = [item, ...list].slice(0, MAX_ENTRIES)
  saveAnalysisHistory(next)
}

export function updateAnalysisHistoryFalsePositives(
  id: string,
  falsePositives: Record<string, boolean>,
): void {
  const list = loadAnalysisHistory()
  const i = list.findIndex((x) => x.id === id)
  if (i < 0) return
  list[i] = { ...list[i], falsePositives }
  saveAnalysisHistory(list)
}

export function removeAnalysisHistoryEntry(id: string): void {
  saveAnalysisHistory(loadAnalysisHistory().filter((x) => x.id !== id))
}

export function clearAnalysisHistory(): void {
  saveAnalysisHistory([])
}
