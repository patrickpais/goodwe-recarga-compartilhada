Linha de lista: o formato que carrega quase todo conteúdo tabular do app.

Serve para eletroposto no resultado da busca, dispositivo na casa, lançamento na carteira, sessão no histórico e vaga no painel do gestor. Uma lista longa é sempre preferível a três colunas de números em tela de celular.

`glyph` recebe o ícone da categoria, `meta` a linha de contexto (endereço, data, série do equipamento) e `trailing` o valor que a pessoa está comparando — preço, kWh, status. Passar `onClick` transforma a linha em botão e acrescenta o chevron; sem ele a linha é estática e não recebe foco.

`trailing` aceita um `StatusPill`: é assim que a lista de eletropostos mostra disponível, ocupado e em falha sem precisar de uma coluna extra.

O consumidor fornece o conteúdo já formatado e a navegação. Um item indisponível não é escondido da lista — fica visível com o motivo em `meta`, porque sumir com o ponto faz a pessoa procurá-lo de novo.
