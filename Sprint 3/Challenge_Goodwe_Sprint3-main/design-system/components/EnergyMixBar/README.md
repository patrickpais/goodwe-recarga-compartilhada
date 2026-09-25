Barra empilhada que mostra de onde veio a energia: solar, bateria e rede.

Aparece na casa do motorista, no monitor da sessão ao vivo e no painel do gestor. É o componente que torna o argumento do produto visível — quanto mais amarelo e verde, menos cinza, melhor o resultado para as duas personas.

As três cores são fixas e semânticas: `solar` amarelo, `battery` verde, `grid-power` cinza. O cinza da rede é deliberado: é a origem que o produto existe para reduzir. Não troque as cores por uma paleta decorativa.

Passe os valores em kWh ou kW, na ordem solar → bateria → rede; o componente calcula os percentuais e escreve cada um na legenda, porque a barra sozinha não é legível para quem não distingue as cores.

O consumidor fornece os valores já medidos. Em tempo real eles vêm do `MeterValues` via middleware OCPP; no fechamento do dia, da medição do SEMS Plus — nunca da previsão do Open-Meteo, que só planeja.
