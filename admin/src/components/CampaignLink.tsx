import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { campaignQuizUrl } from '@shared/captadorCampaign'

export function CampaignLink({
  slug,
  compact = false,
}: {
  slug: string
  compact?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const url = campaignQuizUrl(slug)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className={compact ? '' : 'space-y-1'}>
      {!compact && (
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
          Link da campanha
        </p>
      )}
      <button
        type="button"
        onClick={() => void copy()}
        title="Copiar link"
        className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-soft px-2 py-1 text-left text-xs font-semibold hover:border-brand"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 shrink-0 text-ok" />
        ) : (
          <Copy className="w-3.5 h-3.5 shrink-0 text-muted" />
        )}
        <span className="truncate">{url.replace(/^https:\/\//, '')}</span>
      </button>
    </div>
  )
}
