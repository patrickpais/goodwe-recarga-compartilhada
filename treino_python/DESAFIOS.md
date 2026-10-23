# Treino — Competição do NEXT (Python · demanda energética · tarifação)

**Formato real:** 4 baterias · 8 min cada · múltipla escolha (resposta única, sem voltar) + 1 desafio de código em Python · correção automática · pontua acerto E velocidade · sem consulta, sem IA.

**Como treinar:** cronometre 8 min por bateria. Responda as 3 questões no papel, depois escreva a função pedida em `respostas.py` e rode `python3 testes.py` — ele corrige como o sistema da competição. Gabarito das questões no fim do arquivo (não espie antes!).

---

## Bateria 1 — Energia e tarifa

**Q1.** O que mede o kWh?
- (a) Potência instantânea
- (b) Energia: potência × tempo
- (c) Corrente elétrica
- (d) Tensão da rede

**Q2.** Em Python, qual o resultado de `20 // 6`?
- (a) 3.33
- (b) 3
- (c) 2
- (d) 4

**Q3.** Tarifa base do gestor R$ 0,85/kWh e fator dinâmico 2,0. Qual o preço final ao motorista?
- (a) R$ 0,85
- (b) R$ 1,70
- (c) R$ 2,85
- (d) R$ 0,43

**Código B1.** Escreva `custo_recarga(kwh, tarifa_base, fator)` que devolve o valor em reais da recarga, arredondado a 2 casas: `kwh × tarifa_base × fator`.
Ex.: `custo_recarga(20, 0.85, 2.0)` → `34.0`

---

## Bateria 2 — DLM (gerenciamento de demanda)

**Q4.** Demanda contratada 55 kW, pico do prédio 36,3 kW, margem de segurança 12% da contratada. Qual o teto disponível para as vagas?
- (a) 18,7 kW
- (b) 6,6 kW
- (c) 12,1 kW
- (d) 48,4 kW

**Q5.** Em Python, `max(0, -3)` retorna:
- (a) -3
- (b) 0
- (c) 3
- (d) erro

**Q6.** O que produz `[x * 2 for x in range(3)]`?
- (a) `[2, 4, 6]`
- (b) `[0, 2, 4]`
- (c) `[0, 1, 2]`
- (d) `[1, 2, 3]`

**Código B2.** Escreva duas funções:
- `teto_dlm(contratada_kw, pico_kw, margem_pct)` → teto em kW = `contratada − pico − contratada × margem/100`, nunca negativo, 2 casas.
- `repartir(teto_kw, n_vagas, max_vaga=7.0)` → lista com a potência de cada vaga: o teto dividido igualmente, mas nenhuma vaga passa de `max_vaga`; 2 casas. Com `n_vagas == 0`, devolve lista vazia.
Ex.: `teto_dlm(55, 36.3, 12)` → `12.1` · `repartir(12.1, 2)` → `[6.05, 6.05]` · `repartir(30, 2)` → `[7.0, 7.0]`

---

## Bateria 3 — Cobrança

**Q7.** Pré-autorização de R$ 43,80. O motorista recebeu 10 kWh a R$ 2,19/kWh e encerrou. Quanto é capturado e quanto é liberado?
- (a) Capturado 43,80 · liberado 0
- (b) Capturado 21,90 · liberado 21,90
- (c) Capturado 10,00 · liberado 33,80
- (d) Capturado 0 · liberado 43,80

**Q8.** Split 90/10 de R$ 50,00: galeria e plataforma recebem, respectivamente:
- (a) R$ 40 e R$ 10
- (b) R$ 45 e R$ 5
- (c) R$ 25 e R$ 25
- (d) R$ 50 e R$ 0

**Q9.** `d = {'a': 1}` — o que retorna `d.get('b', 0)`?
- (a) `None`
- (b) erro `KeyError`
- (c) `0`
- (d) `1`

**Código B3.** Escreva `captura_parcial(preautorizado, kwh_entregues, tarifa)` que devolve um dicionário com as chaves `capturado`, `liberado`, `galeria`, `plataforma` (todos em reais, 2 casas):
- `capturado` = menor valor entre `kwh_entregues × tarifa` e `preautorizado`
- `liberado` = `preautorizado − capturado`
- `galeria` = 90% do capturado; `plataforma` = `capturado − galeria` (para fechar os centavos)
Ex.: `captura_parcial(43.80, 10, 2.19)` → `{'capturado': 21.9, 'liberado': 21.9, 'galeria': 19.71, 'plataforma': 2.19}`

---

## Bateria 4 — Load shifting e classificação

**Q10.** O que é "horário de ponta"?
- (a) Horário em que a tarifa é mais barata
- (b) Período de maior demanda da rede, com tarifa mais cara (tipicamente início da noite)
- (c) Horário de geração solar máxima
- (d) Período sem cobrança de demanda

**Q11.** 100 kWh deslocados do horário de ponta (R$ 1,50/kWh) para fora de ponta (R$ 0,85/kWh). Economia:
- (a) R$ 150
- (b) R$ 85
- (c) R$ 65
- (d) R$ 235

**Q12.** `def f(x, y=2): return x ** y` — o que retorna `f(3)`?
- (a) 6
- (b) 9
- (c) 5
- (d) erro: falta argumento

**Código B4.** Escreva duas funções:
- `economia_load_shifting(consumo_ponta_kwh, tarifa_ponta, tarifa_fora, capacidade_bateria_kwh)` → só o que cabe na bateria pode ser deslocado: `deslocado = min(consumo, capacidade)`; economia = `deslocado × (tarifa_ponta − tarifa_fora)`, 2 casas.
- `classificar_demanda(kw, teto_kw)` → `'alta'` se `kw ≥ 90%` do teto, `'media'` se `≥ 60%`, senão `'baixa'`.
Ex.: `economia_load_shifting(187.1, 1.50, 0.85, 100)` → `65.0` · `classificar_demanda(11, 12.1)` → `'alta'`

---

## Gabarito das questões

Q1 b · Q2 b · Q3 b · Q4 c · Q5 b · Q6 b · Q7 b · Q8 b · Q9 c · Q10 b · Q11 c · Q12 b
