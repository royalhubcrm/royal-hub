/* Royal Hub — ponte do WhatsApp por QR code  (node ponte.js)
   Conecta no seu WhatsApp como um "aparelho conectado" e entrega ao sistema
   tudo o que chega. Quem decide se responde (e o quê) é o sistema; aqui a
   gente só leva e traz.

   Freios (iguais aos de antes):
   - grupos, status e canais são ignorados
   - se VOCÊ escrever na conversa (pelo celular ou pelo painel), a assistente recua
   - "falar com o corretor" / "atendente" desliga a assistente naquela conversa
   - responde com atraso e com "digitando…"
*/
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pasta = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(pasta, '.env')); } catch { /* sem .env: vale o que já está no ambiente */ }

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const EMPRESA = process.env.EMPRESA || '';
const TOKEN = process.env.PONTE_TOKEN || '';
const ESPERA_MIN = Number(process.env.WA_ESPERA_MIN || 6);   // segundos antes de responder
const ESPERA_MAX = Number(process.env.WA_ESPERA_MAX || 14);
const A_CADA = Number(process.env.WA_PENDENTES_SEG || 45);   // de quanto em quanto pergunta o que o painel deixou

if (!SUPABASE_URL || !EMPRESA || !TOKEN) {
  console.log('\n  Falta configurar o .env (copie o .env.exemplo): SUPABASE_URL, EMPRESA e PONTE_TOKEN.\n');
  process.exit(1);
}

const FUNCAO = `${SUPABASE_URL}/functions/v1/whatsapp?empresa=${encodeURIComponent(EMPRESA)}`;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const entre = (a, b) => a + Math.random() * (b - a);
const numero = (jid) => (jid || '').split('@')[0].split(':')[0];
const jidDe = (telefone) => telefone.replace(/\D/g, '') + '@s.whatsapp.net';
const hora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Quem você assumiu há pouco (escreveu pelo celular): a ponte não manda o que estava preparando. */
const assumidas = new Map();

async function sistema(corpo) {
  const r = await fetch(FUNCAO, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ponte-token': TOKEN },
    body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.erro || j?.error || ('sistema respondeu ' + r.status));
  return j;
}

const textoDe = (m) => {
  const c = m.message || {};
  return c.conversation || c.extendedTextMessage?.text || c.imageMessage?.caption || c.videoMessage?.caption
    || (c.imageMessage ? '[foto]' : c.audioMessage ? '[áudio]' : c.documentMessage ? '[documento]' : '');
};

/** Manda uma lista de envios (texto ou imagem) com jeito de gente: digitando, pausas. */
async function entregar(sock, envios, rotulo) {
  let jidAtual = '';
  for (const e of envios) {
    const jid = jidDe(e.telefone);
    if (assumidas.get(jid) > Date.now() - 6 * 36e5) { console.log('  · você assumiu ' + numero(jid) + ', não enviei'); continue; }
    if (jid !== jidAtual) { await sock.sendPresenceUpdate('composing', jid); await dormir(entre(2000, 5000)); jidAtual = jid; }
    try {
      if (e.tipo === 'imagem' && e.link) await sock.sendMessage(jid, { image: { url: e.link }, caption: e.texto || '' });
      else await sock.sendMessage(jid, { text: e.texto });
      console.log(`  ${rotulo} → ${numero(jid)}: ${String(e.texto).replace(/\n/g, ' / ').slice(0, 120)}`);
    } catch (err) {
      if (e.tipo === 'imagem') { try { await sock.sendMessage(jid, { text: e.texto }); } catch { /* deixa passar */ } }
      else console.log('  x não consegui enviar: ' + err.message);
    }
    await dormir(entre(1200, 3000));
  }
  if (jidAtual) await sock.sendPresenceUpdate('paused', jidAtual);
}

async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(pasta, 'sessao'));
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version, auth: state, logger: pino({ level: 'silent' }),
    markOnlineOnConnect: false, syncFullHistory: false,
    browser: ['Royal Hub', 'Chrome', '1.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (u) => {
    if (u.qr) {
      console.log('\n  No celular: WhatsApp → Aparelhos conectados → Conectar aparelho → aponte para o código:\n');
      qrcode.generate(u.qr, { small: true });
    }
    if (u.connection === 'open') {
      console.log('\n  Conectado. Controle tudo pela tela Conversas do sistema. Parar: Ctrl+C\n');
      clearInterval(relogio);
      relogio = setInterval(() => buscarPendentes(sock), A_CADA * 1000);
      setTimeout(() => buscarPendentes(sock), 5000);
    }
    if (u.connection === 'close') {
      clearInterval(relogio);
      if (u.lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
        console.log('\n  Sessão encerrada no celular. Apague a pasta "sessao" e rode de novo para escanear outro QR.\n');
        process.exit(0);
      }
      console.log('  Caiu, reconectando em 3s…');
      setTimeout(conectar, 3000);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      const jid = m.key.remoteJid || '';
      if (!jid.endsWith('@s.whatsapp.net')) continue; // grupos, status, canais, LID: fora
      const texto = textoDe(m).trim();
      if (!texto) continue;
      const telefone = numero(jid);
      const nome = m.pushName || '';

      try {
        if (m.key.fromMe) {
          assumidas.set(jid, Date.now());
          await sistema({ acao: 'ponte_mensagem', de: 'voce', telefone, texto });
          console.log(`  ${hora()} você → ${telefone}: ${texto.slice(0, 60)}   (assistente pausada nessa conversa)`);
          continue;
        }
        console.log(`\n  ${hora()} ${nome || telefone}: ${texto.slice(0, 200)}`);
        const r = await sistema({ acao: 'ponte_mensagem', de: 'cliente', telefone, nome, texto });
        if (r.motivo) console.log('  · sem resposta: ' + r.motivo);
        if (!r.envios?.length) continue;
        await sock.readMessages([m.key]).catch(() => null); // tique azul
        await dormir(entre(ESPERA_MIN, ESPERA_MAX) * 1000);
        await entregar(sock, r.envios, 'assistente');
      } catch (e) {
        console.log('  x ' + e.message);
      }
    }
  });
}

/* O que o painel mandou ("Enviar" na tela Conversas) e as retomadas de quem sumiu:
   o sistema decide, a ponte entrega. */
let relogio = null;
async function buscarPendentes(sock) {
  let r;
  try { r = await sistema({ acao: 'ponte_pendentes' }); } catch (e) { console.log('  x sistema: ' + e.message); return; }
  if (r.canal !== 'ponte') { console.log('  ! Em Ajustes → WhatsApp o canal está como "' + r.canal + '". Mude para "QR code" para a ponte responder.'); }
  if (!r.envios?.length) return;
  // mensagens do painel não são "você assumiu": você mandou de propósito
  for (const e of r.envios) assumidas.delete(jidDe(e.telefone));
  await entregar(sock, r.envios, 'painel');
}

console.log('\n  Royal Hub — ponte do WhatsApp (QR code)');
console.log('  Empresa: ' + EMPRESA + '   Sistema: ' + SUPABASE_URL + '\n');
conectar();
