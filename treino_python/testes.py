# Corretor automático — imita o sistema da competição.
#   python3 testes.py            -> corrige respostas.py
#   python3 testes.py gabarito   -> corrige gabarito.py (referência)
import importlib, sys

modulo = sys.argv[1] if len(sys.argv) > 1 else 'respostas'
r = importlib.import_module(modulo)

CASOS = {
    'B1 custo_recarga': [
        (lambda: r.custo_recarga(20, 0.85, 2.0), 34.0),
        (lambda: r.custo_recarga(12.5, 2.19, 1.0), 27.38),
        (lambda: r.custo_recarga(0, 2.19, 1.3), 0.0),
    ],
    'B2 teto_dlm': [
        (lambda: r.teto_dlm(55, 36.3, 12), 12.1),
        (lambda: r.teto_dlm(55, 50, 12), 0),
        (lambda: r.teto_dlm(100, 20, 10), 70.0),
    ],
    'B2 repartir': [
        (lambda: r.repartir(12.1, 2), [6.05, 6.05]),
        (lambda: r.repartir(30, 2), [7.0, 7.0]),
        (lambda: r.repartir(12.1, 3), [4.03, 4.03, 4.03]),
        (lambda: r.repartir(12.1, 0), []),
    ],
    'B3 captura_parcial': [
        (lambda: r.captura_parcial(43.80, 10, 2.19), {'capturado': 21.9, 'liberado': 21.9, 'galeria': 19.71, 'plataforma': 2.19}),
        (lambda: r.captura_parcial(43.80, 25, 2.19), {'capturado': 43.8, 'liberado': 0.0, 'galeria': 39.42, 'plataforma': 4.38}),
        (lambda: r.captura_parcial(10.00, 0, 2.19), {'capturado': 0.0, 'liberado': 10.0, 'galeria': 0.0, 'plataforma': 0.0}),
    ],
    'B4 economia_load_shifting': [
        (lambda: r.economia_load_shifting(187.1, 1.50, 0.85, 100), 65.0),
        (lambda: r.economia_load_shifting(50, 1.50, 0.85, 100), 32.5),
        (lambda: r.economia_load_shifting(0, 1.50, 0.85, 100), 0.0),
    ],
    'B4 classificar_demanda': [
        (lambda: r.classificar_demanda(11, 12.1), 'alta'),
        (lambda: r.classificar_demanda(8, 12.1), 'media'),
        (lambda: r.classificar_demanda(3, 12.1), 'baixa'),
    ],
}

total = ok = 0
for nome, casos in CASOS.items():
    acertos = 0
    for fn, esperado in casos:
        total += 1
        try:
            obtido = fn()
            if obtido == esperado:
                acertos += 1; ok += 1
            else:
                print(f'  ✗ {nome}: esperado {esperado!r}, obtido {obtido!r}')
        except Exception as e:
            print(f'  ✗ {nome}: erro {type(e).__name__}: {e}')
    print(f'{"✅" if acertos == len(casos) else "❌"} {nome}: {acertos}/{len(casos)}')
print(f'\nNOTA: {ok}/{total} casos corretos' + ('  — aprovado!' if ok == total else ''))
