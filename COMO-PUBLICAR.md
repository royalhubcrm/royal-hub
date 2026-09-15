# Colocar o Royal Hub no ar

Dois caminhos. O primeiro é imediato e serve para mostrar hoje; o segundo é o definitivo.

---

## 1. Agora mesmo: túnel (5 minutos, sem conta, sem cartão)

Dá um endereço público `https://` que aponta para o sistema rodando na sua máquina.
Enquanto o computador estiver ligado com `npm run dev`, o site funciona para qualquer pessoa.

1. Baixe o cloudflared:
   https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
2. Renomeie para `cloudflared.exe` e salve na pasta do projeto.
3. Com o sistema rodando (`npm run dev`), abra outro terminal na pasta e rode:

   ```
   .\cloudflared.exe tunnel --url http://localhost:3000
   ```

4. Ele imprime um endereço parecido com `https://algo-aleatorio.trycloudflare.com`.
   Esse endereço é público: abre no celular, no cliente, em qualquer lugar.

5. Coloque esse endereço no `.env` para os links dos imóveis saírem certos:

   ```
   URL_PUBLICA=https://algo-aleatorio.trycloudflare.com
   ```

Limitação: o endereço muda toda vez que você reinicia o túnel, e cai quando o
computador desliga. Serve para demonstrar, não para vender.

---

## 2. Definitivo: Render (grátis para começar)

O sistema roda num servidor 24 horas, com endereço fixo e HTTPS.

1. Crie conta em https://render.com (login com GitHub ou e-mail).
2. Suba o projeto para um repositório no GitHub (sem a pasta `data` e sem o `.env` —
   o `.gitignore` já cuida disso).
3. No Render: **New** → **Blueprint** → aponte para o repositório.
   Ele lê o `render.yaml` que já está aqui e configura tudo sozinho.
4. Em **Environment**, cole:
   - `GROQ_API_KEY` — sua chave
   - `URL_PUBLICA` — o endereço que o Render te deu
5. Primeiro acesso: abra o endereço e crie a conta de administrador.

O disco de 1 GB guarda o banco e as fotos entre atualizações.

### Domínio próprio
Em **Settings → Custom Domain**, aponte `royalnegocios.com.br` (ou o domínio do cliente)
para o Render. Aí cada imobiliária acessa o site dela no próprio domínio.

### Observação sobre o plano gratuito
O serviço grátis do Render hiberna após 15 minutos sem acesso e demora ~30s para
acordar na primeira visita. Para uso comercial, o plano pago mais barato resolve.

---

## Antes de abrir para o mundo

- [ ] Criar a conta de administrador e guardar a senha
- [ ] Conferir se os perfis das outras pessoas estão certos
- [ ] Configurar `SMTP_EMAIL` e `SMTP_SENHA` para a recuperação de senha funcionar
- [ ] Levar as fotos (`public/fotos`) junto — elas não estão no GitHub por padrão
