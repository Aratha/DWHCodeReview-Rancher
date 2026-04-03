import { PRODUCT_NAME } from '../brand'
import { useReviewAnalysis } from '../contexts/ReviewAnalysisContext'
import type { ObjectReviewResult } from '../services/api'
import {
  fpDatabaseForRow,
  ruleCheckKey,
  violationKey,
} from './ReviewResults'

type Props = {
  results: ObjectReviewResult[]
  falsePositives: Record<string, boolean>
}

function escapeCsvField(value: string | null | undefined): string {
  const s = value ?? ''
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function csvLine(fields: string[]): string {
  return fields.map(escapeCsvField).join(',')
}

/** Canlı ekran / sonuç modalı ile aynı FP anahtarını yakalamak için olası varyantları dener. */
function isRuleCheckMarkedFp(
  fp: Record<string, boolean>,
  r: ObjectReviewResult,
  rc: { rule_id: string },
  options?: { database?: string },
): boolean {
  const fpDb = fpDatabaseForRow(r, options)
  const rowOnly = (r.database ?? '').trim()
  const keys = [
    ruleCheckKey(r.schema, r.name, rc.rule_id, fpDb || undefined),
    ruleCheckKey(r.schema, r.name, rc.rule_id, rowOnly || undefined),
  ]
  return keys.some((k) => fp[k] === true)
}

function isViolationMarkedFp(
  fp: Record<string, boolean>,
  r: ObjectReviewResult,
  index: number,
  options?: { database?: string },
): boolean {
  const fpDb = fpDatabaseForRow(r, options)
  const rowOnly = (r.database ?? '').trim()
  const keys = [
    violationKey(r.schema, r.name, index, fpDb || undefined),
    violationKey(r.schema, r.name, index, rowOnly || undefined),
  ]
  return keys.some((k) => fp[k] === true)
}

/** FAIL kural satırı: rule_check FP veya aynı rule_id için işaretlenmiş ihlal FP (API hem kural hem ihlal döndüğünde). */
function isFailRuleMarkedFp(
  fp: Record<string, boolean>,
  r: ObjectReviewResult,
  rc: { rule_id: string; status?: string | null },
  options?: { database?: string },
): boolean {
  const st = (rc.status ?? '').trim().toUpperCase()
  if (st !== 'FAIL') return false
  if (isRuleCheckMarkedFp(fp, r, rc, options)) return true
  const viols = r.violations ?? []
  for (let i = 0; i < viols.length; i++) {
    if (viols[i].rule_id !== rc.rule_id) continue
    if (isViolationMarkedFp(fp, r, i, options)) return true
  }
  return false
}

/**
 * İnceleme sonuçlarını düzleştirilmiş satırlar halinde CSV üretir (UTF-8 BOM ile Excel uyumu).
 * Kural sekmesi / canlı panel ile uyum: `rule_checks` varken çoğu kural tek satır; FAIL olup
 * `violations` içinde aynı rule_id için kayıt varsa üstteki kural özeti yerine yalnızca ihlal
 * satırları (GlobalReviewProgress’teki gibi). `rule_checks` yoksa yalnızca `violations`.
 */
export function buildReviewResultsCsv(
  results: ObjectReviewResult[],
  falsePositives: Record<string, boolean>,
  options?: { reviewError?: string | null; database?: string },
): string {
  const generatedAt = new Date().toISOString()
  const database = options?.database ?? ''

  /** Tek şema: generated_at, database, schema, name, object_type, rule_id, tier, status, severity, description, line_reference, code_snippet, false_positive */
  const headers = [
    'generated_at',
    'database',
    'schema',
    'name',
    'object_type',
    'rule_id',
    'tier',
    'status',
    'severity',
    'description',
    'line_reference',
    'code_snippet',
    'false_positive',
  ]

  if (results.length === 0 && options?.reviewError) {
    return `\ufeff${csvLine(headers)}\r\n${csvLine([
      generatedAt,
      database,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      options.reviewError,
      '',
      '',
      'false',
    ])}`
  }

  const lines: string[] = [`\ufeff${csvLine(headers)}`]

  for (const r of results) {
    const rowDb = (r.database ?? database).trim() || database
    const objErr = r.error ?? ''
    const parseWarn = r.parse_warning ?? ''
    const objectMetaDesc = [objErr, parseWarn].filter(Boolean).join(' | ')
    const ruleChecks = r.rule_checks ?? []
    const viols = r.violations ?? []
    let emitted = false

    const pushViolationRow = (v: (typeof viols)[number], i: number) => {
      const isFp = isViolationMarkedFp(falsePositives, r, i, options)
      const desc = [objectMetaDesc, v.description]
        .filter(Boolean)
        .join(' — ')
      lines.push(
        csvLine([
          generatedAt,
          rowDb,
          r.schema,
          r.name,
          r.object_type,
          v.rule_id,
          '',
          'FAIL',
          v.severity,
          desc,
          v.line_reference,
          v.code_snippet,
          isFp ? 'true' : 'false',
        ]),
      )
    }

    if (ruleChecks.length > 0) {
      for (const rc of ruleChecks) {
        const st = (rc.status ?? '').trim().toUpperCase()
        const detailViolations =
          st === 'FAIL'
            ? viols.filter((v) => v.rule_id === rc.rule_id)
            : []
        if (detailViolations.length > 0) {
          viols.forEach((v, i) => {
            if (v.rule_id === rc.rule_id) pushViolationRow(v, i)
          })
        } else {
          const isFp = isFailRuleMarkedFp(falsePositives, r, rc, options)
          const desc = [objectMetaDesc, rc.description ?? '']
            .filter(Boolean)
            .join(' — ')
          lines.push(
            csvLine([
              generatedAt,
              rowDb,
              r.schema,
              r.name,
              r.object_type,
              rc.rule_id,
              rc.tier ?? '',
              rc.status ?? '',
              rc.severity ?? '',
              desc,
              rc.line_reference ?? '',
              rc.code_snippet ?? '',
              isFp ? 'true' : 'false',
            ]),
          )
        }
      }
      emitted = true
    } else if (viols.length > 0) {
      viols.forEach((v, i) => pushViolationRow(v, i))
      emitted = true
    }

    if (emitted) {
      continue
    }

    lines.push(
      csvLine([
        generatedAt,
        rowDb,
        r.schema,
        r.name,
        r.object_type,
        '',
        '',
        '',
        '',
        objectMetaDesc,
        '',
        '',
        'false',
      ]),
    )
  }

  return lines.join('\r\n')
}

export function downloadReviewResultsCsv(
  results: ObjectReviewResult[],
  falsePositives: Record<string, boolean>,
  options?: { reviewError?: string | null; database?: string },
): void {
  const csv = buildReviewResultsCsv(results, falsePositives, options)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `sql-review-${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function buildPayload(
  results: ObjectReviewResult[],
  fp: Record<string, boolean>,
  options?: { database?: string },
) {
  const generatedAt = new Date().toISOString()
  const objects = results.map((r) => ({
    schema: r.schema,
    name: r.name,
    object_type: r.object_type,
    error: r.error ?? null,
    parse_warning: r.parse_warning ?? null,
    rule_checks: (r.rule_checks ?? []).map((rc) => ({
      ...rc,
      false_positive: isFailRuleMarkedFp(fp, r, rc, options),
    })),
    violations: (r.violations || []).map((v, i) => ({
      ...v,
      false_positive: isViolationMarkedFp(fp, r, i, options),
    })),
  }))
  return { generatedAt, objects }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildHtmlReport(
  results: ObjectReviewResult[],
  fp: Record<string, boolean>,
  options?: { database?: string },
) {
  const { generatedAt, objects } = buildPayload(results, fp, options)
  const parts: string[] = []
  parts.push(
    `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><title>${PRODUCT_NAME} — kod inceleme raporu</title>`,
  )
  parts.push(
    `<style>
      body{font-family:system-ui,Segoe UI,sans-serif;line-height:1.5;max-width:960px;margin:24px auto;padding:0 16px;color:#1f2937}
      h1{font-size:1.25rem}
      .meta{color:#6b7280;font-size:0.875rem;margin-bottom:1.5rem}
      section{border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px;background:#fff}
      h2{font-size:1rem;margin:0 0 8px}
      h3{font-size:0.875rem;margin:12px 0 8px;color:#374151}
      .err{color:#b91c1c;background:#fef2f2;padding:8px;border-radius:6px}
      .v{margin-bottom:12px;padding:12px;border:1px solid #f3f4f6;border-radius:6px}
      .rc{margin-bottom:8px;padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:13px}
      .st{display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:4px;margin-right:6px}
      .pass{background:#d1fae5;color:#065f46}
      .fail{background:#fee2e2;color:#991b1b}
      .unk{background:#e5e7eb;color:#374151}
      .sev{display:inline-block;font-size:11px;font-weight:600;text-transform:uppercase;padding:2px 8px;border-radius:4px;margin-right:8px}
      .low{background:#e5e7eb;color:#374151}
      .med{background:#fef3c7;color:#92400e}
      .high{background:#fee2e2;color:#991b1b}
      pre{white-space:pre-wrap;background:#f9fafb;padding:8px;border-radius:4px;font-size:12px;overflow-x:auto}
      .fp{opacity:0.75}
      ul.fp-list{margin:0;padding-left:18px}
    </style></head><body>`,
  )
  parts.push(`<h1>${PRODUCT_NAME} — kod inceleme raporu</h1>`)
  parts.push(
    `<p class="meta">Oluşturulma: ${escapeHtml(generatedAt)}</p>`,
  )

  for (const o of objects) {
    parts.push('<section>')
    parts.push(
      `<h2>${escapeHtml(o.schema)}.${escapeHtml(o.name)} <span style="color:#6b7280;font-weight:400">(${escapeHtml(o.object_type)})</span></h2>`,
    )
    if (o.error) {
      parts.push(`<p class="err">${escapeHtml(o.error)}</p>`)
    }
    if (o.parse_warning && !o.error) {
      parts.push('<p class="err" style="background:#fffbeb;color:#92400e">' + escapeHtml(o.parse_warning) + '</p>')
    }

    if (o.rule_checks.length > 0) {
      parts.push('<h3>Tüm kurallar</h3>')
      for (const rc of o.rule_checks) {
        const st = (rc.status || '').toUpperCase()
        const stClass =
          st === 'PASS'
            ? 'pass'
            : st === 'FAIL'
              ? 'fail'
              : st === 'NOT_APPLICABLE'
                ? 'unk'
                : 'unk'
        const isFp = rc.false_positive === true
        parts.push(
          `<div class="rc${isFp ? ' fp' : ''}">` +
            `<span class="st ${stClass}">${escapeHtml(rc.status || '?')}</span>` +
            (rc.tier ? `<span style="color:#6b7280;font-size:11px;margin-right:6px">${escapeHtml(rc.tier)}</span>` : '') +
            `<strong>${escapeHtml(rc.rule_id)}</strong>` +
            (rc.decision_basis
              ? ` <span style="color:#6b7280;font-size:11px">${escapeHtml(rc.decision_basis)}</span>`
              : ''),
        )
        if (st === 'FAIL' && rc.severity) {
          const c =
            rc.severity.toUpperCase() === 'HIGH'
              ? 'high'
              : rc.severity.toUpperCase() === 'MEDIUM'
                ? 'med'
                : 'low'
          parts.push(` <span class="sev ${c}">${escapeHtml(rc.severity)}</span>`)
        }
        parts.push(`<p style="margin:6px 0 0">${escapeHtml(rc.description || '')}</p>`)
        if (rc.line_reference)
          parts.push(`<p style="font-size:12px;color:#6b7280">${escapeHtml(rc.line_reference)}</p>`)
        if (rc.code_snippet)
          parts.push(`<pre>${escapeHtml(rc.code_snippet)}</pre>`)
        parts.push('</div>')
      }
    } else {
      const viols = o.violations.filter((v) => !v.false_positive)
      const fps = o.violations.filter((v) => v.false_positive)
      if (viols.length === 0 && !o.error) {
        parts.push('<p>İhlal yok (eski çıktı biçimi).</p>')
      } else {
        for (const v of viols) {
          const c =
            v.severity.toUpperCase() === 'HIGH'
              ? 'high'
              : v.severity.toUpperCase() === 'MEDIUM'
                ? 'med'
                : 'low'
          parts.push('<div class="v">')
          parts.push(
            `<span class="sev ${c}">${escapeHtml(v.severity)}</span><strong>${escapeHtml(v.rule_id)}</strong>`,
          )
          parts.push(`<p>${escapeHtml(v.description)}</p>`)
          if (v.line_reference)
            parts.push(`<p style="font-size:12px;color:#6b7280">${escapeHtml(v.line_reference)}</p>`)
          if (v.code_snippet)
            parts.push(`<pre>${escapeHtml(v.code_snippet)}</pre>`)
          parts.push('</div>')
        }
      }
      if (fps.length > 0) {
        parts.push('<p><strong>İşaretlenen yanlış pozitifler</strong></p><ul class="fp-list">')
        for (const v of fps) {
          parts.push(
            `<li class="fp"><strong>${escapeHtml(v.rule_id)}</strong> — ${escapeHtml(v.description)}</li>`,
          )
        }
        parts.push('</ul>')
      }
    }

    const rcFp = o.rule_checks.filter((x) => x.false_positive)
    if (rcFp.length > 0) {
      parts.push('<p><strong>İşaretlenen yanlış pozitifler (FAIL)</strong></p><ul class="fp-list">')
      for (const rc of rcFp) {
        parts.push(
          `<li class="fp"><strong>${escapeHtml(rc.rule_id)}</strong> — ${escapeHtml(rc.description)}</li>`,
        )
      }
      parts.push('</ul>')
    }

    parts.push('</section>')
  }

  parts.push('</body></html>')
  return parts.join('')
}

export function ExportMenu({ results, falsePositives }: Props) {
  if (results.length === 0) return null

  const { activeReviewSummary, liveProgress } = useReviewAnalysis()
  const database =
    liveProgress?.database ??
    (activeReviewSummary?.kind === 'db' ? activeReviewSummary.database : '')

  const downloadJson = () => {
    const payload = buildPayload(results, falsePositives, { database })
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `sql-review-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const downloadHtml = () => {
    const html = buildHtmlReport(results, falsePositives, { database })
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `sql-review-${Date.now()}.html`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const downloadCsv = () => {
    downloadReviewResultsCsv(results, falsePositives, { database })
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={downloadCsv}
        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        CSV dışa aktar
      </button>
      <button
        type="button"
        onClick={downloadJson}
        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        JSON dışa aktar
      </button>
      <button
        type="button"
        onClick={downloadHtml}
        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        HTML dışa aktar
      </button>
    </div>
  )
}
