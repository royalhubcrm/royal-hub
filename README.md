# Royal Hub

Sistema da Royal Negócios Imobiliários: painel, CRM de leads, carteira de imóveis, chatbot e captação de anúncios — tudo em um servidor que roda no seu computador.

## Como rodar (primeira vez)

1. Instale o Node.js 22 ou superior: https://nodejs.org
2. Abra a pasta `royal-hub` no VSCode.
3. Terminal do VSCode (`Ctrl + '`) e rode:

```bash
npm install
```

4. Copie o arquivo `.env.example` para `.env` e preencha a chave da Anthropic (o chatbot só funciona com ela):

```bash
copy .env.example .env
```

5. Suba o sistema:

```bash
npm start
```

6. Abra no navegador: http://localhost:3000

Para o servidor reiniciar sozinho quando você mexer no código: `npm run dev`.

## O que tem dentro

| Tela | O que faz |
|---|---|
| **Painel** | Leads do mês, quentes, conversão, VGV da carteira, gráfico dos últimos 14 dias, funil |
| **Leads** | CRM completo: origem, campanha, interesse, temperatura, estágio, histórico, botão de WhatsApp |
| **Imóveis** | Carteira com fotos, filtros por bairro/tipo, cadastro e importação em lote |
| **Chatbot** | Responde o cliente usando só os imóveis da sua carteira. Você revisa e envia |
| **Captação** | Link público de formulário + webhook para o Facebook/Instagram Ads |
| **Ajustes** | Seus dados e o estilo de fala do bot |

## Entrada de leads dos anúncios

**Jeito simples** — use como destino do anúncio:

```
http://localhost:3000/captar?c=NOME-DA-CAMPANHA
```

(para funcionar na internet o sistema precisa estar publicado — ngrok para testes, ou uma VPS.)

**Jeito automático** — webhook para Make / Zapier / n8n ligado ao Lead Ads do Meta:

```
POST /api/webhook/meta?token=SEU_TOKEN
{ "nome": "...", "telefone": "...", "interesse": "...", "campanha": "..." }
```

O token está no `.env` (`WEBHOOK_TOKEN`).

## Importar os imóveis da Chave7

Tela **Imóveis → Importar**. Aceita JSON ou uma linha por imóvel:

```
8685; Casa; Jardim Karaíba; 890000; 3; 1; 2; 180
8574; Apartamento; Santa Mônica; 420000; 2; 1; 1; 72
```

## Estrutura

```
royal-hub/
├── server/
│   ├── index.js   API, webhook, chatbot
│   └── db.js      banco SQLite (data/royal.db)
├── public/
│   ├── index.html painel
│   ├── app.js     front-end
│   ├── styles.css visual
│   └── captar.html formulário público
├── .env           suas chaves (não vai para o Git)
└── package.json
```

## Backup

Todo o sistema vive em `data/royal.db`. Copie esse arquivo e você tem o backup completo.
