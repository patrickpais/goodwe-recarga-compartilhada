# -*- coding: utf-8 -*-
"""Configurações globais, caminhos de arquivos e constantes visuais do projeto."""

from pathlib import Path

# Diretório raiz do projeto
BASE_DIR = Path(__file__).resolve().parent

# Diretórios de dados e saídas (plots e relatórios)
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "output"

# Arquivos CSV de entrada e saída intermediária
ARQUIVO_BASE = DATA_DIR / "base_pbev_2022_2026.csv"
ARQUIVO_FILTRADO = DATA_DIR / "base_pbev_eletricos_2022_2026.csv"
RESULTADOS_CSV = OUTPUT_DIR / "resultados_sprint3.csv"

# Caminhos dos gráficos exportados
FIG_PROBABILIDADE_MEDIANA = OUTPUT_DIR / "fig1_probabilidade_acima_mediana.png"
FIG_INTERVALO = OUTPUT_DIR / "fig2_intervalo_dois_desvios.png"
FIG_REGRESSAO = OUTPUT_DIR / "fig3_regressao_linear.png"
FIG_RESIDUOS = OUTPUT_DIR / "fig4_diagnostico_residuos.png"

# Paleta de cores oficial para os gráficos
COR_PRINCIPAL = "#1f4e79"  # Azul escuro
COR_DESTAQUE = "#c0392b"  # Vermelho/Vinho
COR_AUX = "#f0a202"  # Amarelo/Dourado