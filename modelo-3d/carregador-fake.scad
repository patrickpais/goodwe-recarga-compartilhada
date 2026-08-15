// ============================================================
// GoodWe "Recarga Compartilhada" — carregador de mentira (capa)
// v2 — mais fiel ao design real do wallbox GoodWe HCA
// ============================================================
// Réplica em 50% de escala do wallbox GoodWe HCA. Dimensões reais:
// 208 x 450 x 150 mm (fonte: datasheet/manual oficial GoodWe HCA
// Series, en.goodwe.com/hca-g2).
//
// Detalhes desta versão, de cima pra baixo na frente da peça:
//   - logo "GOODWE" em relevo (pintar de vermelho com caneta/tinta)
//   - painel de "display" rebaixado (pintar de preto ou colar vinil
//     escuro/insulfilm pra parecer uma tela desligada)
//   - barra difusora de LED horizontal (a fita WS2812B fica atrás,
//     a luz vaza pela parede fina — igual à barra de luz do HCA real)
//   - botão pequeno redondo (o botão físico do circuito, disfarçado
//     de "botão de status" do carregador)
//   - tomada Tipo 2 falsa: círculo rebaixado com os 7 furos de pino,
//     a cara inconfundível de carregador de EV
//   - entrada de cabo USB na base + tampa traseira de encaixe
//
// Abriga: placa ESP32 DevKit, ~3 LEDs de fita WS2812B, 1 botão tátil.
//
// COMO USAR:
//   1. F5 = preview rápido | F6 = render de verdade (mais demorado)
//   2. Pra exportar: lá no fim do arquivo, comente a linha da
//      visualização dupla e descomente só "body();" -> F6 ->
//      File > Export > Export as STL. Depois repita só com "lid();".
//   3. Eu não consigo renderizar OpenSCAD daqui — confira bem o
//      preview (gire com o mouse, olhe a frente de perto) antes de
//      mandar imprimir.
//
// DICA DE IMPRESSÃO/PINTURA pra ficar igual ao real:
//   - filamento BRANCO (o HCA é branco)
//   - logo: pintar o relevo de vermelho (caneta acrílica resolve)
//   - display: pintar o rebaixo de preto brilhante ou colar vinil
//   - imprimir com a FRENTE virada pra cima (tampa traseira no chão
//     da mesa) minimiza suporte na área dos detalhes
// ============================================================

$fn = 64;

// ---------------- dimensões gerais ----------------
scale_factor = 0.5;                          // 50% do tamanho real
W = 208 * scale_factor;                      // largura      (~104mm)
H = 450 * scale_factor;                      // altura       (~225mm)
D = 150 * scale_factor;                      // profundidade (~75mm)

wall     = 3;      // espessura da parede (mm)
corner_r = 12;     // raio dos cantos arredondados

// ---------------- logo GOODWE (relevo) ----------------
logo_y      = H * 0.40;
logo_size   = 11;          // altura da letra (mm)
logo_emboss = 0.8;         // quanto o relevo salta da superfície

// ---------------- painel "display" (rebaixo) ----------------
screen_w     = W * 0.55;
screen_h     = H * 0.15;
screen_y     = H * 0.245;
screen_depth = 1.2;        // profundidade do rebaixo

// ---------------- barra difusora do LED ----------------
ledbar_w    = W * 0.62;
ledbar_h    = 11;
ledbar_y    = H * 0.115;
ledbar_thin = 1.2;         // espessura da parede só nessa faixa

// ---------------- botão físico ("botão de status") ----------------
button_d = 7;              // diâmetro do furo — ajuste pro seu botão
button_y = H * 0.02;

// ---------------- tomada Tipo 2 falsa ----------------
socket_y       = -H * 0.26;
socket_d       = W * 0.46;   // diâmetro do rebaixo externo
socket_depth   = 2.2;        // profundidade do rebaixo
socket_face_d  = W * 0.36;   // disco interno onde ficam os pinos
pin_d          = 4.2;        // diâmetro dos furos de pino
pin_ring_r     = W * 0.105;  // raio do círculo onde os 5 pinos grandes ficam

// ---------------- entrada do cabo USB (na base) ----------------
cable_w = 12;
cable_h = 7;

// ---------------- tampa traseira (encaixe por atrito) ----------------
lid_lip_h = 6;
lid_gap   = 0.3;

// ============================================================
module rounded_rect_2d(w, h, r) {
    hull() {
        for (x = [-1, 1], y = [-1, 1])
            translate([x*(w/2 - r), y*(h/2 - r)])
                circle(r = r);
    }
}

// ---- tomada Tipo 2: os furos de pino (5 em arco + 2 embaixo) ----
module type2_pins() {
    // 5 pinos grandes em arco na metade de cima (PE, N, L1, L2, L3)
    for (a = [-60, -30, 0, 30, 60])
        rotate([0, 0, a])
            translate([0, pin_ring_r, 0])
                circle(d = pin_d);
    // 2 pinos pequenos de sinal (CP, PP) mais abaixo
    for (x = [-1, 1])
        translate([x * pin_ring_r * 0.55, -pin_ring_r * 0.62])
            circle(d = pin_d * 0.7);
}

// corpo principal: caixa oca, frente detalhada, aberta atrás
module body() {
    union() {
        difference() {
            // casca externa sólida
            linear_extrude(height = D)
                rounded_rect_2d(W, H, corner_r);

            // cavidade interna (vazia da abertura traseira até a
            // parede da frente)
            translate([0, 0, -1])
                linear_extrude(height = D - wall + 1)
                    rounded_rect_2d(W - 2*wall, H - 2*wall, max(corner_r - wall, 1));

            // rebaixo do "display"
            translate([0, screen_y, D - screen_depth])
                linear_extrude(height = screen_depth + 1)
                    rounded_rect_2d(screen_w, screen_h, 5);

            // barra difusora do LED — afina a parede só nessa faixa
            translate([0, ledbar_y, D - wall])
                linear_extrude(height = wall - ledbar_thin)
                    rounded_rect_2d(ledbar_w, ledbar_h, 4);

            // furo do botão físico
            translate([0, button_y, D - wall - 1])
                cylinder(h = wall + 2, d = button_d);

            // rebaixo circular da tomada Tipo 2
            translate([0, socket_y, D - socket_depth])
                cylinder(h = socket_depth + 1, d = socket_d);

            // furos de pino (entram um pouco na parede, sem atravessar)
            translate([0, socket_y, D - socket_depth - 1.4])
                linear_extrude(height = 2)
                    type2_pins();

            // entrada do cabo USB, na borda inferior
            translate([0, -H/2 + wall/2, D/2])
                cube([cable_w, wall + 2, cable_h], center = true);
        }

        // ---- detalhes em relevo (adicionados por cima) ----

        // logo GOODWE em relevo
        translate([0, logo_y, D])
            linear_extrude(height = logo_emboss)
                text("GOODWE", size = logo_size, halign = "center",
                     valign = "center", font = "Liberation Sans:style=Bold",
                     spacing = 1.08);

        // anel elevado em volta da tomada (moldura, como no conector real)
        translate([0, socket_y, D - socket_depth])
            difference() {
                cylinder(h = socket_depth * 0.55, d = socket_face_d + 6);
                translate([0, 0, -1])
                    cylinder(h = socket_depth + 2, d = socket_face_d);
            }
    }
}

// tampa traseira: encaixa por dentro da abertura de trás
module lid() {
    lip_w = W - 2*wall - lid_gap*2;
    lip_h = H - 2*wall - lid_gap*2;

    union() {
        linear_extrude(height = lid_lip_h)
            rounded_rect_2d(lip_w, lip_h, max(corner_r - wall, 1));
        translate([0, 0, -wall])
            linear_extrude(height = wall)
                rounded_rect_2d(W, H, corner_r);
    }
}

// ---------------- visualização (os dois lado a lado) ----------------
body();
translate([W + 20, 0, 0]) lid();

// ---------------- pra exportar em .stl separado ----------------
// comente as duas linhas acima e deixe só uma destas por vez:
// body();
// lid();

// ============================================================
// NOTAS:
// - Se o serviço de impressão reclamar da barra de LED fina (1.2mm):
//   aumente "ledbar_thin" pra 2.0, ou zere e cole papel vegetal por
//   dentro como difusor.
// - Se o texto GOODWE não aparecer no preview: sua instalação pode
//   não ter a fonte "Liberation Sans" — troque o parâmetro font por
//   "Helvetica:style=Bold" (Mac) que funciona igual.
// - A tomada Tipo 2 é decorativa (funcional só no visual) — o
//   "plugue" da encenação do vídeo pode ser qualquer conector/cabo
//   grosso encostado nela + o clique no botão escondido.
// ============================================================
