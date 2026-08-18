# Pronto — falta só você confirmar 2 coisas

Tudo já está no ar:

- API Marketing em produção: `https://alpha-recupera-api.alpharecupera.workers.dev`
- Painel local: http://127.0.0.1:5174/?section=marketing
- Secrets: Blob, criptografia, redirect e App ID já configurados
- Cron de publicação a cada 2 minutos ativo no Worker

## O que você faz agora (2 minutos)

### 1) Pegar o App Secret na Meta

1. Abra: https://developers.facebook.com/apps/2928679704130892/settings/basic/
2. Em **App Secret**, clique em **Show** e copie
3. Em **Instagram** do app, garanta o produto **Instagram API with Instagram Login**
4. Em Valid OAuth Redirect URIs, cadastre exatamente:

```
https://alpha-recupera-api.alpharecupera.workers.dev/oauth/instagram/callback
```

> Se este app for só Conversions API e não deixar adicionar Instagram, crie um app novo tipo Business, adicione Instagram Login, e use o App ID/Secret novos no painel.

### 2) Colar no painel e conectar

1. Abra: http://127.0.0.1:5174/?section=marketing
2. Cole o **App Secret** no campo amarelo (App ID já vem preenchido)
3. Clique **Salvar e liberar conexão**
4. Clique **Conectar Instagram**
5. Autorize a conta profissional no popup da Meta

Pronto. Depois disso você já pode subir mídia, criar posts e publicar/agendar.

## Login do admin

- E-mail: `admin@alpharecupera.com.br`
- Senha: a mesma já usada no painel (`AlphaRec#Admin2026` em local)

## Se algo falhar

- Conta Instagram precisa ser **profissional** (Business/Creator)
- Em modo Development da Meta, só usuários de teste do app conseguem conectar
- Publicação real em produção exige App Review das permissões de publish/insights
