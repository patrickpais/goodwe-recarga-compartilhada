# Firmware — ESP32 da demonstração

> Parte da [demonstração física v1](../README.md), congelada e funcional.

Sketch Arduino do carregador de demonstração: o ESP32 cria a própria rede Wi-Fi, serve
o aplicativo, comanda a fita de LED atrás do "W" vazado da capa impressa em 3D e lê o
botão físico que simula o plugue sendo conectado ao carro.

```
demo-fisica/firmware/esp32-led-demo/
├── esp32-led-demo.ino    sketch principal
└── web_content.h         o app inteiro embutido como string literal (~110 KB)
```

## Montagem

| Item | Ligação | Constante no sketch |
|---|---|---|
| Fita WS2812B (NeoPixel) | fio DIN no GPIO 5 | `LED_PIN 5` |
| Quantidade de LEDs | ajuste para o número real do pedaço cortado | `NUM_LEDS 6` |
| Botão | uma perna no GPIO 4, a outra no GND | `BUTTON_PIN 4` |

O botão usa o pull-up interno do ESP32 — não precisa de resistor.

`NUM_LEDS` tem que bater com a fita de verdade: maior que o real e as animações "somem"
no trecho que não existe; menor e sobram LEDs apagados.

## Gravar

1. Arduino IDE → **Sketch › Include Library › Manage Libraries** → instale **Adafruit NeoPixel**.
2. **Tools › Board** → qualquer placa ESP32 (ex.: *ESP32 Dev Module*).
3. Grave. O monitor serial (115200 baud) imprime o IP, normalmente `192.168.4.1`.

## Usar

Conecte o celular (ou o notebook) na rede **`GoodWe-Demo`**, senha `goodwe123`, e abra
`http://192.168.4.1/`. O app é servido pelo próprio ESP32 — não precisa de internet
nem de computador.

## Endpoints

| Endpoint | O que faz |
|---|---|
| `GET /` | serve o app (`web_content.h`), em blocos de 2 KB |
| `GET /led?r=&g=&b=&mode=` | cor e modo de animação da fita |
| `GET /button` | `{"event":1,"long":0}` — clique curto (plugue) e aperto longo (reset) |
| `GET /state` | último estado publicado por algum celular |
| `POST /state` | substitui o estado publicado |

`/state` é um "quadro compartilhado" simples: cada celular publica o que muda e
pergunta pelo que mudou, o que permite dois aparelhos ficarem sincronizados na
demonstração sem servidor nenhum.

### Modos de animação

| `mode` | Efeito | Uso |
|---|---|---|
| `0` | cor fixa | Disponível (azul) e Indisponível (apagado) |
| `1` | respirando | Em uso (amarelo) e Interrompido (vermelho) |
| `2` | correndo / girando pelo W | **Carregando** (verde) |
| `3` | enchendo tipo bateria, usa `&pct=` | implementado, **sem uso pelo app** |

O app envia cores RGB **puras** (`0,0,255` · `255,255,0` · `0,255,0` · `255,0,0`), não as
cores de marca: são as que renderizam corretamente na fita.

O modo 3 foi abandonado porque com poucos LEDs atrás do recorte do W o efeito de
enchimento não se lê; o verde girando contínuo ficou sendo o efeito de "carregando".

## Notas de leitura do código

- **Comentário desatualizado.** A linha que descreve `mode = 2` como *"não usado mais
  pelo app"* está errada — quem caiu em desuso foi o `mode = 3`. O cabeçalho do arquivo
  e o app estão corretos: carregando é `mode = 2`.
- **"Âmbar" no cabeçalho, amarelo no código.** O cabeçalho chama o estado *Em uso* de
  âmbar; o app envia amarelo puro (`255,255,0`) pelo motivo de renderização acima.
- **`applyChase` foi calibrado para ~8 LEDs** (comentário no código), mas `NUM_LEDS`
  está em 6. Com 6 LEDs o giro fica em ~2 voltas/s em vez de ~1,5. Ajuste `speed` se
  quiser o ritmo original.
- **`handleRoot` envia em blocos de 2 KB** de propósito: com ~110 KB de página, um
  `send()` único pode truncar silenciosamente no ESP32.
- O evento do botão é decidido ao **soltar**, para distinguir clique curto de aperto
  longo (≥ 1,5 s), e é consumido na leitura — nenhum clique se perde nem se repete.

## Atualizar o app embutido

`web_content.h` é gerado a partir de
[`../app-v1/goodwe-mobile.html`](../app-v1/goodwe-mobile.html): o HTML inteiro
entra como *raw string literal* (`R"HTMLDELIM(...)HTMLDELIM"`). Editar o `.h`
na mão é possível, mas nada prático. Regenere a partir do HTML e grave o firmware de
novo.

Os dois arquivos deste repositório foram conferidos: o conteúdo de `web_content.h` é
idêntico ao `goodwe-mobile.html` publicado em `../app-v1/`.

## Segurança

Rede aberta com senha fixa no código, CORS liberado (`Access-Control-Allow-Origin: *`)
e nenhum endpoint autenticado. É adequado a uma mesa de demonstração e a nada além
disso. Em produção, o dispositivo fala com o Supabase por HTTPS com credencial própria
— e não serve página nenhuma.
