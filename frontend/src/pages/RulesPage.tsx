import { useCallback, useEffect, useMemo, useState } from 'react'

import { PRODUCT_NAME } from '../brand'
import type { RuleBundle, RuleLine, RulesState } from '../services/api'
import { getRules, postRulesPublish, putRulesDraft } from '../services/api'

const PREVIEW_CHARS = 100

type Tier = 'critical' | 'normal'

function emptyBundle(): RuleBundle {
  return { critical: [], normal: [] }
}

function formatRuleNum(n: number): string {
  if (n < 100) return `Kural${String(n).padStart(2, '0')}`
  return `Kural${n}`
}

function maxRuleNum(bundle: RuleBundle): number {
  let m = 0
  for (const r of [...bundle.critical, ...bundle.normal]) {
    const x = /^(?:Rule|Kural)(\d+)$/i.exec(r.id.trim())
    if (x) m = Math.max(m, parseInt(x[1], 10))
  }
  return m
}

/** Yeni kural satırı için bundle içinde çakışmayan bir sonraki KuralNN. */
function nextRuleId(bundle: RuleBundle): string {
  const used = new Set(
    [...bundle.critical, ...bundle.normal].map((r) => r.id),
  )
  let n = maxRuleNum(bundle) + 1
  for (;;) {
    const id = formatRuleNum(n)
    if (!used.has(id)) return id
    n++
  }
}

function moveInTier(
  bundle: RuleBundle,
  tier: Tier,
  index: number,
  delta: -1 | 1,
): RuleBundle {
  const key = tier === 'critical' ? 'critical' : 'normal'
  const list = [...bundle[key]]
  const j = index + delta
  if (j < 0 || j >= list.length) return bundle
  ;[list[index], list[j]] = [list[j], list[index]]
  return { ...bundle, [key]: list }
}

function updateRuleText(
  bundle: RuleBundle,
  tier: Tier,
  id: string,
  text: string,
): RuleBundle {
  const key = tier === 'critical' ? 'critical' : 'normal'
  const list = bundle[key].map((r) => (r.id === id ? { ...r, text } : r))
  return { ...bundle, [key]: list }
}

function updateRuleRequiresMetadata(
  bundle: RuleBundle,
  tier: Tier,
  id: string,
  requires_metadata: boolean,
): RuleBundle {
  const key = tier === 'critical' ? 'critical' : 'normal'
  const list = bundle[key].map((r) =>
    r.id === id ? { ...r, requires_metadata } : r,
  )
  return { ...bundle, [key]: list }
}

function removeRule(bundle: RuleBundle, tier: Tier, id: string): RuleBundle {
  const key = tier === 'critical' ? 'critical' : 'normal'
  return { ...bundle, [key]: bundle[key].filter((r) => r.id !== id) }
}

function addRule(bundle: RuleBundle, tier: Tier): RuleBundle {
  const key = tier === 'critical' ? 'critical' : 'normal'
  const id = nextRuleId(bundle)
  const line: RuleLine = {
    id,
    text: '',
    requires_metadata: false,
  }
  return { ...bundle, [key]: [...bundle[key], line] }
}

function bundlesEqual(a: RuleBundle, b: RuleBundle): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function RulesPage() {
  const [state, setState] = useState<RulesState | null>(null)
  const [draft, setDraft] = useState<RuleBundle>(emptyBundle)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [ruleSearch, setRuleSearch] = useState('')

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const s = await getRules()
      setState(s)
      setDraft({
        critical: s.draft.critical.map((r) => ({
          ...r,
          requires_metadata: r.requires_metadata ?? false,
        })),
        normal: s.draft.normal.map((r) => ({
          ...r,
          requires_metadata: r.requires_metadata ?? false,
        })),
      })
    } catch (e) {
      setError((e as Error).message || 'Kurallar yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const draftDirty = useMemo(() => {
    if (!state) return false
    return !bundlesEqual(draft, state.draft)
  }, [state, draft])

  const onSaveDraft = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const s = await putRulesDraft(draft)
      setState(s)
      setDraft({
        critical: s.draft.critical.map((r) => ({
          ...r,
          requires_metadata: r.requires_metadata ?? false,
        })),
        normal: s.draft.normal.map((r) => ({
          ...r,
          requires_metadata: r.requires_metadata ?? false,
        })),
      })
    } catch (e) {
      setError((e as Error).message || 'Taslak kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }, [draft])

  const onPublish = useCallback(async () => {
    setPublishing(true)
    setError(null)
    try {
      if (draftDirty) {
        await putRulesDraft(draft)
      }
      const s = await postRulesPublish()
      setState(s)
      setDraft({
        critical: s.draft.critical.map((r) => ({
          ...r,
          requires_metadata: r.requires_metadata ?? false,
        })),
        normal: s.draft.normal.map((r) => ({
          ...r,
          requires_metadata: r.requires_metadata ?? false,
        })),
      })
    } catch (e) {
      setError((e as Error).message || 'Yayınlama başarısız')
    } finally {
      setPublishing(false)
    }
  }, [draft, draftDirty])

  const publishedLabel = useMemo(() => {
    if (!state?.published_at) return 'Henüz yayınlanmadı'
    try {
      const d = new Date(state.published_at)
      return `Son yayın: ${d.toLocaleString()}`
    } catch {
      return state.published_at
    }
  }, [state?.published_at])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <header className="shrink-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            {PRODUCT_NAME} — İnceleme kuralları
          </h1>
          <span className="text-[11px] text-zinc-500">{publishedLabel}</span>
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Taslak kayıt; <span className="font-medium text-zinc-600 dark:text-zinc-300">yayınla</span>{' '}
          ile LLM’e uygulanır.
        </p>
        <div className="mt-3 max-w-xl">
          <label htmlFor="rules-search" className="sr-only">
            Kural ara (anahtar veya metin)
          </label>
          <input
            id="rules-search"
            type="search"
            value={ruleSearch}
            onChange={(e) => setRuleSearch(e.target.value)}
            placeholder="Ara: Kural01 veya kural metni…"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-500"
          />
        </div>
      </header>

      {error && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Yükleniyor…</p>
      ) : (
        <>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
            <RuleColumn
              title="Kritik"
              subtitle="HIGH"
              accent="critical"
              rules={draft.critical}
              searchQuery={ruleSearch}
              onChangeText={(id, text) =>
                setDraft((b) => updateRuleText(b, 'critical', id, text))
              }
              onChangeRequiresMetadata={(id, v) =>
                setDraft((b) => updateRuleRequiresMetadata(b, 'critical', id, v))
              }
              onRemove={(id) => setDraft((b) => removeRule(b, 'critical', id))}
              onMove={(index, delta) =>
                setDraft((b) => moveInTier(b, 'critical', index, delta))
              }
              onAdd={() => setDraft((b) => addRule(b, 'critical'))}
            />
            <RuleColumn
              title="Normal"
              subtitle="LOW / MEDIUM"
              accent="normal"
              rules={draft.normal}
              searchQuery={ruleSearch}
              onChangeText={(id, text) =>
                setDraft((b) => updateRuleText(b, 'normal', id, text))
              }
              onChangeRequiresMetadata={(id, v) =>
                setDraft((b) => updateRuleRequiresMetadata(b, 'normal', id, v))
              }
              onRemove={(id) => setDraft((b) => removeRule(b, 'normal', id))}
              onMove={(index, delta) =>
                setDraft((b) => moveInTier(b, 'normal', index, delta))
              }
              onAdd={() => setDraft((b) => addRule(b, 'normal'))}
            />
          </div>

          <footer className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-zinc-300 bg-zinc-100/95 py-2.5 backdrop-blur dark:border-zinc-700 dark:bg-zinc-950/95">
            <button
              type="button"
              onClick={() => void onSaveDraft()}
              disabled={saving || publishing || !draftDirty}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              {saving ? 'Kaydediliyor…' : 'Taslağı kaydet'}
            </button>
            <button
              type="button"
              onClick={() => void onPublish()}
              disabled={saving || publishing}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {publishing ? 'Yayınlanıyor…' : 'Yayınla'}
            </button>
            {draftDirty && (
              <span className="text-[11px] text-amber-700 dark:text-amber-400">Kaydedilmedi</span>
            )}
          </footer>
        </>
      )}
    </div>
  )
}

function previewText(text: string): string {
  const t = text.trim()
  if (!t) return '—'
  if (t.length <= PREVIEW_CHARS) return t
  return `${t.slice(0, PREVIEW_CHARS).trim()}…`
}

function ruleMatchesSearch(rule: RuleLine, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  return (
    rule.id.toLowerCase().includes(s) ||
    (rule.text || '').toLowerCase().includes(s)
  )
}

function RuleColumn({
  title,
  subtitle,
  accent,
  rules,
  searchQuery,
  onChangeText,
  onChangeRequiresMetadata,
  onRemove,
  onMove,
  onAdd,
}: {
  title: string
  subtitle: string
  accent: 'critical' | 'normal'
  rules: RuleLine[]
  searchQuery: string
  onChangeText: (id: string, text: string) => void
  onChangeRequiresMetadata: (id: string, requires_metadata: boolean) => void
  onRemove: (id: string) => void
  onMove: (index: number, delta: -1 | 1) => void
  onAdd: () => void
}) {
  const shell =
    accent === 'critical'
      ? 'border-red-300/90 bg-red-50/50 shadow-sm dark:border-red-900/55 dark:bg-red-950/25 dark:shadow-none'
      : 'border-blue-300/90 bg-blue-50/50 shadow-sm dark:border-blue-900/55 dark:bg-blue-950/25 dark:shadow-none'

  return (
    <section
      className={`flex min-h-0 flex-1 flex-col rounded-lg border ${shell} p-2.5`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            accent === 'critical'
              ? 'bg-red-100/90 text-red-800 dark:bg-red-950/80 dark:text-red-200'
              : 'bg-blue-100/90 text-blue-800 dark:bg-blue-950/80 dark:text-blue-200'
          }`}
        >
          {subtitle}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {rules.length === 0 ? (
          <p className="py-2 text-center text-xs italic text-zinc-500">Boş</p>
        ) : searchQuery.trim() && !rules.some((r) => ruleMatchesSearch(r, searchQuery)) ? (
          <p className="py-2 text-center text-xs text-zinc-500">Bu sütunda eşleşme yok</p>
        ) : (
          rules.map((r, index) => (
            <div
              key={r.id}
              className={ruleMatchesSearch(r, searchQuery) ? '' : 'hidden'}
            >
              <CompactRuleRow
                rule={r}
                index={index}
                total={rules.length}
                searchQuery={searchQuery}
                onChangeText={onChangeText}
                onChangeRequiresMetadata={onChangeRequiresMetadata}
                onRemove={onRemove}
                onMove={onMove}
              />
            </div>
          ))
        )}
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="mt-2 w-full rounded border border-dashed border-zinc-300/90 py-1.5 text-xs text-zinc-600 transition hover:border-zinc-400 hover:bg-white/50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-900/30"
      >
        + Kural
      </button>
    </section>
  )
}

function CompactRuleRow({
  rule,
  index,
  total,
  searchQuery,
  onChangeText,
  onChangeRequiresMetadata,
  onRemove,
  onMove,
}: {
  rule: RuleLine
  index: number
  total: number
  searchQuery: string
  onChangeText: (id: string, text: string) => void
  onChangeRequiresMetadata: (id: string, requires_metadata: boolean) => void
  onRemove: (id: string) => void
  onMove: (index: number, delta: -1 | 1) => void
}) {
  const [open, setOpen] = useState(false)
  const showSearchId = Boolean(searchQuery.trim())

  return (
    <div className="rounded border border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-900/80">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-start gap-1.5 px-2 py-1.5 text-left transition hover:bg-zinc-100/90 dark:hover:bg-zinc-800/60"
        >
          <span className="w-5 shrink-0 pt-0.5 text-[10px] font-medium tabular-nums text-zinc-400">
            {index + 1}
          </span>
          <span className="min-w-0 flex-1">
            {showSearchId ? (
              <span
                className="mb-0.5 block truncate font-mono text-[10px] leading-tight text-zinc-500 dark:text-zinc-400"
                title={rule.id}
              >
                {rule.id}
              </span>
            ) : null}
            <span className="block text-xs leading-snug text-zinc-700 dark:text-zinc-300">
              {previewText(rule.text)}
            </span>
          </span>
        </button>
      ) : (
        <div className="p-2">
          <div className="mb-1.5 flex items-center justify-between gap-1">
            <span className="truncate text-[10px] text-zinc-400" title={rule.id}>
              {rule.id}
            </span>
            <div className="flex shrink-0 gap-0.5">
              <button
                type="button"
                aria-label="Yukarı"
                onClick={() => onMove(index, -1)}
                disabled={index === 0}
                className="rounded px-1 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-100 disabled:opacity-25 dark:hover:bg-zinc-800"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Aşağı"
                onClick={() => onMove(index, 1)}
                disabled={index === total - 1}
                className="rounded px-1 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-100 disabled:opacity-25 dark:hover:bg-zinc-800"
              >
                ↓
              </button>
              <button
                type="button"
                aria-label="Sil"
                onClick={() => onRemove(rule.id)}
                className="rounded px-1 py-0.5 text-[11px] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                ×
              </button>
              <button
                type="button"
                aria-label="Daralt"
                onClick={() => setOpen(false)}
                className="rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                ▲
              </button>
            </div>
          </div>
          <label className="mb-2 flex cursor-pointer items-start gap-2 text-[11px] text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-zinc-300 text-zinc-800 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-900"
              checked={rule.requires_metadata ?? false}
              onChange={(e) =>
                onChangeRequiresMetadata(rule.id, e.target.checked)
              }
            />
            <span>
              DB nesne incelemesinde katalog metadatası ekle (bağımlılık + kolonlar; yalnızca sunucudan
              nesne çekilirken)
            </span>
          </label>
          <textarea
            value={rule.text}
            onChange={(e) => onChangeText(rule.id, e.target.value)}
            rows={4}
            className="w-full resize-y rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs leading-snug text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-500"
            placeholder="Kural…"
          />
        </div>
      )}
    </div>
  )
}
