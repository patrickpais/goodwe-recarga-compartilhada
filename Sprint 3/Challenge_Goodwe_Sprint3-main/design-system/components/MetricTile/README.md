Número grande com unidade e rótulo: a unidade de leitura dos painéis do motorista e do gestor.

Use para o dado que a pessoa veio ver — kWh entregues, kW instantâneo, faturamento do dia, CO₂ evitado. O valor vem formatado no padrão brasileiro, com vírgula decimal, e a unidade vai em `unit` para não competir com o número.

O rótulo é curto e em caixa alta. `note` carrega a comparação que dá sentido ao número ("30 dias no mesmo perfil", "equivale a 2 árvores").

`tone` pinta o número quando ele tem origem energética: `solar` para geração, `battery` para armazenamento e economia. `inverse` é o bloco escuro de resumo financeiro usado no simulador e no painel de demanda.

O consumidor fornece valor, unidade e rótulo já traduzidos; o componente não formata nem converte. Não empilhe mais de três lado a lado em tela de celular — acima disso, use `ListRow`.
