# `goodwe-mobile.html` — interface da v1

Versão do aplicativo que roda **servida pelo próprio ESP32**. É a única parte do
projeto que conversa com o hardware hoje: manda cor e modo para a fita de LED, lê o
botão físico e sincroniza dois celulares pelo endpoint `/state`.

Também é o arquivo que gera o
[`web_content.h`](../firmware/esp32-led-demo/web_content.h) do firmware — o HTML
inteiro entra lá como *raw string literal* C++.

## Rodar

**Sem hardware:** abra `goodwe-mobile.html` no navegador. Funciona normalmente — as
chamadas ao ESP32 falham e são ignoradas em silêncio. O console vai acusar requisições
falhas a `192.168.4.1` a cada 400 ms; é esperado.

**Com hardware:** grave o firmware, conecte o celular na rede `GoodWe-Demo` (senha
`goodwe123`) e abra `http://192.168.4.1/`.

Para desligar o LED físico sem hardware, mude `PHYSICAL_LED.enabled` para `false`.

## Como fala com o ESP32

| O quê | Como |
|---|---|
| Cor e animação do LED | `GET http://192.168.4.1/led?r=&g=&b=&mode=`, só quando o status muda |
| Botão físico (plugue) | `GET /button` a cada 400 ms; clique longo (≥1,5 s) reseta a demo |
| Sincronismo entre celulares | `GET`/`POST /state` a cada 700 ms |
| Busca de endereço por CEP | `https://viacep.com.br/ws/{cep}/json/` (esta sim precisa de internet) |

O mapa de status → cor está em `LED_RGB` e o de status → animação em `LED_MODE`, os
dois logo abaixo do comentário `LED físico opcional`. As cores são **puras**
(`0,0,255` · `255,255,0` · `0,255,0` · `255,0,0`), não as da marca: são as que
renderizam corretamente na fita WS2812B.

## Relação com o resto do repositório

```
demo-fisica/app-v1/goodwe-mobile.html
        │
        ├──▶ ../firmware/esp32-led-demo/web_content.h   (mesmo conteúdo, embutido em C++)
        │
        └──▶ ../../app/                                 (v2, refeita no Claude Design;
                                                         herdou a identidade visual daqui)
```

A v2 **não** herdou a integração com o ESP32: religá-la ao hardware passa pelo Supabase,
conforme a arquitetura alvo descrita no [README principal](../../README.md).
