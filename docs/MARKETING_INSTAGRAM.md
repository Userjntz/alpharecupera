# Painel de Marketing — Instagram (API oficial)

## Visão geral

O módulo **Marketing** permite conectar a conta profissional do Instagram da Alpha Recupera via OAuth oficial da Meta, enviar mídias, criar/agendar Feed, Carrossel, Reels e Stories, distribuir conteúdos em lote e publicar por worker/cron durável.

Stack alinhada ao projeto:

- Admin (`admin/`) — UI
- API Cloudflare Worker (`workers/api/`) — produção
- API local (`server/leads-api.mjs` + `server/marketing.mjs`) — desenvolvimento
- Persistência: Cloudflare KV (prod) / JSON em `server/data/` (local)
- Mídia: Vercel Blob (`BLOB_READ_WRITE_TOKEN`) ou R2 (`MEDIA_R2`) em produção; arquivos locais em `server/data/media/` no dev
- Fila: jobs em KV + cron Cloudflare a cada 2 minutos (`*/2 * * * *`); no local, timer a cada 2 minutos

## Variáveis de ambiente

Documentadas em `.env.example`. Principais:

| Variável | Onde | Uso |
|---|---|---|
| `META_APP_ID` | Worker secret / `.env` local | App Meta |
| `META_APP_SECRET` | Worker secret / `.env` local | App Meta |
| `INSTAGRAM_REDIRECT_URI` | Worker / local | Callback OAuth |
| `TOKEN_ENCRYPTION_KEY` | Worker secret | AES-GCM dos tokens (32+ chars) |
| `ADMIN_APP_URL` | Worker vars | Redirect pós-OAuth |
| `BLOB_READ_WRITE_TOKEN` | Worker secret | Upload público para a Meta buscar |
| `MEDIA_PUBLIC_BASE_URL` | Se usar R2 | Base URL pública do bucket |
| `META_WEBHOOK_VERIFY_TOKEN` | Opcional | Validação de webhook |
| `META_GRAPH_VERSION` | Opcional | Padrão `v22.0` |
| `VITE_LEADS_API_URL` | Admin | URL da API |

### Secrets no Cloudflare

```bash
cd workers/api
npx wrangler secret put META_APP_ID
npx wrangler secret put META_APP_SECRET
npx wrangler secret put INSTAGRAM_REDIRECT_URI
npx wrangler secret put TOKEN_ENCRYPTION_KEY
npx wrangler secret put BLOB_READ_WRITE_TOKEN
npx wrangler secret put JWT_SECRET
```

## Configurar o app na Meta

1. Acesse [Meta for Developers](https://developers.facebook.com/) e crie um app com produto **Instagram**.
2. Use **Instagram API with Instagram Login** (Business Login).
3. Permissões solicitadas pelo sistema:
   - `instagram_business_basic`
   - `instagram_business_content_publish`
   - `instagram_business_manage_insights`
4. Em Valid OAuth Redirect URIs, cadastre:
   - Local: `http://localhost:8787/oauth/instagram/callback`
   - Produção: `https://<seu-worker>/oauth/instagram/callback`
5. Conta de teste: Instagram profissional (Business/Creator) adicionada como test user do app.
6. Para produção: App Review + verificação empresarial da Meta.

### Webhook (opcional)

- Callback URL: `https://<seu-worker>/marketing/webhooks/instagram`
- Verify token: o mesmo de `META_WEBHOOK_VERIFY_TOKEN`

## Tipos de conta suportados

- Instagram **Professional** (Business ou Creator)
- Publicação via `graph.instagram.com` (Instagram Login)
- Limite oficial típico: 50 publicações / 24h (consultado em `content_publishing_limit` quando disponível)

## Como rodar local

```bash
# terminal 1
npm run dev:api

# terminal 2
npm run dev:admin
```

1. Entre no admin (`http://127.0.0.1:5174`) com usuário `admin` ou `gerente`/`marketing`.
2. Abra **Marketing**.
3. Configure as variáveis Meta no ambiente da API.
4. Clique **Conectar Instagram** e conclua o OAuth.
5. Envie uma imagem JPEG na Biblioteca.
6. Crie um conteúdo → **Salvar rascunho** / **Agendar** / **Publicar agora**.

URLs de mídia locais (`http://localhost:8787/marketing/files/...`) só são alcançáveis pela Meta se você usar um túnel (ngrok/cloudflared) ou Blob/R2 público.

## Worker e fila

- Cron: `workers/api/wrangler.toml` → `[triggers] crons = ["*/2 * * * *"]`
- Processamento: `DRAFT → SCHEDULED → QUEUED → PREPARING → PROCESSING_MEDIA → PUBLISHING → PUBLISHED`
- Falhas: `FAILED_RETRYABLE` (retry com backoff) ou `FAILED_PERMANENT`
- Idempotência: `idempotencyKey` + lock por job
- Diagnóstico (admin/gerente): `GET /marketing/jobs`, `POST /marketing/jobs/process`

## Migrations

Não há SQL. Dados ficam em chaves KV / arquivos JSON:

- `ig:account`, `ig:media`, `ig:content`, `ig:jobs`, `ig:attempts`, `ig:audit`, `ig:notifications`, `ig:insights`, `ig:oauth_states`, `ig:webhooks`
- Local: `server/data/ig-*.json` e `server/data/media/`

Rollback: restaurar backup das chaves/arquivos anteriores.

## Testes

```bash
npm test
npm run build:admin
```

A suíte automática **não** chama a Meta. Use conta de teste para validação manual.

## Limitações reais da API oficial

- Stories: sem stickers, música, enquetes ou links interativos via API de publicação.
- Insights completos geralmente exigem App Review.
- Tokens long-lived (~60 dias); o sistema tenta refresh automático perto do vencimento.
- A Meta precisa baixar a mídia por URL HTTPS pública no momento da criação do container.
- App em modo Development só funciona com usuários/roles de teste.

## Checklist de produção

- [ ] App Meta em Live + permissões aprovadas
- [ ] Redirect URI de produção cadastrado
- [ ] Secrets no Worker
- [ ] `BLOB_READ_WRITE_TOKEN` ou R2 público configurado
- [ ] `ADMIN_APP_URL` apontando para `https://admin.alpharecupera.com.br`
- [ ] Cron ativo no Worker
- [ ] Conta Instagram profissional conectada por um admin
- [ ] Publicação de teste (imagem de feed) concluída
- [ ] Monitorar `/health` e `/marketing/jobs`

## RBAC

| Papel | Capacidade |
|---|---|
| admin / gerente | Conectar/desconectar, auditoria, jobs, tudo de marketing |
| marketing | Criar, editar, agendar, publicar, biblioteca, lote |
| captador / vendedor | Sem acesso à seção Marketing |
