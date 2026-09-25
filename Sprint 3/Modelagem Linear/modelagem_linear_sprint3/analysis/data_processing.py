# -*- coding: utf-8 -*-
"""Módulo para tratamento, filtragem e preparação dos dados do PBEV."""

import pandas as pd


def load_dataset(path):
    """Carrega o arquivo CSV com a base bruta do PBEV (2022 a 2026)."""
    return pd.read_csv(path)


def get_df_eletric_vehicles(df, path_saida):
    """Filtra apenas veículos 100% elétricos (Tipo_propulsao == 'Elétrico').

    Salva o recorte em um arquivo CSV próprio conforme solicitado no enunciado.
    """
    eletricos = df[df["Tipo_propulsao"] == "Elétrico"].copy()
    eletricos.to_csv(path_saida, index=False, encoding="utf-8-sig")
    return eletricos


def prepare_data(df_eletricos):
    """Seleciona as colunas de consumo e autonomia, elimina registros com valores nulos

    e renomeia o consumo na cidade/estrada para variáveis tratáveis (X_cidade e X_estrada).
    """
    colunas = [
        "Ano",
        "Categoria",
        "Marca",
        "Modelo",
        "Versao",
        "Eletrico_cidade_km_le",
        "Eletrico_estrada_km_le",
        "Consumo_energetico_MJ_km",
        "Autonomia_eletrica_km",
    ]
    colunas_nulos = ["Eletrico_cidade_km_le", "Eletrico_estrada_km_le"]
    renomear = {
        "Eletrico_cidade_km_le": "X_cidade",
        "Eletrico_estrada_km_le": "X_estrada",
    }

    return (
        df_eletricos[colunas]
        .dropna(subset=colunas_nulos)
        .rename(columns=renomear)
        .reset_index(drop=True)
    )


def exportar_resultados_csv(res_stats, res_reg, n_base, n_eletricos, df_dados,path_out,path_csv):
    """Exporta os resultados numéricos calculados para um arquivo CSV consolidador."""
    dados_exportacao = {
        "n": len(df_dados),
        "n_base": n_base,
        "n_eletricos": n_eletricos,
        "media": res_stats["media"],
        "desvio": res_stats["desvio"],
        "mediana": res_stats["mediana"],
        "z_mediana": res_stats["z_mediana"],
        "p_acima_mediana": res_stats["p_acima_mediana"],
        "p_acima_mediana_emp": res_stats["p_empirica_mediana"],
        "limite_inf": res_stats["lim_inf"],
        "limite_sup": res_stats["lim_sup"],
        "p_intervalo": res_stats["p_intervalo"],
        "p_intervalo_emp": res_stats["p_empirica_intervalo"],
        "b0": res_reg["b0"],
        "b1": res_reg["b1"],
        "erro_b1": res_reg["reg"].stderr,
        "r": res_reg["r_pearson"],
        "r2": res_reg["reg"].rvalue**2,
        "r2_teste": res_reg["metrics_ml"]["r2_teste"],
        "rmse": res_reg["metrics_ml"]["rmse"],
        "mae": res_reg["metrics_ml"]["mae"],
        "assimetria": res_stats["assimetria"],
        "curtose": res_stats["curtose"],
        "ks_D": res_stats["ks"].statistic,
        "ks_p": res_stats["ks"].pvalue,
        "minimo": df_dados["X_estrada"].min(),
        "maximo": df_dados["X_estrada"].max(),
        "q1": df_dados["X_estrada"].quantile(0.25),
        "q3": df_dados["X_estrada"].quantile(0.75),
        "media_cidade": df_dados["X_cidade"].mean(),
        "acima_igualdade": res_reg["acima_igualdade"],
        "pct_abaixo": res_reg["pct_abaixo"],
        "autonomia_media": df_dados["Autonomia_eletrica_km"].mean(),
    }

    # Garante a criação da pasta de saída caso não exista
    path_out.mkdir(parents=True, exist_ok=True)
    pd.DataFrame([dados_exportacao]).to_csv(path_csv, index=False)