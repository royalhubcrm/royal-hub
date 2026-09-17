/* Ponte WhatsApp Web  —  node server/whatsapp.js
   Conecta no seu WhatsApp por QR code. Tudo que passa aqui aparece na aba
   Conversas do sistema, e quem manda ou não mandar resposta é o sistema.

   Freios:
   - grupos e status são ignorados
   - se VOCÊ escrever na conversa (por aqui ou pelo celular), o bot recua sozinho
   - "falar com o ricardo" / "atendente" desliga o bot naquela conversa
   - responde com atraso e com "digitando..."
*/
import { makeWASocket,
  useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tokenInterno } from "./db.js";

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SISTEMA = "http://localhost:" + (process.env.PORT || 3000);
// endereço que o cliente abre no celular (troque quando publicar o sistema)
const SISTEMA_PUBLICO = process.env.URL_PUBLICA || SISTEMA;

const PAUSA_HORAS = Number(process.env.WA_PAUSA_HORAS || 6);
const ESPERA_MIN = Number(process.env.WA_ESPERA_MIN || 6);
const ESPERA_MAX = Number(process.env.WA_ESPERA_MAX || 14);

const historico = new Map();
const jaVirouLead = new Set();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const numero = (jid) => (jid || "").split("@")[0];

const TOKEN = tokenInterno();

async function api(rota, opcoes) {
  const r = await fetch(SISTEMA + rota, {
    ...opcoes,
    headers: { "content-type": "application/json", "x-royal-token": TOKEN },
  });
  if (!r.ok) throw new Error(rota + " respondeu " + r.status);
  return r.json();
}

const registrar = (jid, de, texto, nome) =>
  api("/api/wa/mensagem", {
    method: "POST",
    body: JSON.stringify({ jid, de, texto, nome, pausarHoras: PAUSA_HORAS }),
  }).catch(() => null);

async function responder(jid, texto, nome = "") {
  const h = historico.get(jid) || [];
  h.push({ papel: "cliente", texto });
  const j = await api("/api/chat", {
    method: "POST",
    body: JSON.stringify({ mensagens: h.slice(-12), jid, nome, telefone: numero(jid) }),
  });
  h.push({ papel: "bot", texto: j.texto });
  historico.set(jid, h.slice(-12));
  return j;                       // { texto, fotos, agendamento, duvidas }
}

async function virarLead(jid, nome, texto) {
  if (jaVirouLead.has(jid)) return;
  jaVirouLead.add(jid);
  await api("/api/leads", {
    method: "POST",
    body: JSON.stringify({
      nome: nome || numero(jid), telefone: numero(jid), origem: "WhatsApp",
      interesse: String(texto).slice(0, 200), temperatura: "Morno", estagio: "Em contato",
    }),
  }).catch(() => null);
}

const textoDe = (m) => {
  const c = m.message || {};
  return c.conversation || c.extendedTextMessage?.text ||
         c.imageMessage?.caption || c.videoMessage?.caption || "";
};

async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(raiz, "data", "wa-sessao"));
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version, auth: state, printQRInTerminal: false,
    markOnlineOnConnect: false, syncFullHistory: false,
    browser: ["Royal Hub", "Chrome", "1.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (u) => {
    if (u.qr) {
      console.log("\n  WhatsApp do celular → Aparelhos conectados → Conectar aparelho\n");
      qrcode.generate(u.qr, { small: true });
    }
    if (u.connection === "open")
      console.log("\n  Conectado. Controle tudo pela aba Conversas do sistema.\n  Parar: Ctrl+C\n");
    if (u.connection === "close") {
      if (u.lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
        console.log("\n  Sessão encerrada no celular. Apague data/wa-sessao e conecte de novo.\n");
        process.exit(0);
      }
      console.log("  Caiu, reconectando...");
      setTimeout(conectar, 3000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const m of messages) {
      const jid = m.key.remoteJid || "";
      if (jid.endsWith("@g.us") || jid === "status@broadcast" || jid.endsWith("@newsletter")) continue;

      const texto = textoDe(m).trim();
      if (!texto) continue;
      const nome = m.pushName || "";

      // você escreveu (daqui ou do celular) → registra e o sistema recua o bot
      if (m.key.fromMe) {
        await registrar(jid, "voce", texto, nome);
        console.log("  você → " + numero(jid) + ": " + texto.slice(0, 60) + "   (bot pausado " + PAUSA_HORAS + "h)");
        continue;
      }

      await registrar(jid, "cliente", texto, nome);
      await virarLead(jid, nome, texto);
      console.log("\n  " + (nome || numero(jid)) + ": " + texto);

      if (/falar com o ricardo|falar com humano|atendente|pessoa de verdade/i.test(texto)) {
        await api("/api/wa/conversas/" + encodeURIComponent(jid) + "/bot",
          { method: "POST", body: JSON.stringify({ ativo: false }) }).catch(() => null);
        console.log("  ! pediu atendimento humano — bot desligado nessa conversa");
        continue;
      }

      const estado = await api("/api/wa/pode/" + encodeURIComponent(jid) + "?primeira=" + encodeURIComponent(texto.slice(0,120))).catch(() => ({ pode: false, motivo: "sistema fora do ar" }));
      if (!estado.pode) { console.log("  · sem resposta: " + estado.motivo); continue; }

      try {
        const j = await responder(jid, texto, nome);
        const resposta = j.texto;
        await dormir((ESPERA_MIN + Math.random() * (ESPERA_MAX - ESPERA_MIN)) * 1000);

        // conferir de novo: você pode ter assumido a conversa nesse meio tempo
        const ok = await api("/api/wa/pode/" + encodeURIComponent(jid)).catch(() => ({ pode: false }));
        if (!ok.pode) { console.log("  · você assumiu, não enviei"); continue; }

        await sock.sendPresenceUpdate("composing", jid);
        await dormir(2000 + Math.random() * 3000);
        for (const parte of resposta.split(/\n{2,}/).filter(Boolean)) {
          await sock.sendMessage(jid, { text: parte.trim() });
          await dormir(1200 + Math.random() * 1800);
        }
        // fotos: só as que a assistente pediu pelo marcador [ENVIAR_FOTO_IMOVEL_XXXX]
        for (const codigo of (j.fotos || []).slice(0, 2)) {
          const m = await api("/api/imoveis/" + codigo).catch(() => null);
          if (!m) continue;
          // link só quando existe endereço público de verdade: ninguém abre localhost
          const ehLocal = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(SISTEMA_PUBLICO);
          const legenda = `${m.tipo} no ${m.bairro} — cód. ${m.codigo}` +
            (ehLocal ? "" : `\n${SISTEMA_PUBLICO}/imovel/${m.codigo}`);
          try {
            if (m.foto && /^https?:/.test(m.foto)) await sock.sendMessage(jid, { image: { url: m.foto }, caption: legenda });
            else if (m.foto) await sock.sendMessage(jid, { image: { url: SISTEMA + m.foto }, caption: legenda });
            else await sock.sendMessage(jid, { text: legenda });
          } catch { await sock.sendMessage(jid, { text: legenda }); }
          await dormir(1500);
        }

        await sock.sendPresenceUpdate("paused", jid);
        await registrar(jid, "bot", resposta, nome);
        // a IA relê a conversa e anota agendamento e imóveis de interesse
        api("/api/wa/analisar", { method:"POST", body: JSON.stringify({ jid, nome, telefone: numero(jid) }) })
          .then(r => { if (r?.agendamento) console.log("  ✓ atendimento marcado: " +
            (r.agendamento.data || "sem data") + " " + (r.agendamento.hora || "")); })
          .catch(() => null);
        console.log("  bot: " + resposta.replace(/\n/g, " / ").slice(0, 140));
        if (j.agendamento) console.log("  ✓ atendimento marcado pela assistente: " +
          (j.agendamento.data || "") + " " + (j.agendamento.hora || ""));
        for (const d of j.duvidas || []) console.log("  ? dúvida para você: " + (d.pergunta || ""));
      } catch (e) {
        console.log("  x " + e.message);
      }
    }
  });
}

console.log("\n  Royal Hub — ponte do WhatsApp");
console.log("  O sistema (npm run dev) precisa estar rodando em " + SISTEMA + "\n");
conectar();
