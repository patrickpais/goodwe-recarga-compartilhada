/*
  GoodWe · Recarga Compartilhada — LED + botão físicos da demonstração
  ------------------------------------------------------------
  O ESP32 cria sua própria rede Wi-Fi (modo Access Point) e um servidor
  HTTP simples. O protótipo web manda a cor (RGB) e o modo de animação
  toda vez que o status do carregador muda:

    Disponível   -> azul     parado                          (mode=0)
    Em uso       -> âmbar    respirando                      (mode=1)
    Carregando   -> verde    correndo/girando continuo       (mode=2)
    Interrompido -> vermelho respirando                      (mode=1)
    Indisponível -> apagado                                  (mode=0)

  (Na capa impressa em 3D, os LEDs ficam atras do W vazado — o verde
  girando pelo logo e o efeito do carregamento. O antigo mode=3,
  "enchendo tipo bateria" com &pct=, continua implementado mas o app
  nao usa mais: com poucos LEDs atras do recorte ele nao rendia.)

  Endpoint da fita:   GET /led?r=0&g=0&b=255&mode=0

  Já o botão físico simula o plugue sendo conectado/desconectado do carro.
  O ESP32 detecta o clique (com debounce) e guarda um "evento pendente";
  o navegador pergunta a cada ~400ms se houve clique novo, e o evento é
  apagado assim que é lido — assim nenhum clique se perde nem se repete.

  Endpoint do botão:  GET /button   -> {"event":1,"long":0}
                       event=1: clique curto desde a última leitura (plugue)
                       long=1:  aperto de 1,5s+ (reset geral da demonstração —
                                limpa sessões penduradas, tudo volta ao início)

  O ESP32 também serve o próprio app (arquivo web_content.h, gerado a partir
  de goodwe-mobile.html) em http://192.168.4.1/ — é só conectar o celular
  na rede "GoodWe-Demo" e abrir esse endereço no navegador, sem precisar
  de notebook nem internet. E guarda o estado do app num "quadro
  compartilhado" simples, pra dois celulares conseguirem ficar
  sincronizados entre si (cada um manda o que muda e pergunta pelo que
  mudou, ver o SYNC no goodwe-mobile.html):

  Endpoint do estado: GET /state   -> devolve o último estado recebido
                       POST /state -> corpo é o novo estado (substitui o anterior)

  BIBLIOTECAS NECESSÁRIAS (Arduino IDE > Sketch > Include Library > Manage Libraries):
    - "Adafruit NeoPixel" (Adafruit)
  PLACA: qualquer board ESP32 (Tools > Board > ESP32 Dev Module, por exemplo)
*/

#include <WiFi.h>
#include <WebServer.h>
#include <Adafruit_NeoPixel.h>
#include "web_content.h"

// ---------------- ajuste conforme sua montagem ----------------
#define LED_PIN     5      // GPIO ligado ao fio DIN (dados) da fita
#define NUM_LEDS    6      // quantos LEDs de fato estao colados atras do W vazado
                            // IMPORTANTE: ajuste pro numero REAL do pedaco cortado —
                            // se for maior que o real, as animacoes "somem" no trecho
                            // que nao existe; se for menor, sobram LEDs apagados
#define BRIGHTNESS  255    // 0-255, limite geral de brilho

#define BUTTON_PIN  4      // GPIO ligado a uma perna do botão; a outra perna vai direto no GND
                            // (usa o pull-up interno do ESP32, não precisa de resistor)
const unsigned long DEBOUNCE_MS = 40;  // ignora "tremidas" do contato por 40ms após um clique

const char* AP_SSID = "GoodWe-Demo";
const char* AP_PASS = "goodwe123";   // mínimo 8 caracteres

// Modo duplo: além de criar a rede GoodWe-Demo (plano B), o ESP32 também
// ENTRA na rede do local da apresentação — assim o notebook fica com
// internet (banca online) e ainda enxerga o carregador. As credenciais
// ficam no wifi_local.h, que está fora do git (copie do .example.h).
#include "wifi_local.h"
// ----------------------------------------------------------------

Adafruit_NeoPixel strip(NUM_LEDS, LED_PIN, NEO_GRB + NEO_KHZ800);
WebServer server(80);

uint8_t targetR = 0, targetG = 0, targetB = 0;
int fillPct = 0; // usado só no mode=3 (enchendo)

String sharedState = ""; // "quadro compartilhado": último estado que algum celular mandou

bool lastRawReading = HIGH;         // última leitura bruta do pino (pode "tremer")
bool stableState = HIGH;            // estado já confirmado como estável (HIGH = solto, LOW = pressionado)
unsigned long lastDebounceTime = 0;
unsigned long pressStartedAt = 0;   // quando o aperto atual começou
bool buttonEventPending = false;      // clique CURTO pendente (plugue conecta/desconecta)
bool buttonLongEventPending = false;  // aperto LONGO pendente (>=1,5s: reset geral da demo)
const unsigned long LONGPRESS_MS = 1500;

// modo de animação da fita:
//   0 = parado (cor fixa)
//   1 = respirando (pulsa tudo junto, suave)
//   2 = perseguição (uma luz "corre" pelos LEDs) — não usado mais pelo app, mas ainda funciona
//   3 = enchendo (acende os primeiros fillPct% dos LEDs, tipo medidor de bateria)
int mode = 0;

void applyBreathe() {
  float phase = (millis() % 1400) / 1400.0;                    // ciclo de 1.4s
  float factor = 0.35 + 0.65 * (0.5 - 0.5 * cos(phase * 2 * PI)); // curva suave tipo "respirando"
  uint32_t c = strip.Color(targetR * factor, targetG * factor, targetB * factor);
  for (int i = 0; i < NUM_LEDS; i++) strip.setPixelColor(i, c);
  strip.show();
}

void applyChase() {
  // giro continuo pelo W enquanto carrega — calibrado pra fita curta (~8 LEDs):
  // 12 LEDs/s = ~1,5 voltas por segundo, rapido o bastante pra parecer "girando"
  // sem virar um borrao. Ajuste fino: speed maior = gira mais rapido.
  const float speed = 12.0;  // LEDs por segundo
  const float trail = 2.2;   // "comprimento" do rastro em LEDs — aumente pra ficar mais suave/longo

  float headPos = fmod(millis() * speed / 1000.0, NUM_LEDS);

  for (int i = 0; i < NUM_LEDS; i++) {
    float d = fabs(i - headPos);
    d = min(d, NUM_LEDS - d);         // caminho mais curto, considerando a fita "circular"
    float factor = 1.0 - (d / trail);
    if (factor < 0) factor = 0;
    strip.setPixelColor(i, strip.Color(targetR * factor, targetG * factor, targetB * factor));
  }
  strip.show();
}

void applyStatic() {
  uint32_t c = strip.Color(targetR, targetG, targetB);
  for (int i = 0; i < NUM_LEDS; i++) strip.setPixelColor(i, c);
  strip.show();
}

void applyFill() {
  int litCount = (NUM_LEDS * fillPct) / 100; // quantos LEDs, contando do inicio da fita, ficam acesos
  uint32_t c = strip.Color(targetR, targetG, targetB);
  for (int i = 0; i < NUM_LEDS; i++) {
    strip.setPixelColor(i, i < litCount ? c : 0);
  }
  strip.show();
}

void applyColor() {
  if (mode == 1) applyBreathe();
  else if (mode == 2) applyChase();
  else if (mode == 3) applyFill();
  else applyStatic();
}

void handleLed() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  if (server.hasArg("r")) targetR = server.arg("r").toInt();
  if (server.hasArg("g")) targetG = server.arg("g").toInt();
  if (server.hasArg("b")) targetB = server.arg("b").toInt();
  if (server.hasArg("mode")) mode = server.arg("mode").toInt();
  if (server.hasArg("pct")) fillPct = server.arg("pct").toInt();
  applyColor();
  server.send(200, "text/plain", "ok");
}

void handleRoot() {
  // manda em pedaços de 2KB em vez de tudo de uma vez só — com ~108KB de
  // página, um único send() pode falhar/truncar silenciosamente em ESP32
  server.sendHeader("Access-Control-Allow-Origin", "*");
  size_t total = strlen(INDEX_HTML);
  server.setContentLength(total);
  server.send(200, "text/html; charset=utf-8", "");
  const size_t CHUNK = 2048;
  for (size_t i = 0; i < total; i += CHUNK) {
    size_t len = (total - i < CHUNK) ? (total - i) : CHUNK;
    server.sendContent(INDEX_HTML + i, len);
  }
}

void handleStateGet() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", sharedState.length() ? sharedState : "{}");
}

void handleStatePost() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  if (server.hasArg("plain")) sharedState = server.arg("plain"); // corpo bruto do POST
  server.send(200, "text/plain", "ok");
}

// roda em todo loop() — o evento é decidido ao SOLTAR o botão, pra dar
// pra diferenciar clique curto (plugue) de aperto longo (reset da demo)
void checkButton() {
  bool reading = digitalRead(BUTTON_PIN);
  if (reading != lastRawReading) {
    lastDebounceTime = millis();   // o pino mudou agora — reinicia a contagem de estabilidade
    lastRawReading = reading;
  }
  if (millis() - lastDebounceTime > DEBOUNCE_MS) {
    // a leitura ficou parada (sem "tremer") por tempo suficiente: é real
    if (reading != stableState) {
      stableState = reading;
      if (stableState == LOW) {
        pressStartedAt = millis();          // começou a apertar — só marca a hora
      } else {
        // soltou: decide se foi curto ou longo
        if (millis() - pressStartedAt >= LONGPRESS_MS) {
          buttonLongEventPending = true;
          Serial.println("Botao: aperto LONGO (reset da demo)");
        } else {
          buttonEventPending = true;
          Serial.println("Botao: clique curto (plugue)");
        }
      }
    }
  }
}

void handleButton() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  String json = String("{\"event\":") + (buttonEventPending ? "1" : "0")
              + ",\"long\":" + (buttonLongEventPending ? "1" : "0") + "}";
  buttonEventPending = false;     // consome os eventos — cada um só é reportado uma vez
  buttonLongEventPending = false;
  server.send(200, "application/json", json);
}

void setup() {
  Serial.begin(115200);

  strip.begin();
  strip.setBrightness(BRIGHTNESS);
  strip.show(); // tudo apagado no início

  pinMode(BUTTON_PIN, INPUT_PULLUP);

  WiFi.mode(WIFI_AP_STA);          // cria a GoodWe-Demo E entra na rede local
  WiFi.softAP(AP_SSID, AP_PASS);
  WiFi.config(STA_IP, STA_GW, STA_MASK);
  WiFi.begin(STA_SSID, STA_PASS);  // não bloqueia: a GoodWe-Demo funciona igual
  Serial.println();
  Serial.print("Rede criada: ");
  Serial.println(AP_SSID);
  Serial.print("Conecte seu notebook nela e acesse: http://");
  Serial.println(WiFi.softAPIP()); // normalmente 192.168.4.1
  Serial.print("Tentando entrar tambem na rede '");
  Serial.print(STA_SSID);
  Serial.println("'...");

  server.on("/", handleRoot);
  server.on("/led", handleLed);
  server.on("/button", handleButton);
  server.on("/state", HTTP_GET, handleStateGet);
  server.on("/state", HTTP_POST, handleStatePost);
  server.begin();
}

void loop() {
  server.handleClient();
  checkButton();
  if (mode != 0) applyColor(); // mantém a animação rodando mesmo sem requisições novas

  // avisa (uma vez) quando conseguir entrar na rede local
  static bool staAvisado = false;
  if (!staAvisado && WiFi.status() == WL_CONNECTED) {
    staAvisado = true;
    Serial.print("Conectado na rede local! Acesse tambem por: http://");
    Serial.println(WiFi.localIP());
  }
}
