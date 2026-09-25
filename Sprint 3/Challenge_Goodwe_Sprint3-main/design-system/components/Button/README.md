Ação tocável do aplicativo, em pílula, nas três hierarquias que as telas usam.

Use `primary` para a única ação que faz a tela avançar — Liberar carga, Confirmar recarga, Usar como tarifa base. Uma tela nunca tem dois primários. `secondary` é a alternativa de mesmo peso (Adicionar manualmente, Cadastrar depois) e `ghost` é a saída textual (Não consigo ler o QR Code, Cancelar programação).

Ação que conclui um fluxo vai com `block`, colada ao rodapé da tela, para ser alcançável com o polegar.

O consumidor fornece o rótulo e o `onClick`. O rótulo é um verbo no infinitivo com o objeto, não uma palavra solta: "Liberar carga", não "Liberar".

Não use `primary` para ação destrutiva ou irreversível — Encerrar recarga é `secondary`, e o encerramento pede confirmação em folha modal. Não desabilite um botão sem dizer por quê: quando o app está sem conexão, o botão fica desabilitado e um `Callout` ao lado explica.

Contraste: `on-brand` sobre `brand` dá 3,9:1, abaixo do piso de 4,5:1. É o valor exato do protótipo e foi mantido. O rótulo do botão primário fica em 15px peso 900; para qualquer botão com texto menor, pinte com `brand-strong`.
