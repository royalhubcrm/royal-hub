// WhatsApp oficial — Cloud API da Meta.
//
// Diferença para a ponte antiga (Baileys): aqui a Meta conhece e autoriza o
// número. Ninguém é banido por usar, a mensagem não se perde e não precisa de
// computador ligado com o celular pareado. É o que se pode vender para outra
// empresa sem colocar o número dela em risco.
//
// Cada empresa tem o SEU número. Por isso as chaves ficam na configuração da
// empresa (aba Ajustes), não no .env:
//   waToken        — token permanente do app na Meta
//   waNumeroId     — Phone Number ID do número
//   waVerificacao  — uma palavra que você inventa, usada só na hora de ligar
//
// O endereço do webhook que se cadastra na Meta é:
//   https://SEU-ENDERECO/api/whatsapp/<código da empresa>
//
// Enquanto essas três linhas estiverem vazias, este arquivo não faz nada e o
// sistema continua com a ponte antiga.

const API = "https://graph.facebook.com/v21.0";

export const oficialLigado = (config) =>
  Boolean(config?.waToken && config?.waNumeroId);

/* ---------------- enviar ---------------- */
async function chamar(config, corpo) {
  const r = await fetch(`${API}/${config.waNumeroId}/messages`, {
    method: "POST",
    headers: { authorization: "Bearer " + config.waToken, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...corpo }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("WhatsApp " + r.status + ": " + (j?.error?.message || "falhou"));
  return j;
}

export const enviarTexto = (config, para, texto) =>
  chamar(config, { to: para, type: "text", text: { preview_url: true, body: String(texto).slice(0, 4000) } });

export const enviarImagem = (config, para, url, legenda = "") =>
  chamar(config, { to: para, type: "image", image: { link: url, caption: legenda.slice(0, 1000) } });

export const enviarDocumento = (config, para, url, nome = "documento.pdf") =>
  chamar(config, { to: para, type: "document", document: { link: url, filename: nome } });

// marca como lida — o cliente vê o tique azul, como numa conversa de verdade
export const marcarLida = (config, idMensagem) =>
  chamar(config, { status: "read", message_id: idMensagem }).catch(() => null);

/* ---------------- receber ----------------
   A Meta manda um pacote com várias mensagens de uma vez. Aqui viram uma
   lista simples: de quem, o quê, e o nome que a pessoa usa no WhatsApp. */
export function lerRecebidas(corpo) {
  const saida = [];
  for (const entrada of corpo?.entry || []) {
    for (const m of entrada?.changes || []) {
      const v = m?.value;
      if (!v?.messages) continue;
      const contatos = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name || ""]));
      for (const msg of v.messages) {
        if (msg.type !== "text" && msg.type !== "button" && msg.type !== "interactive") continue;
        const texto = msg.text?.body || msg.button?.text ||
          msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || "";
        if (!texto) continue;
        saida.push({
          id: msg.id,
          de: msg.from,                       // número, só dígitos
          nome: contatos[msg.from] || "",
          texto,
          quando: new Date(Number(msg.timestamp || 0) * 1000).toISOString(),
        });
      }
    }
  }
  return saida;
}

// a Meta também avisa quando VOCÊ responde pelo celular — isso desliga o bot
export function respostasSuas(corpo) {
  const saida = [];
  for (const entrada of corpo?.entry || []) {
    for (const m of entrada?.changes || []) {
      for (const s of m?.value?.statuses || []) {
        if (s.status === "sent" && s.recipient_id) saida.push(s.recipient_id);
      }
    }
  }
  return saida;
}
