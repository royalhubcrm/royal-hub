/* Royal Hub — front-end (sem framework) */
const ESTAGIOS = ["Novo","Em contato","Visita","Proposta","Fechado","Perdido"];
const TEMPS = ["Quente","Morno","Frio"];

const state = {
  view:"dash", leads:[], imoveis:[], cfg:{empresa:"Royal Negócios Imobiliários",corretor:"Ricardo"},
  sel:null, filtros:{q:"",bairro:"",tipo:"",estagio:"",temp:""}, chat:[], pensando:false, iaLigada:false,
  conversas:[], convSel:null, convMsgs:[], convTimer:null,
  usuario:null, usuarios:[], papeis:{}, equipes:[], ger:null, gerSel:null, gerDet:null, sites:[], siteRascunho:null, siteEditando:null
};

const BRL = n => (Number(n)||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0});
const esc = s => String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const hoje = () => new Date().toISOString().slice(0,10);
const digits = s => String(s||"").replace(/\D/g,"");
const diasAtras = n => { const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); };
const val = id => (document.getElementById(id)||{}).value || "";

async function api(rota, opcoes){
  const r = await fetch("/api"+rota, {headers:{"content-type":"application/json"}, ...opcoes});
  const j = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.erro || ("Erro "+r.status));
  return j;
}
/* ---- instalação como aplicativo ---- */
let convitePWA = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); convitePWA = e;
  const b = document.getElementById("btn-instalar");
  if (b) b.hidden = false;
});
window.addEventListener("appinstalled", () => { convitePWA = null; const b=document.getElementById("btn-instalar"); if(b) b.hidden = true; });

async function instalarApp(){
  if(!convitePWA){
    alert("No celular: abra o menu do navegador e escolha \"Adicionar à tela inicial\".\n\nNo computador: clique no ícone de instalar na barra de endereço.");
    return;
  }
  convitePWA.prompt();
  await convitePWA.userChoice;
  convitePWA = null;
  const b = document.getElementById("btn-instalar"); if(b) b.hidden = true;
}

/* ===== memória do navegador =====
   As listas grandes ficam guardadas aqui. Ao abrir, a tela aparece na hora com
   o que já estava salvo; depois o sistema pergunta "mudou alguma coisa?" e só
   baixa de novo o que mudou de verdade. */
const CACHE_V = "rh1";
const chaveCache = (nome) => "royal:" + CACHE_V + ":" + nome;

function lerGuardado(nome){
  try{
    const bruto = localStorage.getItem(chaveCache(nome));
    if(!bruto) return null;
    const o = JSON.parse(bruto);
    return (o && "dados" in o) ? o : null;
  }catch{ return null; }
}

function guardar(nome, dados, assinatura){
  try{ localStorage.setItem(chaveCache(nome), JSON.stringify({ dados, assinatura, em: Date.now() })); }
  catch{ /* navegador sem espaço ou em aba anônima: segue sem cache */ }
}

function esquecerTudo(){
  try{
    for(const k of Object.keys(localStorage)) if(k.startsWith("royal:")) localStorage.removeItem(k);
  }catch{}
}

async function carregar(){
  try{
    const a = await (await fetch("/api/auth/estado")).json();
    state.usuario = a.usuario; state.papeis = a.papeis || {};
    state.empresa = a.empresa || null; state.cobranca = a.cobranca || null;
    if(!a.usuario){ esquecerTudo(); return location.href = "/login"; }
  }catch{}

  // 1) pinta com o que já está guardado, sem esperar a rede
  const gLeads = lerGuardado("leads"), gImoveis = lerGuardado("imoveis"), gCfg = lerGuardado("config");
  if(gLeads) state.leads = gLeads.dados;
  if(gImoveis) state.imoveis = gImoveis.dados;
  if(gCfg){ state.cfg = gCfg.dados; state.iaLigada = !!gCfg.dados.iaLigada; }
  if(gLeads || gImoveis || gCfg) render();

  // 2) pergunta o que mudou — é uma requisição pequena
  let v = {};
  try{ v = await api("/versao"); }
  catch{ if(!(gLeads && gImoveis && gCfg)) v = { leads:"?", imoveis:"?", config:"?" }; }

  const precisa = (nome, guardado) => !guardado || guardado.assinatura !== v[nome];
  const tarefas = [];

  if(precisa("leads", gLeads))
    tarefas.push(api("/leads").then(d => { state.leads = d; guardar("leads", d, v.leads); }));
  if(precisa("imoveis", gImoveis))
    tarefas.push(api("/imoveis").then(d => { state.imoveis = d; guardar("imoveis", d, v.imoveis); }));
  if(precisa("config", gCfg))
    tarefas.push(api("/config").then(d => { state.cfg = d; state.iaLigada = !!d.iaLigada; guardar("config", d, v.config); }));

  if(!state.usuarios.length) api("/usuarios").then(u => { state.usuarios = u; }).catch(()=>{});
  if(tarefas.length){ await Promise.all(tarefas); render(); }
  else if(!(gLeads || gImoveis || gCfg)) render();

  state.nuvem = !!v.nuvem;
  carregarConversas();
}

/* ===================== métricas ===================== */
function metricas(){
  const L = state.leads, I = state.imoveis;
  const mes = new Date().toISOString().slice(0,7);
  const noMes = L.filter(l=>(l.criado_em||"").slice(0,7)===mes).length;
  const quentes = L.filter(l=>l.temperatura==="Quente" && !["Fechado","Perdido"].includes(l.estagio)).length;
  const abertos = L.filter(l=>!["Fechado","Perdido"].includes(l.estagio)).length;
  const fechados = L.filter(l=>l.estagio==="Fechado").length;
  const vgv = I.reduce((s,m)=>s+(Number(m.preco)||0),0);
  return {total:L.length,noMes,quentes,abertos,fechados,conv:L.length?Math.round(fechados/L.length*100):0,imoveis:I.length,vgv};
}
function serie14(){
  const dias=[]; for(let i=13;i>=0;i--) dias.push(diasAtras(i));
  return dias.map(d=>({d,n:state.leads.filter(l=>(l.criado_em||"").slice(0,10)===d).length}));
}

/* ===================== render ===================== */
function tickConversas(){
  clearInterval(state.convTimer);
  if(state.view==="conversas") state.convTimer = setInterval(carregarConversas, 5000);
}

function render(){
  document.querySelectorAll(".navbtn").forEach(b=>b.setAttribute("aria-current", String(b.dataset.v===state.view)));
  document.getElementById("cnt-leads").textContent = state.leads.length || "";
  document.getElementById("cnt-imv").textContent = state.imoveis.length || "";
  const naoLidas = state.conversas.reduce((t,c)=>t+(c.nao_lidas||0),0);
  const elc = document.getElementById("cnt-conv"); if(elc) elc.textContent = naoLidas || "";
  const eu = state.usuario;
  document.getElementById("railfoot").innerHTML = eu
    ? esc(eu.nome)+"<br><span class='muted'>"+esc(state.papeis[eu.papel]||eu.papel)+"</span>"+
      "<br><a class='sairlink' onclick='sair()'>Sair</a>"
    : esc(state.cfg.corretor||"")+"<br><span class='muted'>"+esc(state.cfg.empresa||"")+"</span>";
  const navU = document.getElementById("nav-usuarios");
  if(navU) navU.hidden = !(eu && eu.papel === "admin");
  const navS = document.getElementById("nav-sites");
  if(navS) navS.hidden = !(eu && eu.papel === "admin");
  const bi = document.getElementById("btn-instalar");
  if(bi && !convitePWA && !window.matchMedia("(display-mode: standalone)").matches) bi.hidden = false;
  const navG = document.getElementById("nav-gerencia");
  if(navG) navG.hidden = !(eu && (eu.papel === "admin" || eu.papel === "gerente"));
  document.getElementById("main").innerHTML =
    ({dash:vDash,leads:vLeads,imoveis:vImoveis,bot:vBot,conversas:vConversas,captacao:vCaptacao,gerencia:vGerencia,sites:vSites,usuarios:vUsuarios,config:vConfig}[state.view])();
  if(state.view==="config" && !state.portais) carregarPortais();
  if(state.view==="bot") scrollChat();
  tickConversas();
  renderDrawer();
}

function vDash(){
  const k = metricas(), s = serie14(), max = Math.max(1,...s.map(x=>x.n));
  const funil = ESTAGIOS.map(e=>({e,n:state.leads.filter(l=>l.estagio===e).length}));
  const fmax = Math.max(1,...funil.map(f=>f.n));
  const recentes = state.leads.slice(0,7);
  const w=520,h=150,pad=22,bw=(w-pad*2)/14;
  const barras = s.map((x,i)=>{
    const bh = x.n? Math.max(3,(h-pad-18)*(x.n/max)) : 2;
    return `<rect x="${pad+i*bw+3}" y="${h-18-bh}" width="${bw-6}" height="${bh}" rx="2" fill="${x.n?'#C9A227':'#2C281F'}"></rect>`;
  }).join("");
  const rotulos = s.map((x,i)=> (i%3===0||i===13)
    ? `<text x="${pad+i*bw+bw/2}" y="${h-4}" fill="#6F6858" font-size="9" text-anchor="middle" font-family="IBM Plex Mono">${x.d.slice(8)}/${x.d.slice(5,7)}</text>`:"").join("");
  return `
  <div class="head"><div><p class="eyebrow">Painel</p><h1>Bom trabalho, ${esc((state.cfg.corretor||"corretor").split(" ")[0])}</h1>
  <p>Leads dos anúncios, carteira de imóveis e atendimento automático, em um lugar só.</p></div>
  <button class="btn primary" onclick="novoLead()">+ Novo lead</button></div>
  ${state.iaLigada?"":`<div class="banner">Chatbot sem chave de IA: ele responde pelo modo local, com a sua carteira. Para a IA completa, coloque <span class="mono">GROQ_API_KEY</span> no arquivo <span class="mono">.env</span> e reinicie o servidor.</div>`}
  <div class="kpis">
    <div class="kpi accent"><div class="k">Leads no mês</div><div class="v num">${k.noMes}</div><div class="s">${k.total} no total</div></div>
    <div class="kpi"><div class="k">Quentes agora</div><div class="v num" style="color:var(--quente)">${k.quentes}</div><div class="s">prioridade de contato</div></div>
    <div class="kpi"><div class="k">Em atendimento</div><div class="v num">${k.abertos}</div><div class="s">negócios abertos</div></div>
    <div class="kpi"><div class="k">Conversão</div><div class="v num">${k.conv}%</div><div class="s">${k.fechados} fechado(s)</div></div>
    <div class="kpi"><div class="k">Carteira</div><div class="v num">${k.imoveis}</div><div class="s">${BRL(k.vgv)} em VGV</div></div>
  </div>
  <div class="cols">
    <div style="display:flex;flex-direction:column;gap:18px">
      <div class="card"><h3>Leads nos últimos 14 dias</h3>
        <svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Leads por dia">
          <line x1="${pad}" y1="${h-18}" x2="${w-pad+6}" y2="${h-18}" stroke="#332E25"></line>
          <text x="2" y="${pad}" fill="#6F6858" font-size="9" font-family="IBM Plex Mono">${max}</text>
          ${barras}${rotulos}
        </svg></div>
      <div class="card"><h3>Últimos leads</h3>
        <div class="list">${recentes.length?recentes.map(l=>`
          <div class="lrow" onclick="abrirLead('${l.id}')">
            <span class="pill ${(l.temperatura||'Frio').toLowerCase()}"><i></i>${esc(l.temperatura||"Frio")}</span>
            <span class="nm">${esc(l.nome||"(sem nome)")}<div class="meta">${esc(l.interesse||l.origem||"")}</div></span>
            <span class="meta num">${esc(l.criado_em||"")}</span>
          </div>`).join(""):`<div class="empty">Nenhum lead ainda. Ligue o formulário de captação ou cadastre manualmente.</div>`}</div></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:18px">
      <div class="card"><h3>Funil</h3><div class="funil">${funil.map(f=>`
        <div class="frow"><span class="muted">${f.e}</span><div class="fbar"><span style="width:${Math.round(f.n/fmax*100)}%"></span></div><span class="num">${f.n}</span></div>`).join("")}</div></div>
      <div class="card"><h3>Mais procurados</h3><div class="list">${maisProcurados()}</div></div>
    </div>
  </div>`;
}
function maisProcurados(){
  const cont = {};
  state.leads.forEach(l=>(l.imoveis||[]).forEach(c=>cont[c]=(cont[c]||0)+1));
  const top = Object.entries(cont).sort((a,b)=>b[1]-a[1]).slice(0,5);
  if(!top.length) return `<div class="empty" style="padding:16px">Vincule imóveis aos leads para ver o ranking.</div>`;
  return top.map(([cod,n])=>{ const m = state.imoveis.find(x=>x.codigo===cod);
    return `<div class="lrow"><span class="mono" style="color:var(--gold-soft)">${esc(cod)}</span><span class="nm">${esc(m?(m.tipo+" • "+m.bairro):"—")}</span><span class="meta num">${n} lead(s)</span></div>`;}).join("");
}

function vLeads(){
  const f = state.filtros;
  const lista = state.leads.filter(l=>{
    const t=(l.nome+" "+l.telefone+" "+(l.interesse||"")+" "+(l.campanha||"")).toLowerCase();
    return (!f.q||t.includes(f.q.toLowerCase())) && (!f.estagio||l.estagio===f.estagio) && (!f.temp||l.temperatura===f.temp);
  });
  return `
  <div class="head"><div><p class="eyebrow">CRM</p><h1>Leads</h1><p>Cada lead que cai dos anúncios entra aqui. Clique para abrir, anotar e gerar a mensagem.</p></div>
  <div style="display:flex;gap:9px"><button class="btn" onclick="abrirImportarLeads()">Importar planilha</button><button class="btn primary" onclick="novoLead()">+ Novo lead</button></div></div>
  <div class="toolbar">
    <input id="fq" placeholder="Buscar nome, telefone, campanha" value="${esc(f.q)}" oninput="state.filtros.q=this.value;render();foco('fq')">
    <select onchange="state.filtros.estagio=this.value;render()"><option value="">Todos os estágios</option>${ESTAGIOS.map(e=>`<option ${f.estagio===e?"selected":""}>${e}</option>`).join("")}</select>
    <select onchange="state.filtros.temp=this.value;render()"><option value="">Toda temperatura</option>${TEMPS.map(e=>`<option ${f.temp===e?"selected":""}>${e}</option>`).join("")}</select>
    <span class="muted num">${lista.length} de ${state.leads.length}</span>
  </div>
  ${lista.length?`<div class="tablewrap"><table>
    <thead><tr><th>Lead</th><th>Contato</th><th>Interesse</th><th>Origem</th><th>Temp.</th><th>Estágio</th><th>Entrou</th></tr></thead>
    <tbody>${lista.map(l=>`<tr onclick="abrirLead('${l.id}')" style="cursor:pointer">
      <td><b>${esc(l.nome||"(sem nome)")}</b></td>
      <td class="num">${esc(l.telefone||"—")}</td>
      <td>${esc(l.interesse||"—")}</td>
      <td class="muted">${esc(l.origem||"—")}${l.campanha?`<div style="font-size:11px">${esc(l.campanha)}</div>`:""}</td>
      <td><span class="pill ${(l.temperatura||'Frio').toLowerCase()}"><i></i>${esc(l.temperatura||"Frio")}</span></td>
      <td onclick="event.stopPropagation()"><select onchange="mudarEstagio('${l.id}',this.value)">${ESTAGIOS.map(e=>`<option ${l.estagio===e?"selected":""}>${e}</option>`).join("")}</select></td>
      <td class="num muted">${esc(l.criado_em||"")}</td></tr>`).join("")}</tbody></table></div>`
  :`<div class="empty">Nenhum lead com esses filtros.</div>`}`;
}

// monta a folha com os três primeiros imóveis da busca atual e abre para ver
async function folhaPDF(){
  const f = state.filtros;
  const lista = state.imoveis.filter(m=>{
    const t=(m.codigo+" "+m.tipo+" "+m.bairro+" "+(m.descricao||"")).toLowerCase();
    return (!f.q||t.includes(f.q.toLowerCase())) && (!f.bairro||m.bairro===f.bairro) && (!f.tipo||m.tipo===f.tipo);
  }).slice(0,3);
  if(!lista.length) return alert("Nenhum imóvel na busca para montar a folha.");
  try{
    const r = await fetch("/api/imoveis/folha", {method:"POST", headers:{"content-type":"application/json"},
      body: JSON.stringify({codigos: lista.map(m=>m.codigo)})});
    if(!r.ok) throw new Error((await r.json().catch(()=>({}))).erro || "Não consegui montar a folha.");
    const url = URL.createObjectURL(await r.blob());
    window.open(url, "_blank");
    setTimeout(()=>URL.revokeObjectURL(url), 60000);
  }catch(e){ alert(e.message); }
}

function vImoveis(){
  const f = state.filtros;
  const bairros = [...new Set(state.imoveis.map(m=>m.bairro).filter(Boolean))].sort();
  const tipos = [...new Set(state.imoveis.map(m=>m.tipo).filter(Boolean))].sort();
  const lista = state.imoveis.filter(m=>{
    const t=(m.codigo+" "+m.tipo+" "+m.bairro+" "+(m.descricao||"")).toLowerCase();
    return (!f.q||t.includes(f.q.toLowerCase())) && (!f.bairro||m.bairro===f.bairro) && (!f.tipo||m.tipo===f.tipo);
  });
  return `
  <div class="head"><div><p class="eyebrow">Carteira</p><h1>Imóveis</h1><p>A base que o chatbot consulta para responder o cliente.</p></div>
  <div style="display:flex;gap:9px"><button class="btn" onclick="folhaPDF()">Folha em PDF</button><button class="btn" onclick="abrirImportar()">Importar</button><button class="btn" onclick="baixarFotos(this)">Baixar fotos</button><button class="btn primary" onclick="novoImovel()">+ Imóvel</button></div></div>
  <div class="toolbar">
    <input id="fqi" placeholder="Buscar código, bairro, descrição" value="${esc(f.q)}" oninput="state.filtros.q=this.value;render();foco('fqi')">
    <select onchange="state.filtros.bairro=this.value;render()"><option value="">Todos os bairros</option>${bairros.map(b=>`<option ${f.bairro===b?"selected":""}>${esc(b)}</option>`).join("")}</select>
    <select onchange="state.filtros.tipo=this.value;render()"><option value="">Todos os tipos</option>${tipos.map(b=>`<option ${f.tipo===b?"selected":""}>${esc(b)}</option>`).join("")}</select>
    <span class="muted num">${lista.length} imóvel(is)</span>
  </div>
  ${lista.length?`<div class="grid">${lista.map(m=>`
    <article class="imv">
      <div class="ph">${m.foto?`<img src="${esc(m.foto)}" alt="${esc(m.tipo+" "+m.bairro)}" loading="lazy">`:`<div class="noimg">sem foto</div>`}<span class="cod">${esc(m.codigo)}</span></div>
      <div class="bd">
        <div class="pz">${m.preco?BRL(m.preco):"Sob consulta"}</div>
        <div class="tt">${esc(m.tipo||"Imóvel")} — ${esc(m.bairro||"")}${m.cidade?", "+esc(m.cidade):""}</div>
        <div class="sp">${m.quartos?`<span>${m.quartos} qto</span>`:""}${m.suites?`<span>${m.suites} suíte</span>`:""}${m.vagas?`<span>${m.vagas} vaga</span>`:""}${m.area?`<span>${m.area} m²</span>`:""}</div>
      </div>
      <div class="ax"><a class="btn sm" href="/imovel/${esc(m.codigo)}" target="_blank" rel="noopener">Ver imóvel</a><button class="btn sm" onclick="copiarTexto(location.origin+'/imovel/${esc(m.codigo)}')">Copiar link</button><button class="btn sm ghost" onclick="editarImovel('${m.id}')">Editar</button></div>
    </article>`).join("")}</div>`
  :`<div class="empty">Carteira vazia. Use <b>Importar</b> para colar os imóveis da Chave7 ou cadastre um manualmente.</div>`}`;
}

function vBot(){
  return `
  <div class="head"><div><p class="eyebrow">Atendimento</p><h1>Chatbot</h1>
  <p>Responde com base na sua carteira. Nada vai para o cliente sem você aprovar — copie o texto e envie.</p></div>
  <button class="btn" onclick="state.chat=[];render()">Limpar conversa</button></div>
  <div class="chat">
    <div class="msgs" id="msgs">
      ${state.chat.length?state.chat.map((m,i)=>`
        <div class="msg ${m.papel==='user'?'cli':'bot'}">
          <div class="who">${m.papel==='user'?'Cliente':'Bot Royal'}</div>${esc(m.texto)}
          ${m.papel!=='user'?`<div style="margin-top:8px"><button class="btn sm" onclick="copiar(${i})">Copiar resposta</button></div>`:""}
        </div>`).join(""):`<div class="empty" style="margin:auto;max-width:420px">Escreva como se fosse o cliente — “tem casa de 3 quartos até 600 mil?” — e veja a resposta que o bot daria.</div>`}
      ${state.pensando?`<div class="msg bot"><div class="who">Bot Royal</div>Consultando a carteira…</div>`:""}
    </div>
    <form class="cbar" onsubmit="enviarChat(event)">
      <input id="chatin" placeholder="Mensagem do cliente" autocomplete="off" ${state.iaLigada?"":"disabled"}>
      <button class="btn primary" ${state.iaLigada?"":"disabled"}>Responder</button>
    </form>
  </div>`;
}

function vCaptacao(){
  const base = location.origin;
  return `
  <div class="head"><div><p class="eyebrow">Entrada de leads</p><h1>Captação dos anúncios</h1>
  <p>Ligue o formulário do Facebook e do Instagram ao sistema, ou use o link público nos seus anúncios.</p></div></div>
  <div class="cols">
    <div style="display:flex;flex-direction:column;gap:18px">
      <div class="card"><h3>Formulário público</h3>
        <p class="muted" style="margin-top:0">Use como destino do anúncio ou link da bio. O que o cliente preencher entra em Leads na hora.</p>
        <div class="code">${esc(base)}/captar?c=NOME-DA-CAMPANHA</div>
        <div style="display:flex;gap:9px;margin-top:12px">
          <button class="btn sm" onclick="copiarTexto('${esc(base)}/captar')">Copiar link</button>
          <a class="btn sm" href="/captar" target="_blank" rel="noopener">Abrir</a></div>
      </div>
      <div class="card"><h3>Webhook para Make / Zapier / n8n</h3>
        <p class="muted" style="margin-top:0">Conecte o formulário de cadastro do Meta a este endereço e o lead cai direto no CRM.</p>
        <div class="code">POST ${esc(base)}/api/webhook/meta?token=SEU_TOKEN

{ "nome": "...", "telefone": "...", "interesse": "...", "campanha": "..." }</div>
        <p class="muted" style="font-size:12px">O token é o <span class="mono">WEBHOOK_TOKEN</span> do arquivo <span class="mono">.env</span>. Para o Facebook chamar direto, o sistema precisa estar publicado na internet (ngrok ou uma VPS).</p>
      </div>
    </div>
    <div class="card"><h3>Passo a passo no Meta</h3>
      <ol class="steps">
        <li><div><b>Anúncio com formulário instantâneo</b><div class="muted">Gerenciador de Anúncios → objetivo “Cadastros” → campos nome, telefone e o que procura.</div></div></li>
        <li><div><b>Conecte o formulário</b><div class="muted">Em Ferramentas de publicação → Formulários de cadastro → integração com Make/Zapier apontando para o webhook acima.</div></div></li>
        <li><div><b>Teste</b><div class="muted">Envie um lead de teste pela ferramenta de teste do Meta e veja ele aparecer em Leads.</div></div></li>
        <li><div><b>Responda</b><div class="muted">Abra o lead, clique em “Gerar mensagem”, revise e mande pelo WhatsApp.</div></div></li>
      </ol>
    </div>
  </div>`;
}

function vConfig(){
  const c = state.cfg;
  return `
  <div class="head"><div><p class="eyebrow">Ajustes</p><h1>Seus dados</h1><p>Usados no chatbot e no formulário de captação.</p></div></div>
  <div class="card" style="max-width:560px"><div style="display:flex;flex-direction:column;gap:13px">
    <div class="row2">
      <div class="field"><label for="c-corretor">Corretor</label><input id="c-corretor" value="${esc(c.corretor||"")}"></div>
      <div class="field"><label for="c-creci">CRECI</label><input id="c-creci" value="${esc(c.creci||"")}"></div>
    </div>
    <div class="row2">
      <div class="field"><label for="c-empresa">Imobiliária</label><input id="c-empresa" value="${esc(c.empresa||"")}"></div>
      <div class="field"><label for="c-whats">WhatsApp (só números)</label><input id="c-whats" class="num" value="${esc(c.whats||"")}" placeholder="5534999999999"></div>
    </div>
    <div class="field"><label for="c-estilo">Como o bot deve falar</label><textarea id="c-estilo" placeholder="Ex.: cumprimenta pelo nome, fala direto, nunca promete desconto sem falar comigo.">${esc(c.estilo||"")}</textarea></div>
    <div style="display:flex;gap:10px;align-items:center"><button class="btn primary" onclick="gravarCfg()">Salvar</button><span id="cfg-msg" class="muted"></span></div>
    <p class="muted" style="font-size:12px;margin:0">Chatbot: ${state.iaLigada?"ligado":"desligado — falta a chave da Anthropic no arquivo .env"}</p>
  </div></div>

  <div class="card" style="max-width:560px;margin-top:18px">
    <h3 style="margin-top:0">WhatsApp oficial</h3>
    <p class="meta" style="margin-top:0">O número aprovado pela Meta. Com ele, não existe risco de banimento, a mensagem não se perde e não precisa de computador ligado. Enquanto estiver em branco, o sistema usa a ponte antiga (QR code).</p>
    <div style="display:flex;flex-direction:column;gap:13px">
      <div class="field"><label for="c-wa-id">Phone Number ID</label><input id="c-wa-id" class="num" value="${esc(c.waNumeroId||"")}" placeholder="o número que a Meta mostra no painel"></div>
      <div class="field"><label for="c-wa-token">Token permanente</label><input id="c-wa-token" type="password" value="${esc(c.waToken||"")}" placeholder="cole o token do app"></div>
      <div class="field"><label for="c-wa-verif">Palavra de verificação</label><input id="c-wa-verif" value="${esc(c.waVerificacao||"")}" placeholder="invente uma palavra"></div>
      <div class="field"><label>Endereço para colar na Meta (Webhook)</label>
        <input readonly value="${esc((state.enderecoPublico||location.origin) + "/api/whatsapp/" + (state.empresa?.codigo||""))}" onclick="this.select()"></div>
      <div style="display:flex;gap:10px;align-items:center"><button class="btn primary" onclick="gravarCfg()">Salvar</button>
        <span class="meta">${c.waNumeroId && c.waToken ? "ligado" : "usando a ponte antiga"}</span></div>
    </div>
  </div>

  <div class="card" style="max-width:560px;margin-top:18px">
    <h3 style="margin-top:0">Portais (ZAP, Viva Real, OLX)</h3>
    <p class="meta" style="margin-top:0">Cole o endereço abaixo no painel do portal. De hora em hora eles leem sozinhos: imóvel novo aparece, vendido some, preço muda. Você mexe só aqui.</p>
    <div class="field"><label>Endereço do feed</label>
      <input readonly id="feed-url" value="${esc(state.portais?.endereco||"")}" onclick="this.select()"></div>
    ${state.portais ? `<p class="meta" style="margin-top:12px">
      <b>${state.portais.prontos}</b> de ${state.portais.total} imóveis prontos para publicar.
      ${Object.keys(state.portais.pendencias||{}).length ? "O que falta nos outros: " +
        Object.entries(state.portais.pendencias).map(([k,v])=>`${v} sem ${esc(k)}`).join(", ") + "." : ""}
      </p>
      <p class="meta">Os portais exigem no mínimo ${state.portais.exigencias.fotos} fotos e o CEP de cada imóvel. Quem não tiver fica de fora do feed — o resto continua publicando normalmente.</p>`
      : `<p class="meta" style="margin-top:12px">Carregando…</p>`}
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn" onclick="carregarPortais()">Atualizar</button>
      <button class="btn" id="b-cep" onclick="completarCep()">Buscar CEP pelo bairro</button>
    </div>
  </div>`;
}

async function carregarPortais(){
  try{ state.portais = await api("/portais/situacao"); render(); }catch{}
}

// Pede o CEP de cada bairro aos Correios e preenche as fichas que estão sem.
async function completarCep(){
  const b = document.getElementById("b-cep");
  if(b){ b.disabled = true; b.textContent = "Buscando nos Correios…"; }
  try{
    const r = await api("/portais/completar-cep", {method:"POST"});
    await carregarPortais();
    alert(`CEP preenchido em ${r.preenchidos} imóveis.` +
      (r.semResposta ? `\n${r.semResposta} ficaram sem: os Correios não têm CEP próprio para esses bairros.` : "") +
      (r.restam ? `\nAinda faltam ${r.restam}.` : ""));
  }catch(e){ alert(e.message || "Não consegui falar com os Correios agora."); }
  finally{ const x = document.getElementById("b-cep"); if(x){ x.disabled = false; x.textContent = "Buscar CEP pelo bairro"; } }
}

/* ===================== drawer ===================== */
function renderDrawer(){
  const o = document.getElementById("overlay");
  if(!state.sel){ o.innerHTML=""; return; }
  const s = state.sel;
  o.innerHTML = `<div class="scrim" onclick="fechar()"></div><aside class="drawer" role="dialog" aria-modal="true">
    <button class="btn ghost sm xclose" onclick="fechar()">Fechar</button>${
      s.tipo==="lead"?drawerLead(s.data): s.tipo==="imovel"?drawerImovel(s.data): s.tipo==="importarLeads"?drawerImportarLeads(): drawerImportar()}</aside>`;
}
function drawerLead(l){
  const codes = state.imoveis.map(m=>m.codigo);
  const existe = state.leads.some(x=>x.id===l.id);
  const tel = digits(l.telefone);
  return `<h2>${esc(l.nome||"Novo lead")}</h2>
  <div class="stack">
    <div class="row2">
      <div class="field"><label for="l-nome">Nome</label><input id="l-nome" value="${esc(l.nome||"")}"></div>
      <div class="field"><label for="l-tel">Telefone</label><input id="l-tel" class="num" value="${esc(l.telefone||"")}"></div>
    </div>
    <div class="row2">
      <div class="field"><label for="l-origem">Origem</label><input id="l-origem" value="${esc(l.origem||"Facebook Ads")}" list="origens">
        <datalist id="origens"><option>Facebook Ads</option><option>Instagram Ads</option><option>Indicação</option><option>Portal</option><option>WhatsApp</option></datalist></div>
      <div class="field"><label for="l-camp">Campanha / anúncio</label><input id="l-camp" value="${esc(l.campanha||"")}"></div>
    </div>
    <div class="field"><label for="l-int">Interesse</label><input id="l-int" value="${esc(l.interesse||"")}" placeholder="Casa 3 quartos, Zona Leste, até 700 mil"></div>
    <div class="row2">
      <div class="field"><label for="l-temp">Temperatura</label><select id="l-temp">${TEMPS.map(t=>`<option ${l.temperatura===t?"selected":""}>${t}</option>`).join("")}</select></div>
      <div class="field"><label for="l-est">Estágio</label><select id="l-est">${ESTAGIOS.map(t=>`<option ${l.estagio===t?"selected":""}>${t}</option>`).join("")}</select></div>
    </div>
    <div class="field"><label for="l-imv">Imóveis apresentados (códigos)</label><input id="l-imv" class="num" value="${esc((l.imoveis||[]).join(", "))}" placeholder="${esc(codes.slice(0,3).join(", "))}"></div>
    <div class="field"><label for="l-resp">Responsável</label>
      <select id="l-resp"><option value="">— ninguém ainda —</option>${
        (state.usuarios||[]).filter(u=>u.ativo).map(u=>`<option value="${u.id}" ${u.id===l.responsavel_id?"selected":""}>${esc(u.nome)}</option>`).join("")
      }</select>
      <div class="meta" style="margin-top:6px">Quem cuida deste lead. O gerente da equipe dessa pessoa passa a ver o lead e a conversa dele.</div></div>
    <div class="field"><label for="l-obs">Anotações</label><textarea id="l-obs">${esc(l.obs||"")}</textarea></div>
    <div style="display:flex;gap:9px;flex-wrap:wrap">
      <button class="btn primary" onclick="gravarLead()">Salvar</button>
      ${tel?`<a class="btn" target="_blank" rel="noopener" href="https://wa.me/${tel.length>11?tel:"55"+tel}">WhatsApp</a>`:""}
      ${(existe&&state.iaLigada)?`<button class="btn" onclick="sugerirResposta('${l.id}')">Gerar mensagem</button>`:""}
      ${existe?`<button class="btn ghost" style="margin-left:auto;color:var(--quente)" onclick="excluirLead('${l.id}')">Excluir</button>`:""}
    </div>
    <div id="sug"></div>
    ${(l.historico&&l.historico.length)?`<div><h3 style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)">Histórico</h3>
      <div class="hist">${l.historico.slice().reverse().map(h=>`<div><b class="num">${esc(h.data)}</b> — ${esc(h.texto)}</div>`).join("")}</div></div>`:""}
  </div>`;
}
function drawerImovel(m){
  const existe = state.imoveis.some(x=>x.id===m.id);
  return `<h2>${m.codigo?"Imóvel "+esc(m.codigo):"Novo imóvel"}</h2>
  <div class="stack">
    <div class="row2">
      <div class="field"><label for="m-cod">Código</label><input id="m-cod" class="num" value="${esc(m.codigo||"")}"></div>
      <div class="field"><label for="m-tipo">Tipo</label><input id="m-tipo" value="${esc(m.tipo||"")}" list="tipos">
        <datalist id="tipos"><option>Casa</option><option>Apartamento</option><option>Terreno</option><option>Sala comercial</option><option>Chácara</option></datalist></div>
    </div>
    <div class="row2">
      <div class="field"><label for="m-bairro">Bairro</label><input id="m-bairro" value="${esc(m.bairro||"")}"></div>
      <div class="field"><label for="m-cidade">Cidade</label><input id="m-cidade" value="${esc(m.cidade||"Uberlândia")}"></div>
    </div>
    <div class="row2">
      <div class="field"><label for="m-preco">Preço (R$)</label><input id="m-preco" class="num" inputmode="numeric" value="${esc(m.preco||"")}"></div>
      <div class="field"><label for="m-area">Área (m²)</label><input id="m-area" class="num" inputmode="numeric" value="${esc(m.area||"")}"></div>
    </div>
    <div class="row2" style="grid-template-columns:1fr 1fr 1fr">
      <div class="field"><label for="m-q">Quartos</label><input id="m-q" class="num" inputmode="numeric" value="${esc(m.quartos||"")}"></div>
      <div class="field"><label for="m-s">Suítes</label><input id="m-s" class="num" inputmode="numeric" value="${esc(m.suites||"")}"></div>
      <div class="field"><label for="m-v">Vagas</label><input id="m-v" class="num" inputmode="numeric" value="${esc(m.vagas||"")}"></div>
    </div>
    <div class="field"><label for="m-foto">Foto (URL)</label><input id="m-foto" value="${esc(m.foto||"")}"></div>
    <div class="field"><label for="m-link">Link externo (opcional)</label><input id="m-link" value="${esc(m.link||"")}"></div>
    <div class="field"><label for="m-desc">Descrição</label><textarea id="m-desc">${esc(m.descricao||"")}</textarea></div>
    <div style="display:flex;gap:9px">
      <button class="btn primary" onclick="gravarImovel()">Salvar</button>
      ${existe?`<button class="btn ghost" style="margin-left:auto;color:var(--quente)" onclick="excluirImovel('${m.id}')">Excluir</button>`:""}
    </div>
  </div>`;
}
function drawerImportar(){
  return `<h2>Importar imóveis</h2>
  <p class="muted">Cole em JSON, ou uma linha por imóvel no formato<br><span class="mono">código; tipo; bairro; preço; quartos; suítes; vagas; área</span></p>
  <div class="stack">
    <div class="field"><textarea id="imp" class="mono" style="min-height:220px" placeholder="8685; Casa; Jardim Karaíba; 890000; 3; 1; 2; 180"></textarea></div>
    <div id="imp-msg" class="muted"></div>
    <div><button class="btn primary" onclick="importar()">Importar</button></div>
  </div>`;
}

/* ===================== ações ===================== */
function ir(v){ state.view=v; state.filtros={q:"",bairro:"",tipo:"",estagio:"",temp:""}; render(); window.scrollTo(0,0); }
function fechar(){ state.sel=null; renderDrawer(); }
function foco(id){ const e=document.getElementById(id); if(e){ e.focus(); e.setSelectionRange(e.value.length,e.value.length); } }
function novoLead(){ state.sel={tipo:"lead",data:{id:"",estagio:"Novo",temperatura:"Morno",origem:"Facebook Ads",criado_em:hoje(),imoveis:[],historico:[]}}; renderDrawer(); }
function abrirLead(id){ const l=state.leads.find(x=>x.id===id); if(l){ state.sel={tipo:"lead",data:JSON.parse(JSON.stringify(l))}; renderDrawer(); } }
function novoImovel(){ state.sel={tipo:"imovel",data:{id:"",cidade:"Uberlândia"}}; renderDrawer(); }
function editarImovel(id){ const m=state.imoveis.find(x=>x.id===id); if(m){ state.sel={tipo:"imovel",data:{...m}}; renderDrawer(); } }
function abrirImportar(){ state.sel={tipo:"importar",data:{}}; renderDrawer(); }

async function gravarLead(){
  const d = state.sel.data;
  const corpo = {...d, nome:val("l-nome").trim(), telefone:val("l-tel").trim(), origem:val("l-origem").trim(),
    campanha:val("l-camp").trim(), interesse:val("l-int").trim(), temperatura:val("l-temp"), estagio:val("l-est"),
    obs:val("l-obs"), responsavel_id: val("l-resp"),
    imoveis: val("l-imv").split(",").map(s=>s.trim()).filter(Boolean)};
  if(!corpo.id) delete corpo.id;
  try{ await api("/leads",{method:"POST",body:JSON.stringify(corpo)}); fechar(); await carregar(); }
  catch(e){ alert(e.message); }
}
async function excluirLead(id){
  if(!confirm("Excluir este lead?")) return;
  await api("/leads/"+id,{method:"DELETE"}); fechar(); await carregar();
}
async function mudarEstagio(id,est){
  const l = state.leads.find(x=>x.id===id); if(!l) return;
  await api("/leads",{method:"POST",body:JSON.stringify({...l, estagio:est})}); await carregar();
}
async function gravarImovel(){
  const corpo = {codigo:val("m-cod").trim(), tipo:val("m-tipo").trim(), bairro:val("m-bairro").trim(),
    cidade:val("m-cidade").trim(), preco:val("m-preco"), area:val("m-area"), quartos:val("m-q"),
    suites:val("m-s"), vagas:val("m-v"), foto:val("m-foto").trim(), link:val("m-link").trim(), descricao:val("m-desc").trim()};
  try{
    const antigo = state.sel.data.id;
    await api("/imoveis",{method:"POST",body:JSON.stringify(corpo)});
    if(antigo && antigo !== corpo.codigo) await api("/imoveis/"+antigo,{method:"DELETE"});
    fechar(); await carregar();
  }catch(e){ alert(e.message); }
}
async function excluirImovel(id){
  if(!confirm("Excluir este imóvel?")) return;
  await api("/imoveis/"+id,{method:"DELETE"}); fechar(); await carregar();
}
async function gravarCfg(){
  const corpo = {corretor:val("c-corretor"),creci:val("c-creci"),empresa:val("c-empresa"),
    whats:val("c-whats").replace(/\D/g,""),estilo:val("c-estilo"),
    waNumeroId: val("c-wa-id").replace(/\D/g,""), waVerificacao: val("c-wa-verif")};
  // só troca o token quando você digitou um novo
  const token = val("c-wa-token");
  if(token && !/^•+$/.test(token)) corpo.waToken = token;
  await api("/config",{method:"PUT",body:JSON.stringify(corpo)});
  await carregar();
  const m = document.getElementById("cfg-msg"); if(m) m.textContent = "Salvo.";
}
async function importar(){
  const txt = val("imp").trim(); const msg = document.getElementById("imp-msg");
  if(!txt){ msg.textContent = "Cole os imóveis primeiro."; return; }
  let itens = [];
  try{
    const j = JSON.parse(txt);
    itens = Array.isArray(j) ? j : [j];
  }catch(e){
    itens = txt.split("\n").map(l=>l.trim()).filter(Boolean).map(l=>{
      const p = l.split(";").map(s=>s.trim());
      return {codigo:p[0], tipo:p[1], bairro:p[2], preco:p[3], quartos:p[4], suites:p[5], vagas:p[6], area:p[7]};
    });
  }
  msg.textContent = "Importando…";
  try{
    const r = await api("/imoveis/importar",{method:"POST",body:JSON.stringify({itens})});
    msg.textContent = r.importados+" imóvel(is) importado(s).";
    await carregar();
    setTimeout(()=>{ fechar(); ir("imoveis"); }, 700);
  }catch(e){ msg.textContent = e.message; }
}

/* ===================== chatbot ===================== */
async function enviarChat(ev){
  ev.preventDefault();
  const el = document.getElementById("chatin"); const txt = el.value.trim();
  if(!txt || state.pensando) return;
  state.chat.push({papel:"user",texto:txt}); el.value=""; state.pensando=true; render();
  try{
    const r = await api("/chat",{method:"POST",body:JSON.stringify({mensagens:state.chat})});
    state.chat.push({papel:"bot",texto:r.texto||"(sem resposta)"});
  }catch(e){ state.chat.push({papel:"bot",texto:"Não consegui responder: "+e.message}); }
  state.pensando=false; render();
}
function scrollChat(){ const m=document.getElementById("msgs"); if(m) m.scrollTop = m.scrollHeight; }
function copiar(i){ copiarTexto(state.chat[i].texto); }
function copiarTexto(t){ if(navigator.clipboard) navigator.clipboard.writeText(t); }
async function sugerirResposta(id){
  const box = document.getElementById("sug"); if(!box) return;
  box.innerHTML = `<div class="muted">Escrevendo…</div>`;
  try{
    const r = await api("/leads/"+id+"/sugestao",{method:"POST",body:"{}"});
    box.innerHTML = `<div class="card" style="padding:13px"><h3>Sugestão — revise antes de enviar</h3>
      <div id="sug-txt" style="white-space:pre-wrap">${esc(r.texto)}</div>
      <div style="margin-top:10px"><button class="btn sm" onclick="copiarTexto(document.getElementById('sug-txt').innerText)">Copiar</button></div></div>`;
  }catch(e){ box.innerHTML = `<div class="muted">${esc(e.message)}</div>`; }
}

/* ===================== start ===================== */
document.getElementById("rail").addEventListener("click", e=>{ const b=e.target.closest(".navbtn"); if(b) ir(b.dataset.v); });
document.addEventListener("keydown", e=>{ if(e.key==="Escape") fechar(); });
carregar().catch(e=>{ document.getElementById("main").innerHTML = `<div class="empty">Não consegui falar com o servidor: ${esc(e.message)}</div>`; });
setInterval(()=>{ if(!state.sel && state.view!=="bot") carregar().catch(()=>{}); }, 30000);




async function baixarFotos(botao){
  const antes = botao.textContent;
  botao.disabled = true; botao.textContent = "Baixando…";
  try{
    const r = await api("/imoveis/baixar-fotos", {method:"POST"});
    botao.textContent = r.total ? `${r.baixadas} foto(s) salvas` : "Todas já estavam salvas";
    await carregar();
  }catch(e){ botao.textContent = e.message; }
  setTimeout(()=>{ botao.disabled = false; botao.textContent = antes; }, 4000);
}

/* ===================== sites dos clientes ===================== */
async function carregarSites(){
  const gs = lerGuardado("sites");
  if(gs) state.sites = gs.dados;
  try{
    const v = await api("/versao").catch(()=>({}));
    if(!gs || gs.assinatura !== v.sites){ state.sites = await api("/sites"); guardar("sites", state.sites, v.sites); }
  }catch{ if(!gs) state.sites = []; }
  render();
}

async function desenharSite(){
  const d = val("s-descricao").trim();
  const aviso = document.getElementById("s-aviso");
  const botao = [...document.querySelectorAll("button")].find(b=>b.textContent.trim().startsWith("Montar site"));
  if(!d){ aviso.textContent = "Descreva como o site deve ser."; return; }
  if(botao){ botao.disabled = true; botao.textContent = "Montando o site…"; }
  aviso.textContent = "A IA está desenhando. Leva alguns segundos.";
  try{
    const r = await api("/sites/desenhar", {method:"POST", body:JSON.stringify({descricao:d})});
    state.siteRascunho = {...r, whats: val("s-whats"), creci: val("s-creci"), endereco: val("s-endereco")};
    render();
    setTimeout(atualizarPrevia, 60);
    const p = document.getElementById("r-nome");
    if(p) p.scrollIntoView({behavior:"smooth", block:"center"});
  }catch(e){
    aviso.textContent = e.message;
    if(botao){ botao.disabled = false; botao.textContent = "Montar site"; }
  }
}

async function publicarSite(){
  const r = state.siteRascunho;
  const corpo = {...r,
    nome: val("r-nome") || r.nome, slug: val("r-slug"),
    titulo: val("r-titulo"), subtitulo: val("r-subtitulo"), sobre: val("r-sobre"),
    cor: val("r-cor"), fundo: val("r-fundo"), fonte: val("r-fonte"),
    whats: val("r-whats"), creci: val("r-creci"), endereco: val("r-endereco"), email: val("r-email"),
    dominio: val("r-dominio"),
  };
  try{
    const salvo = await api("/sites", {method:"POST", body:JSON.stringify(corpo)});
    state.siteRascunho = null; state.siteEditando = null;
    await carregarSites();
    alert("Site no ar: " + location.origin + "/site/" + salvo.slug);
  }catch(e){ alert(e.message); }
}

// joga a configuração atual da tela para dentro da prévia
function atualizarPrevia(){
  const campos = ["nome","slug","titulo","subtitulo","sobre","cor","fundo","fonte","whats","creci","endereco","email"];
  const cfg = {...(state.siteRascunho||{})};
  campos.forEach(c=>{ const e = document.getElementById("r-"+c); if(e) cfg[c] = e.value; });
  state.siteRascunho = cfg;
  window.__previaSite = cfg;
  const f = document.getElementById("previa-site");
  if(f) f.contentWindow.location.reload();
}

function editarSite(id){
  const s = state.sites.find(x=>x.id===id);
  if(!s) return;
  state.siteRascunho = {...s};
  state.siteEditando = id;
  render();
  setTimeout(atualizarPrevia, 60);
  window.scrollTo({top:0, behavior:"smooth"});
}

async function removerSite(id, nome){
  if(!confirm("Excluir o site de "+nome+"?")) return;
  await api("/sites/"+id, {method:"DELETE"});
  carregarSites();
}

function vSites(){
  if(!state.sites.length && state.sites !== null && !state._sitesCarregou){ state._sitesCarregou = true; carregarSites(); }
  const r = state.siteRascunho;

  const lista = state.sites.length ? state.sites.map(s=>`
    <div class="lrow">
      <span class="corzinha" style="background:${esc(s.cor)}"></span>
      <span class="nm">${esc(s.nome)}
        <div class="meta">${(s.enderecos||["/site/"+s.slug]).map(e=>`<span class="mono">${esc(e.replace(/^https?:\/\//,""))}</span>`).join(" · ")}</div></span>
      <a class="btn sm" href="/site/${esc(s.slug)}" target="_blank" rel="noopener">Abrir</a>
      <button class="btn sm" onclick="copiarTexto(location.origin+'/site/${esc(s.slug)}')">Copiar link</button>
      <button class="btn sm" onclick="editarSite('${s.id}')">Editar</button>
      <button class="btn sm ghost" onclick="removerSite('${s.id}','${esc(s.nome)}')">Excluir</button>
    </div>`).join("") : `<div class="empty">Nenhum site criado ainda.</div>`;

  const previa = r ? `
    <div class="card" style="margin-top:18px">
      <div class="convtopo">
        <h3 style="margin:0">${state.siteEditando?"Editando o site":"Prévia do site"}</h3>
        <button class="btn sm ghost" onclick="state.siteRascunho=null;state.siteEditando=null;render()">Descartar</button>
      </div>
      <div class="grid4">
        <div><label for="r-nome">Nome da imobiliária</label><input id="r-nome" value="${esc(r.nome||"")}"></div>
        <div><label for="r-slug">Endereço do site</label><input id="r-slug" value="${esc(r.slug||"")}" placeholder="nome-da-imobiliaria"></div>
        <div><label for="r-cor">Cor principal</label><input id="r-cor" type="color" value="${esc(r.cor||"#C9A227")}"></div>
        <div><label for="r-fundo">Fundo</label><select id="r-fundo">
          <option value="escuro" ${r.fundo==="escuro"?"selected":""}>Escuro</option>
          <option value="claro" ${r.fundo==="claro"?"selected":""}>Claro</option></select></div>
        <div><label for="r-fonte">Letra</label><select id="r-fonte">
          <option value="classica" ${r.fonte==="classica"?"selected":""}>Clássica</option>
          <option value="moderna" ${r.fonte==="moderna"?"selected":""}>Moderna</option></select></div>
        <div><label for="r-whats">WhatsApp</label><input id="r-whats" value="${esc(r.whats||"")}" placeholder="5534999999999"></div>
        <div><label for="r-creci">CRECI</label><input id="r-creci" value="${esc(r.creci||"")}"></div>
        <div><label for="r-email">E-mail</label><input id="r-email" value="${esc(r.email||"")}"></div>
        <div><label for="r-dominio">Domínio próprio (opcional)</label><input id="r-dominio" value="${esc(r.dominio||"")}" placeholder="primeimoveis.com.br"></div>
      </div>
      <div style="margin-top:12px">
        <label for="r-titulo">Chamada principal</label><input id="r-titulo" value="${esc(r.titulo||"")}" style="width:100%">
      </div>
      <div style="margin-top:10px">
        <label for="r-subtitulo">Linha de apoio</label><input id="r-subtitulo" value="${esc(r.subtitulo||"")}" style="width:100%">
      </div>
      <div style="margin-top:10px">
        <label for="r-endereco">Endereço</label><input id="r-endereco" value="${esc(r.endereco||"")}" style="width:100%">
      </div>
      <div style="margin-top:10px">
        <label for="r-sobre">Sobre a imobiliária</label><textarea id="r-sobre" rows="3" style="width:100%">${esc(r.sobre||"")}</textarea>
      </div>
      <div class="meta" style="margin-top:12px">
        Vai mostrar: ${esc((r.filtro?.tipos||[]).join(", ") || "todos os tipos")}${r.filtro?.cidade?" em "+esc(r.filtro.cidade):""}
        ${r.filtro?.precoMax?" até "+BRL(r.filtro.precoMax):""}
      </div>
      <div style="margin-top:14px">
        <button class="btn primary" onclick="publicarSite()">${state.siteEditando?"Salvar alterações":"Publicar site"}</button>
        <button class="btn" onclick="atualizarPrevia()">Atualizar prévia</button>
      </div>

      <div class="previa">
        <div class="previatopo">
          <span class="meta">Prévia — é assim que o cliente vê</span>
          <span class="previabolinhas"><i></i><i></i><i></i></span>
        </div>
        <iframe id="previa-site" src="/site/_previa" title="Prévia do site"></iframe>
      </div>
    </div>` : "";

  return `
  <div class="head"><div><p class="eyebrow">Plataforma</p><h1>Sites</h1>
    <p>Cada cliente ganha um site próprio, alimentado pela carteira do sistema.</p></div></div>

  <div class="card">
    <h3>Criar um site</h3>
    <p class="muted" style="margin-top:0">Descreva como ele deve ser, com suas palavras. A IA monta e você ajusta antes de publicar.</p>
    <textarea id="s-descricao" rows="4" style="width:100%"
      placeholder="Ex: Site da Prime Imóveis, de Uberlândia. Cores em azul, fundo claro, letra moderna. Focada em apartamentos e casas até 600 mil. Atendimento familiar, 12 anos de mercado."></textarea>
    <div class="grid4" style="margin-top:12px">
      <div><label for="s-whats">WhatsApp</label><input id="s-whats" placeholder="5534999999999"></div>
      <div><label for="s-creci">CRECI</label><input id="s-creci"></div>
      <div><label for="s-endereco">Endereço</label><input id="s-endereco"></div>
    </div>
    <div style="margin-top:14px"><button class="btn primary" onclick="desenharSite()">Montar site</button>
      <span class="meta" id="s-aviso" style="margin-left:12px"></span></div>
  </div>

  ${previa}

  <div class="card" style="margin-top:18px">
    <h3>Sites no ar</h3>
    <div class="list">${lista}</div>
  </div>`;
}


/* ---- importar leads de planilha ---- */
function abrirImportarLeads(){ state.sel={tipo:"importarLeads",data:{}}; renderDrawer(); }

function drawerImportarLeads(){
  return `<h2>Importar leads</h2>
  <div class="stack">
    <p class="muted">Abra sua planilha, selecione tudo — com o cabeçalho — copie e cole aqui.
    O sistema reconhece colunas como nome, telefone, e-mail, interesse e origem, e ignora quem já está cadastrado.</p>
    <div class="field">
      <label for="imp-leads">Dados da planilha</label>
      <textarea id="imp-leads" rows="12" placeholder="Nome&#9;Telefone&#9;Interesse
Maria Silva&#9;34 99999-0000&#9;Casa 3 quartos no Canaã
João Souza&#9;34 98888-1111&#9;Apartamento até 250 mil"></textarea>
    </div>
    <div class="ax">
      <button class="btn primary" onclick="importarLeads(this)">Importar</button>
      <span class="meta" id="imp-aviso"></span>
    </div>
  </div>`;
}

async function importarLeads(botao){
  const texto = (document.getElementById("imp-leads")||{}).value || "";
  const aviso = document.getElementById("imp-aviso");
  if(!texto.trim()){ aviso.textContent = "Cole os dados da planilha."; return; }
  botao.disabled = true; botao.textContent = "Importando…";
  try{
    const r = await api("/leads/importar", {method:"POST", body:JSON.stringify({texto})});
    aviso.textContent = `${r.novos} novo(s)` + (r.repetidos?` · ${r.repetidos} já existiam`:"") + (r.ignorados?` · ${r.ignorados} sem dados`:"");
    await carregar();
    state.sel={tipo:"importarLeads",data:{}}; renderDrawer();
    document.getElementById("imp-aviso").textContent = aviso.textContent;
  }catch(e){ aviso.textContent = e.message; }
  botao.disabled = false; botao.textContent = "Importar";
}

/* ===================== gerência ===================== */
async function carregarGerencia(){
  try{ state.ger = await api("/gerencia/resumo"); }catch{ state.ger = null; }
  render();
}

async function abrirFicha(jid){
  state.gerSel = jid;
  try{ state.gerDet = await api("/gerencia/conversa/"+encodeURIComponent(jid)); }catch{ state.gerDet = null; }
  render();
}

async function marcarStatus(id, status){
  await api("/agendamentos/"+id, {method:"PUT", body:JSON.stringify({status})});
  carregarGerencia();
}

function diaBonito(d){
  if(!d) return "sem data";
  const [a,m,x] = d.split("-");
  const dt = new Date(Number(a), Number(m)-1, Number(x));
  const semana = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"][dt.getDay()];
  return `${x}/${m} · ${semana}`;
}

function vGerencia(){
  if(!state.ger){ carregarGerencia(); return `<div class="head"><h1>Gerência</h1></div><div class="empty">Carregando…</div>`; }
  const g = state.ger, n = g.numeros;

  const agenda = g.proximos.length ? g.proximos.map(a=>`
    <div class="card ag">
      <div class="agtopo">
        <div>
          <div class="agdia">${diaBonito(a.data)} ${a.hora?`<span class="mono">${esc(a.hora)}</span>`:""}</div>
          <div class="agnome">${esc(a.nome||a.telefone)} <span class="meta mono">${esc(a.telefone)}</span></div>
        </div>
        <span class="pill ${a.marcado_por==='bot'?'quente':'morno'}"><i></i>${a.marcado_por==='bot'?'marcado pela IA':'marcado por '+esc(a.marcado_por)}</span>
      </div>
      <div class="agcomo">Fechou assim: <i>“${esc(a.como||"—")}”</i></div>
      <div class="aglocal meta">${esc(a.local||"")}</div>
      <div class="ax">
        <button class="btn sm" onclick="abrirFicha('${esc(a.jid)}')">Ver a conversa inteira</button>
        <button class="btn sm" onclick="marcarStatus('${a.id}','Compareceu')">Compareceu</button>
        <button class="btn sm" onclick="marcarStatus('${a.id}','Faltou')">Faltou</button>
        <button class="btn sm ghost" onclick="marcarStatus('${a.id}','Cancelado')">Cancelar</button>
      </div>
    </div>`).join("") : `<div class="empty">Nenhum atendimento marcado ainda.</div>`;

  const porCliente = {};
  g.interesses.forEach(i=>{ (porCliente[i.jid] = porCliente[i.jid] || {nome:i.nome||i.telefone, jid:i.jid, itens:[]}).itens.push(i); });
  const interesses = Object.values(porCliente).length ? Object.values(porCliente).slice(0,25).map(c=>`
    <div class="lrow" onclick="abrirFicha('${esc(c.jid)}')">
      <span class="nm">${esc(c.nome)}
        <div class="meta">${c.itens.slice(0,3).map(i=>esc(i.codigo+" · "+(i.tipo||"")+" "+(i.bairro||""))).join(" | ")}${c.itens.length>3?" +"+(c.itens.length-3):""}</div></span>
      <span class="meta num">${c.itens.length} imóvel(is)</span>
    </div>`).join("") : `<div class="empty">Ninguém demonstrou interesse em imóvel ainda.</div>`;

  const paradas = g.paradas.length ? g.paradas.slice(0,15).map(c=>`
    <div class="lrow">
      <span class="nm">${esc(c.nome||c.telefone)}<div class="meta">${esc((c.ultima||"").slice(0,60))}</div></span>
      <span class="meta num">${esc((c.atualizado_em||"").slice(0,10))}</span>
      <button class="btn sm" onclick="retomar('${esc(c.jid)}')">Retomar</button>
      <button class="btn sm ghost" onclick="abrirFicha('${esc(c.jid)}')">Ver</button>
    </div>`).join("") : `<div class="empty">Ninguém esperando resposta. Bom sinal.</div>`;

  const duvidas = (g.duvidas||[]).length ? g.duvidas.slice(0,20).map(d=>`
    <div class="lrow">
      <span class="nm">${esc(d.pergunta)}
        <div class="meta">${esc(d.nome||d.jid||"cliente")} · ${esc((d.criado_em||"").slice(0,10))}</div></span>
      <button class="btn sm" onclick="responderDuvida('${esc(d.id)}')">Respondi</button>
      ${d.jid?`<button class="btn sm ghost" onclick="abrirFicha('${esc(d.jid)}')">Ver</button>`:""}
    </div>`).join("") : `<div class="empty">Nenhuma pergunta parada. A assistente deu conta de tudo.</div>`;

  const ficha = state.gerDet ? `
    <div class="card" style="margin-top:18px">
      <div class="convtopo"><h3 style="margin:0">Ficha do cliente</h3>
        <button class="btn sm ghost" onclick="state.gerDet=null;state.gerSel=null;render()">Fechar</button></div>
      ${state.gerDet.agenda.length?`<div class="meta" style="margin-bottom:10px">Atendimentos: ${
        state.gerDet.agenda.map(a=>esc(diaBonito(a.data)+" "+(a.hora||"")+" ("+a.status+")")).join(" · ")}</div>`:""}
      ${state.gerDet.interesses.length?`<div class="meta" style="margin-bottom:12px">Imóveis que interessaram: ${
        state.gerDet.interesses.map(i=>esc(i.codigo)).join(", ")}</div>`:""}
      <div class="convmsgs">${state.gerDet.mensagens.map(m=>`
        <div class="msg ${m.de==='cliente'?'cli':'bot'}">
          <div class="quem">${m.de==='cliente'?'CLIENTE':m.de==='bot'?'BOT':'VOCÊ'} · ${esc((m.criado_em||"").slice(11,16))}</div>
          <div>${esc(m.texto).replace(/\n/g,"<br>")}</div></div>`).join("")}</div>
    </div>` : "";

  return `
  <div class="head"><div><p class="eyebrow">Supervisão</p><h1>Gerência</h1>
    <p>O que a IA marcou, como marcou e o que cada cliente quis.</p></div>
    <button class="btn" onclick="carregarGerencia()">Atualizar</button></div>

  <div class="kpis">
    <div class="kpi accent"><div class="k">Atendimentos marcados</div><div class="v num">${n.marcados}</div><div class="s">${n.pelaIA} pela IA</div></div>
    <div class="kpi"><div class="k">Compareceram</div><div class="v num" style="color:var(--quente)">${n.compareceram}</div><div class="s">confirmados por você</div></div>
    <div class="kpi"><div class="k">Faltaram</div><div class="v num">${n.faltaram}</div><div class="s">para remarcar</div></div>
    <div class="kpi"><div class="k">Esperando resposta</div><div class="v num">${g.paradas.length}</div><div class="s">clientes parados</div></div>
    <div class="kpi"><div class="k">Perguntas para você</div><div class="v num">${(g.duvidas||[]).length}</div><div class="s">a assistente não soube</div></div>
  </div>

  <h3 style="margin:26px 0 12px">Próximos atendimentos</h3>
  <div class="agenda">${agenda}</div>

  <div class="card" style="margin-top:22px">
    <h3>Perguntas esperando você</h3>
    <p class="meta" style="margin-top:0">Quando a assistente não sabe, ela não inventa: avisa o cliente que vai confirmar e larga a pergunta aqui.</p>
    <div class="list">${duvidas}</div>
  </div>

  <div class="cols" style="margin-top:22px">
    <div class="card"><h3>Imóveis que interessaram</h3><div class="list">${interesses}</div></div>
    <div class="card"><h3>Clientes esperando resposta</h3><div class="list">${paradas}</div></div>
  </div>
  ${ficha}`;
}

async function responderDuvida(id){
  const resposta = prompt("O que é a resposta certa? (fica guardado para você lembrar)") ?? "";
  try{
    await api("/gerencia/duvida/"+encodeURIComponent(id), {method:"POST", body:JSON.stringify({resposta})});
    carregarGerencia();
  }catch(e){ alert(e.message); }
}

async function retomar(jid){
  try{
    const r = await api("/gerencia/retomar/"+encodeURIComponent(jid), {method:"POST"});
    copiarTexto(r.texto);
    alert("Parado há "+r.dias+" dia(s).\n\nMensagem copiada:\n\n"+r.texto);
  }catch(e){ alert(e.message); }
}

/* ===================== usuários ===================== */
async function carregarUsuarios(){
  const gu = lerGuardado("usuarios");
  if(gu) state.usuarios = gu.dados;
  try{
    const v = await api("/versao").catch(()=>({}));
    if(!gu || gu.assinatura !== v.usuarios){ state.usuarios = await api("/usuarios"); guardar("usuarios", state.usuarios, v.usuarios); }
  }catch{ if(!gu) state.usuarios = []; }
  try{ state.equipes = await api("/equipes"); }catch{ state.equipes = []; }
  render();
}

async function sair(){
  esquecerTudo();
  await fetch("/api/auth/sair", {method:"POST"});
  location.href = "/login";
}

async function salvarEquipe(dados){
  if(!dados.nome) return alert("Dê um nome para a equipe.");
  try{ await api("/equipes", {method:"POST", body:JSON.stringify(dados)}); carregarUsuarios(); }
  catch(e){ alert(e.message); }
}

async function apagarEquipe(id, nome){
  if(!confirm(`Excluir a equipe "${nome}"? Os corretores ficam sem equipe, mas nada mais se perde.`)) return;
  try{ await api("/equipes/"+id, {method:"DELETE"}); carregarUsuarios(); }
  catch(e){ alert(e.message); }
}

async function porNaEquipe(usuarioId, equipeId){
  try{ await api("/equipes/membro", {method:"POST", body:JSON.stringify({usuarioId, equipeId})}); carregarUsuarios(); }
  catch(e){ alert(e.message); }
}

async function definirResponsavel(leadId, usuarioId){
  try{ await api("/leads/"+leadId+"/responsavel", {method:"POST", body:JSON.stringify({usuarioId})}); await carregar(); }
  catch(e){ alert(e.message); }
}

function vUsuarios(){
  if(!state.usuarios.length) carregarUsuarios();
  const opcoes = (sel) => Object.entries(state.papeis)
    .map(([k,v])=>`<option value="${k}" ${k===sel?"selected":""}>${esc(v)}</option>`).join("");

  const eqOpcoes = (sel) => `<option value="">— sem equipe —</option>` + state.equipes
    .map(e=>`<option value="${e.id}" ${e.id===sel?"selected":""}>${esc(e.nome)}</option>`).join("");

  const linhas = state.usuarios.map(u=>`
    <tr>
      <td><b>${esc(u.nome)}</b><div class="meta">${esc(u.email)}</div></td>
      <td><select class="sm" onchange="salvarUsuario('${u.id}',{papel:this.value})">${opcoes(u.papel)}</select></td>
      <td><select class="sm" onchange="porNaEquipe('${u.id}',this.value)">${eqOpcoes(u.equipe_id)}</select></td>
      <td><span class="pill ${u.ativo?'quente':'frio'}"><i></i>${u.ativo?"ativo":"desativado"}</span></td>
      <td class="meta num">${esc((u.ultimo_acesso||"").slice(0,10)) || "nunca entrou"}</td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn sm" onclick="novaSenhaDe('${u.id}','${esc(u.nome)}')">Nova senha</button>
        <button class="btn sm" onclick="salvarUsuario('${u.id}',{ativo:${u.ativo?false:true}})">${u.ativo?"Desativar":"Reativar"}</button>
        ${u.id===state.usuario?.id?"":`<button class="btn sm ghost" onclick="removerUsuario('${u.id}','${esc(u.nome)}')">Excluir</button>`}
      </td>
    </tr>`).join("");

  return `
  <div class="head"><div><p class="eyebrow">Equipe</p><h1>Usuários</h1>
    <p>Quem entra no sistema e o que cada um pode fazer.</p></div></div>

  <div class="card">
    <h3>Adicionar pessoa</h3>
    <div class="grid4">
      <div><label for="u-nome">Nome</label><input id="u-nome" placeholder="Nome completo"></div>
      <div><label for="u-email">E-mail</label><input id="u-email" type="email" placeholder="pessoa@email.com"></div>
      <div><label for="u-senha">Senha provisória</label><input id="u-senha" type="text" placeholder="mínimo 6 caracteres"></div>
      <div><label for="u-papel">Perfil</label><select id="u-papel">${opcoes("corretor")}</select></div>
    </div>
    <div style="margin-top:14px"><button class="btn primary" onclick="adicionarUsuario()">Adicionar</button>
      <span class="meta" id="u-aviso" style="margin-left:12px"></span></div>
  </div>

  <div class="card" style="margin-top:18px">
    <h3>Pessoas com acesso</h3>
    <table class="tab"><thead><tr><th>Pessoa</th><th>Perfil</th><th>Equipe</th><th>Situação</th><th>Último acesso</th><th></th></tr></thead>
    <tbody>${linhas || '<tr><td colspan="6" class="muted">Ninguém cadastrado ainda.</td></tr>'}</tbody></table>
  </div>

  <div class="card" style="margin-top:18px">
    <h3>Equipes</h3>
    <p class="meta" style="margin-top:0">Cada equipe tem um gerente. O gerente enxerga só os corretores da equipe dele, os leads que foram passados para eles e as conversas desses leads. O administrador continua vendo tudo.</p>
    ${state.equipes.length ? `<table class="tab">
      <thead><tr><th>Equipe</th><th>Gerente</th><th>Corretores</th><th></th></tr></thead>
      <tbody>${state.equipes.map(e=>`<tr>
        <td><b>${esc(e.nome)}</b></td>
        <td><select class="sm" onchange="salvarEquipe({id:'${e.id}', nome:'${esc(e.nome)}', gerente_id:this.value})">
          <option value="">— escolher —</option>
          ${state.usuarios.filter(u=>["gerente","admin"].includes(u.papel))
            .map(u=>`<option value="${u.id}" ${u.id===e.gerente_id?"selected":""}>${esc(u.nome)}</option>`).join("")}
        </select></td>
        <td class="meta">${(e.membros||[]).map(m=>esc(m.nome)).join(", ") || "ninguém ainda"}</td>
        <td style="text-align:right"><button class="btn sm ghost" onclick="apagarEquipe('${e.id}','${esc(e.nome)}')">Excluir</button></td>
      </tr>`).join("")}</tbody></table>` : `<div class="empty">Nenhuma equipe criada ainda.</div>`}
    <div class="grid4" style="margin-top:14px">
      <div><label for="eq-nome">Nome da nova equipe</label><input id="eq-nome" placeholder="Ex: Equipe Centro"></div>
      <div style="align-self:end"><button class="btn primary" onclick="salvarEquipe({nome: val('eq-nome')})">Criar equipe</button></div>
    </div>
  </div>

  <div class="card" style="margin-top:18px">
    <h3>O que cada perfil pode</h3>
    <div class="list">
      <div class="lrow"><span class="nm"><b>Administrador</b><div class="meta">Tudo, inclusive cadastrar pessoas e mexer nos ajustes</div></span></div>
      <div class="lrow"><span class="nm"><b>Corretor</b><div class="meta">Leads, imóveis, conversas, chatbot e captação</div></span></div>
      <div class="lrow"><span class="nm"><b>Assistente</b><div class="meta">Leads e conversas do WhatsApp</div></span></div>
      <div class="lrow"><span class="nm"><b>Cliente</b><div class="meta">Só a vitrine de imóveis</div></span></div>
    </div>
  </div>`;
}

async function adicionarUsuario(){
  const aviso = document.getElementById("u-aviso");
  try{
    await api("/usuarios", {method:"POST", body:JSON.stringify({
      nome:val("u-nome"), email:val("u-email"), senha:val("u-senha"), papel:val("u-papel")})});
    aviso.textContent = "Pronto. Passe a senha provisória para a pessoa trocar depois.";
    ["u-nome","u-email","u-senha"].forEach(id=>{const e=document.getElementById(id); if(e) e.value="";});
    carregarUsuarios();
  }catch(e){ aviso.textContent = e.message; }
}

async function salvarUsuario(id, campos){
  await api("/usuarios/"+id, {method:"PUT", body:JSON.stringify(campos)});
  carregarUsuarios();
}

async function novaSenhaDe(id, nome){
  const senha = prompt("Nova senha para "+nome+" (mínimo 6 caracteres):");
  if(!senha) return;
  try{ await salvarUsuario(id, {senha}); alert("Senha trocada. A pessoa precisa entrar de novo."); }
  catch(e){ alert(e.message); }
}

async function removerUsuario(id, nome){
  if(!confirm("Excluir a conta de "+nome+"?")) return;
  await api("/usuarios/"+id, {method:"DELETE"});
  carregarUsuarios();
}

/* ===================== conversas do WhatsApp ===================== */
async function carregarConversas(){
  try{ state.conversas = await api("/wa/conversas"); }catch{ state.conversas = []; }
  if(state.convSel){
    try{ state.convMsgs = await api("/wa/conversas/"+encodeURIComponent(state.convSel)+"/mensagens"); }catch{}
  }
  if(state.view==="conversas") render();
}

function abrirConversa(jid){
  state.convSel = jid;
  carregarConversas();
}

async function alternarBotConversa(jid, ativo){
  await api("/wa/conversas/"+encodeURIComponent(jid)+"/bot", {method:"POST", body:JSON.stringify({ativo})});
  carregarConversas();
}

async function alternarNaoPerturbe(jid, ativo){
  await api("/wa/conversas/"+encodeURIComponent(jid)+"/nao-perturbe", {method:"POST", body:JSON.stringify({ativo})});
  carregarConversas();
}

async function salvarRegras(){
  state.cfg = await api("/config", {method:"PUT", body:JSON.stringify({...state.cfg,
    botModo: val("b-modo"), botHoraInicio: val("b-ini"), botHoraFim: val("b-fim"),
    botNumeros: val("b-numeros")})});
  carregarConversas();
}

async function alternarBotGeral(ligado){
  state.cfg = await api("/config", {method:"PUT", body:JSON.stringify({...state.cfg,
    botLigado: ligado?"1":"0"})});
  carregarConversas();
}

function estadoConversa(c){
  if(!c) return {txt:"—", cls:""};
  if(c.nao_perturbe) return {txt:"não perturbe", cls:"frio"};
  if(!c.bot_ativo) return {txt:"bot desligado", cls:"frio"};
  if(c.pausado_ate && new Date(c.pausado_ate) > new Date()) return {txt:"você conduzindo", cls:"morno"};
  return {txt:"bot ativo", cls:"quente"};
}

function vConversas(){
  const geral = (state.cfg.botLigado ?? "1") === "1";
  const modo = state.cfg.botModo || "novos";
  const lista = state.conversas;
  const sel = lista.find(c=>c.jid===state.convSel);
  const e = estadoConversa(sel);

  const linhas = lista.length ? lista.map(c=>{
    const s = estadoConversa(c);
    return `<div class="lrow ${c.jid===state.convSel?'sel':''}" onclick="abrirConversa('${esc(c.jid)}')">
      <span class="pill ${s.cls}"><i></i>${s.txt}</span>
      <span class="nm">${esc(c.nome||c.telefone)}<div class="meta">${esc((c.ultima||"").slice(0,54))}</div></span>
      ${c.nao_lidas?`<span class="cnt">${c.nao_lidas}</span>`:""}
    </div>`;}).join("") : `<div class="empty">Nenhuma conversa ainda. Rode <span class="mono">npm run zap</span> e conecte o WhatsApp.</div>`;

  const msgs = state.convMsgs.length ? state.convMsgs.map(m=>`
    <div class="msg ${m.de==='cliente'?'cli':'bot'}">
      <div class="quem">${m.de==='cliente'?esc(sel?.nome||'Cliente'):m.de==='bot'?'BOT':'VOCÊ'}</div>
      <div>${esc(m.texto).replace(/\n/g,"<br>")}</div>
    </div>`).join("") : `<div class="empty">Escolha uma conversa à esquerda.</div>`;

  return `
  <div class="head"><div><p class="eyebrow">WhatsApp</p><h1>Conversas</h1>
    <p>Tudo que passa no seu WhatsApp aparece aqui. Quando você responde, o bot recua sozinho.</p></div>
    <button class="btn ${geral?'primary':''}" onclick="alternarBotGeral(${!geral})">
      ${geral?'Chatbot ligado — desligar tudo':'Chatbot desligado — ligar'}
    </button>
  </div>

  <div class="card" style="margin-bottom:16px">
    <div class="regras">
      <div>
        <label for="b-modo">Quem o bot atende</label>
        <select id="b-modo" onchange="salvarRegras()">
          <option value="anuncio" ${modo==="anuncio"?"selected":""}>Só quem chega pelo anúncio</option>
          <option value="novos" ${modo==="novos"?"selected":""}>Contatos novos (sem conversa anterior)</option>
          <option value="todos" ${modo==="todos"?"selected":""}>Todo mundo que mandar mensagem</option>
        </select>
      </div>
      <div>
        <label for="b-ini">Atende a partir de</label>
        <input id="b-ini" type="time" value="${esc(state.cfg.botHoraInicio||"")}" onchange="salvarRegras()">
      </div>
      <div>
        <label for="b-fim">Até</label>
        <input id="b-fim" type="time" value="${esc(state.cfg.botHoraFim||"")}" onchange="salvarRegras()">
      </div>
      <div class="meta" style="align-self:end">Horário em branco = o dia inteiro.</div>
      <div style="grid-column:1/-1">
        <label for="b-numeros">Modo teste — responder só nestes números</label>
        <input id="b-numeros" type="text" placeholder="ex: 34 98692024, 34 99999-0000"
               value="${esc(state.cfg.botNumeros||"")}" onchange="salvarRegras()">
        <div class="meta" style="margin-top:6px">Em branco, o bot segue a regra de cima e atende todo mundo. Com números aqui, ele só responde a eles — o resto fica esperando você.</div>
      </div>
    </div>
  </div>
  <div class="cols conv">
    <div class="card" style="padding:0"><div class="list">${linhas}</div></div>
    <div class="card">
      ${sel?`<div class="convtopo">
        <div><h3 style="margin:0">${esc(sel.nome||sel.telefone)}</h3>
          <span class="meta mono">${esc(sel.telefone)}</span></div>
        <div style="display:flex;gap:8px">
          <button class="btn sm ${sel.nao_perturbe?'primary':''}" onclick="alternarNaoPerturbe('${esc(sel.jid)}', ${!sel.nao_perturbe})">
            ${sel.nao_perturbe?'Voltar a contatar':'Não perturbe'}
          </button>
          <button class="btn sm ${sel.bot_ativo?'':'primary'}" onclick="alternarBotConversa('${esc(sel.jid)}', ${!sel.bot_ativo})">
            ${sel.bot_ativo?'Desligar bot aqui':'Ligar bot aqui'}
          </button>
        </div>
      </div>
      <div class="meta" style="margin-bottom:10px">Estado: ${e.txt}${sel.pausado_ate && new Date(sel.pausado_ate)>new Date() ? " até "+new Date(sel.pausado_ate).toLocaleString("pt-BR") : ""}${
        sel.nao_perturbe ? " · não recebe mais mensagem automática" : (sel.retomadas ? " · já retomado "+sel.retomadas+"x" : "")}</div>`:""}
      <div class="convmsgs">${msgs}</div>
    </div>
  </div>`;
}
