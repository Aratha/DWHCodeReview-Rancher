import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { AccordionSection } from './AccordionSection'
import { ruleCheckKey, violationKey } from './ReviewResults'
import { downloadReviewResultsCsv } from './ExportMenu'
import { PRODUCT_NAME } from '../brand'
import { useReviewAnalysis } from '../contexts/ReviewAnalysisContext'
import type { ObjectReviewResult, Violation } from '../services/api'
import {
  formatRuleTokenLine,
  ruleCheckIsPass,
  type LiveObjectProgress,
  type LiveRuleProgress,
} from '../reviewProgress'

function checkStatusBadgeClass(status: string): string {
  const u = status.toUpperCase()
  if (u === 'PASS' || u === 'NOT_APPLICABLE') {
    return 'bg-emerald-600 text-white shadow-sm dark:bg-emerald-500'
  }
  if (u === 'FAIL') {
    return 'bg-rose-600 text-white shadow-sm dark:bg-rose-500'
  }
  if (u === 'UNKNOWN') {
    return 'bg-amber-500 text-white shadow-sm dark:bg-amber-600'
  }
  return 'bg-zinc-600 text-white shadow-sm dark:bg-zinc-500'
}

/**
 * Kural önem rozetleri — PASS (yeşil) ile karışmaması için LOW emerald değil;
 * risk sırası: kritik → yüksek → orta → düşük → bilgi.
 */
function severityBadgeClass(sev: string): string {
  const u = sev.toUpperCase()
  if (u === 'CRITICAL') {
    return 'bg-red-700 text-white shadow-sm dark:bg-red-600'
  }
  if (u === 'HIGH') {
    return 'bg-rose-600 text-white shadow-sm dark:bg-rose-500'
  }
  if (u === 'MEDIUM') {
    return 'bg-amber-500 text-white shadow-sm dark:bg-amber-600'
  }
  if (u === 'LOW') {
    return 'bg-indigo-600 text-white shadow-sm dark:bg-indigo-500'
  }
  if (u === 'INFO' || u === 'INFORMATIONAL') {
    return 'bg-sky-600 text-white shadow-sm dark:bg-sky-500'
  }
  return 'bg-zinc-600 text-white shadow-sm dark:bg-zinc-500'
}

function ruleCardTone(r: LiveRuleProgress): string {
  if (r.status === 'running') {
    return 'border-zinc-300 bg-zinc-50/90 dark:border-zinc-600 dark:bg-zinc-900/40'
  }
  if (r.checkStatus) {
    if (ruleCheckIsPass(r.checkStatus)) {
      return 'border-emerald-200/90 bg-emerald-50/60 dark:border-emerald-800/50 dark:bg-emerald-950/25'
    }
    if (r.checkStatus.toUpperCase() === 'UNKNOWN') {
      return 'border-amber-200/90 bg-amber-50/50 dark:border-amber-800/40 dark:bg-amber-950/20'
    }
    return 'border-rose-200/90 bg-rose-50/60 dark:border-rose-800/50 dark:bg-rose-950/25'
  }
  return 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950/80'
}

function ruleHeaderHint(r: LiveRuleProgress): string {
  const n = r.violations?.length ?? 0
  if (n > 0) return `${n} ihlal`
  return ''
}

/** CSV/sonuç modalı `violationKey` ile nesnenin tüm ihlal listesindeki indeksi kullanır; canlı panel kurala göre dilimler. */
function globalViolationIndexForRule(
  all: Violation[] | undefined,
  ruleId: string,
  localIndex: number,
): number {
  if (!all?.length) return localIndex
  let seen = 0
  for (let gi = 0; gi < all.length; gi++) {
    if (all[gi].rule_id !== ruleId) continue
    if (seen === localIndex) return gi
    seen++
  }
  return localIndex
}

function matchApiViolations(
  results: ObjectReviewResult[],
  o: LiveObjectProgress,
  fallbackDatabase?: string,
): Violation[] | undefined {
  if (results.length === 0) return undefined
  const cat = (o.catalogDatabase || fallbackDatabase || '').trim()
  const match =
    results.find(
      (res) =>
        res.schema === o.schema &&
        res.name === o.name &&
        (res.database ?? '').trim() === cat,
    ) ??
    results.find(
      (res) => res.schema === o.schema && res.name === o.name,
    )
  return match?.violations
}

function ViolationBlock({
  v,
  index,
  titleRight,
}: {
  v: Violation
  index: number
  /** Başlık satırında (İhlal N) sağa — örn. yanlış pozitif kutusu */
  titleRight?: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-rose-200/95 bg-white shadow-md shadow-rose-900/10 ring-1 ring-rose-100/80 dark:border-rose-800/55 dark:bg-rose-950/30 dark:shadow-black/40 dark:ring-rose-900/40">
      <div className="flex min-w-0 gap-0">
        <div
          className="w-1 shrink-0 bg-gradient-to-b from-rose-500 to-rose-600 dark:from-rose-400 dark:to-rose-500"
          aria-hidden
        />
        <div className="min-w-0 flex-1 px-3 py-2.5 text-xs">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-rose-100/90 pb-1.5 font-bold uppercase tracking-wide text-rose-950 dark:border-rose-800/60 dark:text-rose-100">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span>İhlal {index + 1}</span>
              {v.severity ? (
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase shadow-sm ${severityBadgeClass(v.severity)}`}
                >
                  {v.severity}
                </span>
              ) : null}
            </div>
            {titleRight ? (
              <div className="ml-auto shrink-0 normal-case">{titleRight}</div>
            ) : null}
          </div>
          {v.description ? (
            <p className="leading-relaxed text-zinc-900 dark:text-zinc-100">{v.description}</p>
          ) : null}
          {v.line_reference ? (
            <p className="mt-1 font-mono text-[11px] text-rose-800/90 dark:text-rose-200/90">
              Konum: {v.line_reference}
            </p>
          ) : null}
          {v.code_snippet ? (
            <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-rose-200/80 bg-rose-50/80 p-2 font-mono text-[11px] leading-snug text-zinc-900 dark:border-rose-800/70 dark:bg-zinc-950 dark:text-zinc-200">
              {v.code_snippet}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function objectItemKey(o: LiveObjectProgress): string {
  return `${o.label}|${o.schema ?? ''}|${o.name ?? ''}`
}

function statusLabelFor(o: LiveObjectProgress): string {
  switch (o.status) {
    case 'fetch':
      return 'Tanım okunuyor'
    case 'metadata':
      return 'Metadata'
    case 'rules':
      return 'İnceleniyor'
    case 'done':
      return 'Tamamlandı'
    case 'error':
      return 'Hata'
    default:
      return 'Bekliyor'
  }
}

/** Nesne akordeonu: tek standart (nötr) çerçeve; statüye göre renk yok. */
function liveObjectPanelClasses(o: LiveObjectProgress): {
  outer: string
  button: string
} {
  const hot = o.activeRuleIds.length > 0
  const pulse =
    hot && o.status === 'rules'
      ? ' motion-safe:animate-[livePulse_2.2s_ease-in-out_infinite]'
      : ''

  return {
    outer: `!border !border-zinc-200 !bg-white transition duration-200 hover:!border-zinc-300 hover:shadow-sm dark:!border-zinc-600 dark:!bg-zinc-950/80 dark:hover:!border-zinc-500${pulse}`,
    button:
      'cursor-pointer hover:bg-zinc-50 active:scale-[0.995] dark:hover:bg-zinc-800/80',
  }
}

function RuleAccordionRow({
  r,
  rid,
  rowKey,
  open,
  onToggle,
  schema,
  name,
  catalogDatabase,
  falsePositives,
  onFalsePositiveChange,
  apiViolations,
}: {
  r: LiveRuleProgress
  rid: string
  rowKey: string
  open: boolean
  onToggle: () => void
  schema: string
  name: string
  catalogDatabase: string
  falsePositives: Record<string, boolean>
  onFalsePositiveChange: (key: string, value: boolean) => void
  /** API `violations` dizisi; ihlal FP anahtarı global indeks ile üretilir */
  apiViolations?: Violation[]
}) {
  const running = r.status === 'running'
  const hasCheck = Boolean(r.checkStatus)
  const hint = ruleHeaderHint(r)
  const vios = r.violations ?? []
  const db = catalogDatabase.trim()
  const ruleFpKey = ruleCheckKey(schema, name, rid, db || undefined)
  const ruleFp = falsePositives[ruleFpKey] === true
  const isFail = (r.checkStatus || '').toUpperCase() === 'FAIL'
  const panelId = `rp-${rowKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 88)}`
  const hasLlmBlock =
    hasCheck &&
    Boolean(
      r.description ||
        r.lineReference ||
        r.codeSnippet ||
        r.decisionBasis ||
        r.severity,
    )
  /** İhlal satırları varken üstteki kural özeti (FAIL + açıklama) gösterilmez; yalnızca ihlal detayları. */
  const showLlmSummary = hasLlmBlock && vios.length === 0

  return (
    <li
      className={`min-w-0 overflow-hidden rounded-lg border shadow-sm ${ruleCardTone(r)}${
        ruleFp ? ' opacity-75' : ''
      }`}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="flex min-w-0 flex-1 items-center gap-1.5 font-mono text-xs font-medium text-zinc-900 dark:text-zinc-100">
              {running ? (
                <span
                  className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-500 dark:bg-sky-400"
                  aria-hidden
                />
              ) : null}
              <span className="min-w-0 truncate">
                {rid}
                {hint ? (
                  <span className="font-normal text-zinc-500 dark:text-zinc-400">
                    {' '}
                    · {hint}
                  </span>
                ) : null}
              </span>
              {r.tier ? (
                <span className="shrink-0 rounded-md border border-zinc-300 bg-zinc-100 px-1 py-px text-xs font-semibold text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
                  {r.tier}
                </span>
              ) : null}
            </span>
            <span
              className={`shrink-0 font-mono text-xs font-semibold tabular-nums ${
                running
                  ? 'text-sky-800 dark:text-sky-300'
                  : 'text-zinc-700 dark:text-zinc-300'
              }`}
            >
              {formatRuleTokenLine(r)}
            </span>
          </div>
        </div>
        <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-500" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? (
        <div
          id={panelId}
          role="region"
          className="border-t border-zinc-300/80 px-2 pb-2 pt-1.5 text-xs dark:border-zinc-600/80"
        >
          {running ? (
            <p className="font-medium text-zinc-600 dark:text-zinc-400">
              Yanıt üretiliyor (token sayısı / tahmin)
            </p>
          ) : null}
          {showLlmSummary ? (
            <div className="mb-2 space-y-1 rounded-md border border-zinc-200/90 bg-white/80 px-2 py-1.5 dark:border-zinc-600 dark:bg-zinc-900/80">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1">
                  {r.checkStatus ? (
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide ${checkStatusBadgeClass(r.checkStatus)}`}
                    >
                      {r.checkStatus}
                    </span>
                  ) : null}
                  {r.severity ? (
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide ${severityBadgeClass(r.severity)}`}
                    >
                      {r.severity}
                    </span>
                  ) : null}
                </div>
                {isFail ? (
                  <label
                    className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[10px] text-zinc-600 dark:text-zinc-400"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={ruleFp}
                      onChange={(e) =>
                        onFalsePositiveChange(ruleFpKey, e.target.checked)
                      }
                    />
                    Yanlış pozitif
                  </label>
                ) : null}
              </div>
              {r.description ? (
                <p className="leading-snug text-zinc-800 dark:text-zinc-200">{r.description}</p>
              ) : null}
              {r.decisionBasis ? (
                <p className="leading-snug text-zinc-600 dark:text-zinc-400">{r.decisionBasis}</p>
              ) : null}
              {r.lineReference ? (
                <p className="font-mono text-zinc-500 dark:text-zinc-500">Konum: {r.lineReference}</p>
              ) : null}
              {r.codeSnippet ? (
                <pre className="max-h-48 overflow-auto rounded border border-zinc-300/90 bg-zinc-100/90 p-1.5 font-mono text-xs leading-tight text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                  {r.codeSnippet}
                </pre>
              ) : null}
            </div>
          ) : null}
          {vios.length > 0 ? (
            <div className="space-y-2.5">
              {vios.map((v, i) => {
                const gi = globalViolationIndexForRule(apiViolations, rid, i)
                const vk = violationKey(schema, name, gi, db || undefined)
                const vfp = falsePositives[vk] === true
                return (
                  <div
                    key={`${rowKey}-vio-${i}`}
                    className={vfp ? 'opacity-75' : undefined}
                  >
                    <ViolationBlock
                      v={v}
                      index={i}
                      titleRight={
                        <label
                          className="flex cursor-pointer items-center gap-1.5 text-[10px] font-normal text-zinc-600 dark:text-zinc-400"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={vfp}
                            onChange={(e) =>
                              onFalsePositiveChange(vk, e.target.checked)
                            }
                          />
                          Yanlış pozitif
                        </label>
                      }
                    />
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

function ObjectAccordion({
  o,
  open,
  onToggle,
  defaultExpandAllRules,
  fallbackDatabase,
  falsePositives,
  onFalsePositiveChange,
  apiViolations,
}: {
  o: LiveObjectProgress
  open: boolean
  onToggle: () => void
  /** İlk sıradaki nesne: kural satırları eklendikçe yeni akordeonlar da açık başlar; kullanıcı kapattıysa tekrar zorlanmaz. */
  defaultExpandAllRules?: boolean
  /** catalogDatabase boşsa (tek DB istekleri) istekteki varsayılan catalog */
  fallbackDatabase?: string
  falsePositives: Record<string, boolean>
  onFalsePositiveChange: (key: string, value: boolean) => void
  /** Tamamlanan API yanıtındaki ihlal listesi (global indeks için) */
  apiViolations?: Violation[]
}) {
  const [ruleOpenById, setRuleOpenById] = useState<Record<string, boolean>>({})

  const st = statusLabelFor(o)
  const catalog = (o.catalogDatabase || fallbackDatabase || '').trim()
  const title =
    catalog && o.schema && o.name
      ? `${catalog} · ${o.schema} · ${o.name}`
      : o.schema && o.name
        ? `${o.schema} · ${o.name}`
        : o.label
  const subtitleParts = [o.typeCode, st].filter(Boolean)
  const subtitle = subtitleParts.join(' · ')

  const safeId = `live-obj-${objectItemKey(o).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96)}`
  const panel = liveObjectPanelClasses(o)

  const ruleIds =
    o.ruleOrder.length > 0
      ? o.ruleOrder
      : Object.keys(o.rulesById).sort()

  const ruleIdsKey = ruleIds.join('\0')

  const objKey = objectItemKey(o)

  useEffect(() => {
    if (!defaultExpandAllRules || ruleIds.length === 0) return
    setRuleOpenById((prev) => {
      const next = { ...prev }
      let changed = false
      for (const rid of ruleIds) {
        const rowKey = `${objKey}|${rid}`
        if (next[rowKey] === undefined) {
          next[rowKey] = true
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [defaultExpandAllRules, objKey, ruleIdsKey])

  return (
    <AccordionSection
      id={safeId}
      title={title}
      subtitle={subtitle}
      open={open}
      onToggle={onToggle}
      headingSize="compact"
      className={`[&_button]:focus-visible:outline [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-offset-2 [&_button]:focus-visible:outline-zinc-500 dark:[&_button]:focus-visible:outline-zinc-400 ${panel.outer}`}
      buttonClassName={panel.button}
    >
      <div className="space-y-3 px-3 py-3 text-xs leading-normal">
        {ruleIds.length === 0 ? (
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {o.rulesTotal > 0
              ? 'Kurallar kuyruğa alınıyor…'
              : 'Henüz kural yok'}
          </p>
        ) : (
          <ul className="grid grid-cols-2 items-start gap-2">
            {ruleIds.map((rid) => {
              const r = o.rulesById[rid]
              if (!r) return null
              const rowKey = `${objectItemKey(o)}|${rid}`
              const ruleOpen = Boolean(ruleOpenById[rowKey])
              return (
                <RuleAccordionRow
                  key={rid}
                  r={r}
                  rid={rid}
                  rowKey={rowKey}
                  open={ruleOpen}
                  onToggle={() =>
                    setRuleOpenById((prev) => ({
                      ...prev,
                      [rowKey]: !prev[rowKey],
                    }))
                  }
                  schema={o.schema ?? ''}
                  name={o.name ?? ''}
                  catalogDatabase={catalog}
                  falsePositives={falsePositives}
                  onFalsePositiveChange={onFalsePositiveChange}
                  apiViolations={apiViolations}
                />
              )
            })}
          </ul>
        )}

        {o.parseWarning ? (
          <p className="break-words rounded-md border border-amber-200/90 bg-amber-50/80 px-2 py-1.5 text-xs font-medium text-amber-950/90 dark:border-amber-800/50 dark:bg-amber-950/20 dark:text-amber-100/95">
            {o.parseWarning}
          </p>
        ) : null}

        {o.detail ? (
          <p className="break-words rounded-md border border-red-200 bg-red-50/80 px-2 py-1.5 text-xs font-medium text-red-900 dark:border-red-900/45 dark:bg-red-950/25 dark:text-red-200">
            {o.detail}
          </p>
        ) : null}
      </div>
    </AccordionSection>
  )
}

/** Canlı takip içeriği (popup içinde kullanılır). */
export function GlobalReviewProgress() {
  const {
    reviewing,
    activeReviewSummary,
    liveProgress,
    reviewError,
    cancelReview,
    hasReviewOutput,
    results,
    falsePositives,
    onFalsePositiveChange,
    dismissLiveTracking,
  } = useReviewAnalysis()

  const objectList = useMemo(() => {
    if (!liveProgress) return []
    return Object.keys(liveProgress.byObject).map(
      (key) => liveProgress.byObject[key],
    )
  }, [liveProgress])

  const firstObjectKey = useMemo(
    () => (objectList.length > 0 ? objectItemKey(objectList[0]) : null),
    [objectList],
  )

  const [openByKey, setOpenByKey] = useState<Record<string, boolean>>({})

  const showStreamError =
    reviewError &&
    reviewError !== 'İnceleme durduruldu.' &&
    !reviewing

  const completedFooterLine =
    reviewError === 'İnceleme durduruldu.'
      ? 'İnceleme durduruldu.'
      : reviewError
        ? 'İnceleme hata ile sona erdi; ayrıntılar yukarıda.'
        : 'İnceleme tamamlandı.'

  const exportCsv = () => {
    const database =
      liveProgress?.database ??
      (activeReviewSummary?.kind === 'db' ? activeReviewSummary.database : '')
    downloadReviewResultsCsv(results, falsePositives, {
      reviewError: results.length === 0 ? reviewError : undefined,
      database,
    })
  }

  return (
    <div
      className="flex h-[min(88vh,1200px)] max-h-[96vh] min-h-0 flex-col gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-3 font-sans text-xs text-zinc-800 antialiased shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
      role="status"
      aria-live="polite"
      aria-busy={reviewing}
    >
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-700">
        <div>
          <div className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            {PRODUCT_NAME} — canlı inceleme
          </div>
          {activeReviewSummary?.kind === 'script' ? (
            <p className="mt-0.5 font-mono font-medium text-zinc-600 dark:text-zinc-400">
              Betik: {activeReviewSummary.label}
            </p>
          ) : activeReviewSummary?.kind === 'db' ? (
            <p className="mt-0.5 font-mono font-medium text-zinc-600 dark:text-zinc-400">
              DB: {activeReviewSummary.database}
            </p>
          ) : (
            <p className="mt-0.5 font-medium text-zinc-500 dark:text-zinc-500">
              İstek gönderiliyor…
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {reviewing ? (
            <button
              type="button"
              onClick={() => cancelReview()}
              className="shrink-0 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-900 shadow-sm hover:bg-red-100 dark:border-red-800/70 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
            >
              Analizi durdur
            </button>
          ) : null}
        </div>
      </div>

      {showStreamError ? (
        <p
          className="shrink-0 rounded-md border border-red-200 bg-red-50/90 px-2 py-1.5 font-medium text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
          role="alert"
        >
          {reviewError}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {objectList.length === 0 ? (
            <p className="font-medium text-zinc-600 dark:text-zinc-400">
              Nesne kuyruğu hazırlanıyor…
            </p>
          ) : (
            objectList.map((o) => {
              const k = objectItemKey(o)
              const apiViolations = matchApiViolations(
                results,
                o,
                liveProgress?.mode === 'db'
                  ? liveProgress.database
                  : undefined,
              )
              return (
                <ObjectAccordion
                  key={k}
                  o={o}
                  open={openByKey[k] ?? true}
                  defaultExpandAllRules={
                    firstObjectKey !== null && k === firstObjectKey
                  }
                  fallbackDatabase={
                    liveProgress?.mode === 'db' ? liveProgress.database : ''
                  }
                  falsePositives={falsePositives}
                  onFalsePositiveChange={onFalsePositiveChange}
                  apiViolations={apiViolations}
                  onToggle={() =>
                    setOpenByKey((prev) => {
                      const currentOpen = prev[k] ?? true
                      return { ...prev, [k]: !currentOpen }
                    })
                  }
                />
              )
            })
          )}
        </div>
      </div>

      {!reviewing ? (
        <div
          className="flex shrink-0 flex-col gap-2.5 border-t border-zinc-200 pt-3 dark:border-zinc-700"
          role="group"
          aria-label="İnceleme sonrası işlemler"
        >
          <p className="font-medium leading-snug text-zinc-700 dark:text-zinc-300">
            {completedFooterLine}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {hasReviewOutput ? (
              <button
                type="button"
                onClick={exportCsv}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:focus-visible:outline-zinc-400"
              >
                CSV indir
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => dismissLiveTracking()}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:focus-visible:outline-zinc-500"
            >
              Kapat
            </button>
          </div>
        </div>
      ) : null}

      {reviewing ? (
        <>
          <div className="h-1 w-full shrink-0 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div className="h-full w-1/3 animate-[shimmer_1.2s_ease-in-out_infinite] rounded-full bg-zinc-500 dark:bg-zinc-400" />
          </div>
          <style>{`
            @keyframes shimmer {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(400%); }
            }
          `}</style>
        </>
      ) : null}
    </div>
  )
}
