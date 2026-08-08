/*
  GoodWe · Recarga Compartilhada — teste de integração real (WiFi + app) com LED simples
  ------------------------------------------------------------
  Igual ao ../esp32-led-demo.ino de verdade: cria a rede Wi-Fi
  "GoodWe-Demo" e responde exatamente aos mesmos endereços HTTP que o
  app usa (/led e /button). A diferença é só a "saída": em vez de
  mandar a cor pra uma fita WS2812B (que ainda não chegou), esse
  firmware reconhece QUAL status o app mandou (comparando a cor
  recebida com as cores conhecidas) e mostra um padrão de piscada
  diferente no LED simples/embutido.

    Disponível/Indisponível -> aceso fixo / apagado
    Em uso                  -> respirando (fade suave)
    Carregando              -> piscando rápido
    Interrompido            -> flash duplo (alerta)

  O APP NÃO MUDA NADA — ele sempre manda cor de verdade; é esse
  firmware temporário que "traduz" a cor pra um padrão, porque ainda
  não temos a fita de verdade pra mostrar a cor.

  Quando a fita WS2812B chegar: troque esse arquivo pelo
  ../esp32-led-demo.ino (fiação do botão continua igual; só troca a
  fiação do LED pela fita).

  BIBLIOTECAS: nenhuma extra (não usa Adafruit_NeoPixel aqui)
*/

#include <WiFi.h>
#include <WebServer.h>

#define ONBOARD_LED_PIN 2   // troque se o LED da sua placa/montagem for outro GPIO
#define BUTTON_PIN      4   // mesma fiação do botão de sempre

const unsigned long DEBOUNCE_MS = 40;

const char* AP_SSID = "GoodWe-Demo";
const char* AP_PASS = "goodwe123";

WebServer server(80);

// modo de exibição do LED: 0=apagado 1=aceso fixo 2=respirando 3=piscando rápido 4=flash duplo
int mode = 0;

bool lastRawReading = HIGH;
bool stableState = HIGH;
unsigned long lastDebounceTime = 0;
bool buttonEventPending = false;

void applyOff() { analogWrite(ONBOARD_LED_PIN, 0); }
void applyOn()  { analogWrite(ONBOARD_LED_PIN, 180); }

void applyBreathe() {
  float phase = (millis() % 1400) / 1400.0;
  float factor = 0.15 + 0.85 * (0.5 - 0.5 * cos(phase * 2 * PI));
  analogWrite(ONBOARD_LED_PIN, (int)(255 * factor));
}

void applyFastBlink() {
  bool on = (millis() / 150) % 2 == 0;
  analogWrite(ONBOARD_LED_PIN, on ? 255 : 0);
}

void applyDoubleFlash() {
  unsigned long t = millis() % 1000;
  bool on = (t < 100) || (t > 200 && t < 300);
  analogWrite(ONBOARD_LED_PIN, on ? 255 : 0);
}

void applyPattern() {
  if (mode == 1) applyOn();
  else if (mode == 2) applyBreathe();
  else if (mode == 3) applyFastBlink();
  else if (mode == 4) applyDoubleFlash();
  else applyOff();
}

// traduz a cor que o app mandou pra um dos 5 padrões — mesmas cores de
// LED_RGB no goodwe-recarga-compartilhada.html
int patternForColor(int r, int g, int b) {
  if (r == 53  && g == 119 && b == 241) return 1; // disponivel -> aceso fixo
  if (r == 242 && g == 176 && b == 30)  return 2; // em uso -> respirando
  if (r == 25  && g == 195 && b == 125) return 3; // carregando -> piscando rapido
  if (r == 211 && g == 30  && b == 44)  return 4; // interrompido -> flash duplo
  return 0; // oculto/indisponivel/desconhecido -> apagado
}

void handleLed() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  int r = server.hasArg("r") ? server.arg("r").toInt() : 0;
  int g = server.hasArg("g") ? server.arg("g").toInt() : 0;
  int b = server.hasArg("b") ? server.arg("b").toInt() : 0;
  mode = patternForColor(r, g, b);
  applyPattern();
  server.send(200, "text/plain", "ok");
}

void handleRoot() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "text/plain", "GoodWe demo LED online (modo teste - LED simples)");
}

void checkButton() {
  bool reading = digitalRead(BUTTON_PIN);
  if (reading != lastRawReading) {
    lastDebounceTime = millis();
    lastRawReading = reading;
  }
  if (millis() - lastDebounceTime > DEBOUNCE_MS) {
    if (reading != stableState) {
      stableState = reading;
      if (stableState == LOW) {
        buttonEventPending = true;
        Serial.println("Botao pressionado");
      }
    }
  }
}

void handleButton() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  String json = String("{\"event\":") + (buttonEventPending ? "1" : "0") + "}";
  buttonEventPending = false;
  server.send(200, "application/json", json);
}

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  WiFi.softAP(AP_SSID, AP_PASS);
  Serial.println();
  Serial.print("Rede criada: ");
  Serial.println(AP_SSID);
  Serial.print("Conecte seu notebook nela e acesse: http://");
  Serial.println(WiFi.softAPIP()); // normalmente 192.168.4.1

  server.on("/", handleRoot);
  server.on("/led", handleLed);
  server.on("/button", handleButton);
  server.begin();

  applyPattern();
}

void loop() {
  server.handleClient();
  checkButton();
  applyPattern();
}
