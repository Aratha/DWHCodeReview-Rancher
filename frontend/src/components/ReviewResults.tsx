import { useId, useMemo, useState } from 'react'

import type { ObjectReviewResult, RuleCheck, Violation } from '../services/api'



export function violationKey(
  schema: string,
  name: string,
  index: number,
  database?: string,
): string {
  const d = (database ?? '').trim()
  const s = (schema ?? '').trim()
  const n = (name ?? '').trim()
  return `${d}|${s}|${n}|${index}`
}

export function ruleCheckKey(
  schema: string,
  name: string,
  ruleId: string,
  database?: string,
): string {
  const d = (database ?? '').trim()
  const s = (schema ?? '').trim()
  const n = (name ?? '').trim()
  const r = (ruleId ?? '').trim()
  return `${d}|${s}|${n}|rc|${r}`
}

/**
 * CSV / dışa aktarım ile canlı ekrandaki FP anahtarlarını hizalar.
 * `r.database` doluysa onu kullanır; boşsa yalnızca tek-catalog isteklerinde
 * `csvOptions.database` yedeğini dener (çoklu DB özet metnini anahtara katmaz).
 */
export function fpDatabaseForRow(
  r: Pick<ObjectReviewResult, 'database'>,
  csvOptions?: { database?: string },
): string {
  const row = (r.database ?? '').trim()
  if (row) return row
  const opt = (csvOptions?.database ?? '').trim()
  if (opt && !/veritabanı/i.test(opt)) return opt
  return ''
}



function severityClass(sev: string) {

  const u = sev.toUpperCase()

  if (u === 'HIGH')

    return 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'

  if (u === 'MEDIUM')

    return 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'

  return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200'

}



function statusClass(st: string) {

  const u = st.toUpperCase()

  if (u === 'PASS')

    return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'

  if (u === 'FAIL')

    return 'bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200'

  if (u === 'NOT_APPLICABLE')

    return 'bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200'

  return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300'

}

function CodeSnippetBlock({ snippet }: { snippet: string }) {
  const lines = snippet.replace(/\r\n/g, '\n').split('\n')
  const gutterW = Math.max(2, String(lines.length).length)
  return (
    <div className="mt-2 overflow-x-auto rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/80">
      <div className="min-w-0 divide-y divide-zinc-200/80 font-mono text-[11px] leading-relaxed dark:divide-zinc-700/80 sm:text-xs">
        {lines.map((line, i) => (
          <div key={i} className="flex gap-2 px-2 py-0.5">
            <span
              className="shrink-0 select-none text-right tabular-nums text-zinc-400 dark:text-zinc-500"
              style={{ width: `${gutterW + 1}ch` }}
            >
              {i + 1}
            </span>
            <span className="min-w-0 whitespace-pre text-zinc-800 dark:text-zinc-200">
              {line || ' '}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LineReferenceRow({ text }: { text: string }) {
  return (
    <div className="mt-2 flex flex-wrap items-baseline gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Konum
      </span>
      <span className="rounded-md border border-emerald-200/90 bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-950 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100">
        {text}
      </span>
    </div>
  )
}

type Props = {

  results: ObjectReviewResult[]

  falsePositives: Record<string, boolean>

  onFalsePositiveChange: (key: string, value: boolean) => void

  /** Akordiyon başlığı dışarıdaysa false yapın */
  showHeading?: boolean

}



type IndexedRuleCheck = { check: RuleCheck; originalIndex: number }



export function ReviewResults({

  results,

  falsePositives,

  onFalsePositiveChange,

  showHeading = true,

}: Props) {

  const filterId = useId()

  const [severity, setSeverity] = useState<string>('ALL')

  const [status, setStatus] = useState<string>('ALL')

  const [search, setSearch] = useState('')



  const filteredByMeta = useMemo(() => {

    const q = search.trim().toLowerCase()

    return results.map((r) => {

      const checks = r.rule_checks ?? []

      const list: IndexedRuleCheck[] = checks.map((check, originalIndex) => ({

        check,

        originalIndex,

      }))

      const filteredChecks = list.filter(({ check: c }) => {

        const st = (c.status || '').toUpperCase()

        if (status !== 'ALL' && st !== status) return false

        if (

          st === 'FAIL' &&

          severity !== 'ALL' &&

          (c.severity || '').toUpperCase() !== severity

        )

          return false

        if (!q) return true

        const blob = `${c.rule_id} ${c.tier} ${c.status} ${c.severity} ${c.decision_basis ?? ''} ${c.description} ${c.code_snippet} ${c.line_reference}`.toLowerCase()

        return blob.includes(q)

      })

      return { ...r, indexedChecks: filteredChecks, allChecks: checks }

    })

  }, [results, severity, status, search])



  if (results.length === 0) return null

  const hasActiveFilters =
    status !== 'ALL' || severity !== 'ALL' || search.trim() !== ''

  const inputBase =
    'w-full rounded-md border border-zinc-300 bg-white py-1.5 text-xs text-zinc-900 shadow-sm transition placeholder:text-zinc-400 focus:border-emerald-600/80 focus:outline-none focus:ring-1 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-emerald-500/70 dark:focus:ring-emerald-500/20'

  return (

    <section className="space-y-4">

      <div
        className={
          showHeading
            ? 'flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4'
            : 'w-full'
        }
      >

        {showHeading ? (

          <h2 className="shrink-0 text-lg font-semibold text-zinc-900 dark:text-zinc-100">

            İnceleme sonuçları

          </h2>

        ) : null}

        <div
          className={
            showHeading
              ? 'w-full min-w-0 lg:max-w-2xl lg:flex-1'
              : 'w-full min-w-0'
          }
        >

          <fieldset className="rounded-lg border border-zinc-200/90 bg-zinc-50/80 p-2 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/50">

            <legend className="sr-only">Sonuçları filtrele</legend>

            <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5 border-b border-zinc-200/70 pb-2 dark:border-zinc-700/70">

              <div className="flex items-center gap-1.5">

                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                  aria-hidden
                >

                  <svg
                    className="h-3 w-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.75}
                    stroke="currentColor"
                  >

                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 7h15M7 12h10M9.5 17h5"
                    />

                  </svg>

                </span>

                <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">

                  Filtreler

                </span>

              </div>

              {hasActiveFilters ? (

                <button

                  type="button"

                  className="rounded px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/50"

                  onClick={() => {

                    setStatus('ALL')

                    setSeverity('ALL')

                    setSearch('')

                  }}

                >

                  Sıfırla

                </button>

              ) : null}

            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(7rem,8.5rem)_minmax(7rem,8.5rem)] lg:items-end">

              <div className="sm:col-span-2 lg:col-span-1">

                <label

                  htmlFor={`${filterId}-search`}

                  className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400"

                >

                  Metin ara

                </label>

                <div className="relative">

                  <span

                    className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"

                    aria-hidden

                  >

                    <svg
                      className="h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >

                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m21 21-4.35-4.35M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z"
                      />

                    </svg>

                  </span>

                  <input

                    id={`${filterId}-search`}

                    type="search"

                    value={search}

                    onChange={(e) => setSearch(e.target.value)}

                    placeholder="Kural id, açıklama, kod…"

                    className={`${inputBase} pl-7 pr-2`}

                    autoComplete="off"

                  />

                </div>

              </div>

              <div>

                <label

                  htmlFor={`${filterId}-status`}

                  className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400"

                >

                  Kural durumu

                </label>

                <select

                  id={`${filterId}-status`}

                  value={status}

                  onChange={(e) => setStatus(e.target.value)}

                  className={`${inputBase} cursor-pointer px-2 pr-7`}

                >

                  <option value="ALL">Tüm durumlar</option>

                  <option value="PASS">PASS</option>

                  <option value="FAIL">FAIL</option>

                  <option value="NOT_APPLICABLE">NOT_APPLICABLE</option>

                  <option value="UNKNOWN">BELİRSİZ</option>

                </select>

              </div>

              <div>

                <label

                  htmlFor={`${filterId}-severity`}

                  className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400"

                >

                  Önem (FAIL)

                </label>

                <select

                  id={`${filterId}-severity`}

                  value={severity}

                  onChange={(e) => setSeverity(e.target.value)}

                  className={`${inputBase} cursor-pointer px-2 pr-7`}

                >

                  <option value="ALL">Tüm önemler</option>

                  <option value="LOW">Düşük</option>

                  <option value="MEDIUM">Orta</option>

                  <option value="HIGH">Yüksek</option>

                </select>

              </div>

            </div>

          </fieldset>

        </div>

      </div>



      <div className="space-y-3">

        {filteredByMeta.map((r) => (

          <ObjectBlock

            key={`${r.database ?? ''}|${r.schema}.${r.name}`}

            database={r.database}

            schema={r.schema}

            name={r.name}

            objectType={r.object_type}

            error={r.error}

            parseWarning={r.parse_warning}

            indexedChecks={r.indexedChecks}

            allChecks={r.allChecks}

            violations={r.violations ?? []}

            falsePositives={falsePositives}

            onFalsePositiveChange={onFalsePositiveChange}

          />

        ))}

      </div>

    </section>

  )

}



function ObjectBlock({

  database,

  schema,

  name,

  objectType,

  error,

  parseWarning,

  indexedChecks,

  allChecks,

  violations,

  falsePositives,

  onFalsePositiveChange,

}: {

  database?: string

  schema: string

  name: string

  objectType: string

  error?: string | null

  parseWarning?: string | null

  indexedChecks: IndexedRuleCheck[]

  allChecks: RuleCheck[]

  violations: Violation[]

  falsePositives: Record<string, boolean>

  onFalsePositiveChange: (key: string, value: boolean) => void

}) {

  const [open, setOpen] = useState(true)

  const hasChecks = allChecks.length > 0

  const legacyOnly = !hasChecks && (violations?.length ?? 0) > 0



  const summary = useMemo(() => {

    const all = allChecks

    const pass = all.filter((c) => c.status?.toUpperCase() === 'PASS').length

    const fail = all.filter((c) => c.status?.toUpperCase() === 'FAIL').length

    const na = all.filter((c) => c.status?.toUpperCase() === 'NOT_APPLICABLE').length

    const unk = all.filter((c) => {

      const s = c.status?.toUpperCase()

      return s !== 'PASS' && s !== 'FAIL' && s !== 'NOT_APPLICABLE'

    }).length

    return { pass, fail, na, unk, total: all.length }

  }, [allChecks])



  return (

    <div className="overflow-hidden rounded-xl border border-zinc-300 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-none">

      <button

        type="button"

        onClick={() => setOpen(!open)}

        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-zinc-900 hover:bg-zinc-100/90 dark:text-zinc-100 dark:hover:bg-zinc-800/90"

      >

        <span>

          {database ? (

            <span className="mr-2 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">

              {database}

            </span>

          ) : null}

          <span className="font-mono text-xs text-zinc-500">{schema}.</span>

          {name}

          <span className="ml-2 text-xs font-normal text-zinc-500">

            {objectType}

          </span>

        </span>

        <span className="shrink-0 text-xs text-zinc-500">

          {error

            ? 'Hata'

            : hasChecks

              ? `${summary.pass} PASS · ${summary.fail} FAIL${summary.na ? ` · ${summary.na} N/A` : ''}${summary.unk ? ` · ${summary.unk} belirsiz` : ''}`

              : legacyOnly

                ? `${violations.length} sorun`

                : '0 kural'}

          {' '}

          {open ? '▾' : '▸'}

        </span>

      </button>

      {open && (

        <div className="border-t border-zinc-200/90 px-4 py-3 dark:border-zinc-700/80">

          {error && (

            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">

              {error}

            </p>

          )}

          {parseWarning && !error && (

            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">

              {parseWarning}

            </p>

          )}



          {hasChecks && (

            <>

              <p className="mb-2 text-xs text-zinc-500">

                Tüm yayınlanmış kurallar ({summary.total}): PASS / FAIL / NOT_APPLICABLE / BELİRSİZ.

              </p>

              {!error && indexedChecks.length === 0 && (

                <p className="text-sm text-zinc-500">

                  Bu filtreyle eşleşen satır yok.

                </p>

              )}

              <ul className="space-y-2">

                {indexedChecks.map(({ check: c }) => {

                  const st = (c.status || '').toUpperCase()

                  const isFail = st === 'FAIL'

                  const rk = ruleCheckKey(schema, name, c.rule_id, database)

                  const fp = falsePositives[rk] === true

                  return (

                    <li

                      key={rk}

                      className={`rounded-lg border px-3 py-2.5 dark:border-zinc-600 ${

                        fp

                          ? 'border-zinc-300 bg-zinc-100/90 opacity-75 dark:border-zinc-600 dark:bg-zinc-800/55'

                          : 'border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-950/50'

                      }`}

                    >

                      <div className="flex flex-wrap items-center gap-2">

                        <span

                          className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${statusClass(c.status)}`}

                        >

                          {c.status || '—'}

                        </span>

                        {c.tier && (

                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">

                            {c.tier}

                          </span>

                        )}

                        {isFail && c.severity && (

                          <span

                            className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${severityClass(c.severity)}`}

                          >

                            {c.severity}

                          </span>

                        )}

                        <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">

                          {c.rule_id}

                        </span>

                        {c.decision_basis && (

                          <span className="rounded bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">

                            {c.decision_basis}

                          </span>

                        )}

                        {isFail && (

                          <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">

                            <input

                              type="checkbox"

                              checked={fp}

                              onChange={(e) =>

                                onFalsePositiveChange(rk, e.target.checked)

                              }

                            />

                            Yanlış pozitif

                          </label>

                        )}

                      </div>

                      {c.description && (

                        <p className="mt-2 text-sm text-zinc-800 dark:text-zinc-200">

                          {c.description}

                        </p>

                      )}

                      {c.line_reference ? (
                        <LineReferenceRow text={c.line_reference} />
                      ) : null}

                      {c.code_snippet ? (
                        <CodeSnippetBlock snippet={c.code_snippet} />
                      ) : null}

                    </li>

                  )

                })}

              </ul>

            </>

          )}



          {!hasChecks && !error && legacyOnly && (

            <>

              <p className="mb-2 text-xs text-amber-800 dark:text-amber-200/90">

                Eski yanıt biçimi: yalnızca ihlaller listelendi; kural bazlı PASS

                yok.

              </p>

              <ul className="space-y-3">

                {violations.map((v, originalIndex) => {

                  const vk = violationKey(schema, name, originalIndex, database)

                  const fp = falsePositives[vk] === true

                  return (

                    <li

                      key={vk}

                      className={`rounded-lg border px-3 py-3 dark:border-zinc-600 ${

                        fp

                          ? 'border-zinc-300 bg-zinc-100/90 opacity-75 dark:border-zinc-600 dark:bg-zinc-800/55'

                          : 'border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-950/50'

                      }`}

                    >

                      <div className="flex flex-wrap items-start gap-2">

                        <span

                          className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${severityClass(v.severity)}`}

                        >

                          {v.severity}

                        </span>

                        <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">

                          {v.rule_id}

                        </span>

                        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">

                          <input

                            type="checkbox"

                            checked={fp}

                            onChange={(e) =>

                              onFalsePositiveChange(vk, e.target.checked)

                            }

                          />

                          Yanlış pozitif

                        </label>

                      </div>

                      <p className="mt-2 text-sm text-zinc-800 dark:text-zinc-200">

                        {v.description}

                      </p>

                      {v.line_reference ? (
                        <LineReferenceRow text={v.line_reference} />
                      ) : null}

                      {v.code_snippet ? (
                        <CodeSnippetBlock snippet={v.code_snippet} />
                      ) : null}

                    </li>

                  )

                })}

              </ul>

            </>

          )}



          {!hasChecks &&

            !error &&

            !legacyOnly &&

            indexedChecks.length === 0 && (

              <p className="text-sm text-zinc-500">Sonuç yok.</p>

            )}

        </div>

      )}

    </div>

  )

}


