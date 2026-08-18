import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
import {
  Camera,
  Link2,
  Unlink,
  RefreshCw,
  Upload,
  Calendar as CalendarIcon,
  List,
  Image as ImageIcon,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Copy,
  Ban,
  Play,
  Trash2,
  Layers,
  Megaphone,
  ImagePlus,
  Clapperboard,
  Settings2,
} from 'lucide-react'
import {
  FORMAT_LABELS,
  STATUS_LABELS,
  DEFAULT_TIMEZONE,
  CAPTION_MAX,
  zonedLocalToUtcIso,
  type ContentFormat,
  type DistributionMode,
} from '@shared/marketing'
import type { AuthUser } from '../lib/api'
import { canManageMarketingConnection, hasPermission, normalizeRole } from '../lib/roles'
import {
  contentAction,
  createBatch,
  createContent,
  deleteContent,
  deleteMedia,
  disconnectInstagram,
  fetchCalendar,
  fetchContent,
  fetchContentDetail,
  fetchMarketingAccount,
  fetchMarketingSummary,
  fetchMediaLibrary,
  previewSchedule,
  saveMetaConfig,
  startInstagramOAuth,
  syncInstagramAccount,
  updateContent,
  uploadMedia,
  type ContentListItem,
  type MarketingAccountResponse,
  type MediaAsset,
} from '../lib/marketingApi'

type Tab = 'agenda' | 'fila' | 'biblioteca'
type ComposerPreset = {
  format?: ContentFormat
  mode?: 'now' | 'schedule'
  open?: boolean
}

const QUEUE_FILTERS = [
  { id: 'ALL', label: 'Todos' },
  { id: 'SCHEDULED', label: 'Agendados' },
  { id: 'PROCESSING', label: 'Processando' },
  { id: 'PUBLISHED', label: 'Publicados' },
  { id: 'FAILED', label: 'Falhas' },
  { id: 'DRAFT', label: 'Rascunhos' },
  { id: 'CANCELLED', label: 'Cancelados' },
] as const

function formatLocal(iso: string | null | undefined, tz = DEFAULT_TIMEZONE) {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: tz,
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function statusTone(status: string) {
  if (status === 'PUBLISHED') return 'bg-green-50 text-ok border-green-100'
  if (status.startsWith('FAILED')) return 'bg-red-50 text-bad border-red-100'
  if (status === 'CANCELLED' || status === 'PAUSED')
    return 'bg-zinc-100 text-zinc-600 border-zinc-200'
  if (['QUEUED', 'PREPARING', 'PROCESSING_MEDIA', 'PUBLISHING'].includes(status))
    return 'bg-amber-50 text-amber-700 border-amber-100'
  if (status === 'SCHEDULED') return 'bg-soft text-brand border-[#ffe0c2]'
  return 'bg-white text-muted border-line'
}

const STATUS_ACCOUNT: Record<string, string> = {
  connected: 'Conectado',
  expired: 'Token expirado',
  revoked: 'Revogado',
  missing_permissions: 'Permissões incompletas',
  disconnected: 'Desconectado',
}

export function Marketing({ user }: { user: AuthUser }) {
  const role = normalizeRole(user.role)
  const extras = user.permissionExtras || []
  const canConnect = canManageMarketingConnection(role, extras)
  const canPublish = hasPermission(role, 'marketing.publish', extras)
  const [tab, setTab] = useState<Tab>('agenda')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [accountData, setAccountData] =
    useState<MarketingAccountResponse | null>(null)
  const [summary, setSummary] = useState({
    today: 0,
    upcoming: 0,
    drafts: 0,
    processing: 0,
    errors: 0,
    published: 0,
  })
  const [queueStatus, setQueueStatus] = useState<string>('ALL')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<ContentListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [media, setMedia] = useState<MediaAsset[]>([])
  const [calendarItems, setCalendarItems] = useState<ContentListItem[]>([])
  const [calView, setCalView] = useState<'month' | 'week' | 'day'>('week')
  const [composer, setComposer] = useState<ComposerPreset>({})
  const [batchOpen, setBatchOpen] = useState<false | 'mixed' | 'stories'>(
    false,
  )
  const [detailId, setDetailId] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 3500)
  }

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [acc, sum, content, lib] = await Promise.all([
        fetchMarketingAccount(),
        fetchMarketingSummary(),
        fetchContent({ status: queueStatus, q: query, page, pageSize: 20 }),
        fetchMediaLibrary(),
      ])
      setAccountData(acc)
      setSummary(sum.summary)
      setItems(content.items)
      setTotal(content.total)
      setMedia(lib)

      const now = new Date()
      const from = new Date(now)
      from.setDate(from.getDate() - 7)
      const to = new Date(now)
      to.setDate(to.getDate() + 21)
      const cal = await fetchCalendar(from.toISOString(), to.toISOString())
      setCalendarItems(cal.items)
    } catch (e) {
      if (String(e).includes('unauthorized')) throw e
      setError(e instanceof Error ? e.message : 'Falha ao carregar Marketing')
    } finally {
      setLoading(false)
    }
  }, [page, query, queueStatus])

  const [showMetaSetup, setShowMetaSetup] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    let ig = params.get('ig')
    let reason = params.get('reason') || ''
    try {
      const stored = sessionStorage.getItem('ig_oauth_return')
      if (stored) {
        const parsed = JSON.parse(stored) as {
          ig?: string
          reason?: string
          at?: number
        }
        if (parsed.ig && (!ig || Date.now() - (parsed.at || 0) < 15 * 60 * 1000)) {
          ig = parsed.ig
          reason = parsed.reason || reason
        }
        sessionStorage.removeItem('ig_oauth_return')
      }
    } catch {
      /* ignore */
    }

    if (ig === 'connected') {
      showToast('Instagram conectado com sucesso')
      void reload().catch(() => {})
    }
    if (ig === 'error') {
      const decoded = decodeURIComponent(reason || 'erro')
      const invalidApp = /invalid platform app/i.test(decoded)
      const invalidRedirect = /invalid redirect_uri/i.test(decoded)
      if (invalidApp) {
        setShowMetaSetup(true)
        setError(
          'App inválido para Instagram Login. No painel da Meta use o Instagram App ID e Instagram App Secret (em Instagram → API setup with Instagram login → Business login settings), não o App ID do Facebook/Pixel. Salve de novo e tente conectar.',
        )
      } else if (invalidRedirect) {
        setShowMetaSetup(true)
        setError(
          'Redirect URI inválida. Na Meta, em Instagram → API setup with Instagram login → Business login settings → OAuth redirect URIs, cadastre exatamente a URL que aparece no formulário abaixo (sem barra no final) e salve. Depois tente conectar de novo.',
        )
      } else if (decoded === 'state') {
        setError(
          'A sessão do login Instagram expirou ou falhou no retorno. Clique em Conectar Instagram de novo (na mesma aba do painel).',
        )
      } else {
        setError(`Falha ao conectar Instagram: ${decoded}`)
      }
    }
    if (ig) {
      params.delete('ig')
      params.delete('reason')
      const next = `${window.location.pathname}?section=marketing${params.toString() ? `&${params.toString()}` : ''}`
      window.history.replaceState({}, '', next)
    }
  }, [reload])

  useEffect(() => {
    void reload().catch(() => {})
    const id = window.setInterval(() => void reload().catch(() => {}), 20000)
    return () => window.clearInterval(id)
  }, [reload])

  const account = accountData?.account
  const config = accountData?.config
  const connected = account?.status === 'connected'
  const ready = Boolean(config?.configured && connected)
  const tokenMsLeft = account?.tokenExpiresAt
    ? new Date(account.tokenExpiresAt).getTime() - Date.now()
    : null
  const tokenShortLived =
    tokenMsLeft != null && tokenMsLeft > 0 && tokenMsLeft < 2 * 24 * 60 * 60 * 1000
  const tokenExpired =
    account?.status === 'expired' ||
    (tokenMsLeft != null && tokenMsLeft <= 0)
  const needsReconnect = Boolean(tokenExpired || tokenShortLived)

  const openComposer = (preset: ComposerPreset) => {
    setComposer({ ...preset, open: true })
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 rounded-2xl bg-ink text-white px-4 py-3 text-sm font-semibold shadow-lg"
        >
          {toast}
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-red-50 text-bad px-4 py-3 text-sm font-semibold">
          {error}
        </div>
      )}

      {/* Conexão Instagram */}
      <section className="rounded-3xl bg-white border border-line p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center gap-5 justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-soft flex items-center justify-center overflow-hidden shrink-0">
              {account?.profilePictureUrl ? (
                <img
                  src={account.profilePictureUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <Camera className="w-7 h-7 text-brand" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold truncate">
                {account?.username
                  ? `@${account.username}`
                  : 'Conecte o Instagram'}
              </h2>
              <p className="text-sm text-muted font-medium">
                {account
                  ? `${STATUS_ACCOUNT[account.status] || account.status} · ${account.accountType}`
                  : 'Conta profissional para posts, stories e agendamentos'}
              </p>
              <p className="text-xs text-muted mt-1">
                Fuso {accountData?.timezone || DEFAULT_TIMEZONE}
                {account?.lastSyncedAt
                  ? ` · sync ${formatLocal(account.lastSyncedAt)}`
                  : ''}
                {account?.tokenExpiresAt
                  ? ` · token até ${formatLocal(account.tokenExpiresAt)}`
                  : ''}
              </p>
              {config?.lastOAuthError && (
                <p className="text-xs text-bad font-semibold mt-1">
                  Último aviso OAuth: {config.lastOAuthError.reason}
                </p>
              )}
              {config && config.hasAppSecret === false && (
                <p className="text-xs text-bad font-semibold mt-1">
                  App Secret não carregou — abra App Meta / Instagram e salve de
                  novo.
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canConnect &&
              config?.configured &&
              (!account || account.status === 'disconnected') && (
                <button
                  type="button"
                  className="btn-brand inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold"
                  onClick={() =>
                    void startInstagramOAuth().catch((e) => setError(e.message))
                  }
                >
                  <Link2 className="w-4 h-4" />
                  Conectar Instagram
                </button>
              )}
            {canConnect &&
              account &&
              account.status !== 'disconnected' &&
              (needsReconnect ||
                ['expired', 'revoked', 'missing_permissions'].includes(
                  account.status,
                )) && (
                <button
                  type="button"
                  className="btn-brand inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold"
                  onClick={() =>
                    void startInstagramOAuth().catch((e) => setError(e.message))
                  }
                >
                  <RefreshCw className="w-4 h-4" />
                  Reconectar
                </button>
              )}
            {connected && !tokenExpired && (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border border-line bg-white hover:bg-soft"
                onClick={() =>
                  void syncInstagramAccount()
                    .then(async (r) => {
                      await reload()
                      if (r.warnings?.length) {
                        setError(r.warnings.join(' · '))
                        showToast('Sincronizado com avisos')
                      } else {
                        showToast('Conta sincronizada')
                      }
                    })
                    .catch((e) => setError(e.message))
                }
              >
                <RefreshCw className="w-4 h-4" />
                Sincronizar
              </button>
            )}
            {canConnect && account && account.status !== 'disconnected' && (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border border-red-100 text-bad bg-red-50"
                onClick={() => {
                  if (
                    !window.confirm(
                      'Desconectar Instagram? Agendamentos serão pausados.',
                    )
                  )
                    return
                  void disconnectInstagram()
                    .then(() => reload())
                    .then(() => showToast('Conta desconectada'))
                    .catch((e) => setError(e.message))
                }}
              >
                <Unlink className="w-4 h-4" />
                Desconectar
              </button>
            )}
            {canConnect && (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border border-line bg-white hover:bg-soft"
                onClick={() => setShowMetaSetup((v) => !v)}
              >
                <Settings2 className="w-4 h-4" />
                {showMetaSetup ? 'Ocultar app Meta' : 'App Meta / Instagram'}
              </button>
            )}
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border border-line bg-white hover:bg-soft"
              onClick={() => void reload()}
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
              />
              Atualizar
            </button>
          </div>
        </div>

        {config && canConnect && (showMetaSetup || !config.configured) && (
          <MetaSetupForm
            redirectUri={
              config.oauthRedirectToRegister || config.redirectUri || ''
            }
            hint={config.setupHint}
            missing={config.missing}
            appIdMasked={config.appIdMasked}
            onSaved={async () => {
              setShowMetaSetup(false)
              showToast('Instagram App salvo — agora clique em Conectar Instagram')
              await reload()
            }}
            onError={setError}
          />
        )}
      </section>

      {needsReconnect && account && account.status !== 'disconnected' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 font-medium flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="flex gap-2 items-start">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>
              {tokenExpired
                ? 'Token do Instagram expirou. Reconecte para publicar e agendar.'
                : 'Token ainda é de curta duração (~1h). A Meta está bloqueando a troca para 60 dias neste app — em developers.facebook.com peça Advanced Access (instagram_business_basic + content_publish), App Review e verificação do negócio. Enquanto isso, reconecte antes de cada lote longo.'}
              {account.username?.startsWith('user_')
                ? ' O @usuario também fica bloqueado até o Advanced Access; publicar/agendar pode funcionar mesmo assim.'
                : ''}
            </p>
          </div>
          {canConnect && (
            <button
              type="button"
              className="btn-brand shrink-0 rounded-xl px-4 py-2 text-sm font-bold"
              onClick={() =>
                void startInstagramOAuth().catch((e) => setError(e.message))
              }
            >
              Reconectar Instagram
            </button>
          )}
        </div>
      )}

      {/* Ações principais */}
      <section className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <ActionCard
          title="Postar publicação"
          desc="Feed agora com legenda"
          icon={ImagePlus}
          disabled={!ready || !canPublish || tokenExpired}
          onClick={() => openComposer({ format: 'FEED_IMAGE', mode: 'now' })}
        />
        <ActionCard
          title="Postar story"
          desc="Story agora"
          icon={Clapperboard}
          disabled={!ready || !canPublish || tokenExpired}
          onClick={() => openComposer({ format: 'STORY_IMAGE', mode: 'now' })}
        />
        <ActionCard
          title="Agendar post"
          desc="Feed/Reel com horário"
          icon={Clock}
          disabled={!ready || !canPublish || tokenExpired}
          onClick={() => openComposer({ format: 'FEED_IMAGE', mode: 'schedule' })}
        />
        <ActionCard
          title="Agendar story"
          desc="Story com horário"
          icon={CalendarIcon}
          disabled={!ready || !canPublish || tokenExpired}
          onClick={() =>
            openComposer({ format: 'STORY_IMAGE', mode: 'schedule' })
          }
        />
        <ActionCard
          title="Vários posts"
          desc="Lote com legenda por item"
          icon={Layers}
          disabled={!ready || !canPublish || tokenExpired}
          onClick={() => setBatchOpen('mixed')}
        />
        <ActionCard
          title="Vários stories"
          desc="Lote de stories + horários"
          icon={Megaphone}
          disabled={!ready || !canPublish || tokenExpired}
          onClick={() => setBatchOpen('stories')}
        />
      </section>

      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          ['Hoje', summary.today],
          ['Próximas', summary.upcoming],
          ['Rascunhos', summary.drafts],
          ['Processando', summary.processing],
          ['Erros', summary.errors],
          ['Publicados', summary.published],
        ].map(([label, value]) => (
          <article
            key={String(label)}
            className="rounded-2xl bg-white border border-line p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {label}
            </p>
            <p className="text-2xl font-extrabold mt-1">{value}</p>
          </article>
        ))}
      </section>

      {!ready && (
        <div className="rounded-2xl border border-dashed border-line bg-white p-8 text-center">
          <p className="font-extrabold text-lg">
            {config?.configured
              ? 'Conecte o Instagram para começar'
              : 'Configure o App Meta e depois conecte o Instagram'}
          </p>
          <p className="text-sm text-muted mt-2">
            Depois disso você posta, agenda stories e publica vários no mesmo dia.
          </p>
        </div>
      )}

      {ready && (
        <>
          <div className="flex flex-wrap gap-2 border-b border-line pb-3">
            {(
              [
                ['agenda', CalendarIcon, 'Calendário'],
                ['fila', List, 'Fila'],
                ['biblioteca', ImageIcon, 'Biblioteca'],
              ] as const
            ).map(([id, Icon, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold ${
                  tab === id ? 'bg-soft text-brand' : 'text-muted hover:bg-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {tab === 'agenda' && (
            <CalendarView
              view={calView}
              onView={setCalView}
              items={calendarItems}
              onOpen={setDetailId}
              onReschedule={async (id, scheduledAt) => {
                try {
                  await updateContent(id, { scheduledAt })
                  showToast('Reagendado')
                  await reload()
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Falha ao reagendar')
                }
              }}
            />
          )}

          {tab === 'fila' && (
            <QueueView
              filters={QUEUE_FILTERS}
              status={queueStatus}
              onStatus={setQueueStatus}
              query={query}
              onQuery={setQuery}
              items={items}
              total={total}
              page={page}
              onPage={setPage}
              loading={loading}
              onOpen={setDetailId}
              onAction={async (id, action) => {
                try {
                  await contentAction(id, action)
                  showToast('Ação concluída')
                  await reload()
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Falha')
                }
              }}
              onDelete={async (id) => {
                if (!window.confirm('Excluir este item?')) return
                await deleteContent(id)
                await reload()
              }}
            />
          )}

          {tab === 'biblioteca' && (
            <LibraryView
              media={media}
              onUpload={async (files) => {
                for (const file of files) await uploadMedia(file)
                showToast('Upload concluído')
                await reload()
              }}
              onDelete={async (id) => {
                try {
                  await deleteMedia(id)
                  await reload()
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : 'Não foi possível excluir',
                  )
                }
              }}
            />
          )}
        </>
      )}

      {composer.open && (
        <ComposerModal
          media={media}
          initialFormat={composer.format || 'FEED_IMAGE'}
          initialMode={composer.mode || 'now'}
          onClose={() => setComposer({})}
          onUploaded={async () => setMedia(await fetchMediaLibrary())}
          onSaved={async () => {
            setComposer({})
            showToast('Pronto')
            await reload()
          }}
        />
      )}

      {batchOpen && (
        <BatchModal
          mode={batchOpen}
          onClose={() => setBatchOpen(false)}
          onDone={async () => {
            setBatchOpen(false)
            showToast('Conteúdos agendados')
            setTab('agenda')
            await reload()
          }}
        />
      )}

      {detailId && (
        <DetailModal
          id={detailId}
          onClose={() => setDetailId(null)}
          onChanged={reload}
        />
      )}
    </div>
  )
}

function ActionCard({
  title,
  desc,
  icon: Icon,
  disabled,
  onClick,
}: {
  title: string
  desc: string
  icon: typeof Megaphone
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-2xl bg-white border border-line p-4 text-left hover:border-brand hover:bg-soft transition-colors disabled:opacity-45 disabled:hover:border-line disabled:hover:bg-white"
    >
      <Icon className="w-6 h-6 text-brand" />
      <p className="font-extrabold mt-3">{title}</p>
      <p className="text-xs text-muted font-medium mt-0.5">{desc}</p>
    </button>
  )
}

function MetaSetupForm({
  redirectUri,
  hint,
  missing,
  appIdMasked,
  onSaved,
  onError,
}: {
  redirectUri: string
  hint?: string
  missing: string[]
  appIdMasked?: string | null
  onSaved: () => Promise<void>
  onError: (msg: string) => void
}) {
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const redirect =
    redirectUri ||
    'https://alpha-recupera-api.alpharecupera.workers.dev/oauth/instagram/callback'

  return (
    <div className="mt-4 rounded-2xl bg-amber-50 border border-amber-100 px-4 py-4 space-y-3">
      <p className="text-sm text-amber-900 font-semibold flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        Configure o Instagram App ID (não o App ID do Facebook/Pixel)
        {missing.length > 0 ? ` · faltando: ${missing.join(', ')}` : ''}
      </p>
      <p className="text-xs text-amber-800 font-medium">{hint}</p>
      {appIdMasked && (
        <p className="text-xs text-amber-900 font-semibold">
          App atual salvo: {appIdMasked} — se deu “Invalid platform app”, troque
          pelo Instagram App ID correto abaixo.
        </p>
      )}
      <ol className="text-xs text-amber-900 font-medium list-decimal pl-4 space-y-1">
        <li>
          Abra{' '}
          <a
            className="underline font-bold"
            href="https://developers.facebook.com/apps/"
            target="_blank"
            rel="noreferrer"
          >
            developers.facebook.com/apps
          </a>{' '}
          → app tipo Business com produto Instagram
        </li>
        <li>
          Vá em <strong>Instagram → API setup with Instagram login → Business
          login settings</strong>
        </li>
        <li>
          Copie o <strong>Instagram App ID</strong> e o{' '}
          <strong>Instagram App Secret</strong>
        </li>
        <li>
          Em <strong>OAuth redirect URIs</strong> (Business login settings do
          Instagram — não o do Facebook Login), cole exatamente:
          <div className="mt-1 flex flex-col sm:flex-row gap-2">
            <code className="flex-1 bg-white/80 rounded-lg px-2 py-1 break-all select-all">
              {redirect}
            </code>
            <button
              type="button"
              className="shrink-0 rounded-lg bg-white border border-amber-200 px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-100"
              onClick={() => {
                void navigator.clipboard.writeText(redirect).then(() => {
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 1500)
                })
              }}
            >
              {copied ? 'Copiada!' : 'Copiar URI'}
            </button>
          </div>
          <span className="block mt-1 text-amber-800">
            Tem que ser idêntica: https, sem espaço, sem / no final.
          </span>
        </li>
        <li>Salve na Meta, salve aqui e clique em Conectar Instagram</li>
      </ol>
      <div className="grid sm:grid-cols-2 gap-2">
        <label className="text-xs font-bold text-amber-950">
          Instagram App ID
          <input
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder="Só o Instagram App ID"
            className="mt-1 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-bold text-amber-950">
          Instagram App Secret
          <input
            type="password"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            placeholder="Cole o Instagram App Secret"
            className="mt-1 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>
      <button
        type="button"
        disabled={saving || !appId || !appSecret}
        className="btn-brand rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-60"
        onClick={() => {
          setSaving(true)
          void saveMetaConfig({ appId, appSecret, redirectUri: redirect })
            .then(() => onSaved())
            .catch((e) =>
              onError(e instanceof Error ? e.message : 'Falha ao salvar'),
            )
            .finally(() => setSaving(false))
        }}
      >
        {saving ? 'Salvando…' : 'Salvar Instagram App'}
      </button>
    </div>
  )
}

function QueueView({
  filters,
  status,
  onStatus,
  query,
  onQuery,
  items,
  total,
  page,
  onPage,
  loading,
  onOpen,
  onAction,
  onDelete,
}: {
  filters: typeof QUEUE_FILTERS
  status: string
  onStatus: (s: string) => void
  query: string
  onQuery: (s: string) => void
  items: ContentListItem[]
  total: number
  page: number
  onPage: (n: number) => void
  loading: boolean
  onOpen: (id: string) => void
  onAction: (
    id: string,
    action: 'duplicate' | 'cancel' | 'retry' | 'publish',
  ) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => {
              onStatus(f.id)
              onPage(1)
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
              status === f.id
                ? 'bg-soft text-brand border-[#ffe0c2]'
                : 'bg-white text-muted border-line'
            }`}
          >
            {f.label}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => {
            onQuery(e.target.value)
            onPage(1)
          }}
          placeholder="Buscar…"
          className="ml-auto rounded-xl border border-line px-3 py-1.5 text-sm min-w-[180px]"
          aria-label="Buscar na fila"
        />
      </div>

      {loading && items.length === 0 ? (
        <p className="text-muted font-medium flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </p>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line bg-white p-10 text-center">
          <p className="font-bold">Nada na fila</p>
          <p className="text-sm text-muted mt-1">
            Use Postar, Story, Agendar ou Vários no dia.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const thumb =
              item.mediaDetails?.[0]?.thumbnailUrl ||
              item.mediaDetails?.[0]?.publicUrl
            return (
              <article
                key={item.id}
                className="rounded-2xl bg-white border border-line p-3 sm:p-4 flex gap-3"
              >
                <button
                  type="button"
                  onClick={() => onOpen(item.id)}
                  className="w-16 h-16 rounded-xl bg-soft overflow-hidden shrink-0"
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="w-6 h-6 m-auto mt-5 text-brand" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-brand">
                      {FORMAT_LABELS[item.format]}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${statusTone(item.status)}`}
                    >
                      {STATUS_LABELS[item.status]}
                    </span>
                    <span className="text-xs text-muted">
                      {formatLocal(item.scheduledAt || item.publishedAt)}
                    </span>
                  </div>
                  <p className="text-sm font-medium truncate mt-1">
                    {item.caption || item.internalNote || '(sem legenda)'}
                  </p>
                  {item.lastErrorMessage && (
                    <p className="text-xs text-bad mt-1">{item.lastErrorMessage}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <IconBtn
                    label="Duplicar"
                    onClick={() => void onAction(item.id, 'duplicate')}
                  >
                    <Copy className="w-4 h-4" />
                  </IconBtn>
                  {item.status === 'FAILED_RETRYABLE' && (
                    <IconBtn
                      label="Tentar novamente"
                      onClick={() => void onAction(item.id, 'retry')}
                    >
                      <Play className="w-4 h-4" />
                    </IconBtn>
                  )}
                  {['DRAFT', 'SCHEDULED', 'PAUSED'].includes(item.status) && (
                    <IconBtn
                      label="Publicar agora"
                      onClick={() => void onAction(item.id, 'publish')}
                    >
                      <Megaphone className="w-4 h-4" />
                    </IconBtn>
                  )}
                  {['DRAFT', 'SCHEDULED', 'QUEUED', 'PAUSED', 'FAILED_RETRYABLE'].includes(
                    item.status,
                  ) && (
                    <IconBtn
                      label="Cancelar"
                      onClick={() => void onAction(item.id, 'cancel')}
                    >
                      <Ban className="w-4 h-4" />
                    </IconBtn>
                  )}
                  {['DRAFT', 'CANCELLED'].includes(item.status) && (
                    <IconBtn
                      label="Excluir"
                      onClick={() => void onDelete(item.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </IconBtn>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {total > 20 && (
        <div className="flex items-center justify-between text-sm font-semibold">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            className="px-3 py-1.5 rounded-lg border border-line disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-muted">
            Página {page} · {total} itens
          </span>
          <button
            type="button"
            disabled={page * 20 >= total}
            onClick={() => onPage(page + 1)}
            className="px-3 py-1.5 rounded-lg border border-line disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      )}
    </section>
  )
}

function IconBtn({
  children,
  label,
  onClick,
}: {
  children: import('react').ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="p-2 rounded-lg border border-line hover:bg-soft"
    >
      {children}
    </button>
  )
}

function CalendarView({
  view,
  onView,
  items,
  onOpen,
  onReschedule,
}: {
  view: 'month' | 'week' | 'day'
  onView: (v: 'month' | 'week' | 'day') => void
  items: ContentListItem[]
  onOpen: (id: string) => void
  onReschedule: (id: string, scheduledAt: string) => Promise<void>
}) {
  const [dragId, setDragId] = useState<string | null>(null)

  const days = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    if (view === 'day') return [start]
    const count = view === 'week' ? 7 : 28
    if (view === 'week') {
      const day = start.getDay()
      start.setDate(start.getDate() - day)
    }
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [view])

  const onDrop = (day: Date, e: DragEvent) => {
    e.preventDefault()
    if (!dragId) return
    const item = items.find((i) => i.id === dragId)
    if (!item?.scheduledAt) return
    const prev = new Date(item.scheduledAt)
    const next = new Date(day)
    next.setHours(prev.getHours(), prev.getMinutes(), 0, 0)
    if (
      !window.confirm(
        `Reagendar para ${next.toLocaleString('pt-BR', { timeZone: DEFAULT_TIMEZONE })}?`,
      )
    ) {
      setDragId(null)
      return
    }
    void onReschedule(dragId, next.toISOString())
    setDragId(null)
  }

  return (
    <section className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {(['day', 'week', 'month'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onView(v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
              view === v ? 'bg-soft text-brand' : 'bg-white border border-line'
            }`}
          >
            {v === 'day' ? 'Dia' : v === 'week' ? 'Semana' : 'Mês'}
          </button>
        ))}
        <span className="text-xs text-muted font-medium ml-auto self-center">
          Arraste para reagendar · {DEFAULT_TIMEZONE}
        </span>
      </div>
      <div
        className={`grid gap-2 ${
          view === 'day'
            ? 'grid-cols-1'
            : 'grid-cols-2 md:grid-cols-7'
        }`}
      >
        {days.map((day) => {
          const dayKey = new Intl.DateTimeFormat('en-CA', {
            timeZone: DEFAULT_TIMEZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(day)
          const dayItems = items.filter((it) => {
            if (!it.scheduledAt) return false
            const d = new Intl.DateTimeFormat('en-CA', {
              timeZone: DEFAULT_TIMEZONE,
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }).format(new Date(it.scheduledAt))
            return d === dayKey
          })
          return (
            <div
              key={dayKey}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(day, e)}
              className="min-h-[120px] rounded-2xl bg-white border border-line p-2"
            >
              <p className="text-[11px] font-bold text-muted mb-2">
                {day.toLocaleDateString('pt-BR', {
                  weekday: 'short',
                  day: '2-digit',
                  month: 'short',
                })}
              </p>
              <div className="space-y-1">
                {dayItems.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    draggable
                    onDragStart={() => setDragId(it.id)}
                    onClick={() => onOpen(it.id)}
                    className={`w-full text-left rounded-lg px-2 py-1.5 text-[11px] font-semibold border ${statusTone(it.status)}`}
                  >
                    <span className="block truncate">
                      {FORMAT_LABELS[it.format].split(' ')[0]}{' '}
                      {formatLocal(it.scheduledAt).split(', ')[1] ||
                        formatLocal(it.scheduledAt)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function LibraryView({
  media,
  onUpload,
  onDelete,
}: {
  media: MediaAsset[]
  onUpload: (files: File[]) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  return (
    <section className="space-y-4">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const files = [...e.dataTransfer.files]
          if (!files.length) return
          setBusy(true)
          void onUpload(files).finally(() => setBusy(false))
        }}
        className="rounded-3xl border border-dashed border-line bg-white p-8 text-center"
      >
        <Upload className="w-8 h-8 text-brand mx-auto" />
        <p className="font-bold mt-2">Arraste imagens ou vídeos</p>
        <label className="inline-flex mt-4 btn-brand rounded-xl px-4 py-2.5 text-sm font-bold cursor-pointer">
          {busy ? 'Enviando…' : 'Selecionar arquivos'}
          <input
            type="file"
            accept="image/jpeg,image/png,video/mp4,video/quicktime"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = [...(e.target.files || [])]
              if (!files.length) return
              setBusy(true)
              void onUpload(files).finally(() => setBusy(false))
            }}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        {media.map((m) => (
          <article
            key={m.id}
            className="rounded-2xl bg-white border border-line overflow-hidden"
          >
            <div className="aspect-square bg-soft">
              {m.kind === 'image' ? (
                <img
                  src={m.thumbnailUrl || m.publicUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted">
                  VÍDEO
                </div>
              )}
            </div>
            <div className="p-2">
              <button
                type="button"
                className="text-[11px] font-bold text-bad"
                onClick={() => void onDelete(m.id)}
              >
                Excluir
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function ComposerModal({
  media,
  initialFormat,
  initialMode,
  onClose,
  onUploaded,
  onSaved,
}: {
  media: MediaAsset[]
  initialFormat: ContentFormat
  initialMode: 'now' | 'schedule'
  onClose: () => void
  onUploaded: () => Promise<void>
  onSaved: () => Promise<void>
}) {
  const [kind, setKind] = useState<'post' | 'story' | 'reel' | 'carousel'>(
    initialFormat.startsWith('STORY')
      ? 'story'
      : initialFormat === 'REEL'
        ? 'reel'
        : initialFormat === 'CAROUSEL'
          ? 'carousel'
          : 'post',
  )
  const [selected, setSelected] = useState<string[]>([])
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [scheduledLocal, setScheduledLocal] = useState('')
  const [mode, setMode] = useState<'now' | 'schedule' | 'draft'>(
    initialMode === 'schedule' ? 'schedule' : 'now',
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const format: ContentFormat = useMemo(() => {
    const first = media.find((m) => m.id === selected[0])
    if (kind === 'story') {
      return first?.kind === 'video' ? 'STORY_VIDEO' : 'STORY_IMAGE'
    }
    if (kind === 'reel') return 'REEL'
    if (kind === 'carousel') return 'CAROUSEL'
    return first?.kind === 'video' ? 'FEED_VIDEO' : 'FEED_IMAGE'
  }, [kind, media, selected])

  const fullLen = `${caption}\n\n${hashtags}`.trim().length

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      if (!selected.length) throw new Error('Selecione a mídia')
      let scheduledAt: string | null = null
      if (mode === 'schedule') {
        if (!scheduledLocal) throw new Error('Informe data e horário')
        scheduledAt = zonedLocalToUtcIso(scheduledLocal, DEFAULT_TIMEZONE)
      }
      await createContent({
        format,
        caption: kind === 'story' ? '' : caption,
        hashtags: kind === 'story' ? '' : hashtags,
        internalNote: kind === 'story' ? caption || undefined : undefined,
        mediaIds: selected,
        scheduledAt,
        publishNow: mode === 'now',
        saveDraft: mode === 'draft',
        timezone: DEFAULT_TIMEZONE,
      })
      await onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Criar publicação"
        className="bg-white w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-line p-5 sm:p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-extrabold">
            {mode === 'now'
              ? 'Publicar agora'
              : mode === 'schedule'
                ? 'Agendar publicação'
                : 'Salvar rascunho'}
          </h3>
          <button type="button" className="font-bold text-muted" onClick={onClose}>
            Fechar
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(
            [
              ['post', 'Publicação'],
              ['story', 'Story'],
              ['reel', 'Reel'],
              ['carousel', 'Carrossel'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setKind(id)
                setSelected([])
              }}
              className={`rounded-xl px-3 py-2.5 text-sm font-bold border ${
                kind === id
                  ? 'bg-soft text-brand border-[#ffe0c2]'
                  : 'bg-white border-line'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('now')}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold border ${
              mode === 'now'
                ? 'bg-soft text-brand border-[#ffe0c2]'
                : 'border-line'
            }`}
          >
            Agora
          </button>
          <button
            type="button"
            onClick={() => setMode('schedule')}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold border ${
              mode === 'schedule'
                ? 'bg-soft text-brand border-[#ffe0c2]'
                : 'border-line'
            }`}
          >
            Agendar
          </button>
          <button
            type="button"
            onClick={() => setMode('draft')}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold border ${
              mode === 'draft'
                ? 'bg-soft text-brand border-[#ffe0c2]'
                : 'border-line'
            }`}
          >
            Rascunho
          </button>
        </div>

        {kind === 'story' && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 font-medium">
            Story via API oficial: imagem ou vídeo (até 60s). Stickers, música e
            links não são enviados. O texto abaixo fica só como nota interna — o
            Instagram não aceita legenda em story pela API.
          </p>
        )}

        <div>
          <p className="text-sm font-semibold mb-2">
            Mídia {kind === 'carousel' ? '(2 a 10)' : '(1)'}
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 max-h-48 overflow-y-auto">
            {media.map((m) => {
              const on = selected.includes(m.id)
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setSelected((prev) => {
                      if (kind === 'carousel') {
                        return on
                          ? prev.filter((id) => id !== m.id)
                          : [...prev, m.id].slice(0, 10)
                      }
                      return [m.id]
                    })
                  }}
                  className={`aspect-square rounded-xl overflow-hidden border-2 ${
                    on ? 'border-brand' : 'border-line'
                  }`}
                >
                  {m.kind === 'image' ? (
                    <img
                      src={m.thumbnailUrl || m.publicUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] font-bold flex h-full items-center justify-center bg-soft">
                      VÍDEO
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <label className="inline-flex mt-2 text-sm font-bold text-brand cursor-pointer">
            + Enviar arquivo
            <input
              type="file"
              className="hidden"
              accept="image/jpeg,image/png,video/mp4"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                void uploadMedia(file)
                  .then(async (r) => {
                    await onUploaded()
                    setSelected(
                      kind === 'carousel'
                        ? [...selected, r.media.id]
                        : [r.media.id],
                    )
                  })
                  .catch((err) => setError(err.message))
              }}
            />
          </label>
        </div>

        <label className="block text-sm font-semibold">
          {kind === 'story'
            ? 'Nota interna (não vai pro Instagram)'
            : `Legenda (${fullLen}/${CAPTION_MAX})`}
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={kind === 'story' ? 2 : 4}
            className="mt-1 w-full rounded-xl border-2 border-line px-3 py-2"
          />
        </label>

        {kind !== 'story' && (
          <label className="block text-sm font-semibold">
            Hashtags
            <input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              className="mt-1 w-full rounded-xl border-2 border-line px-3 py-2"
              placeholder="#alpha #recupera"
            />
          </label>
        )}

        {mode === 'schedule' && (
          <label className="block text-sm font-semibold">
            Data e horário ({DEFAULT_TIMEZONE})
            <input
              type="datetime-local"
              value={scheduledLocal}
              onChange={(e) => setScheduledLocal(e.target.value)}
              className="mt-1 w-full rounded-xl border-2 border-line px-3 py-2"
              required
            />
          </label>
        )}

        {error && <p className="text-sm font-semibold text-bad">{error}</p>}

        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="btn-brand w-full rounded-xl px-4 py-3 text-sm font-bold disabled:opacity-60 inline-flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {mode === 'draft'
            ? 'Salvar rascunho'
            : mode === 'now'
              ? kind === 'story'
                ? 'Postar story agora'
                : 'Publicar agora'
              : kind === 'story'
                ? 'Agendar story'
                : 'Agendar publicação'}
        </button>
      </div>
    </div>
  )
}

function BatchModal({
  mode: batchKind,
  onClose,
  onDone,
}: {
  mode: 'mixed' | 'stories'
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const storiesOnly = batchKind === 'stories'
  const [files, setFiles] = useState<
    {
      file: File
      progress: number
      mediaId?: string
      error?: string
      format: ContentFormat
      caption: string
    }[]
  >([])
  const [defaultCaption, setDefaultCaption] = useState('')
  const [defaultHashtags, setDefaultHashtags] = useState('')
  const [mode, setMode] = useState<DistributionMode>('custom_slots')
  const [intervalMinutes, setIntervalMinutes] = useState(
    storiesOnly ? 60 : 120,
  )
  const [customSlots, setCustomSlots] = useState(
    storiesOnly ? '09:00,11:00,14:00,17:00,20:00' : '09:00,12:00,15:00,18:00',
  )
  const [windowStart, setWindowStart] = useState('09:00')
  const [windowEnd, setWindowEnd] = useState(storiesOnly ? '22:00' : '21:00')
  const [includeWeekends, setIncludeWeekends] = useState(true)
  const [preview, setPreview] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const rule = {
    mode,
    days: includeWeekends ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5],
    windowStart,
    windowEnd,
    includeWeekends,
    intervalMinutes,
    maxPerDay: storiesOnly ? 12 : 8,
    customSlots: customSlots
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    timezone: DEFAULT_TIMEZONE,
  }

  const defaultFormatFor = (file: File): ContentFormat => {
    const video = file.type.startsWith('video')
    if (storiesOnly) return video ? 'STORY_VIDEO' : 'STORY_IMAGE'
    return video ? 'REEL' : 'FEED_IMAGE'
  }

  const uploadAll = async (list: File[]) => {
    const next = list.map((file) => ({
      file,
      progress: 0,
      format: defaultFormatFor(file),
      caption: '',
    }))
    let startIndex = 0
    setFiles((prev) => {
      startIndex = prev.length
      return [...prev, ...next]
    })
    for (let i = 0; i < next.length; i++) {
      const idx = startIndex + i
      try {
        const res = await uploadMedia(next[i].file, (pct) => {
          setFiles((prev) =>
            prev.map((f, j) => (j === idx ? { ...f, progress: pct } : f)),
          )
        })
        setFiles((prev) =>
          prev.map((f, j) =>
            j === idx ? { ...f, progress: 100, mediaId: res.media.id } : f,
          ),
        )
      } catch (e) {
        setFiles((prev) =>
          prev.map((f, j) =>
            j === idx
              ? { ...f, error: e instanceof Error ? e.message : 'Erro' }
              : f,
          ),
        )
      }
    }
  }

  const applyDefaultToEmpty = () => {
    if (!defaultCaption.trim()) return
    setFiles((prev) =>
      prev.map((f) =>
        f.caption.trim() ? f : { ...f, caption: defaultCaption },
      ),
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl border border-line p-6 space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-xl font-extrabold">
              {storiesOnly ? 'Vários stories' : 'Vários posts'}
            </h3>
            <p className="text-sm text-muted font-medium">
              {storiesOnly
                ? 'Cada story com nota interna + horário próprio'
                : 'Cada item com legenda própria + horários'}
            </p>
          </div>
          <button type="button" className="font-bold text-muted" onClick={onClose}>
            Fechar
          </button>
        </div>

        {storiesOnly && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 font-medium">
            A API do Instagram não envia texto/legenda no story. Use a descrição
            de cada item como nota interna da equipe.
          </p>
        )}

        <label className="btn-brand inline-flex rounded-xl px-4 py-2.5 text-sm font-bold cursor-pointer">
          Selecionar arquivos
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,video/mp4,video/quicktime"
            className="hidden"
            onChange={(e) => void uploadAll([...(e.target.files || [])])}
          />
        </label>

        <div className="space-y-3 max-h-72 overflow-y-auto">
          {files.map((f, i) => (
            <div
              key={`${f.file.name}-${i}`}
              className="rounded-xl border border-line p-3 text-sm space-y-2"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{f.file.name}</p>
                  <div className="h-1.5 bg-soft rounded-full mt-1">
                    <div
                      className="h-full bar-brand rounded-full"
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                  {f.error && <p className="text-bad text-xs">{f.error}</p>}
                </div>
                {!storiesOnly && (
                  <select
                    value={f.format}
                    onChange={(e) =>
                      setFiles((prev) =>
                        prev.map((x, j) =>
                          j === i
                            ? { ...x, format: e.target.value as ContentFormat }
                            : x,
                        ),
                      )
                    }
                    className="rounded-lg border border-line text-xs px-2 py-1"
                  >
                    <option value="FEED_IMAGE">Post</option>
                    <option value="REEL">Reel</option>
                    <option value="STORY_IMAGE">Story</option>
                    <option value="STORY_VIDEO">Story vídeo</option>
                  </select>
                )}
                {storiesOnly && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-brand bg-soft px-2 py-1 rounded-md">
                    {f.format.startsWith('STORY_VIDEO') ? 'Story vídeo' : 'Story'}
                  </span>
                )}
                <button
                  type="button"
                  className="text-bad font-bold text-xs"
                  onClick={() =>
                    setFiles((prev) => prev.filter((_, j) => j !== i))
                  }
                >
                  Remover
                </button>
              </div>
              <textarea
                value={f.caption}
                onChange={(e) =>
                  setFiles((prev) =>
                    prev.map((x, j) =>
                      j === i ? { ...x, caption: e.target.value } : x,
                    ),
                  )
                }
                placeholder={
                  storiesOnly || f.format.startsWith('STORY')
                    ? 'Nota interna deste story (não vai ao Instagram)'
                    : 'Legenda deste item'
                }
                rows={2}
                className="w-full rounded-xl border border-line px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm font-semibold">
            {storiesOnly ? 'Nota padrão (opcional)' : 'Legenda padrão'}
            <textarea
              value={defaultCaption}
              onChange={(e) => setDefaultCaption(e.target.value)}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2"
              rows={2}
              placeholder="Usada nos itens sem texto próprio"
            />
            <button
              type="button"
              className="mt-1 text-xs font-bold text-brand"
              onClick={applyDefaultToEmpty}
            >
              Aplicar nos vazios
            </button>
          </label>
          {!storiesOnly ? (
            <label className="text-sm font-semibold">
              Hashtags padrão
              <textarea
                value={defaultHashtags}
                onChange={(e) => setDefaultHashtags(e.target.value)}
                className="mt-1 w-full rounded-xl border border-line px-3 py-2"
                rows={2}
              />
            </label>
          ) : (
            <label className="text-sm font-semibold">
              Intervalo sugerido
              <p className="mt-1 text-xs text-muted font-medium">
                Stories em sequência no mesmo dia — ajuste os horários abaixo.
              </p>
            </label>
          )}
          <label className="text-sm font-semibold">
            Distribuição
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as DistributionMode)}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2"
            >
              <option value="custom_slots">Horários fixos no dia</option>
              <option value="fixed_interval">A cada X minutos</option>
              <option value="max_per_day">Espalhar no dia</option>
            </select>
          </label>
          {mode === 'custom_slots' ? (
            <label className="text-sm font-semibold">
              Horários (ex: 09:00,12:00,18:00)
              <input
                value={customSlots}
                onChange={(e) => setCustomSlots(e.target.value)}
                className="mt-1 w-full rounded-xl border border-line px-3 py-2"
              />
            </label>
          ) : mode === 'fixed_interval' ? (
            <label className="text-sm font-semibold">
              Intervalo (minutos)
              <input
                type="number"
                min={15}
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-line px-3 py-2"
              />
            </label>
          ) : (
            <label className="text-sm font-semibold">
              Janela do dia
              <div className="mt-1 flex gap-2">
                <input
                  type="time"
                  value={windowStart}
                  onChange={(e) => setWindowStart(e.target.value)}
                  className="w-full rounded-xl border border-line px-3 py-2"
                />
                <input
                  type="time"
                  value={windowEnd}
                  onChange={(e) => setWindowEnd(e.target.value)}
                  className="w-full rounded-xl border border-line px-3 py-2"
                />
              </div>
            </label>
          )}
        </div>

        <label className="inline-flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={includeWeekends}
            onChange={(e) => setIncludeWeekends(e.target.checked)}
          />
          Incluir finais de semana
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-xl border border-line px-4 py-2 text-sm font-bold"
            onClick={() => {
              const ready = files.filter((f) => f.mediaId)
              void previewSchedule(ready.length, rule)
                .then((r) => setPreview(r.schedule))
                .catch((e) => setError(e.message))
            }}
          >
            Ver horários
          </button>
          <button
            type="button"
            disabled={busy}
            className="btn-brand rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-60"
            onClick={() => {
              const ready = files.filter((f) => f.mediaId)
              if (!ready.length) {
                setError('Envie ao menos um arquivo')
                return
              }
              setBusy(true)
              setError('')
              void createBatch({
                items: ready.map((f) => {
                  const isStory = f.format.startsWith('STORY')
                  const text = f.caption.trim() || defaultCaption
                  return {
                    mediaId: f.mediaId!,
                    format: f.format,
                    caption: isStory ? undefined : text,
                    hashtags: isStory ? undefined : defaultHashtags,
                    internalNote: isStory ? text || undefined : undefined,
                  }
                }),
                rule,
                defaultCaption: storiesOnly ? undefined : defaultCaption,
                defaultHashtags: storiesOnly ? undefined : defaultHashtags,
              })
                .then(() => onDone())
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false))
            }}
          >
            Confirmar agendamentos
          </button>
        </div>

        {preview.length > 0 && (
          <ul className="text-xs font-medium space-y-1 max-h-40 overflow-y-auto bg-soft rounded-xl p-3">
            {preview.map((iso, i) => (
              <li key={iso + i}>
                #{i + 1} · {formatLocal(iso)}
                {files[i]?.caption
                  ? ` · ${files[i].caption.slice(0, 40)}${files[i].caption.length > 40 ? '…' : ''}`
                  : ''}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="text-sm text-bad font-semibold">{error}</p>}
      </div>
    </div>
  )
}

function DetailModal({
  id,
  onClose,
  onChanged,
}: {
  id: string
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof fetchContentDetail>
  > | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void fetchContentDetail(id)
      .then(setData)
      .finally(() => setLoading(false))
  }, [id])

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-line p-6 space-y-4">
        <div className="flex justify-between">
          <h3 className="text-lg font-extrabold">Detalhes</h3>
          <button type="button" className="font-bold text-muted" onClick={onClose}>
            Fechar
          </button>
        </div>
        {loading || !data ? (
          <Loader2 className="w-5 h-5 animate-spin text-brand" />
        ) : (
          <>
            <p className="text-sm font-semibold">
              {FORMAT_LABELS[data.content.format]} ·{' '}
              {STATUS_LABELS[data.content.status]}
            </p>
            <p className="text-sm whitespace-pre-wrap">
              {data.content.caption ||
                (data.content.format.startsWith('STORY')
                  ? '(story sem legenda no Instagram)'
                  : '(sem legenda)')}
            </p>
            {data.content.internalNote && (
              <p className="text-sm whitespace-pre-wrap rounded-xl bg-soft px-3 py-2">
                <span className="text-xs font-bold uppercase text-muted">
                  Nota interna
                </span>
                <br />
                {data.content.internalNote}
              </p>
            )}
            <p className="text-xs text-muted">
              Agendado: {formatLocal(data.content.scheduledAt)} · Publicado:{' '}
              {formatLocal(data.content.publishedAt)}
            </p>
            {data.content.lastErrorMessage && (
              <p className="text-sm text-bad">{data.content.lastErrorMessage}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {data.content.status === 'FAILED_RETRYABLE' && (
                <button
                  type="button"
                  className="btn-brand rounded-xl px-3 py-2 text-sm font-bold"
                  onClick={() =>
                    void contentAction(id, 'retry')
                      .then(() => onChanged())
                      .then(onClose)
                  }
                >
                  Tentar novamente
                </button>
              )}
              {data.content.permalink && (
                <a
                  href={data.content.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-line px-3 py-2 text-sm font-bold"
                >
                  Abrir no Instagram
                </a>
              )}
            </div>
            {!!data.attempts?.length && (
              <ul className="text-xs space-y-1">
                {(
                  data.attempts as {
                    startedAt: string
                    ok: boolean
                    errorMessage?: string
                  }[]
                ).map((a, i) => (
                  <li key={i} className="flex items-center gap-2">
                    {a.ok ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-ok" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-bad" />
                    )}
                    {formatLocal(a.startedAt)} {a.errorMessage || ''}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  )
}
