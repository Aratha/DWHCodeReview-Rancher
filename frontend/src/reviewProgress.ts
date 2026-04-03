import type {
  ObjectReviewResult,
  ReviewProgressEvent,
  Violation,
} from './services/api'

/** Tek kural için canlı LLM akışı (içerik yok; token / tahmin). */
export type LiveRuleProgress = {
  ruleId: string
  tier?: string
  status: 'pending' | 'running' | 'done' | 'error'
  /** API completion_tokens veya akıştan gelen son değer */
  llmStreamTokens?: number | null
  /** Yanıt metni karakter sayısı (tahmini token için) */
  llmStreamChars?: number
  ok?: boolean
  /** Tamamlanan inceleme: rule_checks.status (PASS / FAIL / …) */
  checkStatus?: string
  severity?: string
  description?: string
  lineReference?: string
  decisionBasis?: string
  codeSnippet?: string
  /** Aynı kural_id için birden fazla ihlal satırı (API violations) */
  violations?: Violation[]
}

export type LiveObjectProgress = {
  label: string
  schema?: string
  name?: string
  typeCode?: string
  /** Catalog veritabanı (çoklu DB kartları için) */
  catalogDatabase?: string
  rulesTotal: number
  rulesDone: number
  activeRuleIds: string[]
  /** Görüntüleme sırası (ilk rule_start sırası) */
  ruleOrder: string[]
  rulesById: Record<string, LiveRuleProgress>
  status: 'pending' | 'fetch' | 'metadata' | 'rules' | 'done' | 'error'
  detail?: string
  /** Nesne düzeyinde parse uyarısı (API parse_warning) */
  parseWarning?: string
}

export type LiveProgressSnapshot = {
  mode: 'db' | 'script'
  database: string
  scriptLabel?: string
  objectsTotal: number
  objectsDone: number
  totalRulesPlanned: number
  completedRuleCalls: number
  byObject: Record<string, LiveObjectProgress>
}

function ensureRule(
  base: LiveObjectProgress,
  rid: string,
): LiveRuleProgress {
  let r = base.rulesById[rid]
  if (!r) {
    r = { ruleId: rid, status: 'pending' }
    base.rulesById = { ...base.rulesById, [rid]: r }
  }
  return r
}

function cloneObject(o: LiveObjectProgress): LiveObjectProgress {
  const rulesById: Record<string, LiveRuleProgress> = {}
  for (const [k, v] of Object.entries(o.rulesById)) {
    rulesById[k] = {
      ...v,
      violations: v.violations ? [...v.violations] : undefined,
    }
  }
  return {
    ...o,
    activeRuleIds: [...o.activeRuleIds],
    ruleOrder: [...o.ruleOrder],
    rulesById,
  }
}

export function createInitialLiveProgress(params: {
  mode: 'db' | 'script'
  database: string
  scriptLabel?: string
  objectsTotal: number
}): LiveProgressSnapshot {
  return {
    mode: params.mode,
    database: params.database,
    scriptLabel: params.scriptLabel,
    objectsTotal: params.objectsTotal,
    objectsDone: 0,
    totalRulesPlanned: 0,
    completedRuleCalls: 0,
    byObject: {},
  }
}

function recomputeRulePlan(snap: LiveProgressSnapshot): void {
  let sum = 0
  for (const o of Object.values(snap.byObject)) {
    sum += o.rulesTotal
  }
  snap.totalRulesPlanned = sum
}

export function mergeReviewProgressEvent(
  prev: LiveProgressSnapshot,
  ev: ReviewProgressEvent,
): LiveProgressSnapshot {
  const key = (ev.object_label || 'unknown').trim() || 'unknown'

  const byObject = { ...prev.byObject }
  const base = byObject[key]
    ? cloneObject(byObject[key])
    : {
        label: key,
        schema: ev.schema,
        name: ev.name,
        typeCode: ev.type_code,
        catalogDatabase: ev.database,
        rulesTotal: 0,
        rulesDone: 0,
        activeRuleIds: [] as string[],
        ruleOrder: [] as string[],
        rulesById: {} as Record<string, LiveRuleProgress>,
        status: 'pending' as const,
      }

  if (ev.schema !== undefined) base.schema = ev.schema
  if (ev.name !== undefined) base.name = ev.name
  if (ev.type_code !== undefined) base.typeCode = ev.type_code
  if (ev.database !== undefined) base.catalogDatabase = ev.database

  switch (ev.phase) {
    case 'object_start':
      base.status = 'fetch'
      break
    case 'definition_fetch':
      base.status = 'fetch'
      break
    case 'sql_ready':
      base.status = 'rules'
      break
    case 'metadata_fetch':
      base.status = 'metadata'
      break
    case 'metadata_ready':
      base.status = 'rules'
      break
    case 'rules_batch_start': {
      const rt = ev.rules_total ?? 0
      base.rulesTotal = rt
      break
    }
    case 'rule_start': {
      const rid = ev.rule_id ?? ''
      if (!rid) break
      if (!base.ruleOrder.includes(rid)) {
        base.ruleOrder = [...base.ruleOrder, rid]
      }
      const ru = ensureRule(base, rid)
      ru.status = 'running'
      ru.tier = ev.tier
      ru.llmStreamTokens = undefined
      ru.llmStreamChars = 0
      base.rulesById = { ...base.rulesById, [rid]: ru }
      if (!base.activeRuleIds.includes(rid)) {
        base.activeRuleIds = [...base.activeRuleIds, rid]
      }
      break
    }
    case 'llm_stream': {
      base.status = 'rules'
      const rid = ev.rule_id ?? ''
      if (!rid) break
      const ru = ensureRule(base, rid)
      if (ev.completion_tokens != null && ev.completion_tokens >= 0) {
        ru.llmStreamTokens = ev.completion_tokens
      }
      if (ev.total_chars != null && ev.total_chars >= 0) {
        ru.llmStreamChars = ev.total_chars
      }
      base.rulesById = { ...base.rulesById, [rid]: { ...ru } }
      break
    }
    case 'rule_done': {
      const rid = ev.rule_id ?? ''
      base.activeRuleIds = base.activeRuleIds.filter((x) => x !== rid)
      base.rulesDone += 1
      if (rid) {
        const ru = ensureRule(base, rid)
        ru.status = ev.ok === false ? 'error' : 'done'
        ru.ok = ev.ok
        if (ev.completion_tokens != null && ev.completion_tokens >= 0) {
          ru.llmStreamTokens = ev.completion_tokens
        }
        if (ev.total_chars != null && ev.total_chars >= 0) {
          ru.llmStreamChars = ev.total_chars
        }
        base.rulesById = { ...base.rulesById, [rid]: { ...ru } }
      }
      break
    }
    case 'object_done':
      base.status = 'done'
      base.activeRuleIds = []
      break
    case 'object_error':
      base.status = 'error'
      base.detail = ev.error
      break
    default:
      break
  }

  byObject[key] = base

  const snap: LiveProgressSnapshot = {
    ...prev,
    byObject,
    completedRuleCalls:
      ev.phase === 'rule_done'
        ? prev.completedRuleCalls + 1
        : prev.completedRuleCalls,
    objectsDone:
      ev.phase === 'object_done' ? prev.objectsDone + 1 : prev.objectsDone,
  }

  recomputeRulePlan(snap)

  return snap
}

/**
 * Canlı SSE olayları işlenmediyse (ör. satır sonu uyumsuzluğu), tamamlanan sonuçlardan
 * nesne kartlarını ve sayaçları doldurur.
 */
export function hydrateLiveProgressFromResults(
  prev: LiveProgressSnapshot,
  results: ObjectReviewResult[],
): LiveProgressSnapshot {
  const prevKeys = Object.keys(prev.byObject).length
  if (results.length === 0 || prevKeys > 0) {
    return prev
  }

  const byObject: Record<string, LiveObjectProgress> = {}
  let completedRuleCalls = 0
  for (const r of results) {
    const checks = r.rule_checks ?? []
    completedRuleCalls += checks.length
    const key = resultObjectKey(r)
    const ruleOrder: string[] = []
    const rulesById: Record<string, LiveRuleProgress> = {}
    for (const c of checks) {
      const rid = c.rule_id
      if (!ruleOrder.includes(rid)) ruleOrder.push(rid)
      rulesById[rid] = {
        ruleId: rid,
        tier: c.tier,
        status: 'done',
        ok: true,
      }
    }
    byObject[key] = {
      label: key,
      schema: r.schema,
      name: r.name,
      typeCode: r.object_type,
      catalogDatabase: r.database,
      rulesTotal: checks.length,
      rulesDone: checks.length,
      activeRuleIds: [],
      ruleOrder,
      rulesById,
      status: r.error ? 'error' : 'done',
      detail: r.error ?? undefined,
      parseWarning: r.parse_warning ?? undefined,
    }
  }

  let totalRulesPlanned = 0
  for (const o of Object.values(byObject)) {
    totalRulesPlanned += o.rulesTotal
  }

  return {
    ...prev,
    byObject,
    objectsDone: results.length,
    completedRuleCalls,
    totalRulesPlanned,
  }
}

/** Tek kural satırı için gösterilecek token metni (API veya tahmin). */
export function formatRuleTokenLine(r: LiveRuleProgress): string {
  if (r.llmStreamTokens != null && r.llmStreamTokens > 0) {
    return `${r.llmStreamTokens.toLocaleString()} token`
  }
  const ch = r.llmStreamChars ?? 0
  if (ch > 0) {
    return `~${Math.max(1, Math.ceil(ch / 4)).toLocaleString()} token (tahmini)`
  }
  if (r.status === 'running') {
    return '…'
  }
  return '—'
}

export function ruleCheckIsPass(status: string | undefined): boolean {
  if (!status) return false
  const u = status.toUpperCase()
  return u === 'PASS' || u === 'NOT_APPLICABLE'
}

/** API sonucu için nesne anahtarı; veritabanı + şema + ad + tür (canlı etiket ile uyumlu). */
export function resultObjectKey(res: ObjectReviewResult): string {
  const db = (res.database ?? '').trim()
  if (db) {
    return `[${db}] ${res.schema}.${res.name} (${res.object_type})`
  }
  return `${res.schema}.${res.name} (${res.object_type})`
}

/**
 * Canlı SSE `object_label` ile API sonucunu eşleştirir; çoklu DB için catalog adı da kullanılır.
 */
function findMatchingObjectKey(
  byObject: Record<string, LiveObjectProgress>,
  res: ObjectReviewResult,
): string | null {
  const fromApi = resultObjectKey(res)
  if (byObject[fromApi]) return fromApi

  const resDb = (res.database ?? '').trim()
  for (const [k, o] of Object.entries(byObject)) {
    if (o.schema !== res.schema || o.name !== res.name) continue
    const oDb = (o.catalogDatabase ?? '').trim()
    if (!resDb || !oDb || resDb === oDb) {
      return k
    }
  }
  return null
}

/** Sonuç listesini mevcut canlı karta işler (kural başına PASS/FAIL + açıklama). */
export function mergeRuleResultsIntoLiveProgress(
  prev: LiveProgressSnapshot,
  results: ObjectReviewResult[],
): LiveProgressSnapshot {
  if (results.length === 0) return prev

  const byObject = { ...prev.byObject }

  for (const res of results) {
    const keyFromApi = resultObjectKey(res)
    const existingKey = findMatchingObjectKey(byObject, res)
    const key = existingKey ?? keyFromApi

    const base = byObject[key]
      ? cloneObject(byObject[key])
      : {
          label: key,
          schema: res.schema,
          name: res.name,
          typeCode: res.object_type,
          rulesTotal: 0,
          rulesDone: 0,
          activeRuleIds: [] as string[],
          ruleOrder: [] as string[],
          rulesById: {} as Record<string, LiveRuleProgress>,
          status: (res.error ? 'error' : 'done') as LiveObjectProgress['status'],
          detail: res.error ?? undefined,
        }

    const checks = res.rule_checks ?? []
    if (checks.length > 0) {
      base.rulesTotal = Math.max(base.rulesTotal, checks.length)
      base.rulesDone = Math.max(base.rulesDone, checks.length)
    }

    const ruleOrder = [...base.ruleOrder]
    const rulesById: Record<string, LiveRuleProgress> = { ...base.rulesById }

    for (const c of checks) {
      const rid = c.rule_id
      if (!ruleOrder.includes(rid)) {
        ruleOrder.push(rid)
      }
      const existing = rulesById[rid]
      const merged: LiveRuleProgress = {
        ...(existing ?? { ruleId: rid, status: 'done' as const }),
        ruleId: rid,
        tier: c.tier,
        status: 'done',
        ok: ruleCheckIsPass(c.status),
        checkStatus: c.status,
        severity: c.severity,
        description: c.description,
        lineReference: c.line_reference,
        decisionBasis: c.decision_basis,
        codeSnippet: c.code_snippet,
      }
      rulesById[rid] = merged
    }

    const vlist = res.violations ?? []
    const violByRule: Record<string, Violation[]> = {}
    for (const v of vlist) {
      if (!violByRule[v.rule_id]) violByRule[v.rule_id] = []
      violByRule[v.rule_id].push(v)
    }
    for (const rid of Object.keys(rulesById)) {
      const vs = violByRule[rid]
      if (vs && vs.length > 0) {
        rulesById[rid] = { ...rulesById[rid], violations: vs }
      }
    }
    for (const rid of Object.keys(violByRule)) {
      if (!rulesById[rid]) {
        if (!ruleOrder.includes(rid)) ruleOrder.push(rid)
        rulesById[rid] = {
          ruleId: rid,
          status: 'done',
          violations: violByRule[rid],
        }
      }
    }

    base.ruleOrder = ruleOrder
    base.rulesById = rulesById
    base.status = res.error ? 'error' : 'done'
    base.detail = res.error ?? undefined
    base.parseWarning = res.parse_warning ?? undefined
    byObject[key] = base

    if (key !== keyFromApi && byObject[keyFromApi] !== undefined) {
      delete byObject[keyFromApi]
    }
  }

  const snap: LiveProgressSnapshot = {
    ...prev,
    byObject,
  }
  recomputeRulePlan(snap)
  return snap
}
