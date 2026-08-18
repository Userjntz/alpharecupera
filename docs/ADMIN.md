# Painel Administrativo da Empresa

Centro de controle da Alpha Recupera (compra de veículos). Reutiliza a API de leads, o Painel de Marketing e o armazenamento existente (JSON local / Cloudflare KV).

## Arquitetura

| Camada | Local |
|--------|--------|
| Frontend | `admin/` (React + Vite) |
| API local | `server/leads-api.mjs` + `server/admin-routes.mjs` + `server/admin-store.mjs` |
| API produção | `workers/api` (Cloudflare Worker + KV) |
| RBAC | `shared/admin.ts` |
| Marketing | módulos já existentes (não duplicados) |

Autorização é sempre validada no backend por **permissão granular** (`users.invite`, `finance.view_details`, etc.), não só pelo nome do cargo.

## Cargos e matriz

| Cargo | Papel |
|-------|--------|
| `admin` | Proprietário — acesso total |
| `gerente` | Administrador operacional |
| `captador` | Atendimento / aquisição de leads |
| `avaliador` | Avaliações técnicas |
| `vendedor` | Estoque e vendas |
| `marketing` | Instagram / conteúdos |
| `financeiro` | Resumo e detalhes financeiros |
| `auditor` | Somente leitura |

Detalhes em `GET /admin/meta` e na tela **Usuários → Matriz de cargos**.

Regras importantes:

- não conceder cargo/permissão acima do próprio rank;
- não suspender/arquivar o último proprietário ativo;
- convites com token de uso único (hash SHA-256), sem senha em texto;
- sessões com `jti` revogável;
- auditoria sanitizada (sem senha/token/segredo).

## Primeiro proprietário

Variáveis (servidor):

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `JWT_SECRET`

Na primeira subida sem usuários, a API cria o owner com esses valores.

## Convidar usuários

1. Login como `admin` ou perfil com `users.invite`
2. **Usuários → Convidar**
3. Se e-mail não estiver configurado (`SMTP_URL` / `RESEND_API_KEY`), a API devolve `inviteLink`
4. Convidado abre `/#/aceitar-convite?token=...` e define a senha (mín. 8)

## E-mail de convite

Opcional. Sem provedor, use o link retornado. Com provedor, configure as variáveis e integre o envio no handler de convite.

## Variáveis de ambiente

Veja `.env.example`. Nunca versione segredos reais.

## Migrations / dados

Não há SQL. Persistência em arquivos sob `server/data/` (local) ou chaves `admin:*` no KV (Worker).

Rollback: restaurar backup dos JSON / KV.

## Testes

```bash
npm test
npm run lint
npm run build:admin
```

## Marketing

O Admin mostra resumo e link para o módulo completo (`section=marketing`). Tokens do Instagram permanecem só no serviço de marketing.

## Checklist de produção

- [ ] `JWT_SECRET` forte e único
- [ ] `ADMIN_PASSWORD` rotacionada após o primeiro acesso
- [ ] CORS só com origens oficiais
- [ ] Convites com expiração adequada
- [ ] Testar suspender usuário + revogar sessões
- [ ] Testar que o último owner não pode ser removido
- [ ] Confirmar que financeiro mascara valores sem permissão
- [ ] Backup de `server/data` / KV
- [ ] Deploy Worker + Admin + Quiz alinhados na mesma API
