# ChargeGrid Design System

Tokens, componentes e regras de conteúdo extraídos do protótipo em [`../app/`](../app/).
Nada aqui foi aproximado: os valores são os que a interface usa de fato.

```
design-system/
├── tokens.json          cores, tipografia, espaçamento, raio, sombra
├── design-system.json   metadados do sistema
└── components/          9 componentes com README e preview.html
    ├── bundle.css · bundle.js · index.d.ts
    ├── Button · Callout · Cover · EnergyMixBar · ListRow
    └── MetricTile · StatusPill · TabBar · TariffLock
```

Para ver um componente, abra o `preview.html` da pasta dele no navegador.

---

ChargeGrid transforma o carregador residencial GoodWe HCA G2 em um posto de recarga compartilhada. Um aplicativo, dois papéis: o motorista encontra, pluga e paga; o gestor da galeria controla demanda, tarifa e repasse. Este sistema traz os valores reais do protótipo — nada aqui foi aproximado.

## Fundamentos de conteúdo

Fale em português do Brasil, na segunda pessoa direta ("sua recarga", "você recebe 90%"), sem gerúndio de atendimento e sem jargão elétrico na interface do motorista. O gestor lê termos técnicos — demanda contratada, DLM, horário de ponta — porque são os termos da conta de luz dele.

Rótulo de ação é verbo no infinitivo com objeto: `Liberar carga`, `Usar como tarifa base`, `Cadastrar carregador`. Nunca um verbo solto.

Número brasileiro: vírgula decimal, ponto de milhar, unidade separada do valor (`4,8 kW`, `R$ 68,09`, `101,5 kWh`). Percentual sem casa decimal.

Diga o efeito financeiro sempre que ele existir. Cada aviso de falha ou interrupção carrega uma frase sobre dinheiro: "Nada foi cobrado", "Cobramos só os kWh entregues". Sem ela a pessoa presume o pior.

Toda saída de inteligência artificial vem com uma linha de justificativa legível — o fator de tarifa, a indicação de vaga, o insight do Síndico Virtual. Número sem razão é caixa-preta.

Emoji apenas como glifo de energia e sustentabilidade, dentro de selo (☀️ 🌳 ⚡). Nunca em texto corrido, nunca como decoração de cartão.

## Fundamentos visuais

**Cor é status.** As cores de estado espelham o LED do carregador físico: `status-available` azul, `status-charging` verde, `status-fault` vermelho. Essa correspondência é contratual — quem olha o poste e depois o celular precisa ver a mesma coisa.

**O vermelho da marca é o vermelho da falha.** `brand` e `status-fault` são o mesmo `#f5333f`. Por isso nenhum estado é comunicado só por cor: todo status sai com cor, ícone e palavra escrita, em qualquer componente. É também por isso que ação destrutiva não usa botão primário.

**Potência reduzida não é erro.** O controle dinâmico de carga atuando usa `status-reduced` em âmbar, com texto dizendo que a galeria está protegendo o disjuntor. Pintar isso de vermelho gera chamado de suporte.

**Três origens de energia, três cores fixas.** `solar` amarelo, `battery` verde, `grid-power` cinza. O cinza da rede é intencional: é a origem que o produto existe para reduzir.

**Texto.** Corpo em `body` sobre `surface-card`, com `ink`. Texto secundário em tamanho de corpo usa `ink-muted-strong`, não `ink-muted` — o valor original do protótipo fica em 3,8:1 e só se sustenta em 19px peso 800 ou acima. Número de painel em `metric`, rótulo de painel em `overline` caixa alta.

**Superfície e profundidade.** Cartão é `surface-card` com borda de 1px em `border` e raio `radius-xl`. Sombra só onde há elevação real: `shadow-card` na barra persistente de sessão ativa e `shadow-sheet` na folha modal. O resto do app se separa por borda, não por sombra.

**Raio.** `radius-pill` em botão, selo e seletor segmentado; `radius-xl` e `radius-2xl` em cartão; `radius-3xl` em folha modal e bloco escuro de resumo. Nada quadrado: o sistema é arredondado de ponta a ponta, coerente com a Nunito.

**Espaçamento.** Passo de 4px, de `space-1` a `space-8`. Margem lateral da tela e padding de cartão em `space-6`. O canvas original também usa 9, 13, 15 e 18px em alguns cartões; em telas novas, aproxime para o passo mais próximo.

**Foco.** Anel de 2px em `focus-ring` com 2px de deslocamento, em todo alvo tocável. Ele atende 3:1 sobre qualquer superfície do sistema nos dois temas.

**Temas.** O tema claro é o app. O tema escuro serve às telas imersivas — leitura de QR Code e sessão de recarga ao vivo — onde a tela vira instrumento e o ambiente costuma ser um estacionamento à noite.

## Iconografia

Os ícones do protótipo são glifos Unicode e emoji inline. Ao sair do protótipo, adote **Lucide** (`lucide-react-native`), traço de 2px em grade de 24px, que tem equivalente direto para todo glifo em uso e mantém o desenho arredondado do sistema.

Correspondência a manter: `map` início · `zap` carga e carregando · `house` casa · `leaf` impacto · `plug` disponível · `triangle-alert` falha · `wrench` manutenção · `clock` agendada · `sun` solar · `battery-charging` bateria · `utility-pole` rede · `activity` demanda contratada · `qr-code` liberar carga · `car-front` veículo · `credit-card` pagamento · `download` exportar · `sparkles` saída de IA.

`sparkles` é reservado à inteligência artificial. Onde ele aparece, há obrigatoriamente uma linha de justificativa em texto.

Ícone de aba nunca aparece sem rótulo escrito abaixo. Em lista, um ícone por linha. Badge numérico só em notificações e no chat do Síndico.

## Navegação

Quatro abas por papel, nunca cinco. O gestor tem oito assuntos: quatro nas abas e o resto em uma grade de serviços dentro de Início. Item que não cabe vira grade, não aba desabilitada.

Profundidade máxima de três níveis — aba, lista ou mapa, detalhe. Ação de escrita abre em folha modal com fechamento explícito.

Enquanto houver recarga em andamento, a barra persistente de sessão fica acima da barra de abas, mostra kW e custo acumulado e leva ao monitor ao vivo de qualquer aba.

## O que este sistema não cobre

Não há logotipo GoodWe aqui: a marca não foi fornecida em arquivo e não deve ser redesenhada. Onde a identidade for necessária, componha o nome em tipo — `display-lg` em `ink`, com `brand` como acento.

Os componentes cobrem as oito famílias que o protótipo realmente define. Mapa, anel de progresso da sessão e gráfico de orquestração do dia ainda vivem como marcação solta no canvas e entram no sistema quando estabilizarem.
