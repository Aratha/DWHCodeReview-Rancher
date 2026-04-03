import { useCallback, useEffect, useState } from 'react'

import { PRODUCT_NAME } from '../brand'
import type { LlmChatApiMode, LlmConfig, LlmConfigPatch } from '../services/api'
import { getLlmConfig, putLlmConfig } from '../services/api'

const inputClass =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-500'

export function LlmConfigPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedOk, setSavedOk] = useState(false)

  const [llm_chat_api, setLlmChatApi] = useState<LlmChatApiMode>('openai')
  const [llm_base_url, setLlmBaseUrl] = useState('')
  const [llm_chat_url, setLlmChatUrl] = useState('')
  const [llm_model, setLlmModel] = useState('')
  const [sql_review_llm_model, setSqlReviewLlmModel] = useState('')
  const [llm_http_trust_env, setLlmHttpTrustEnv] = useState(false)

  const [api_key_set, setApiKeySet] = useState(false)
  const [newApiKey, setNewApiKey] = useState('')
  const [removeApiKey, setRemoveApiKey] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const c = await getLlmConfig()
      applyConfig(c)
    } catch (e) {
      setError((e as Error).message || 'Ayarlar yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  function applyConfig(c: LlmConfig) {
    setLlmChatApi(c.llm_chat_api === 'api_v1_chat' ? 'api_v1_chat' : 'openai')
    setLlmBaseUrl(c.llm_base_url)
    setLlmChatUrl(c.llm_chat_url)
    setLlmModel(c.llm_model)
    setSqlReviewLlmModel(c.sql_review_llm_model)
    setLlmHttpTrustEnv(c.llm_http_trust_env)
    setApiKeySet(c.api_key_set)
    setNewApiKey('')
    setRemoveApiKey(false)
  }

  useEffect(() => {
    void load()
  }, [load])

  const onSave = async () => {
    setSaving(true)
    setError(null)
    setSavedOk(false)
    try {
      const patch: LlmConfigPatch = {
        llm_chat_api,
        llm_base_url: llm_base_url.trim(),
        llm_chat_url: llm_chat_url.trim(),
        llm_model: llm_model.trim(),
        sql_review_llm_model: sql_review_llm_model.trim(),
        llm_http_trust_env,
      }
      if (removeApiKey) {
        patch.llm_api_key = ''
      } else if (newApiKey.trim()) {
        patch.llm_api_key = newApiKey.trim()
      }
      const next = await putLlmConfig(patch)
      applyConfig(next)
      setSavedOk(true)
      window.setTimeout(() => setSavedOk(false), 4000)
    } catch (e) {
      setError((e as Error).message || 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <header className="shrink-0">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {PRODUCT_NAME} — LLM konfigürasyonu
        </h1>
        <p className="mt-1 max-w-2xl text-xs text-zinc-500 dark:text-zinc-400">
          OpenAI uyumlu uç nokta (LM Studio, vLLM vb.) ve model adları. Değerler{' '}
          <code className="rounded bg-zinc-200/80 px-1 py-0.5 text-[11px] text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
            backend/.env
          </code>{' '}
          dosyasına yazılır; çalışan API sürecinde hemen kullanılır (yeniden başlatma
          gerekmez).
        </p>
      </header>

      {error && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {error}
        </div>
      )}

      {savedOk && (
        <div
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100"
          role="status"
        >
          Ayarlar kaydedildi.
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Yükleniyor…</p>
      ) : (
        <div className="max-w-xl space-y-4">
          <div>
            <label htmlFor="llm-chat-api" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              LLM API biçimi
            </label>
            <select
              id="llm-chat-api"
              value={llm_chat_api}
              onChange={(e) => setLlmChatApi(e.target.value as LlmChatApiMode)}
              className={inputClass}
            >
              <option value="openai">OpenAI uyumlu (messages + /v1/chat/completions)</option>
              <option value="api_v1_chat">POST /api/v1/chat (system_prompt + input, örn. LM Studio)</option>
            </select>
            <p className="mt-1 text-[11px] text-zinc-500">
              {llm_chat_api === 'api_v1_chat'
                ? 'Boş chat URL için hedef: kök URL + /api/v1/chat (base .../v1 ile bitiyorsa /v1 kaldırılır).'
                : 'LM Studio / vLLM: sonunda /v1; tam yol .../v1/chat/completions olur.'}
            </p>
          </div>

          <div>
            <label htmlFor="llm-base-url" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              LLM base URL
            </label>
            <input
              id="llm-base-url"
              type="url"
              value={llm_base_url}
              onChange={(e) => setLlmBaseUrl(e.target.value)}
              placeholder={
                llm_chat_api === 'api_v1_chat'
                  ? 'http://127.0.0.1:1234 veya http://127.0.0.1:1234/v1'
                  : 'http://127.0.0.1:1234/v1'
              }
              autoComplete="off"
              spellCheck={false}
              className={inputClass}
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              {llm_chat_api === 'api_v1_chat' ? (
                <>
                  Sunucu kökü veya <code className="text-zinc-600 dark:text-zinc-400">.../v1</code>; uç{' '}
                  <code className="text-zinc-600 dark:text-zinc-400">/api/v1/chat</code> otomatik eklenir.
                </>
              ) : (
                <>
                  Sonunda <code className="text-zinc-600 dark:text-zinc-400">/v1</code> olmalı (örn. LM Studio:{' '}
                  <code className="text-zinc-600 dark:text-zinc-400">http://127.0.0.1:1234/v1</code>).
                </>
              )}
            </p>
          </div>

          <div>
            <label htmlFor="llm-chat-url" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Chat tam URL (isteğe bağlı)
            </label>
            <input
              id="llm-chat-url"
              type="url"
              value={llm_chat_url}
              onChange={(e) => setLlmChatUrl(e.target.value)}
              placeholder={
                llm_chat_api === 'api_v1_chat'
                  ? 'Boşsa base + /api/v1/chat'
                  : 'Boşsa base + /chat/completions (örn. .../v1/chat/completions)'
              }
              autoComplete="off"
              spellCheck={false}
              className={inputClass}
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              {llm_chat_api === 'api_v1_chat'
                ? 'Özel yol gerekiyorsa tam adresi yazın (örn. http://host:1234/api/v1/chat).'
                : 'Yalnızca .../v1 yazdıysanız tam yol otomatik tamamlanır. Aksi halde tam OpenAI uyumlu adresi girin.'}
            </p>
          </div>

          <div>
            <label htmlFor="llm-model" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              LLM model
            </label>
            <input
              id="llm-model"
              type="text"
              value={llm_model}
              onChange={(e) => setLlmModel(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className={inputClass}
            />
          </div>

          <div>
            <label
              htmlFor="sql-review-model"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              SQL inceleme modeli (öncelikli)
            </label>
            <input
              id="sql-review-model"
              type="text"
              value={sql_review_llm_model}
              onChange={(e) => setSqlReviewLlmModel(e.target.value)}
              placeholder="Boşsa LLM model kullanılır"
              autoComplete="off"
              spellCheck={false}
              className={inputClass}
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              Doluysa incelemelerde her zaman bu model seçilir (<code className="text-zinc-600 dark:text-zinc-400">SQL_REVIEW_LLM_MODEL</code>).
            </p>
          </div>

          <div>
            <label htmlFor="llm-api-key" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              API anahtarı
            </label>
            <input
              id="llm-api-key"
              type="password"
              value={newApiKey}
              onChange={(e) => {
                setNewApiKey(e.target.value)
                if (e.target.value) setRemoveApiKey(false)
              }}
              placeholder={api_key_set ? 'Yeni anahtar yazın veya aşağıdan kaldırın' : 'İsteğe bağlı'}
              autoComplete="off"
              className={inputClass}
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {api_key_set ? (
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  Kayıtlı anahtar var.
                </span>
              ) : (
                <span className="text-xs text-zinc-500">Kayıtlı anahtar yok.</span>
              )}
              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={removeApiKey}
                  onChange={(e) => {
                    setRemoveApiKey(e.target.checked)
                    if (e.target.checked) setNewApiKey('')
                  }}
                  className="rounded border-zinc-400 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800"
                />
                Kayıtlı anahtarı sil
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/50">
            <input
              id="llm-trust-env"
              type="checkbox"
              checked={llm_http_trust_env}
              onChange={(e) => setLlmHttpTrustEnv(e.target.checked)}
              className="rounded border-zinc-400 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800"
            />
            <label htmlFor="llm-trust-env" className="text-sm text-zinc-700 dark:text-zinc-300">
              Sistem HTTP(S)_PROXY ortam değişkenlerine güven (kurumsal proxy için; yerel LAN LLM için genelde kapalı)
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || saving}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Yenile
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
