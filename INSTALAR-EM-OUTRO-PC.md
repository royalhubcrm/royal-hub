# Royal Hub — instalar em outro computador

Tudo que o sistema é está nesta pasta. Siga na ordem.

---

## 1. Node.js

Baixe e instale o **Node.js 22 ou mais novo**: https://nodejs.org (versão LTS).

Para conferir, abra o terminal e rode:

```
node -v
```

Precisa mostrar `v22` ou maior. Abaixo disso o banco de dados não funciona.

## 2. Abrir o projeto

Descompacte esta pasta onde quiser (ex.: `Documentos\royal-hub`), abra o **VSCode**,
vá em `Arquivo > Abrir Pasta` e escolha ela.

No VSCode: `Terminal > Novo Terminal`.

## 3. Instalar as dependências

```
npm install
```

Demora um ou dois minutos. Cria a pasta `node_modules`, que não vem no pacote.

## 4. Criar o arquivo .env

Na raiz do projeto (do lado do `package.json`), crie um arquivo chamado **`.env`**
com este conteúdo:

```
GROQ_API_KEY=cole-aqui-sua-chave
GROQ_MODEL=llama-3.3-70b-versatile
PORT=3000
WEBHOOK_TOKEN=royal-webhook

SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=cole-aqui-a-chave-service-role
```

As duas últimas linhas ligam o banco na nuvem. Com elas, este computador e o
endereço publicado trabalham sobre os mesmos dados, e nada se perde quando o
servidor reinicia. Sem elas, o sistema usa só o banco local, como antes.

A chave é gratuita e sai em `console.groq.com/keys`.

Sem chave o sistema funciona assim mesmo: o chatbot responde por regras, usando a carteira.

Opcionais, quando precisar:

```
URL_PUBLICA=https://seu-endereco-publico      # links dos imóveis no WhatsApp
SMTP_EMAIL=seuemail@gmail.com                 # recuperação de senha por e-mail
SMTP_SENHA=senha-de-app-de-16-letras
ANTHROPIC_API_KEY=                            # se um dia quiser usar a IA da Anthropic
GEMINI_API_KEY=                               # ou a do Google
```

## 5. Ligar

```
npm run dev
```

Abra **http://localhost:3000** no navegador. Na primeira vez ele pede para criar
a conta de administrador.

---

## Onde ficam os dados

Com o Supabase ligado, os imóveis, leads, conversas, agendamentos, usuários e
sites ficam no Postgres do Supabase. O arquivo `data/royal.db` continua
existindo, mas só como cópia rápida: ao ligar, o sistema baixa tudo da nuvem;
a cada alteração, sobe o que mudou. As fotos dos imóveis sobem para o Storage
do Supabase na primeira vez que o sistema liga com as chaves preenchidas.

As tabelas estão com RLS ligado e sem política nenhuma: só o servidor, com a
chave secreta, lê e escreve. Quem pegar a chave pública não vê nada.

## Levar os dados junto (sem Supabase)

O pacote traz o sistema, não o conteúdo. Para o computador novo já nascer com a
carteira, os leads e as conversas:

1. No computador antigo, copie a pasta **`data`** inteira
2. Copie também **`public/fotos`** (as imagens dos imóveis)
3. Cole as duas no mesmo lugar, no computador novo

Pronto — usuários, senhas, imóveis, leads, agendamentos e histórico do WhatsApp vão junto.

Sem isso, o sistema começa vazio e você importa os imóveis de novo pela aba
**Imóveis > Importar**, e depois clica em **Baixar fotos**.

---

## Os comandos que existem

| Comando | O que faz |
|---|---|
| `npm run dev` | Liga o sistema e reinicia sozinho quando um arquivo muda |
| `npm start` | Liga o sistema em modo normal |
| `npm run zap` | Liga a ponte do WhatsApp (QR code no terminal) |
| `node server/importar.js` | Importa imóveis de um JSON da pasta Downloads |
| `node server/baixar-fotos.js` | Baixa as fotos dos imóveis para dentro do sistema |

Para a ponte do WhatsApp, o `npm run dev` precisa estar rodando em outro terminal.

---

## O que é cada arquivo

```
server/
  index.js         O sistema em si: todas as telas, regras e rotas
  db.js            Banco de dados (SQLite) e as tabelas
  auth.js          Contas, senhas, sessões e permissões
  email.js         Envio de e-mail (recuperação de senha)
  whatsapp.js      Ponte com o WhatsApp Web
  estilo.md        Como o bot deve falar — editável, muda o bot na hora
  importar.js      Importador de imóveis por arquivo
  baixar-fotos.js  Baixa as fotos para dentro do projeto

public/
  index.html       Estrutura do painel
  app.js           Todas as telas do painel
  styles.css       Aparência
  login.html       Tela de entrada e recuperação de senha
  imovel.html      Página de um imóvel (para mandar ao cliente)
  site.html        Os sites dos clientes
  captar.html      Formulário público de captação de leads

data/              Criada sozinha: banco, fotos e sessão do WhatsApp
.env               Suas chaves (nunca vai para o GitHub)
Dockerfile         Para publicar na nuvem
render.yaml        Configuração pronta do Render
```

---

## O que o sistema faz

- **Painel** — leads do mês, quentes, conversão, VGV da carteira
- **Leads** — CRM com funil, temperatura, anotações e histórico
- **Imóveis** — carteira com foto, busca e página própria de cada imóvel
- **Chatbot** — responde clientes no seu estilo, com base na sua carteira
- **Conversas** — tudo do WhatsApp, com liga/desliga geral e por cliente
- **Gerência** — atendimentos marcados pela IA, como foram marcados, imóveis
  de interesse e clientes esperando resposta
- **Sites** — cada imobiliária cliente ganha um site próprio, gerado a partir
  de uma descrição em texto
- **Usuários** — contas com perfis: administrador, gerente, corretor, assistente, cliente
- **Captação** — formulário público e webhook do Facebook/Instagram

---

## Problemas comuns

**`npm run dev` diz que não encontrou o comando** — o terminal não está na pasta do
projeto. O caminho antes do `>` precisa terminar em `royal-hub`.

**Mudei o `.env` e nada aconteceu** — pare com `Ctrl` + `C` e rode `npm run dev` de novo.
Mudança em `.env` só vale reiniciando.

**Mudei uma tela e não mudou no navegador** — `Ctrl` + `Shift` + `R`.

**O chatbot responde sem graça, sempre igual** — a chave da IA não está sendo aceita.
Olhe o terminal: se diz *"sem chave — respondendo pelo modo local"*, confira a chave no `.env`.

**Erro de git no `npm install`** — não deve acontecer nesta versão. Se acontecer,
instale o Git: https://git-scm.com/download/win
