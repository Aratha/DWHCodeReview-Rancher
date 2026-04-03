import type { ReactNode } from 'react'

type Props = {
  id?: string
  /** hideHeading false iken gösterilir */
  title?: string
  subtitle?: string
  /** false ise başlık satırı (toggle) yok; içerik her zaman görünür */
  hideHeading?: boolean
  open?: boolean
  onToggle?: () => void
  children: ReactNode
  /** Kapalıyken içerik yüksekliği yer kaplamasın */
  className?: string
  /**
   * Açıkken üst düzey flex kolonunda kalan dikey alanı doldurur (nesne listesi / SQL alanı).
   * Üst öğe `flex flex-col min-h-0` ile sarılmalıdır.
   */
  fillHeight?: boolean
  /** Başlık satırı (toggle) için ek sınıflar — canlı durum renkleri vb. */
  buttonClassName?: string
  /** `compact`: nesne adı vb. daha küçük tipografi (canlı inceleme paneli). */
  headingSize?: 'default' | 'compact'
}

export function AccordionSection({
  id,
  title = '',
  subtitle,
  hideHeading = false,
  open = false,
  onToggle,
  children,
  className = '',
  fillHeight = false,
  buttonClassName = '',
  headingSize = 'default',
}: Props) {
  const panelId = id ? `${id}-panel` : undefined
  const headingId = id ? `${id}-heading` : undefined
  const expanded = hideHeading || open
  const heightClasses = fillHeight
    ? expanded
      ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
      : 'shrink-0'
    : ''
  return (
    <div
      className={`overflow-hidden rounded-xl border border-zinc-300 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] ${heightClasses} ${className}`}
    >
      {!hideHeading && onToggle ? (
        <button
          type="button"
          id={headingId}
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className={`relative z-0 flex w-full items-center justify-between gap-2 text-left transition hover:bg-zinc-100/90 dark:hover:bg-zinc-800/90 ${
            headingSize === 'compact' ? 'px-3 py-2.5' : 'gap-3 px-4 py-3'
          } ${buttonClassName}`}
        >
          <span className="min-w-0">
            <span
              className={
                headingSize === 'compact'
                  ? 'text-xs font-semibold leading-snug text-zinc-900 dark:text-zinc-100'
                  : 'text-base font-semibold text-zinc-900 dark:text-zinc-100'
              }
            >
              {headingSize === 'compact' ? (
                <span className="font-mono">{title}</span>
              ) : (
                title
              )}
            </span>
            {subtitle ? (
              <span
                className={
                  headingSize === 'compact'
                    ? 'ml-1.5 text-xs font-normal text-zinc-500 dark:text-zinc-500'
                    : 'ml-2 text-sm font-normal text-zinc-600 dark:text-zinc-400'
                }
              >
                {subtitle}
              </span>
            ) : null}
          </span>
          <span
            className={`shrink-0 tabular-nums text-zinc-500 dark:text-zinc-500 ${
              headingSize === 'compact' ? 'text-xs' : ''
            }`}
            aria-hidden
          >
            {open ? '▾' : '▸'}
          </span>
        </button>
      ) : null}
      {expanded ? (
        <div
          id={panelId}
          role="region"
          aria-labelledby={hideHeading ? undefined : headingId}
          aria-label={hideHeading ? title || 'İçerik' : undefined}
          className={`relative z-10 ${
            hideHeading
              ? ''
              : 'border-t border-zinc-200/90 dark:border-zinc-700/80'
          } ${
            fillHeight
              ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
              : 'flex min-h-0 flex-col'
          }`}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}
