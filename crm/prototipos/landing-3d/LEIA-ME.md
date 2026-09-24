# Três estudos de landing page com Three.js

Páginas independentes (HTML puro, Three.js pela CDN), para comparar antes de escolher o que entra no site.
Cada uma usa a cena 3D para contar a mensagem da tela, não como enfeite. Navy, ouro e Cinzel, como o resto do Royal Hub.

Para abrir: no Claude Code, preview `landing-3d` (porta 4340), ou qualquer servidor estático nesta pasta.
`file://` não funciona por causa dos módulos ES.

| Arquivo | Ideia | O que a cena diz |
|---|---|---|
| `1-constelacao.html` | Mil pontos de luz espalhados se reúnem, com a rolagem, na coroa-casa da marca. | Do disperso (planilha, arquivo, celular de cada um) ao lugar só. |
| `2-edificio.html` | Uma torre de linhas douradas se ergue andar por andar sobre um piso espelhado. | Elegância que se constrói; cada andar é uma parte do trabalho, no mesmo edifício. |
| `3-caminho.html` | Um fio de luz percorre quatro estações (Lead, Conversa, Visita, Chave na mão) e a câmera acompanha. | O caminho do cliente dentro do sistema, do primeiro contato ao fechamento. |

Comuns às três: rolagem como controle (nada acontece sozinho além de um movimento lento), paralaxe leve com o mouse,
texto real em HTML (leitor de tela e teclado funcionam; o canvas é `aria-hidden`), "reduzir movimento" do sistema
respeitado, pixel ratio limitado a 2, celular com layout próprio.

Custo estimado se entrar no Angular: Three.js ~150 kB comprimido, carregado só na landing (`import()` depois do texto aparecer).
