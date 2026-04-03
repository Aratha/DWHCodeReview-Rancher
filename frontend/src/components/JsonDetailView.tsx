import { useMemo } from 'react'

/** String değerlerde JSON gibi görünen içeriği parse edip nesneye çevirir (görüntü için). */
function deepParseJsonLikeStrings(value: unknown, depth = 0): unknown {
  if (depth > 32) return value
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return value
  }
  if (typeof value === 'string') {
    const s = value.trim()
    if (
      s.length >= 2 &&
      ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']')))
    ) {
      try {
        const parsed: unknown = JSON.parse(s)
        return deepParseJsonLikeStrings(parsed, depth + 1)
      } catch {
        return value
      }
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map((v) => deepParseJsonLikeStrings(v, depth + 1))
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(o)) {
      out[k] = deepParseJsonLikeStrings(v, depth + 1)
    }
    return out
  }
  return value
}

export function formatLogEntryAsPrettyJson(entry: Record<string, unknown>): string {
  const expanded = deepParseJsonLikeStrings(entry)
  return JSON.stringify(expanded, null, 2)
}

type TokenKind = 'ws' | 'punct' | 'key' | 'str' | 'num' | 'kw'

function tokenizeJsonDisplay(input: string): Array<{ kind: TokenKind; text: string }> {
  const tokens: Array<{ kind: TokenKind; text: string }> = []
  let i = 0
  const n = input.length

  while (i < n) {
    const c = input[i]
    if (c === '\n' || c === '\r' || c === ' ' || c === '\t') {
      let start = i
      while (i < n && /[\n\r \t]/.test(input[i])) i++
      tokens.push({ kind: 'ws', text: input.slice(start, i) })
      continue
    }
    if (c === '"') {
      let start = i
      i++
      while (i < n) {
        if (input[i] === '\\') {
          i++
          if (i < n && input[i] === 'u') {
            i++
            let hx = 0
            while (hx < 4 && i < n && /[0-9a-fA-F]/.test(input[i])) {
              i++
              hx++
            }
          } else if (i < n) {
            i++
          }
          continue
        }
        if (input[i] === '"') {
          i++
          break
        }
        i++
      }
      const raw = input.slice(start, i)
      let j = i
      while (j < n && /\s/.test(input[j])) j++
      const isKey = j < n && input[j] === ':'
      tokens.push({ kind: isKey ? 'key' : 'str', text: raw })
      i = j
      continue
    }
    if (c === '-' || (c >= '0' && c <= '9')) {
      let start = i
      i++
      while (i < n && /[0-9.eE+-]/.test(input[i])) i++
      tokens.push({ kind: 'num', text: input.slice(start, i) })
      continue
    }
    if (input.startsWith('true', i)) {
      tokens.push({ kind: 'kw', text: 'true' })
      i += 4
      continue
    }
    if (input.startsWith('false', i)) {
      tokens.push({ kind: 'kw', text: 'false' })
      i += 5
      continue
    }
    if (input.startsWith('null', i)) {
      tokens.push({ kind: 'kw', text: 'null' })
      i += 4
      continue
    }
    tokens.push({ kind: 'punct', text: c })
    i++
  }
  return tokens
}

const kindClass: Record<TokenKind, string> = {
  ws: '',
  punct: 'text-zinc-600 dark:text-zinc-400',
  key: 'text-sky-700 dark:text-sky-300',
  str: 'text-emerald-800 dark:text-emerald-300',
  num: 'text-violet-700 dark:text-violet-300',
  kw: 'text-amber-700 dark:text-amber-300',
}

export function JsonDetailView({ jsonText }: { jsonText: string }) {
  const tokens = useMemo(() => tokenizeJsonDisplay(jsonText), [jsonText])
  return (
    <pre
      className="whitespace-pre-wrap break-words rounded-md border border-zinc-200 bg-zinc-50 p-3 font-mono text-[11px] leading-relaxed text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
      tabIndex={0}
    >
      {tokens.map((t, idx) =>
        t.kind === 'ws' ? (
          <span key={idx}>{t.text}</span>
        ) : (
          <span key={idx} className={kindClass[t.kind]}>
            {t.text}
          </span>
        ),
      )}
    </pre>
  )
}
