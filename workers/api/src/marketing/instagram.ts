import {
  GRAPH_API_VERSION,
  IG_SCOPES,
  IG_SCOPES_CONNECT,
  isRetryableProviderError,
  type ContentFormat,
} from '../../../../shared/marketing'

export type InstagramEnv = {
  META_APP_ID?: string
  META_APP_SECRET?: string
  INSTAGRAM_REDIRECT_URI?: string
  META_GRAPH_VERSION?: string
}

export type ProviderError = {
  code: string
  message: string
  retryable: boolean
  status?: number
}

function graphHost(version: string) {
  return `https://graph.instagram.com/${version}`
}

function sanitizeError(data: unknown, status: number): ProviderError {
  const obj = (data || {}) as {
    error?: { code?: number | string; message?: string; error_subcode?: number }
  }
  const code = String(obj.error?.code ?? status ?? 'UNKNOWN')
  let message = obj.error?.message || `Erro Instagram (${status})`
  message = message
    .replace(/access_token=[^&\s]+/gi, 'access_token=***')
    .replace(/Bearer\s+\S+/gi, 'Bearer ***')
  const permanent = [
    '10',
    '190',
    '200',
    '24',
    '100',
    '36003',
    '36001',
    '2207051',
  ].includes(code)
  return {
    code,
    message,
    retryable: !permanent && isRetryableProviderError(code),
    status,
  }
}

export class InstagramProvider {
  private version: string
  private appId: string
  private appSecret: string
  private redirectUri: string

  constructor(env: InstagramEnv) {
    this.version = env.META_GRAPH_VERSION || GRAPH_API_VERSION
    this.appId = env.META_APP_ID || ''
    this.appSecret = env.META_APP_SECRET || ''
    this.redirectUri = env.INSTAGRAM_REDIRECT_URI || ''
  }

  isConfigured() {
    return Boolean(this.appId && this.appSecret && this.redirectUri)
  }

  configStatus() {
    return {
      configured: this.isConfigured(),
      missing: [
        !this.appId && 'META_APP_ID',
        !this.appSecret && 'META_APP_SECRET',
        !this.redirectUri && 'INSTAGRAM_REDIRECT_URI',
      ].filter(Boolean) as string[],
      scopes: [...IG_SCOPES],
      graphVersion: this.version,
      redirectUri: this.redirectUri || null,
      mode: this.isConfigured() ? 'ready' : 'missing_config',
    }
  }

  buildAuthorizeUrl(state: string): string {
    // Business Login for Instagram exige Instagram App ID + Instagram App Secret
    // (App Dashboard → Instagram → API setup with Instagram login → Business login settings).
    // Não use o App ID/Secret do Facebook/Pixel.
    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      // Conectar com basic primeiro (publish/insights exigem permissão adicionada no app Meta).
      scope: IG_SCOPES_CONNECT.join(','),
      response_type: 'code',
      state,
      enable_fb_login: '0',
      force_reauth: 'true',
    })
    return `https://www.instagram.com/oauth/authorize?${params}`
  }

  async exchangeCode(code: string): Promise<{
    accessToken: string
    userId: string
    expiresIn?: number
  }> {
    const body = new URLSearchParams({
      client_id: this.appId,
      client_secret: this.appSecret,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
      code,
    })
    const res = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const data = (await res.json()) as {
      access_token?: string
      user_id?: string | number
      data?: Array<{
        access_token?: string
        user_id?: string | number
        permissions?: string
      }>
      error_type?: string
      error_message?: string
      error?: { message?: string; code?: number }
      code?: number
    }
    const row = data.data?.[0]
    const accessToken = data.access_token || row?.access_token
    const userId = data.user_id ?? row?.user_id
    if (!res.ok || !accessToken || userId == null) {
      throw sanitizeError(
        {
          error: {
            code: data.code || data.error?.code || res.status,
            message:
              data.error_message ||
              data.error?.message ||
              'Falha ao trocar código OAuth',
          },
        },
        res.status,
      )
    }
    return {
      accessToken,
      userId: String(userId),
    }
  }

  async exchangeLongLived(shortToken: string): Promise<{
    accessToken: string
    expiresIn: number
  }> {
    // Alguns apps Meta aceitam só GET; outros só POST. Tentamos ambos.
    const params = new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: this.appSecret,
      access_token: shortToken,
    })
    const bases = [
      'https://graph.instagram.com/access_token',
      `https://graph.instagram.com/${this.version}/access_token`,
    ]
    const attempts: { url: string; method: 'GET' | 'POST' }[] = []
    for (const base of bases) {
      attempts.push({ url: `${base}?${params.toString()}`, method: 'GET' })
      attempts.push({ url: base, method: 'POST' })
    }
    const errors: string[] = []
    let preferredErr: ProviderError | null = null
    for (const attempt of attempts) {
      const res = await fetch(
        attempt.url,
        attempt.method === 'POST'
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: params.toString(),
            }
          : { method: 'GET' },
      )
      const data = (await res.json()) as {
        access_token?: string
        expires_in?: number
        error?: { message?: string; code?: number }
      }
      if (res.ok && data.access_token) {
        return {
          accessToken: data.access_token,
          expiresIn: data.expires_in || 60 * 60 * 24 * 60,
        }
      }
      const err = sanitizeError(data, res.status)
      const methodIssue =
        /unsupported request|method type/i.test(err.message || '')
      errors.push(`${attempt.method}: ${err.message}`)
      // Prefere o erro "real" (secret inválido, token, etc.) ao de método
      if (!methodIssue || !preferredErr) {
        if (!methodIssue) preferredErr = err
        else if (!preferredErr) preferredErr = err
      }
    }
    const base = preferredErr || {
      code: 'TOKEN',
      message: 'Falha ao obter token longo',
      retryable: true,
    }
    throw {
      ...base,
      message: `${base.message} (${errors.slice(0, 3).join(' | ')})`,
    }
  }

  async refreshLongLived(token: string): Promise<{
    accessToken: string
    expiresIn: number
  }> {
    const params = new URLSearchParams({
      grant_type: 'ig_refresh_token',
      access_token: token,
    })
    const attempts: { url: string; method: 'GET' | 'POST' }[] = [
      {
        url: `https://graph.instagram.com/refresh_access_token?${params}`,
        method: 'GET',
      },
      { url: 'https://graph.instagram.com/refresh_access_token', method: 'POST' },
      {
        url: `https://graph.instagram.com/${this.version}/refresh_access_token?${params}`,
        method: 'GET',
      },
    ]
    let lastErr: ProviderError | null = null
    for (const attempt of attempts) {
      const res = await fetch(
        attempt.url,
        attempt.method === 'POST'
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: params,
            }
          : { method: 'GET' },
      )
      const data = (await res.json()) as {
        access_token?: string
        expires_in?: number
        error?: { message?: string; code?: number }
      }
      if (res.ok && data.access_token) {
        return {
          accessToken: data.access_token,
          expiresIn: data.expires_in || 60 * 60 * 24 * 60,
        }
      }
      lastErr = sanitizeError(data, res.status)
    }
    throw lastErr || {
      code: 'TOKEN',
      message: 'Falha ao renovar token longo',
      retryable: true,
    }
  }

  async getMe(accessToken: string, knownUserId?: string) {
    const fields = [
      'user_id',
      'username',
      'name',
      'account_type',
      'profile_picture_url',
      'followers_count',
    ].join(',')
    const urls: string[] = []
    if (knownUserId) {
      urls.push(
        `${graphHost(this.version)}/${encodeURIComponent(knownUserId)}?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`,
        `https://graph.instagram.com/${encodeURIComponent(knownUserId)}?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`,
      )
    }
    urls.push(
      `${graphHost(this.version)}/me?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`,
      `https://graph.instagram.com/me?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`,
    )
    let lastErr: ProviderError | null = null
    for (const endpoint of urls) {
      const res = await fetch(endpoint)
      const data = (await res.json()) as {
        user_id?: string
        id?: string
        username?: string
        name?: string
        account_type?: string
        profile_picture_url?: string
        error?: { message?: string; code?: number }
      }
      if (res.ok) {
        return {
          userId: String(data.user_id || data.id || ''),
          username: data.username || '',
          name: data.name || data.username || '',
          accountType: data.account_type || 'PROFESSIONAL',
          profilePictureUrl: data.profile_picture_url,
        }
      }
      lastErr = sanitizeError(data, res.status)
    }
    throw lastErr || {
      code: 'ME',
      message: 'Falha ao ler perfil Instagram',
      retryable: true,
    }
  }

  async createMediaContainer(
    igUserId: string,
    accessToken: string,
    input: {
      format: ContentFormat
      mediaUrl: string
      caption?: string
      isCarouselItem?: boolean
      coverUrl?: string
      children?: string[]
      altText?: string
    },
  ): Promise<string> {
    const params = new URLSearchParams({ access_token: accessToken })
    const format = input.format

    if (input.children?.length) {
      params.set('media_type', 'CAROUSEL')
      params.set('children', input.children.join(','))
      if (input.caption) params.set('caption', input.caption)
    } else if (format === 'REEL') {
      params.set('media_type', 'REELS')
      params.set('video_url', input.mediaUrl)
      if (input.caption) params.set('caption', input.caption)
      if (input.coverUrl) params.set('cover_url', input.coverUrl)
    } else if (format === 'STORY_IMAGE' || format === 'STORY_VIDEO') {
      params.set('media_type', 'STORIES')
      if (format === 'STORY_VIDEO') params.set('video_url', input.mediaUrl)
      else params.set('image_url', input.mediaUrl)
    } else if (format === 'FEED_VIDEO') {
      params.set('media_type', 'VIDEO')
      params.set('video_url', input.mediaUrl)
      if (input.caption && !input.isCarouselItem) params.set('caption', input.caption)
    } else if (input.isCarouselItem) {
      if (format.includes('VIDEO') || format === 'REEL') {
        params.set('media_type', 'VIDEO')
        params.set('video_url', input.mediaUrl)
      } else {
        params.set('image_url', input.mediaUrl)
      }
      params.set('is_carousel_item', 'true')
    } else {
      params.set('image_url', input.mediaUrl)
      if (input.caption) params.set('caption', input.caption)
      if (input.altText) params.set('alt_text', input.altText)
    }

    const res = await fetch(
      `${graphHost(this.version)}/${igUserId}/media`,
      { method: 'POST', body: params },
    )
    const data = (await res.json()) as {
      id?: string
      error?: { message?: string; code?: number }
    }
    if (!res.ok || !data.id) throw sanitizeError(data, res.status)
    return data.id
  }

  async getContainerStatus(containerId: string, accessToken: string) {
    const res = await fetch(
      `${graphHost(this.version)}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`,
    )
    const data = (await res.json()) as {
      status_code?: string
      status?: string
      error?: { message?: string; code?: number }
    }
    if (!res.ok) throw sanitizeError(data, res.status)
    return data.status_code || data.status || 'UNKNOWN'
  }

  async publish(
    igUserId: string,
    accessToken: string,
    creationId: string,
  ): Promise<{ id: string }> {
    const params = new URLSearchParams({
      creation_id: creationId,
      access_token: accessToken,
    })
    const res = await fetch(
      `${graphHost(this.version)}/${igUserId}/media_publish`,
      { method: 'POST', body: params },
    )
    const data = (await res.json()) as {
      id?: string
      error?: { message?: string; code?: number }
    }
    if (!res.ok || !data.id) throw sanitizeError(data, res.status)
    return { id: data.id }
  }

  async getPermalink(mediaId: string, accessToken: string) {
    const res = await fetch(
      `${graphHost(this.version)}/${mediaId}?fields=permalink,timestamp&access_token=${encodeURIComponent(accessToken)}`,
    )
    const data = (await res.json()) as {
      permalink?: string
      error?: { message?: string; code?: number }
    }
    if (!res.ok) throw sanitizeError(data, res.status)
    return data.permalink || null
  }

  async getMediaInsights(mediaId: string, accessToken: string, metrics: string[]) {
    const res = await fetch(
      `${graphHost(this.version)}/${mediaId}/insights?metric=${metrics.join(',')}&access_token=${encodeURIComponent(accessToken)}`,
    )
    const data = (await res.json()) as {
      data?: { name: string; period?: string; values: unknown[] }[]
      error?: { message?: string; code?: number }
    }
    if (!res.ok) throw sanitizeError(data, res.status)
    return data.data || []
  }

  async getPublishingLimit(igUserId: string, accessToken: string) {
    const res = await fetch(
      `${graphHost(this.version)}/${igUserId}/content_publishing_limit?fields=config,quota_usage&access_token=${encodeURIComponent(accessToken)}`,
    )
    const data = (await res.json()) as {
      data?: { quota_usage?: number; config?: { quota_total?: number } }[]
      error?: { message?: string; code?: number }
    }
    if (!res.ok) {
      return { usage: null as number | null, total: 50, error: sanitizeError(data, res.status) }
    }
    const row = data.data?.[0]
    return {
      usage: row?.quota_usage ?? null,
      total: row?.config?.quota_total ?? 50,
      error: null as ProviderError | null,
    }
  }
}

export function isProviderError(err: unknown): err is ProviderError {
  return Boolean(
    err &&
      typeof err === 'object' &&
      'code' in err &&
      'message' in err &&
      'retryable' in err,
  )
}
