Preço por kWh com o estado do congelamento e a justificativa da IA.

É a tela de confiança do produto. Antes do plug-in mostra a tarifa vigente; depois, com `locked`, afirma que o preço não muda mais nesta sessão — a garantia que a RN002 exige e que o motorista precisa ler antes de conectar.

`factor` traz o fator de modulação que a IA aplicou sobre a tarifa base do gestor. Sempre que `factor` for passado, `reason` é obrigatório: uma frase curta em linguagem comum que explica o número ("Excedente solar alto agora", "Horário de ponta da concessionária"). Fator sem razão transforma o preço em caixa-preta, e é a diferença entre tarifa dinâmica e preço arbitrário.

O consumidor fornece o preço já formatado, o fator e a razão vindos do serviço de precificação. O componente não calcula preço.

Na versão travada, a borda verde e a frase de estado usam `battery-ink`. Não use vermelho aqui: vermelho neste produto significa falha.
