# Soluções de referência — só olhe depois de tentar!

def custo_recarga(kwh, tarifa_base, fator):
    return round(kwh * tarifa_base * fator, 2)

def teto_dlm(contratada_kw, pico_kw, margem_pct):
    return round(max(0, contratada_kw - pico_kw - contratada_kw * margem_pct / 100), 2)

def repartir(teto_kw, n_vagas, max_vaga=7.0):
    if n_vagas <= 0:
        return []
    return [round(min(teto_kw / n_vagas, max_vaga), 2) for _ in range(n_vagas)]

def captura_parcial(preautorizado, kwh_entregues, tarifa):
    capturado = round(min(kwh_entregues * tarifa, preautorizado), 2)
    galeria = round(capturado * 0.9, 2)
    return {
        'capturado': capturado,
        'liberado': round(preautorizado - capturado, 2),
        'galeria': galeria,
        'plataforma': round(capturado - galeria, 2),
    }

def economia_load_shifting(consumo_ponta_kwh, tarifa_ponta, tarifa_fora, capacidade_bateria_kwh):
    deslocado = min(consumo_ponta_kwh, capacidade_bateria_kwh)
    return round(deslocado * (tarifa_ponta - tarifa_fora), 2)

def classificar_demanda(kw, teto_kw):
    if kw >= 0.9 * teto_kw:
        return 'alta'
    if kw >= 0.6 * teto_kw:
        return 'media'
    return 'baixa'
