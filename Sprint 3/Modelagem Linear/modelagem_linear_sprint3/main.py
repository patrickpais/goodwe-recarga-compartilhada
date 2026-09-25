# -*- coding: utf-8 -*-
"""===============================================================================

FIAP - 2o SEMESTRE - CHALLENGE SPRINT 3 (parceria GoodWe)
Estatística Aplicada com Python: Distribuição Normal e Regressão Linear

INTEGRANTES DO GRUPO:
    Patrick Fernandes Martins Pais  RM: 572899
    Bruna Yukimy Hada Matrícula     RM: 571836
    Denize Ferrante                 RM: 571562
    Gabriel Del Pizzo Pintor        RM: 570436
    Gabriel Dias Menezes            RM: 572395
    Ian Rodrigues Martins           RM: 570540
===============================================================================
"""

import pandas as pd

# 1. Módulo de Configuração
import config as c

# 2. Módulo de Tratamento de Dados
from analysis.data_processing import (
    exportar_resultados_csv,
    get_df_eletric_vehicles,
    load_dataset,
    prepare_data,
)

# 3. Módulo de Regressão Linear Simples
from analysis.regression import executar_regressao

# 4. Módulo de Cálculos Estatísticos
from analysis.stats import calcular_estatisticas_normal

# 5. Módulos de Visualização (Gráficos e Impressão de Relatórios)
from visuals import plots, reports


def main():
    try:
        # -------------------------------------------------------------------
        # ETAPA 1: Carga dos Dados e Tratamento do Recorte (Elétricos)
        # -------------------------------------------------------------------
        df = load_dataset(c.ARQUIVO_BASE)
        eletricos = get_df_eletric_vehicles(df, c.ARQUIVO_FILTRADO)
        dados = prepare_data(eletricos)
        X = dados["X_estrada"]  # Variável Aleatória X (Consumo Estrada)

        # -------------------------------------------------------------------
        # ETAPA 2: Processamento Estatístico e Regressão Linear
        # -------------------------------------------------------------------
        res_stats = calcular_estatisticas_normal(X)
        res_reg = executar_regressao(dados)

        # -------------------------------------------------------------------
        # ETAPA 3: Exibição dos Relatórios no Terminal
        # -------------------------------------------------------------------
        reports.initial_reports(df, eletricos, X, res_stats)
        reports.report_probabilidades(res_stats)
        reports.report_regressao(res_reg)
        reports.report_sintese(res_stats, res_reg)

        # -------------------------------------------------------------------
        # ETAPA 4: Geração e Exportação dos Gráficos PNG
        # -------------------------------------------------------------------
        plots.gerar_grafico_mediana(X, res_stats)
        plots.gerar_grafico_intervalo(res_stats)
        plots.gerar_graficos_regressao(res_reg)

        # -------------------------------------------------------------------
        # ETAPA 5: Exportação do Consolidador CSV
        # -------------------------------------------------------------------
        exportar_resultados_csv(
            res_stats, res_reg, 
            len(df), len(eletricos), 
            dados,c.OUTPUT_DIR,
            c.RESULTADOS_CSV
        )

        print("\nArquivos gerados:")
        for arquivo in [
            c.ARQUIVO_FILTRADO,
            c.FIG_PROBABILIDADE_MEDIANA,
            c.FIG_INTERVALO,
            c.FIG_REGRESSAO,
            c.FIG_RESIDUOS,
            c.RESULTADOS_CSV,
        ]:
            print(f"   - {arquivo}")

        print("\nAnálise concluída com sucesso.")

    except Exception as e:
        print("Erro interno durante a execução:", e)


if __name__ == "__main__":
    main()