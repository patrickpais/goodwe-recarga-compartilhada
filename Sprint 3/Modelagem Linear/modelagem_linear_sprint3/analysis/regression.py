# -*- coding: utf-8 -*-
"""Módulo de modelagem preditiva e Regressão Linear Simples."""

import numpy as np
from scipy import stats
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split


def executar_regressao(df_dados):
    """Executa a Análise 03: Regressão Linear Simples para prever o consumo na estrada (Y)

    a partir do consumo na cidade (X).
    Aplica validação por Mínimos Quadrados (Scipy) e validação cruzada com treino/teste (scikit-learn).
    """
    x = df_dados["X_cidade"].to_numpy()
    y = df_dados["X_estrada"].to_numpy()

    # Correlacao e Mínimos Quadrados Clássicos (Scipy)
    r_pearson, p_valor_r = stats.pearsonr(x, y)
    reg = stats.linregress(x, y)
    b0, b1 = reg.intercept, reg.slope
    residuos = y - (b0 + b1 * x)

    # Validação Preditiva com Aprendizado de Máquina (scikit-learn: 70% Treino / 30% Teste)
    X_ml = x.reshape(-1, 1)
    X_tr, X_te, y_tr, y_te = train_test_split(
        X_ml, y, test_size=0.30, random_state=42
    )

    modelo = LinearRegression().fit(X_tr, y_tr)
    y_pred = modelo.predict(X_te)

    metrics_ml = {
        "r2_teste": r2_score(y_te, y_pred),
        "rmse": float(np.sqrt(mean_squared_error(y_te, y_pred))),
        "mae": mean_absolute_error(y_te, y_pred),
    }

    # Comparação de consumo Cidade vs Estrada
    acima_igualdade = int((y >= x).sum())
    pct_abaixo = (1 - acima_igualdade / len(y)) * 100

    # Previsões pontuais pedidas no estudo
    previsoes = {v: b0 + b1 * v for v in [25, 30, 35, 40, 45]}

    return {
        "x": x,
        "y": y,
        "b0": b0,
        "b1": b1,
        "r_pearson": r_pearson,
        "p_valor_r": p_valor_r,
        "reg": reg,
        "residuos": residuos,
        "metrics_ml": metrics_ml,
        "previsoes": previsoes,
        "acima_igualdade": acima_igualdade,
        "pct_abaixo": pct_abaixo,
    }