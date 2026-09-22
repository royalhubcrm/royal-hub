# Royal CRM

O Royal Hub refeito em Angular + Supabase. Leads, pipeline, imóveis, WhatsApp com assistente de IA, agenda, sites e portais — sem servidor próprio para manter ligado.

## Ver funcionando agora (sem configurar nada)

```bash
npm install
npm run demo
```

Abra http://localhost:4331. É o **modo demonstração**: dados de exemplo que vivem só no navegador (recarregar a página volta tudo ao começo). Serve para conhecer as telas antes de ligar o banco.

## Ligar de verdade — passo a passo

### 1. Banco (uma vez)
1. No Supabase, abra **SQL Editor**, cole todo o arquivo `supabase/migrations/20260922120000_crm_inicial.sql` e rode.
2. **Project Settings → Data API → Exposed schemas**: adicione `crm`.
3. **Authentication → Sign In / Providers**: desligue *Allow new users to sign up* (quem cria contas é o administrador, na tela Equipe).
4. **Authentication → Users → Add user**: crie o seu login (e-mail e senha).

### 2. App
Em `src/environments/environment.ts`, cole o endereço do projeto e a chave **anon** (Project Settings → API).
Nunca use a chave `service_role` aqui: ela dá acesso total e o navegador mostra tudo o que carrega.

```bash
npm start
```

Entre com o login do passo 1.4. No primeiro acesso o sistema pergunta o nome da imobiliária e você vira o administrador.

### 3. Funções do servidor (IA, WhatsApp, webhook, portais, contas)

```bash
npx supabase login
npx supabase link --project-ref SEU-PROJETO
npx supabase functions deploy
npx supabase secrets set GROQ_API_KEY=sua-chave SITE_URL=https://endereco-do-app
```

- `GROQ_API_KEY`: gratuita em https://console.groq.com/keys. Liga a assistente, a sugestão de mensagem, a retomada e o "Montar site com IA". (Também aceita `ANTHROPIC_API_KEY` ou `GEMINI_API_KEY`.)
- `SITE_URL`: o endereço público do app. Entra nos links que a assistente manda no WhatsApp e no feed dos portais.
- Opcional: `META_APP_SECRET` (a função confere a assinatura das mensagens da Meta) e `CRON_SECRET` (retomada automática, ver `supabase/agendador-retomadas.sql`).

### 4. Publicar o app
`npm run build` gera a pasta `dist/crm/browser`. Ela pode ir para Cloudflare Pages, Netlify ou Vercel. O arquivo `_redirects` já está incluído, para as rotas funcionarem ao recarregar a página.

## O que tem em cada tela

| Tela | Para quê | Quem vê |
|---|---|---|
| Painel | Números do mês, 14 dias, funil, últimos leads, imóveis mais pedidos | todos |
| Pipeline | Kanban de vendas: arrastar ou usar as setas (teclado) | todos |
| Leads | Tabela com busca, filtros, ordenação e páginas; ficha com histórico; importar planilha | todos |
| Conversas | WhatsApp: ler, responder, ligar/desligar a assistente; testar a assistente | todos |
| Imóveis | Carteira com fotos, CEP automático, situação, portais; folha para o cliente (imprimir/PDF) | admin, gerente, corretor |
| Agenda e gerência | Visitas marcadas, perguntas que a assistente deixou, clientes parados, interesses | admin, gerente |
| Sites | Sites dos clientes com prévia ao vivo e rascunho por IA | admin |
| Equipe | Pessoas, papéis, equipes | admin |
| Ajustes | Imobiliária, assistente, WhatsApp oficial, captação (formulário e webhook), portais | admin |
| Empresas | Criar e bloquear imobiliárias | dono da plataforma |

Páginas públicas, sem login: `/captar/<empresa>` (formulário do anúncio), `/imovel/<id>` e `/s/<site>`.

## A marca

- A coroa-casa é um desenho vetorial em `src/app/shared/ui/marca.ts` (componente `<app-marca>`) e em `public/favicon.svg` — nítida em qualquer tamanho e leve. O arquivo original enviado está guardado em `public/logo-royal.webp`.
- Cores: azul-marinho `#0F1B2D` e dourado `#C9A227`. Em texto sobre fundo claro, o dourado usado é o tom escuro `#8A6714`, que passa no contraste exigido por acessibilidade.
- Letras: **Cinzel** (a serifada da logo) nos títulos de tela e na marca; **IBM Plex Sans** na interface; **IBM Plex Mono** nos números, para as colunas ficarem alinhadas.

## Estrutura

```
src/app/
  core/        supabase, login (auth), modelos e serviços de dados
  layout/      menu lateral
  shared/      painel lateral (gaveta), avisos, pipes, utilidades
  features/    uma pasta por tela
src/demo/      o modo demonstração (não entra na versão de produção)
supabase/
  migrations/  o banco inteiro (tabelas, segurança, funções)
  functions/   usuarios, assistente, whatsapp, leads-webhook, feed-portais
```
