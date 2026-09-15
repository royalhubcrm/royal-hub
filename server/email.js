// Envio de e-mail pelo SMTP do Gmail (ou outro), sem biblioteca externa.
// Configure no .env:
//   SMTP_EMAIL=seuemail@gmail.com
//   SMTP_SENHA=senha-de-app-de-16-letras   (myaccount.google.com > Segurança > Senhas de app)
//   SMTP_HOST=smtp.gmail.com     (opcional)
//   SMTP_PORTA=465               (opcional)
import tls from "node:tls";

const HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const PORTA = Number(process.env.SMTP_PORTA || 465);

export const emailConfigurado = () =>
  Boolean(process.env.SMTP_EMAIL && process.env.SMTP_SENHA);

function conversa(socket, comandos) {
  return new Promise((resolve, reject) => {
    let i = 0, buffer = "";
    const prazo = setTimeout(() => reject(new Error("SMTP demorou demais")), 20000);

    socket.on("data", (d) => {
      buffer += d.toString();
      if (!buffer.endsWith("\n")) return;
      const linhas = buffer.trim().split("\r\n");
      const ultima = linhas[linhas.length - 1];
      buffer = "";
      if (/^[45]/.test(ultima)) { clearTimeout(prazo); return reject(new Error("SMTP: " + ultima)); }
      if (/^\d{3}-/.test(ultima)) return;              // resposta ainda continua
      if (i >= comandos.length) { clearTimeout(prazo); return resolve(); }
      socket.write(comandos[i++] + "\r\n");
    });
    socket.on("error", (e) => { clearTimeout(prazo); reject(e); });
  });
}

export async function enviarEmail({ para, assunto, texto }) {
  if (!emailConfigurado()) throw new Error("SMTP não configurado no .env");
  const de = process.env.SMTP_EMAIL;
  const senha = process.env.SMTP_SENHA.replace(/\s/g, "");
  const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

  const corpo = [
    "From: Royal Hub <" + de + ">",
    "To: " + para,
    "Subject: =?UTF-8?B?" + b64(assunto) + "?=",
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64(texto).replace(/(.{76})/g, "$1\r\n"),
    ".",
  ].join("\r\n");

  const socket = tls.connect({ host: HOST, port: PORTA, servername: HOST });
  await new Promise((r, j) => { socket.once("secureConnect", r); socket.once("error", j); });

  await conversa(socket, [
    "EHLO royalhub",
    "AUTH LOGIN",
    b64(de),
    b64(senha),
    "MAIL FROM:<" + de + ">",
    "RCPT TO:<" + para + ">",
    "DATA",
    corpo,
    "QUIT",
  ]);
  socket.end();
  return true;
}
