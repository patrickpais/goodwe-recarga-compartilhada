// ============================================================
// GoodWe "Recarga Compartilhada" — carregador de mentira (capa)
// ============================================================
// Réplica em 50% de escala do wallbox GoodWe HCA. Dimensões reais:
// 208 x 450 x 150 mm (fonte: datasheet/manual oficial GoodWe HCA
// Series, en.goodwe.com/hca-g2).
//
// Abriga: placa ESP32 DevKit, ~3 LEDs de uma fita WS2812B (atrás da
// janela difusora), 1 botão tátil, e a entrada do cabo USB de energia.
//
// COMO USAR:
//   1. Instale o OpenSCAD (gratuito, https://openscad.org) — Windows/
//      Mac/Linux.
//   2. Abra este arquivo. Aperte F5 pra pré-visualizar rápido (não é
//      o desenho final, só um preview), F6 pra renderizar de verdade
//      (demora mais, mas é o resultado real).
//   3. IMPORTANTE: eu não consigo abrir/renderizar OpenSCAD daqui pra
//      conferir visualmente — dá uma boa olhada no preview antes de
//      mandar pra impressão, principalmente a área da janela do LED.
//   4. Pra exportar: comente as duas linhas de visualização lá no
//      fim do arquivo, descomente "body();" sozinho, F6 pra renderizar,
//      File > Export > Export as STL. Repete só com "lid();" pra
//      exportar a tampa separada. Manda os dois .stl pro serviço de
//      impressão.
//
// Ajuste os parâmetros abaixo se sua placa ESP32 ou a fita de LED
// forem de um tamanho diferente do que eu assumi.
// ============================================================

$fn = 64;

// ---------------- dimensões gerais ----------------
scale_factor = 0.5;                          // 50% do tamanho real
W = 208 * scale_factor;                      // largura      (~104mm)
H = 450 * scale_factor;                      // altura       (~225mm)
D = 150 * scale_factor;                      // profundidade (~75mm)

wall     = 3;      // espessura da parede (mm) — 3mm é seguro pra PLA/PETG
corner_r = 10;     // raio dos cantos arredondados

// ---------------- janela difusora do LED ----------------
// Fica com a parede bem fina nessa área — a luz do LED "vaza" através
// dela quando impressa em filamento claro (branco/natural funciona
// melhor que preto). Se o serviço de impressão recusar por ser fino
// demais, veja a alternativa na nota no fim do arquivo.
window_w    = W * 0.5;
window_h    = 45;
window_y    = H * 0.28;    // deslocamento vertical (positivo = mais pro topo)
window_thin = 1.2;         // espessura da parede só nessa área

// ---------------- botão físico ----------------
button_d = 7;              // diâmetro do furo — ajuste pro seu botão
button_y = -H * 0.05;

// ---------------- entrada do cabo USB (na base) ----------------
cable_w = 12;
cable_h = 7;

// ---------------- tampa traseira (encaixe por atrito) ----------------
lid_lip_h = 6;      // altura da aba que entra dentro do corpo
lid_gap   = 0.3;    // folga do encaixe (aumente se ficar apertado demais)

// ============================================================
module rounded_rect_2d(w, h, r) {
    hull() {
        for (x = [-1, 1], y = [-1, 1])
            translate([x*(w/2 - r), y*(h/2 - r)])
                circle(r = r);
    }
}

// corpo principal: caixa oca, fechada na frente, aberta atrás
module body() {
    difference() {
        // casca externa solida
        linear_extrude(height = D)
            rounded_rect_2d(W, H, corner_r);

        // cavidade interna: vazia desde a abertura de trás (z=0) até
        // pouco antes da parede da frente — deixa a parede da frente
        // (espessura "wall") e as laterais intactas
        translate([0, 0, -1])
            linear_extrude(height = D - wall + 1)
                rounded_rect_2d(W - 2*wall, H - 2*wall, max(corner_r - wall, 1));

        // janela difusora — afina só essa área da parede da frente
        translate([0, window_y, D - window_thin])
            linear_extrude(height = window_thin + 1)
                rounded_rect_2d(window_w, window_h, 6);

        // furo do botão físico, atravessa a parede da frente
        translate([0, button_y, D - wall - 1])
            cylinder(h = wall + 2, d = button_d);

        // entrada do cabo USB, na borda inferior
        translate([0, -H/2 + wall/2, D/2])
            cube([cable_w, wall + 2, cable_h], center = true);
    }
}

// tampa traseira: encaixa por dentro da abertura de trás
module lid() {
    lip_w = W - 2*wall - lid_gap*2;
    lip_h = H - 2*wall - lid_gap*2;

    union() {
        // aba que entra dentro do corpo (encaixe por atrito)
        linear_extrude(height = lid_lip_h)
            rounded_rect_2d(lip_w, lip_h, max(corner_r - wall, 1));

        // "boca" que fecha por fora, do tamanho do corpo, tipo tampa de caixa
        translate([0, 0, -wall])
            linear_extrude(height = wall)
                rounded_rect_2d(W, H, corner_r);
    }
}

// ---------------- visualização (os dois lado a lado) ----------------
body();
translate([W + 20, 0, 0]) lid();

// ---------------- pra exportar em .stl separado ----------------
// comente as duas linhas de visualização acima e deixe só uma
// destas descomentada por vez, depois File > Export > Export as STL:
// body();
// lid();

// ============================================================
// NOTA — se o serviço de impressão recusar a janela do LED (parede
// de 1.2mm às vezes é rejeitada como "frágil demais"): troque
// "window_thin" pra um valor maior tipo 2.5, ou zere ela totalmente
// (vira um vão vazado) e cole por dentro um pedacinho de plástico
// translúcido (tipo uma bolinha de pingue-pongue cortada, ou papel
// vegetal) como difusor — funciona igual de bem e é mais simples de
// imprimir com segurança.
// ============================================================
