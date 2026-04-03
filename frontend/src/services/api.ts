/**
 * Geliştirmede varsayılan: doğrudan FastAPI (Vite proxy güvenilir olmayabilir).
 * Üretim: aynı origin veya VITE_API_PREFIX ile tam taban URL.
 * VITE_API_PREFIX sonunda `/api` olmamalı (yoksa `/api/api/...` oluşur ve 404 verir).
 */
function normalizeApiBase(raw: string): string {
  let s = raw.trim().replace(/\/+$/, '')
  if (s.endsWith('/api')) {
    s = s.slice(0, -4).replace(/\/+$/, '')
  }
  return s
}

function apiBase(): string {
  const explicit = import.meta.env.VITE_API_PREFIX
  if (explicit != null && String(explicit).trim() !== '') {
    return normalizeApiBase(String(explicit))
  }
  if (import.meta.env.DEV) {
    return 'http://127.0.0.1:8000'
  }
  return ''
}

export type DbObject = {
  schema: string
  name: string
  type: string
  type_code: string
  /** sys.objects.create_date (ISO) */
  created_at?: string | null
  last_modified: string | null
}

export type Violation = {
  rule_id: string
  severity: string
  description: string
  line_reference: string
  code_snippet: string
}

export type RuleCheck = {
  rule_id: string
  tier: string
  status: string
  severity: string
  decision_basis?: string
  description: string
  line_reference: string
  code_snippet: string
}

export type ObjectReviewResult = {
  schema: string
  name: string
  object_type: string
  /** Catalog veritabanı (çoklu DB seçiminde satır başına) */
  database?: string
  /** Her yayınlanmış kural için PASS/FAIL/UNKNOWN (yeni LLM biçimi) */
  rule_checks?: RuleCheck[]
  violations: Violation[]
  error?: string | null
  parse_warning?: string | null
}

export type RuleLine = {
  id: string
  text: string
  /** true ise DB nesne incelemesinde bağımlılık + kolon özeti LLM isteğine eklenir */
  requires_metadata?: boolean
}

export type RuleBundle = {
  critical: RuleLine[]
  normal: RuleLine[]
}

export type RulesState = {
  draft: RuleBundle
  published: RuleBundle
  published_at: string | null
}

const STALE_BACKEND_MSG =
  'Sunucu bu API yolunu tanımıyor (404). Genelde güncellenmiş backend kodu çalışmıyordur ' +
  '(eski uvicorn süreci). Süreci durdurup yeniden başlatın: proje kökünde ' +
  '`python run_backend.py` veya backend klasöründe ' +
  '`python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000`'

/** /api/health yanıtında rules_api yoksa porttaki süreç kurallar öncesi kodu çalıştırıyordur. */
const RULES_404_STALE_PROCESS_MSG =
  '8000 portunda dinleyen süreç güncel değil: bu API sürümünde /api/health içinde "rules_api": true olmalı. ' +
  'Genelde eski uvicorn arka planda kalmıştır. PowerShell: netstat -ano | findstr :8000 ile PID bulun, ' +
  'Görev Yöneticisinde o işlemi sonlandırın; sonra proje kökünde `python run_backend.py` çalıştırın. ' +
  'Doğrulama: tarayıcıda http://127.0.0.1:8000/ açıp JSON içinde "rules":"/api/rules" satırını görmelisiniz.'

function parseApiErrorText(status: number, text: string): string {
  if (status === 404) {
    try {
      const j = JSON.parse(text) as { detail?: unknown }
      const d = j.detail
      if (
        d === 'Not Found' ||
        (typeof d === 'string' && d.toLowerCase().includes('not found'))
      ) {
        return STALE_BACKEND_MSG
      }
    } catch {
      /* ignore */
    }
    if (!text.trim()) {
      return STALE_BACKEND_MSG
    }
  }
  return text || `HTTP ${status}`
}

async function readApiError(res: Response): Promise<string> {
  const text = await res.text()
  return parseApiErrorText(res.status, text)
}

/** 'missing' = /api/health cevap verdi ama rules_api yok (eski süreç). 'ok' = güncel. 'unknown' = ulaşılamadı. */
async function healthRulesApiState(
  base: string,
): Promise<'missing' | 'ok' | 'unknown'> {
  try {
    const hr = await fetch(`${base}/api/health`)
    if (!hr.ok) return 'unknown'
    const j = (await hr.json()) as { rules_api?: boolean }
    if (j.rules_api === true) return 'ok'
    return 'missing'
  } catch {
    return 'unknown'
  }
}

export async function getDatabases(): Promise<string[]> {
  const base = apiBase()
  const url = `${base}/api/databases`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(await readApiError(res))
  }
  const data = await res.json()
  return data.databases as string[]
}

export async function getObjects(
  database: string,
  q?: string,
  /** YYYY-MM-DD: bu tarihte veya sonrasında oluşturulmuş veya güncellenmiş nesneler */
  fromDate?: string | null,
): Promise<DbObject[]> {
  const params = new URLSearchParams()
  params.set('database', database)
  if (q?.trim()) params.set('q', q.trim())
  if (fromDate?.trim()) params.set('from_date', fromDate.trim())
  const url = `${apiBase()}/api/objects?${params}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(await readApiError(res))
  }
  return res.json()
}

export async function getRules(): Promise<RulesState> {
  const base = apiBase()
  const res = await fetch(`${base}/api/rules`)
  if (res.ok) return res.json()
  const text = await res.text()
  if (res.status === 404) {
    const h = await healthRulesApiState(base)
    if (h === 'missing') {
      throw new Error(RULES_404_STALE_PROCESS_MSG)
    }
  }
  throw new Error(parseApiErrorText(res.status, text))
}

export async function putRulesDraft(draft: RuleBundle): Promise<RulesState> {
  const res = await fetch(`${apiBase()}/api/rules/draft`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  })
  if (!res.ok) {
    throw new Error(await readApiError(res))
  }
  return res.json()
}

export async function postRulesPublish(): Promise<RulesState> {
  const res = await fetch(`${apiBase()}/api/rules/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    throw new Error(await readApiError(res))
  }
  return res.json()
}

export async function postReview(
  database: string,
  selections: {
    schema: string
    name: string
    object_type: string
    database?: string
  }[],
): Promise<ObjectReviewResult[]> {
  const res = await fetch(`${apiBase()}/api/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      database,
      selections: selections.map((s) => ({
        schema: s.schema,
        name: s.name,
        object_type: s.object_type,
        ...(s.database ? { database: s.database } : {}),
      })),
    }),
  })
  if (!res.ok) {
    throw new Error(await readApiError(res))
  }
  const data = await res.json()
  return data.results as ObjectReviewResult[]
}

export type ReviewProgressEvent = {
  phase: string
  database?: string
  object_label?: string
  object_index?: number
  objects_total?: number
  schema?: string
  name?: string
  type_code?: string
  rule_id?: string
  tier?: string
  rule_index?: number
  rules_total?: number
  ok?: boolean
  kind?: string
  error?: string
  message?: string
  sql_length?: number
  /** LLM streaming: sunucu usage.completion_tokens (varsa) veya birikimli karakter sayısı */
  completion_tokens?: number | null
  total_chars?: number
}

/** SSE olay sınırı: bazı ortamlar \r\n\r\n gönderir; yalnızca \n\n aramak olayları sonsuza dek tamponda tutar. */
function nextSseFrameEnd(buf: string): { end: number; sepLen: number } | null {
  const crlf = buf.indexOf('\r\n\r\n')
  if (crlf !== -1) return { end: crlf, sepLen: 4 }
  const lf = buf.indexOf('\n\n')
  if (lf !== -1) return { end: lf, sepLen: 2 }
  return null
}

async function parseReviewSseStream(
  res: Response,
  onEvent: (e: ReviewProgressEvent) => void,
): Promise<ObjectReviewResult[]> {
  const reader = res.body?.getReader()
  if (!reader) {
    throw new Error('Sunucu yanıt gövdesi okunamadı')
  }
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    // Son okumada (done=true) value olabilir; önce decode etmeden break etmeyin.
    // stream:!done ile TextDecoder son chunk'ta flush edilir.
    buf += dec.decode(value ?? new Uint8Array(), { stream: !done })
    for (;;) {
      const frame = nextSseFrameEnd(buf)
      if (!frame) break
      const block = buf.slice(0, frame.end).trim()
      buf = buf.slice(frame.end + frame.sepLen)
      if (!block.startsWith('data: ')) continue
      let j: ReviewProgressEvent & { results?: ObjectReviewResult[] }
      try {
        j = JSON.parse(block.slice(6).trim()) as ReviewProgressEvent & {
          results?: ObjectReviewResult[]
        }
      } catch {
        continue
      }
      if (j.phase === 'complete') {
        return (j.results ?? []) as ObjectReviewResult[]
      }
      if (j.phase === 'error') {
        throw new Error(j.message || 'Akış hatası')
      }
      onEvent(j)
    }
    if (done) break
  }
  throw new Error('Akış tamamlanmadan kapandı')
}

/** SSE: nesne + kural düzeyinde canlı olaylar; tamamlanınca sonuç listesi döner. */
export async function postReviewStream(
  database: string,
  selections: {
    schema: string
    name: string
    object_type: string
    database?: string
  }[],
  onEvent: (e: ReviewProgressEvent) => void,
  signal?: AbortSignal,
): Promise<ObjectReviewResult[]> {
  const res = await fetch(`${apiBase()}/api/review/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      database,
      selections: selections.map((s) => ({
        schema: s.schema,
        name: s.name,
        object_type: s.object_type,
        ...(s.database ? { database: s.database } : {}),
      })),
    }),
    signal,
  })
  if (!res.ok) {
    throw new Error(await readApiError(res))
  }
  return parseReviewSseStream(res, onEvent)
}

export async function postScriptReviewStream(
  sql: string,
  label: string | undefined,
  onEvent: (e: ReviewProgressEvent) => void,
  signal?: AbortSignal,
): Promise<ObjectReviewResult[]> {
  const res = await fetch(`${apiBase()}/api/review/script/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sql,
      ...(label?.trim() ? { label: label.trim() } : {}),
    }),
    signal,
  })
  if (!res.ok) {
    throw new Error(await readApiError(res))
  }
  return parseReviewSseStream(res, onEvent)
}

/** Veritabanından nesne çekmeden yapıştırılan SQL betiğini inceler (yayınlanmış kurallar). */
export async function postScriptReview(
  sql: string,
  label?: string,
): Promise<ObjectReviewResult[]> {
  const res = await fetch(`${apiBase()}/api/review/script`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sql,
      ...(label?.trim() ? { label: label.trim() } : {}),
    }),
  })
  if (!res.ok) {
    throw new Error(await readApiError(res))
  }
  const data = await res.json()
  return data.results as ObjectReviewResult[]
}

export type LlmLogMeta = {
  id: string
  ts: string
  object_label: string
  ok: boolean
  error_preview: string | null
}

export type LlmLogEntry = Record<string, unknown>

export async function getLlmLogs(limit = 100): Promise<{ items: LlmLogMeta[] }> {
  const res = await fetch(`${apiBase()}/api/llm-logs?limit=${limit}`)
  if (!res.ok) {
    throw new Error(await readApiError(res))
  }
  return res.json()
}

export async function getLlmLogEntry(id: string): Promise<LlmLogEntry> {
  const res = await fetch(
    `${apiBase()}/api/llm-logs/${encodeURIComponent(id)}`,
  )
  if (!res.ok) {
    throw new Error(await readApiError(res))
  }
  return res.json()
}

export async function deleteLlmLogs(): Promise<void> {
  const res = await fetch(`${apiBase()}/api/llm-logs`, { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(await readApiError(res))
  }
}

export type LlmChatApiMode = 'openai' | 'api_v1_chat'

export type LlmConfig = {
  llm_chat_api: LlmChatApiMode
  llm_base_url: string
  llm_chat_url: string
  llm_model: string
  sql_review_llm_model: string
  llm_http_trust_env: boolean
  sql_review_max_concurrent_rules: number
  api_key_set: boolean
}

export type LlmConfigPatch = {
  llm_chat_api?: LlmChatApiMode
  llm_base_url?: string
  llm_chat_url?: string
  llm_model?: string
  sql_review_llm_model?: string
  llm_api_key?: string
  llm_http_trust_env?: boolean
  sql_review_max_concurrent_rules?: number
}

export async function getLlmConfig(): Promise<LlmConfig> {
  const res = await fetch(`${apiBase()}/api/llm-config`)
  if (!res.ok) {
    throw new Error(await readApiError(res))
  }
  return res.json()
}

export async function putLlmConfig(patch: LlmConfigPatch): Promise<LlmConfig> {
  const res = await fetch(`${apiBase()}/api/llm-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    throw new Error(await readApiError(res))
  }
  return res.json()
}
