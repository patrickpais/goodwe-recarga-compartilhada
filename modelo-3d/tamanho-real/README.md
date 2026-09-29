# Réplica em tamanho real — HCA G2

Peças extraídas do CAD oficial da GoodWe (`00-7kW-3D.stp`) em **escala 1:1**,
preparadas para a versão grande do protótipo (banca final do NEXT, 22/10/2026).

| Arquivo | O quê | Dimensões |
|---|---|---|
| `capa-frontal-real.stl` | Capa frontal (KETI-TOP) com o **W vazado** para os LEDs | 208 × 58 × 282 mm |
| `traseira-real-oca.stl` | Concha traseira (KETI-1216) **escavada**: paredes ~5–6 mm, interior liso | 209 × 95 × 450 mm |
| `traseira-so-carcaca.stl` | A mesma concha sem escavar (referência/comparação) | 209 × 95 × 450 mm |
| `../capa-extraida/KETI-ZHONG.stl` | Corpo do meio — já é moldura fina, usar como está | 208 × 101 × 450 mm |

## O que a escavação fez

- Removeu **34% do material** (536 → 353 cm³): colunas de parafuso, nervuras e
  divisórias internas viraram uma cavidade lisa para a eletrônica.
- Preservou: as **aletas externas**, a região de **entrada de cabos** na base,
  a borda frontal de encaixe (4 mm) e **4 suportes de canto** — úteis para
  parafusar o ESP32/power bank.
- Escavação feita no CAD (FreeCAD, sólido × caixas por faixa de altura),
  não em malha — sem artefatos.

## Impressão

- A traseira e o corpo têm **45 cm de altura** — na maioria das impressoras vão
  precisar ser fatiados em 2–3 seções (pendente: volume da impressora da equipe).
- Sugestão de slicer: 2–3 perímetros, 5–8% de infill (as peças já são ocas),
  capa com a face externa para cima e suportes só no recorte do W.
- A traseira está no referencial local da peça (não no da montagem) — para
  imprimir não faz diferença; para montar visualmente com as outras, alinhe
  pelos contornos.

## Reproduzir

Scripts em `../`: `extract_shell.py` (extração do STEP), `cut_w.scad` (o W a
50%; a versão 1:1 usa as mesmas coordenadas ×2) e o log completo da escavação
em `traseira-cad-log2.txt`.
