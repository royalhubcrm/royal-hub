# Ponte do WhatsApp por QR code

Liga o WhatsApp do seu celular ao Royal CRM sem a API oficial da Meta. Roda num computador
que fique ligado — o CRM em si já vive na nuvem; **só esta ponte precisa de máquina ligada**.

## Instalar num computador Windows

1. Copie **esta pasta inteira** para o computador que vai ficar ligado, por exemplo em
   `C:\Royal\ponte-whatsapp`. Evite Área de Trabalho, Documentos sincronizados com OneDrive
   e pen drive: a ponte guarda a sessão do WhatsApp aqui dentro.
2. No painel do CRM, abra **Ajustes → WhatsApp**, escolha o canal **QR code** e clique em
   **Mostrar o token**. Deixe essa tela aberta.
3. Dê dois cliques em **INSTALAR.bat**. Ele instala o Node.js se faltar, abre o arquivo de
   configuração para você colar o **endereço da empresa** e o **token**, baixa o que falta,
   impede o computador de dormir e deixa a ponte subindo sozinha toda vez que o Windows entrar.
4. Volte ao painel, em **Ajustes → WhatsApp**: o QR code aparece lá. No celular:
   **WhatsApp → Aparelhos conectados → Conectar aparelho** e aponte para o código.

Pronto. As mensagens caem em Conversas, viram lead e a assistente responde conforme as
regras da tela Assistente.

## Instalar num Mac (iMac, MacBook)

1. Copie **esta pasta inteira** para o Mac, por exemplo em `~/Royal/ponte-whatsapp`.
   Evite a Área de Trabalho sincronizada com o iCloud: a sessão do WhatsApp fica gravada aqui dentro.
2. No painel do CRM, abra **Ajustes → WhatsApp**, canal **QR code**, e clique em **Mostrar o token**.
3. Dois cliques em **`INSTALAR.command`**. Na primeira vez o macOS pode barrar ("não foi possível
   verificar o desenvolvedor"): clique com o botão direito no arquivo → **Abrir** → **Abrir**.
   Ele instala o Node se faltar, abre o arquivo de configuração para você colar o endereço da
   empresa e o token, baixa o resto e deixa a ponte subindo sozinha sempre que você entrar no Mac.
4. Volte ao painel: o QR aparece em Ajustes → WhatsApp. No celular:
   **WhatsApp → Aparelhos conectados → Conectar aparelho**.

Os atalhos são os mesmos, com outro nome: `LIGAR.command`, `PARAR.command`,
`VER-REGISTRO.command` e `DESINSTALAR.command`.

**Para o Mac se comportar como servidor:** em Ajustes do Sistema → Bateria/Economia de energia,
marque **"Impedir que o Mac entre em repouso automaticamente quando a tela estiver desligada"**.
A tela pode apagar; o Mac não pode dormir. E não faça logout do usuário — a ponte sobe no login.

### Rodando pela mão, no terminal

Se preferir ver a ponte trabalhando na sua frente, abra a pasta no terminal e rode:

```
npm install     (só na primeira vez)
npm run whatsapp
```

O QR aparece no próprio terminal e também no painel. Só lembre: assim ela vive enquanto
aquela janela estiver aberta — fechou a janela ou caiu, parou. Para ficar de pé como
servidor, use o `INSTALAR.bat`.

### Os outros atalhos da pasta

| Arquivo | Para quê |
| --- | --- |
| `INSTALAR.bat` | a instalação completa, só na primeira vez |
| `LIGAR.bat` | ligar a ponte de novo depois de parar |
| `PARAR.bat` | parar a ponte (ela não volta sozinha até você ligar) |
| `VER-REGISTRO.bat` | abrir o `ponte.log` e ver o que ela andou fazendo |
| `DESINSTALAR.bat` | tirar do início automático (não apaga nada) |

### Para ele se comportar mesmo como servidor

- **Não deslogue o Windows.** A ponte sobe quando o usuário entra. Se o PC reiniciar sozinho
  (atualização do Windows, queda de luz), alguém precisa entrar no Windows uma vez — ou você
  liga o login automático nas contas do Windows.
- **Energia:** o `INSTALAR.bat` já desliga suspensão e hibernação na tomada. A tela pode apagar
  à vontade, isso não atrapalha.
- **Nobreak** resolve queda de luz; sem ele, a ponte volta quando alguém ligar o PC de novo.
- **Internet cabeada**, se der. Wi-Fi que cai derruba a conversa no meio.
- O celular que escaneou o QR precisa ter internet de vez em quando; se ficar dias desligado,
  o WhatsApp encerra a sessão.

## Ligar num Linux (VPS), se um dia quiser

`npm install` e depois `pm2 start ponte.js --name royal-ponte && pm2 save && pm2 startup`.

## Como se comporta

- Ignora grupos, status e canais.
- Se você escrever na conversa pelo celular, a assistente recua por 6 horas naquela conversa.
- "falar com o corretor", "atendente": desliga a assistente naquela conversa (religa em Conversas).
- Responde com alguns segundos de espera e "digitando…".
- A cada 45 s pergunta ao sistema o que o painel mandou (botão Enviar em Conversas) e as
  retomadas de quem sumiu, e entrega.

## Se cair

Ela reconecta sozinha, e o `ponte-sempre.bat` sobe de novo se o programa morrer.
Se o celular encerrar a sessão, apague a pasta `sessao` e escaneie de novo —
o QR volta a aparecer em Ajustes → WhatsApp.
