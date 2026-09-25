Selo que comunica o estado de um eletroposto ou de uma sessão, com cor, ícone e palavra escrita ao mesmo tempo.

É o componente que cumpre a regra visual central do produto: a cor espelha o LED do carregador GoodWe (azul disponível, verde carregando, vermelho falha) e nunca carrega a informação sozinha. Todo estado sai com glifo e rótulo — por isso o componente não aceita rótulo vazio.

Passe `detail` com o dado que qualifica o estado: a potência em `charging`, a previsão de liberação em `idle`, o código do erro em `fault`.

O estado `reduced` é o controle dinâmico de carga atuando. Não é falha e não usa vermelho: sai em âmbar e exige um `Callout` de tom `reduced` por perto explicando que a galeria está protegendo o disjuntor. Sinalizar redução de potência como erro gera chamado de suporte.

O consumidor fornece o status e, quando houver, o detalhe. A pílula não é tocável: para levar ao detalhe do ponto, envolva-a em um `ListRow`.
