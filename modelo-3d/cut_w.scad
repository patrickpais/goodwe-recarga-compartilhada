// Corta o W da GoodWe VAZADO na capa frontal — a luz dos LEDs atravessa.
// Coordenadas herdadas da montagem oficial (escala 50%):
//   frente da capa = superficie externa em Y=32.6, apontando pra -Y
//   logo centrado em X=0, Z=121.3
W_w = 34;      // largura total do W
W_h = 13;      // altura
t   = 3.4;     // espessura das barras
cx  = 0;
cz  = 121.3;

cut_from = 45;   // Y inicial do corte (dentro da peca)
cut_depth = 25;  // atravessa ate Y=20 (fora da peca) — fura a parede com folga

// zigue-zague do W: fracoes (x, z)
zig = [[0, 1], [0.25, 0], [0.5, 0.62], [0.75, 0], [1, 1]];

module w_bars() {
    for (i = [0 : 3]) {
        x1 = cx - W_w/2 + zig[i][0]   * W_w;
        z1 = cz - W_h/2 + zig[i][1]   * W_h;
        x2 = cx - W_w/2 + zig[i+1][0] * W_w;
        z2 = cz - W_h/2 + zig[i+1][1] * W_h;
        translate([0, cut_from, 0])
            rotate([90, 0, 0])   // extrusao +Z vira -Y; XY do polygon vira XZ
                linear_extrude(height = cut_depth)
                    polygon([[x1 - t/2, z1], [x1 + t/2, z1],
                             [x2 + t/2, z2], [x2 - t/2, z2]]);
    }
}

difference() {
    import("top-limpo.stl");
    w_bars();
}
