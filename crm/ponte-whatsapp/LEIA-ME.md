# Ponte do WhatsApp por QR code

Liga o WhatsApp do seu celular ao Royal CRM sem a API oficial da Meta. Roda num computador que fique ligado (o seu, ou um servidor pequeno).

## Ligar

1. No painel, em **Ajustes → WhatsApp**, escolha o canal **QR code** e clique em **Mostrar o token**.
2. Nesta pasta, copie `.env.exemplo` para `.env` e preencha `EMPRESA` (o endereço da empresa, o mesmo do link de captação) e `PONTE_TOKEN`.
3. `npm install` (uma vez) e depois `npm start`.
4. Volte ao painel: o QR aparece em **Ajustes → WhatsApp** (e também no terminal). No celular: WhatsApp → Aparelhos conectados → Conectar aparelho → aponte para o código.

Pronto: as mensagens aparecem em Conversas, viram lead e a assistente responde conforme as regras da tela Assistente. A sessão fica na pasta `sessao/`; para trocar de número, apague a pasta e rode de novo.

## Como se comporta

- Ignora grupos, status e canais.
- Se você escrever na conversa pelo celular, a assistente recua por 6 horas naquela conversa.
- "falar com o corretor", "atendente": desliga a assistente naquela conversa (religa em Conversas).
- Responde com alguns segundos de espera e "digitando…".
- A cada 45 s pergunta ao sistema o que o painel mandou (botão Enviar em Conversas) e as retomadas de quem sumiu, e entrega.

## Se cair

Ela reconecta sozinha. Se o celular encerrar a sessão, apague `sessao/` e escaneie de novo. Para manter ligado num servidor Linux, use `pm2 start ponte.js --name royal-ponte`.
