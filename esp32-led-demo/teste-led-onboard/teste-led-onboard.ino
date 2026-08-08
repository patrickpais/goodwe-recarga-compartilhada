/*
  GoodWe · Recarga Compartilhada — teste com LED comum (não endereçável)
  ------------------------------------------------------------
  Enquanto a fita WS2812B não chega, esse sketch usa o LED que já vem
  embutido na própria placa ESP32 — não precisa ligar fio nenhum além
  do botão, que você já tem montado do teste anterior. Em vez de cor,
  cada status vira um jeito diferente de piscar/acender:

    Disponível   -> aceso fixo
    Em uso       -> respirando (fade suave)
    Carregando   -> piscando rápido e regular
    Interrompido -> flash duplo (pisca-pisca-pausa), tipo alerta
    Indisponível -> apagado

  O botão continua na GPIO 4 (mesma fiação de antes, não mexe nela).

  O LED embutido geralmente fica na GPIO 2 — se o seu não responder,
  procure na placa um LED pequeno (geralmente azul, perto da antena
  Wi-Fi) e veja se tem algum número de GPIO escrito do lado dele;
  troque o ONBOARD_LED_PIN abaixo pra esse número.

  Quando a fita WS2812B chegar, a gente troca esse arquivo pelo
  ../esp32-led-demo.ino — a lógica do botão é a mesma, só a "saída"
  muda de padrão de piscada pra cor de verdade.
*/

#define ONBOARD_LED_PIN 2   // troque aqui se o LED da sua placa for em outro GPIO
#define BUTTON_PIN      4   // mesma fiação do botão que você já tinha

const unsigned long DEBOUNCE_MS = 40;
const unsigned long HANDSHAKE_MS = 2200;

String currentStatus = "disponivel";
bool handshakePending = false;
unsigned long handshakeStartedAt = 0;

bool lastRawReading = HIGH;    // última leitura bruta do pino (pode "tremer")
bool stableState = HIGH;       // estado já confirmado como estável
unsigned long lastDebounceTime = 0;

// modo de exibição do LED:
//   0 = apagado | 1 = aceso fixo | 2 = respirando | 3 = piscando rápido | 4 = flash duplo
int mode = 0;

void applyOff() { analogWrite(ONBOARD_LED_PIN, 0); }
void applyOn()  { analogWrite(ONBOARD_LED_PIN, 180); }

void applyBreathe() {
  float phase = (millis() % 1400) / 1400.0;                       // ciclo de 1.4s
  float factor = 0.15 + 0.85 * (0.5 - 0.5 * cos(phase * 2 * PI));  // curva suave tipo "respirando"
  analogWrite(ONBOARD_LED_PIN, (int)(255 * factor));
}

void applyFastBlink() {
  bool on = (millis() / 150) % 2 == 0; // liga/desliga a cada 150ms
  analogWrite(ONBOARD_LED_PIN, on ? 255 : 0);
}

void applyDoubleFlash() {
  unsigned long t = millis() % 1000; // ciclo de 1s: pisca, pisca, pausa
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

void setStatus(String s) {
  currentStatus = s;
  handshakePending = false; // qualquer troca manual cancela uma negociação em andamento
  if (s == "disponivel") {
    mode = 1;
    Serial.println("-> Disponivel (aceso fixo)");
  } else if (s == "em_uso") {
    mode = 2;
    Serial.println("-> Em uso (respirando)");
  } else if (s == "carregando") {
    mode = 3;
    Serial.println("-> Carregando (piscando rapido)");
  } else if (s == "interrompido") {
    mode = 4;
    Serial.println("-> Interrompido (flash duplo)");
  } else if (s == "indisponivel") {
    mode = 0;
    Serial.println("-> Indisponivel (apagado)");
  } else {
    Serial.println("Comando nao reconhecido. Use: disponivel | em_uso | carregando | interrompido | indisponivel");
    return;
  }
  applyPattern();
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
    if (reading != stableState) {
      stableState = reading;
      if (stableState == LOW) handleButtonPress(); // borda de descida confirmada
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  Serial.println();
  Serial.println("Teste com LED onboard pronto.");
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
  applyPattern();
}
