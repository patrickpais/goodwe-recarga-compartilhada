# -*- coding: utf-8 -*-
"""Módulo responsável por formatar e imprimir os relatórios estatísticos no terminal."""

import pandas as pd
from analysis.stats import classificar_evento


def titulo(texto):
    """Exibe um divisor visual formatado no terminal."""
    print("\n" + "=" * 79)
    print(texto)
    print("=" * 79)


def initial_reports(df, df_filtered, samples, res_stats):
    """Imprime o relatório da Seção 0: dados brutos, filtro aplicado, descritiva e teste de normalidade."""
    titulo("0) BASE DE DADOS, FILTRO E VARIAVEL ALEATORIA")
    print(f"Registros na base completa ..... {len(df)}")
    print(f"Edicoes (anos) ................. {sorted(df['Ano'].unique())}")
    print("\nRegistros por tipo de propulsao (antes do filtro):")
    print(df["Tipo_propulsao"].value_counts().to_string())

    pct = len(df_filtered) / len(df) * 100
    print(
        f"\nApos o filtro (somente eletricos) ... {len(df_filtered)} registros ({pct:.1f}% da base)"
    )
    print("\nDistribuicao dos eletricos por edicao:")
    print(df_filtered.groupby("Ano").size().to_string())
    print("\nMarcas com mais modelos eletricos:")
    print(df_filtered["Marca"].value_counts().head(8).to_string())

    print(f"\nAmostra analisada .............. n = {len(samples)} veiculos eletricos")
    print("\nEstatisticas descritivas de X (consumo na estrada, km/l e):")
    print(samples.describe().round(4).to_string())

    print(f"\nAssimetria ..................... {res_stats['assimetria']:+.4f}")
    print(f"Curtose (excesso) .............. {res_stats['curtose']:+.4f}")
    print(f"Kolmogorov-Smirnov ............. D = {res_stats['ks'].statistic:.4f} | p = {res_stats['ks'].pvalue:.4f}")
    print("""
Como o p-valor e maior que 0,05, NAO se rejeita a hipotese de que os
dados provem de uma distribuicao Normal: a suposicao do enunciado e
estatisticamente sustentada por esta amostra.
    """)


def report_probabilidades(res_stats):
    """Imprime os relatórios numéricos das Análises 01 e 02."""
    titulo("01) PROBABILIDADE ACIMA DA MEDIANA")
    print(f"a) Mediana (Md) ................ {res_stats['mediana']:.4f} km/l e")
    print(f"   Media (mu) .................. {res_stats['media']:.4f} km/l e")
    print(f"   Desvio padrao (s) ........... {res_stats['desvio']:.4f} km/l e")

    print(f"\nb) Z = (Md - mu)/s ............. {res_stats['z_mediana']:+.4f}")
    print(f"   P(X > Md) = 1 - F(Z) ........ {res_stats['p_acima_mediana']:.4f} ({res_stats['p_acima_mediana']*100:.2f}%)")
    print(f"   Frequencia observada ........ {res_stats['p_empirica_mediana']:.4f} ({res_stats['p_empirica_mediana']*100:.2f}%)")

    print(f"\nd) Classificacao do evento ..... {classificar_evento(res_stats['p_acima_mediana'])}")

    print()

    titulo("02) PROBABILIDADE DENTRO DO INTERVALO (media +/- 2 desvios)")
    print(f"a) Media (mu) .................. {res_stats['media']:.4f} km/l e")
    print(f"   Desvio padrao (s) ........... {res_stats['desvio']:.4f} km/l e")
    print(f"   Intervalo [mu-2s ; mu+2s] ... [{res_stats['lim_inf']:.4f} ; {res_stats['lim_sup']:.4f}]")

    print(f"\nb) P(mu-2s < X < mu+2s) ....... {res_stats['p_intervalo']:.4f} ({res_stats['p_intervalo']*100:.2f}%)")
    print(f"   Frequencia observada ........ {res_stats['p_empirica_intervalo']:.4f} ({res_stats['p_empirica_intervalo']*100:.2f}%)")

    print(f"\nd) Classificacao do evento ..... {classificar_evento(res_stats['p_intervalo'])}")


def report_regressao(res_reg):
    """Imprime os resultados detalhados do modelo de Regressão Linear Simples (Análise 03)."""
    titulo("03) REGRESSAO LINEAR SIMPLES")
    print(f"Coeficiente de correlacao de Pearson (r) ... {res_reg['r_pearson']:+.4f} (p-valor = {res_reg['p_valor_r']:.3e})")

    print("\nModelo ajustado (minimos quadrados):")
    print(f"   Y = {res_reg['b0']:.4f} + ({res_reg['b1']:.4f}) * X")
    print(f"   b0 (intercepto) ............. {res_reg['b0']:+.4f} km/l e")
    print(f"   b1 (inclinacao) ............. {res_reg['b1']:+.4f} (km/l e) por (km/l e)")
    print(f"   Erro padrao de b1 ........... {res_reg['reg'].stderr:.4f}")
    print(f"   R² (coef. de determinacao) .. {res_reg['reg'].rvalue**2:.4f} ({res_reg['reg'].rvalue**2*100:.2f}% da variacao explicada)")
    print(f"   p-valor do modelo ........... {res_reg['reg'].pvalue:.3e}")

    print("\nValidacao preditiva (scikit-learn | treino 70% / teste 30%):")
    print(f"   R² na base de teste ......... {res_reg['metrics_ml']['r2_teste']:.4f}")
    print(f"   RMSE ........................ {res_reg['metrics_ml']['rmse']:.2f} km/l e")
    print(f"   MAE ......................... {res_reg['metrics_ml']['mae']:.2f} km/l e")

    print( f"\nVeiculos com rendimento MAIOR na cidade que na estrada ... {len(res_reg['y']) - res_reg['acima_igualdade']} ({res_reg['pct_abaixo']:.1f}%)")
    print(f"Veiculos com rendimento igual ou maior na estrada ........ {res_reg['acima_igualdade']} ({100 - res_reg['pct_abaixo']:.1f}%)")
    print(f"Media na cidade .......... {res_reg['x'].mean():.2f} km/l e")
    print(f"Media na estrada ......... {res_reg['y'].mean():.2f} km/l e")

    print("\nPrevisoes do modelo:")
    for c_val, e_val in res_reg["previsoes"].items():
        print(f"   Cidade = {c_val:>2} km/l e  ->  Estrada prevista = {e_val:6.2f} km/l e")


def report_sintese(res_stats, res_reg):
    """Tabela final resumindo os principais indicadores do trabalho."""
    titulo("04) SINTESE DOS RESULTADOS")
    resumo = pd.DataFrame([
        {
            "Analise": "01 - P(X > mediana)",
            "Resultado": f"{res_stats['p_acima_mediana']:.4f}",
            "Percentual": f"{res_stats['p_acima_mediana']*100:.2f}%",
            "Classificacao": classificar_evento(res_stats["p_acima_mediana"]),
        },
        {
            "Analise": "02 - P(mu-2s < X < mu+2s)",
            "Resultado": f"{res_stats['p_intervalo']:.4f}",
            "Percentual": f"{res_stats['p_intervalo']*100:.2f}%",
            "Classificacao": classificar_evento(res_stats["p_intervalo"]),
        },
        {
            "Analise": "03 - R² da regressao",
            "Resultado": f"{res_reg['reg'].rvalue**2:.4f}",
            "Percentual": f"{res_reg['reg'].rvalue**2*100:.2f}%",
            "Classificacao": "Ajuste forte",
        },
    ])
    print(resumo.to_string(index=False))