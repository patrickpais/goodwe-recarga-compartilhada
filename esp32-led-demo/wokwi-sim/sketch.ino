/*
  GoodWe · Recarga Compartilhada — SIMULAÇÃO (Wokwi)
  ------------------------------------------------------------
  Versão de treino, pra rodar em wokwi.com ANTES da placa física chegar.
  Em vez de receber a cor por WiFi (como o firmware real, em
  ../esp32-led-demo.ino), essa versão reage a um botão local (e também
  aceita comandos digitados no Serial Monitor). A lógica da fita
  (cores + animações) é IDÊNTICA à do firmware real — só a forma de
  disparar o comando muda. Quando a placa e a fita chegarem, troque
  por esp32-led-demo.ino e a fiação continua a mesma.

  Duas formas de controlar a simulação:
    1) Aperte o botão — ele se comporta igual ao botão físico vai se
       comportar de verdade:
         Disponível --[aperta]--> Em uso (negociando, ~2s)
                     --[automático]--> Carregando
         Carregando --[aperta]--> Interrompido
         Interrompido --[aperta]--> Carregando (retoma de onde parou)
       (nos outros estados o botão não faz nada, igual no app real —
       lá quem finaliza de vez é um botão na tela, não o botão físico)

    2) Digite no Serial Monitor, pra forçar qualquer estado na mão:
       disponivel | em_uso | carregando | interrompido | indisponivel
*/

#include <Adafruit_NeoPixel.h>

#define LED_PIN     5
#define NUM_LEDS    8      // mesmo numero de LEDs colados atras do W vazado
#define BRIGHTNESS  200

#define BUTTON_PIN  4      // GPIO ligado a uma perna do botão; a outra perna vai no GND
                            // (usa o pull-up interno, não precisa de resistor)
const unsigned long DEBOUNCE_MS = 40;     // ignora "tremidas" do contato por 40ms após um clique
const unsigned long HANDSHAKE_MS = 2200;  // tempo simulado de "negociação" antes de começar a carregar de verdade

Adafruit_NeoPixel strip(NUM_LEDS, LED_PIN, NEO_GRB + NEO_KHZ800);

uint8_t targetR = 0, targetG = 0, targetB = 0;
int mode = 0; // 0 = parado | 1 = respirando | 2 = correndo

String currentStatus = "disponivel";
bool handshakePending = false;
unsigned long handshakeStartedAt = 0;

bool lastRawReading = HIGH;    // última leitura bruta do pino (pode "tremer")
bool stableState = HIGH;       // estado já confirmado como estável (HIGH = solto, LOW = pressionado)
unsigned long lastDebounceTime = 0;

void applyBreathe() {
  float phase = (millis() % 1400) / 1400.0;                    // ciclo de 1.4s
  float factor = 0.35 + 0.65 * (0.5 - 0.5 * cos(phase * 2 * PI)); // curva suave tipo "respirando"
  uint32_t c = strip.Color(targetR * factor, targetG * factor, targetB * factor);
  for (int i = 0; i < NUM_LEDS; i++) strip.setPixelColor(i, c);
  strip.show();
}

void applyChase() {
  const float speed = 12.0;  // LEDs por segundo — aumente pra ficar mais rapido
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

void applyColor() {
  if (mode == 1) applyBreathe();
  else if (mode == 2) applyChase();
  else applyStatic();
}

void setStatus(String s) {
  currentStatus = s;
  handshakePending = false; // qualquer troca manual cancela uma negociação em andamento
  if (s == "disponivel") {
    targetR = 53; targetG = 119; targetB = 241; mode = 0;
    Serial.println("-> Disponivel (azul, parado)");
  } else if (s == "em_uso") {
    targetR = 242; targetG = 176; targetB = 30; mode = 1;
    Serial.println("-> Em uso (ambar, respirando)");
  } else if (s == "carregando") {
    targetR = 25; targetG = 195; targetB = 125; mode = 2;
    Serial.println("-> Carregando (verde, correndo)");
  } else if (s == "interrompido") {
    targetR = 211; targetG = 30; targetB = 44; mode = 1;
    Serial.println("-> Interrompido (vermelho, respirando)");
  } else if (s == "indisponivel") {
    targetR = 0; targetG = 0; targetB = 0; mode = 0;
    Serial.println("-> Indisponivel (apagado)");
  } else {
    Serial.println("Comando nao reconhecido. Use: disponivel | em_uso | carregando | interrompido | indisponivel");
    return;
  }
  applyColor();
}

// simula o plugue conectando/desconectando/reconectando, dependendo da fase atual
void handleButtonPress() {
  if (currentStatus == "disponivel") {
    setStatus("em_uso");
    Serial.println("   (plugue conectado, negociando...)");
    handshakePending = true;
    handshakeStartedAt = millis();
  } else if (currentStatus == "carregando") {
    setStatus("interrompido");
    Serial.println("   (plugue solto durante a carga)");
  } else if (currentStatus == "interrompido") {
    setStatus("carregando");
    Serial.println("   (plugue reconectado, retomando)");
  }
}

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
      if (stableState == LOW) handleButtonPress(); // borda de descida confirmada
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  strip.begin();
  strip.setBrightness(BRIGHTNESS);
  strip.show();
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  Serial.println();
  Serial.println("Simulacao GoodWe pronta.");
  Serial.println("Aperte o botao pra simular o plugue, ou digite: disponivel | em_uso | carregando | interrompido | indisponivel");
  setStatus("disponivel");
}

void loop() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.length() > 0) setStatus(cmd);
  }
  checkButton();
  if (handshakePending && millis() - handshakeStartedAt > HANDSHAKE_MS) {
    handshakePending = false;
    setStatus("carregando");
    Serial.println("   (negociacao concluida, comecando a carregar de verdade)");
  }
  if (mode != 0) applyColor();
}
