# Demonstração física — v1

**Versão 1, congelada e funcional.** É a única parte do projeto que fecha o ciclo
completo: plugue conectado → medição → LED → interface. É ela que roda na
demonstração com hardware.

A interface foi substituída pela de [`../app/`](../app/), que está em desenvolvimento.
Isso não deprecia o que está aqui: a v2 ainda não conversa com equipamento nenhum.

```
demo-fisica/
├── firmware/esp32-led-demo/
│   ├── esp32-led-demo.ino    fita WS2812B, botão físico e servidor HTTP
│   └── web_content.h         o app abaixo, embutido como string literal C++
└── app-v1/
    └── goodwe-mobile.html    a interface — é a origem do web_content.h
```

Os dois arquivos são o mesmo conteúdo em formatos diferentes, e foram conferidos:
o HTML dentro de `web_content.h` é idêntico ao `goodwe-mobile.html`. Ao alterar a
interface, mude o HTML, regenere o `.h` e grave o firmware de novo.

## Rodar a demonstração

1. Monte a fita e o botão conforme [`firmware/README.md`](firmware/README.md).
2. Grave o sketch (precisa da biblioteca **Adafruit NeoPixel**).
3. Conecte o celular na rede **`GoodWe-Demo`** (senha `goodwe123`).
4. Abra `http://192.168.4.1/`.

Não precisa de internet, de notebook nem de servidor: o ESP32 cria a rede e serve o
app sozinho.

Sem hardware, `app-v1/goodwe-mobile.html` abre direto no navegador — as chamadas ao
ESP32 falham e são ignoradas em silêncio.

## O que esta versão prova

| Capacidade | Como |
|---|---|
| Evento físico vira estado de aplicação | botão → `/button`, lido a cada 400 ms, consumido na leitura |
| Estado de aplicação vira sinal no equipamento | status → `/led?r=&g=&b=&mode=`, só quando muda |
| Dois aparelhos veem a mesma sessão | `GET`/`POST /state`, a cada 700 ms |
| Operação sem infraestrutura | Access Point próprio, app servido do flash do ESP32 |

É exatamente essa cadeia que a arquitetura alvo move para o Supabase: o dispositivo
deixa de servir a página e de decidir qualquer coisa, e passa a só reportar ao banco —
que vira a fonte única de verdade. Veja o [README principal](../README.md).

## Por que está congelada

A v1 nasceu acoplada ao ESP32: a interface inteira cabe em ~110 KB porque precisa caber
no flash do microcontrolador. Esse limite é o que a tornou uma boa prova de conceito de
hardware e uma má base para o produto — as três personas do ChargeGrid (motorista,
gestor com a solução e gestor prospect) não cabem numa página servida por
microcontrolador.

Então ela para aqui, fazendo bem o que faz. O desenvolvimento seguiu em
[`../app/`](../app/).
