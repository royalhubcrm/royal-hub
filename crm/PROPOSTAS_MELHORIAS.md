# Propostas de melhoria — Royal CRM

Tudo o que muda fluxo, regra de negócio, banco ou cria tela nova ficou **fora** da rodada automática (Fase 2) e está aqui, para você decidir. As propostas estão em ordem de prioridade: maior ganho com menor esforço primeiro.

Legenda de esforço: **Baixo** = só tela (1 a 2 dias) · **Médio** = tela + banco/função (3 a 5 dias) · **Alto** = mais de uma semana ou integração externa.

> **Feito em 23/09/2026 (rodada "compactar"):** modo escuro; tela Assistente única (Testar | Configurar) no lugar das abas de Conversas e da aba de Ajustes; Ajustes sem abas; cabeçalhos de uma linha e nomes diretos (Funil, Agenda); cadastros de Equipe e Empresas em gaveta; ficha do lead com "Mais campos" fechado. As duas propostas marcadas ✅ abaixo saíram daí.

---

### [NOVA] — Aviso de lead repetido ao digitar o telefone
**O quê:** Ao digitar o telefone na ficha, mostrar na hora "Já existe: Maria Silva (Em contato, com Carla)" com botão para abrir.
**Por quê:** Hoje o aviso só vem na hora de salvar, como erro. Evita retrabalho, evita dois corretores no mesmo cliente e aproveita o índice único que o banco já tem.
**Impacto/Esforço:** Alto — Baixo

### [NOVA] — Cadastro rápido (quick add) no Pipeline e em Leads
**O quê:** Uma linha "nome + WhatsApp + Enter" no topo do Kanban (por coluna) e da tabela, sem abrir a ficha inteira.
**Por quê:** O corretor recebe o contato no balcão ou no telefone e precisa anotar em 5 segundos; o resto ele completa depois. Reduz o cadastro de 12 campos para 2.
**Impacto/Esforço:** Alto — Baixo

### [ALTERAR] — Cards do Kanban com "dias sem contato" e alerta de lead parado
**O quê:** Cada card mostra há quantos dias ninguém mexe nele (última anotação, mensagem ou mudança de etapa) e fica com borda âmbar acima de 3 dias, vermelha acima de 7; ordenar a coluna por urgência.
**Por quê:** É a pergunta que o gerente faz todo dia ("quem está esquecido?") e hoje só dá para responder na Agenda e gerência. Usa dados que já existem (histórico, atualizado_em).
**Impacto/Esforço:** Alto — Baixo

### [COMPACTAR] — "Seu dia" no Painel
**O quê:** Levar para o topo do Painel as visitas de hoje, as perguntas que a assistente deixou e os clientes sem resposta — como uma lista de tarefas com botão de ação em cada linha.
**Por quê:** Hoje isso vive em Agenda e gerência, que só admin/gerente veem. O corretor abriria o sistema e já saberia o que fazer, sem navegar. Zero mudança de banco: são as mesmas consultas.
**Impacto/Esforço:** Alto — Baixo

### [NOVA] — Motivo de perda
**O quê:** Ao mover um lead para "Perdido", pedir o motivo numa lista curta (preço, comprou em outro lugar, sem retorno, desistiu, outro) e mostrar o resumo no Painel.
**Por quê:** Sem motivo, "Perdido" não ensina nada. Com ele, dá para ver se o problema é preço, carteira ou atendimento. Uma coluna nova em leads + uma pergunta no Kanban.
**Impacto/Esforço:** Alto — Médio

### [NOVA] — Próxima ação e lembrete por lead (follow-up)
**O quê:** Campo "Próximo contato" (data + o que fazer) na ficha; lista "Para hoje / Atrasados" no Painel; aviso por e-mail ou WhatsApp interno para o responsável.
**Por quê:** É o coração de Pipedrive/HubSpot: o CRM lembra o corretor, não o contrário. Hoje a única "memória" é a assistente de retomada, que só cobre o WhatsApp.
**Impacto/Esforço:** Alto — Médio

### [NOVA] — Linha do tempo única na ficha (visão 360º)
**O quê:** Na ficha do lead, uma aba "Atividades" juntando em ordem: anotações, mudanças de etapa, mensagens do WhatsApp (as últimas), visitas marcadas e imóveis pedidos — com o campo de responder ali mesmo quando o WhatsApp oficial estiver ligado.
**Por quê:** Hoje o histórico está na ficha, a conversa em Conversas e a visita em Agenda. Quem atende precisa abrir três telas para saber "onde parou" com o cliente.
**Impacto/Esforço:** Alto — Médio

### [NOVA] — Distribuição automática de leads (rodízio)
**O quê:** Lead que entra pelo formulário, webhook ou WhatsApp vai sozinho para o próximo corretor ativo da fila (ou da equipe), com regra configurável em Ajustes.
**Por quê:** Lead sem responsável esfria. Rodízio tira a decisão do gerente e dá resposta em minutos. Precisa de uma tabela de fila + ajuste no trigger que cria o lead.
**Impacto/Esforço:** Alto — Médio

### [NOVA] — Ações em massa na tabela de leads
**O quê:** Caixa de seleção por linha e barra "N selecionados: mudar etapa · responsável · temperatura · excluir".
**Por quê:** Redistribuir 40 leads quando um corretor sai, ou marcar uma campanha inteira como fria, hoje é um por um.
**Impacto/Esforço:** Alto — Médio

### [NOVA] — Painel com conversão por origem e tempo por etapa
**O quê:** Dois gráficos novos: taxa de fechamento por origem/campanha e dias médios em cada etapa; filtro por período e por corretor.
**Por quê:** Responde "qual anúncio traz cliente que compra?" e "onde o funil trava?". Hoje o Painel mostra volume, não qualidade. O histórico já registra as datas de cada troca de etapa.
**Impacto/Esforço:** Alto — Médio

### [NOVA] — Notificação de nova mensagem e novo lead
**O quê:** Notificação do navegador (com permissão) e som discreto quando chega mensagem no WhatsApp ou lead novo, mesmo com o sistema em outra aba.
**Por quê:** O tempo real já existe (a bolinha do menu atualiza sozinha), mas ninguém vê se estiver em outra aba. Resposta rápida é o que mais converte em imóvel.
**Impacto/Esforço:** Médio — Baixo

### [NOVA] — Exportar leads e imóveis (CSV/Excel)
**O quê:** Botão "Exportar" nas duas tabelas, respeitando os filtros ativos.
**Por quê:** Relatório para o dono, backup, envio para o contador ou para outra ferramenta. Já existe importação; falta o caminho de volta.
**Impacto/Esforço:** Médio — Baixo

### [ALTERAR] — Ficha do lead em abas (Dados · Atividades · Conversa) — ✅ parcial: "Mais campos" já está fechado
**O quê:** Dividir o painel lateral: "Dados" com o formulário, "Atividades" com histórico e anotações, "Conversa" com o WhatsApp. Campos raros (empresa, campanha, e-mail) atrás de "Mais campos".
**Por quê:** A gaveta hoje empilha 12 campos + sugestão de IA + histórico; em tela pequena é rolagem longa. Abas deixam o essencial visível e preparam o terreno para a linha do tempo.
**Impacto/Esforço:** Médio — Baixo

### [COMPACTAR] — Cadastro de imóvel em duas camadas
**O quê:** Primeiro o essencial (código, tipo, finalidade, preço, CEP → endereço automático, quartos, fotos); condomínio, IPTU, link externo e descrição longa ficam num bloco "Mais detalhes" fechado.
**Por quê:** O cadastro rápido de um imóvel novo hoje passa por 20 campos. A maioria só importa para os portais, que já avisam o que falta.
**Impacto/Esforço:** Médio — Baixo

### [REMOVER] — Campo "Empresa do cliente" na ficha do lead — ✅ movido para "Mais campos"
**O quê:** Tirar o campo do formulário (mantendo a coluna no banco) ou movê-lo para "Mais campos".
**Por quê:** Imobiliária residencial quase nunca usa; é um campo a mais para pular em todo cadastro. Se houver clientes pessoa jurídica, o campo volta como opcional escondido.
**Impacto/Esforço:** Baixo — Baixo

### [ALTERAR] — Imóveis do lead escolhidos da carteira, não digitados
**O quê:** No lugar do campo "códigos separados por vírgula", uma busca com autocomplete pela carteira, mostrando foto, preço e situação de cada imóvel ligado ao lead.
**Por quê:** Digitar código errado é comum e o sistema não avisa. Com a lista, a ficha vira uma mini-vitrine do que já foi mostrado ao cliente, e "Imóveis mais procurados" no Painel fica confiável.
**Impacto/Esforço:** Médio — Médio

### [NOVA] — Filtros salvos (visões) na tabela de leads
**O quê:** Salvar uma combinação de filtros com nome ("Meus quentes", "Sem responsável", "Facebook em outubro") e abrir com um clique; a visão fica na URL para compartilhar.
**Por quê:** Gerente e corretor repetem os mesmos filtros todo dia. É o padrão de HubSpot/Pipedrive e não mexe em regra de negócio.
**Impacto/Esforço:** Médio — Médio

### [ALTERAR] — Etapas do pipeline editáveis por imobiliária
**O quê:** Em Ajustes, renomear, colorir, reordenar e criar etapas, com a probabilidade de fechamento de cada uma.
**Por quê:** As 6 etapas atuais são iguais para todas as empresas. Uma imobiliária de locação ou de lançamentos tem funil diferente. O banco já foi feito com `etapas_pipeline` por empresa; falta a tela.
**Impacto/Esforço:** Médio — Médio

### [ALTERAR] — Importação de imóveis com mapeamento de colunas
**O quê:** Colar a planilha com cabeçalho (como já funciona nos leads) e conferir uma prévia "coluna da planilha → campo do sistema" antes de importar.
**Por quê:** Hoje o formato é fixo (código; tipo; bairro; preço…) e cada imobiliária exporta de um jeito diferente do sistema anterior.
**Impacto/Esforço:** Médio — Médio

### [NOVA] — Metas por corretor e ranking da equipe
**O quê:** Meta mensal (leads atendidos, visitas, fechamentos) por pessoa; barra de progresso na Equipe e no Painel do gerente.
**Por quê:** Dá ao gerente um motivo para abrir o sistema todo dia e ao corretor um placar. Precisa de uma tabela de metas e das contagens que o histórico já permite.
**Impacto/Esforço:** Médio — Médio

### [NOVA] — Busca global (Ctrl+K)
**O quê:** Uma caixa que acha lead, imóvel e conversa pelo nome, telefone ou código, de qualquer tela.
**Por quê:** "O cliente ligou, qual é a ficha dele?" hoje exige ir em Leads e filtrar. A tecla "/" já foca a busca da tela; a global fecha o caso.
**Impacto/Esforço:** Médio — Médio

---

## Dúvidas ainda em aberto (da entrega anterior)
Cobrança/planos no painel do dono · ponte não oficial (Baileys) · migração dos dados do sistema antigo · papel "cliente" · UF fixa (MG) no feed dos portais · domínio próprio real para os sites · copiar o `server/estilo.md` antigo para o campo de estilo da assistente.
