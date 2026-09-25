# -*- coding: utf-8 -*-
"""Módulo de cálculos estatísticos: média, desvio, probabilidades e testes de normalidade."""

import pandas as pd
from scipy import stats


def classificar_evento(p):
    """Classifica a probabilidade de um evento segundo a escala solicitada no enunciado:

    - p < 0,05           -> RARO
    - 0,05 <= p < 0,25   -> POUCO PROVAVEL
    - 0,25 <= p < 0,90   -> PROVAVEL
    - p >= 0,90          -> QUASE CERTO
    """
    if p < 0.05:
        return "RARO"
    if p < 0.25:
        return "POUCO PROVAVEL"
    if p < 0.90:
        return "PROVAVEL"
    return "QUASE CERTO"


def calcular_estatisticas_normal(X):
    """Executa as Análises 01 e 02:

    01) Probabilidade de o consumo superar a mediana P(X > Md).
    02) Probabilidade no intervalo [mu - 2s, mu + 2s].
    Também calcula assimetria, curtose e o teste de Kolmogorov-Smirnov para validar normalidade.
    """
    media = X.mean()
    desvio = X.std(ddof=1)  # Desvio padrão amostral (n-1)
    mediana = X.median()

    # --- Análise 01: P(X > Md) ---
    z_mediana = (mediana - media) / desvio
    p_acima_mediana = 1 - stats.norm.cdf(z_mediana)  # Usando distrib. Normal
    p_empirica_mediana = (X > mediana).mean()  # Frequência empírica na amostra

    # --- Análise 02: P(mu - 2s < X < mu + 2s) ---
    lim_inf = media - 2 * desvio
    lim_sup = media + 2 * desvio
    p_intervalo = stats.norm.cdf(lim_sup, media, desvio) - stats.norm.cdf(
        lim_inf, media, desvio
    )
    p_empirica_intervalo = X.between(lim_inf, lim_sup).mean()

    # --- Testes e Métricas Complementares de Normalidade ---
    assimetria = stats.skew(X)
    curtose = stats.kurtosis(X)  # Curtose em excesso
    ks = stats.kstest(X, stats.norm(loc=media, scale=desvio).cdf)

    return {
        "media": media,
        "desvio": desvio,
        "mediana": mediana,
        "z_mediana": z_mediana,
        "p_acima_mediana": p_acima_mediana,
        "p_empirica_mediana": p_empirica_mediana,
        "lim_inf": lim_inf,
        "lim_sup": lim_sup,
        "p_intervalo": p_intervalo,
        "p_empirica_intervalo": p_empirica_intervalo,
        "assimetria": assimetria,
        "curtose": curtose,
        "ks": ks,
    }