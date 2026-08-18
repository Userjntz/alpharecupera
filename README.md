# Alpha Recupera — Quiz + Admin (Cloudflare)

Tudo roda na **Cloudflare** (Pages + Workers). Nada na Vercel.

| App | Domínio | Deploy |
|-----|---------|--------|
| Quiz | https://alpharecupera.com.br | Pages `alpharecupera-quiz` + Worker `quiz-proxy` |
| Admin | https://admin.alpharecupera.com.br | Pages `alpharecupera-admin` + Worker `admin-proxy` |
| API | https://alpha-recupera-api.alpharecupera.workers.dev | Worker `alpha-recupera-api` |

## Rodar local

```bash
# terminal 1 — API
npm run dev:api

# terminal 2 — quiz
npm run dev:quiz

# terminal 3 — admin
npm run dev:admin
```

- Quiz: http://127.0.0.1:5173  
- Admin: http://127.0.0.1:5174  
- API: http://localhost:8787  

## Deploy (Cloudflare)

```bash
npm run deploy:api
npm run deploy:quiz
npm run deploy:admin
# ou tudo:
npm run deploy:all
```

Use `VITE_LEADS_API_URL=https://alpha-recupera-api.alpharecupera.workers.dev` no build do quiz/admin.

## Onde ajustar

- `src/data/quiz.ts` — perguntas e segmentação
- `src/lib/facebook.ts` — Pixel (só lead qualificado)
- `admin/src/App.tsx` — painel
- `admin/src/components/Marketing.tsx` — Marketing / Instagram
- `workers/api` — API + leads + marketing

## Docs

- Admin: [`docs/ADMIN.md`](docs/ADMIN.md)
- Marketing Instagram: [`docs/MARKETING_INSTAGRAM.md`](docs/MARKETING_INSTAGRAM.md)
