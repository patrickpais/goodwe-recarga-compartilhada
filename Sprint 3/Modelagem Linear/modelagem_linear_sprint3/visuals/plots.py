# -*- coding: utf-8 -*-
"""Módulo de geração e exportação de gráficos estatísticos e de regressão."""

import matplotlib

matplotlib.use("Agg")  # Backend sem interface gráfica
import config as c
import matplotlib.pyplot as plt
import numpy as np
from scipy import stats

# Configurações globais de estilo para os gráficos
plt.rcParams.update({
    "figure.dpi": 130,
    "savefig.dpi": 130,
    "font.size": 10,
    "axes.grid": True,
    "grid.alpha": 0.25,
    "axes.axisbelow": True,
})


def gerar_grafico_mediana(X, res_stats):
    """Gera o Gráfico 01: Curva de Densidade Normal com o sombreamento da área acima da mediana."""
    m, s, md = res_stats["media"], res_stats["desvio"], res_stats["mediana"]
    grade = np.linspace(m - 4 * s, m + 4 * s, 600)
    densidade = stats.norm.pdf(grade, m, s)

    fig, ax = plt.subplots(figsize=(8, 4.4))
    ax.hist(
        X,
        bins=35,
        density=True,
        color="#cfd8dc",
        edgecolor="white",
        label="Distribuição observada (histograma)",
    )
    ax.plot(
        grade,
        densidade,
        color=c.COR_PRINCIPAL,
        lw=2,
        label=f"Normal ajustada  N({m:.2f}; {s:.2f}²)",
    )
    ax.fill_between(
        grade,
        densidade,
        where=(grade > md),
        color=c.COR_DESTAQUE,
        alpha=0.35,
        label=f"P(X > Md) = {res_stats['p_acima_mediana']:.4f}",
    )
    ax.axvline(
        md,
        color=c.COR_DESTAQUE,
        ls="--",
        lw=1.6,
        label=f"Mediana = {md:.2f} km/l e",
    )

    ax.set_title(
        "Análise 01 — Probabilidade de o consumo superar a mediana\nConsumo na estrada (km/l equivalente) — veículos 100% elétricos",
        fontsize=11,
        weight="bold",
    )
    ax.set_xlabel("Consumo na estrada (km/l equivalente)")
    ax.set_ylabel("Densidade de probabilidade")
    ax.legend(loc="upper right", fontsize=8.5, framealpha=0.95)

    fig.tight_layout()
    fig.savefig(c.FIG_PROBABILIDADE_MEDIANA)
    plt.close(fig)


def gerar_grafico_intervalo(res_stats):
    """Gera o Gráfico 02: Intervalo de probabilidade centrado na média (mu ± 2s)."""
    m, s = res_stats["media"], res_stats["desvio"]
    lim_inf, lim_sup = res_stats["lim_inf"], res_stats["lim_sup"]
    grade = np.linspace(m - 4 * s, m + 4 * s, 600)
    densidade = stats.norm.pdf(grade, m, s)

    fig, ax = plt.subplots(figsize=(8, 4.4))
    ax.plot(
        grade, densidade, color=c.COR_PRINCIPAL, lw=2, label="Normal ajustada"
    )
    ax.fill_between(
        grade,
        densidade,
        where=(grade >= lim_inf) & (grade <= lim_sup),
        color=c.COR_PRINCIPAL,
        alpha=0.30,
        label=f"P = {res_stats['p_intervalo']:.4f} ({res_stats['p_intervalo']*100:.2f}%)",
    )

    for lim, rotulo in [(lim_inf, "μ - 2s"), (lim_sup, "μ + 2s")]:
        ax.axvline(lim, color=c.COR_DESTAQUE, ls="--", lw=1.5)
        ax.annotate(
            f"{rotulo}\n{lim:.2f}",
            xy=(lim, densidade.max() * 0.62),
            ha="center",
            fontsize=8.5,
            color=c.COR_DESTAQUE,
            weight="bold",
        )

    ax.axvline(m, color=c.COR_AUX, lw=1.6, label=f"Média = {m:.2f} km/l e")
    ax.set_title(
        "Análise 02 — Probabilidade dentro do intervalo μ ± 2s\nConsumo na estrada (km/l equivalente) — veículos 100% elétricos",
        fontsize=11,
        weight="bold",
    )
    ax.set_xlabel("Consumo na estrada (km/l equivalente)")
    ax.set_ylabel("Densidade de probabilidade")
    ax.legend(loc="upper right", fontsize=8.5, framealpha=0.95)

    fig.tight_layout()
    fig.savefig(c.FIG_INTERVALO)
    plt.close(fig)


def gerar_graficos_regressao(res_reg):
    """Gera os Gráficos 03 (Reta de Regressão) e 04 (Diagnóstico de Resíduos / Q-Q Plot)."""
    x, y = res_reg["x"], res_reg["y"]
    b0, b1 = res_reg["b0"], res_reg["b1"]

    # Gráfico 3: Scatter plot e reta de regressão ajustada
    x_reta = np.linspace(x.min(), x.max(), 200)
    y_reta = b0 + b1 * x_reta
    err_std = res_reg["residuos"].std(ddof=2)

    fig, ax = plt.subplots(figsize=(8.4, 5))
    ax.scatter(
        x,
        y,
        s=18,
        alpha=0.35,
        color=c.COR_PRINCIPAL,
        edgecolor="none",
        label=f"Veículos observados (n = {len(x)})",
    )
    ax.plot(
        x_reta,
        y_reta,
        color=c.COR_DESTAQUE,
        lw=2.4,
        label=f"Reta ajustada:  Ŷ = {b0:.2f} + {b1:.2f}·X",
    )
    ax.fill_between(
        x_reta,
        y_reta - 2 * err_std,
        y_reta + 2 * err_std,
        color=c.COR_DESTAQUE,
        alpha=0.12,
        label="Faixa de ± 2 erros-padrão dos resíduos",
    )
    ax.plot(
        x_reta,
        x_reta,
        color="#7a8b99",
        lw=1.2,
        ls=":",
        label="Reta de igualdade (cidade = estrada)",
    )

    ax.set_title(
        "Análise 03 — Regressão linear: consumo na estrada × na cidade\nVeículos 100% elétricos — PBEV/INMETRO 2022–2026",
        fontsize=11,
        weight="bold",
    )
    ax.set_xlabel("X — Consumo na cidade (km/l equivalente)")
    ax.set_ylabel("Y — Consumo na estrada (km/l equivalente)")
    ax.legend(loc="upper left", fontsize=8.5, framealpha=0.95)

    ax.text(
        0.975,
        0.06,
        f"r = {res_reg['r_pearson']:.4f}\nR² = {res_reg['reg'].rvalue**2:.4f}\np < 0,001",
        transform=ax.transAxes,
        fontsize=9,
        ha="right",
        bbox=dict(
            boxstyle="round,pad=0.45",
            fc="white",
            ec=c.COR_PRINCIPAL,
            alpha=0.9,
        ),
    )

    fig.tight_layout()
    fig.savefig(c.FIG_REGRESSAO)
    plt.close(fig)

    # Gráfico 4: Diagnóstico de resíduos (Homocedasticidade e Normalidade)
    fig, axes = plt.subplots(1, 2, figsize=(9.6, 3.9))

    # Resíduos x Previstos
    axes[0].scatter(
        b0 + b1 * x,
        res_reg["residuos"],
        s=14,
        alpha=0.32,
        color=c.COR_PRINCIPAL,
        edgecolor="none",
    )
    axes[0].axhline(0, color=c.COR_DESTAQUE, lw=1.6)
    axes[0].set_title(
        "Resíduos × valores previstos", fontsize=10, weight="bold"
    )
    axes[0].set_xlabel("Ŷ — consumo na estrada previsto (km/l e)")
    axes[0].set_ylabel("Resíduo (km/l e)")

    # Q-Q Plot
    stats.probplot(res_reg["residuos"], dist="norm", plot=axes[1])
    axes[1].get_lines()[0].set(
        markerfacecolor=c.COR_PRINCIPAL, markersize=3, markeredgecolor="none"
    )
    axes[1].get_lines()[1].set(color=c.COR_DESTAQUE, lw=1.6)
    axes[1].set_title("Q-Q plot dos resíduos", fontsize=10, weight="bold")
    axes[1].set_xlabel("Quantis teóricos da Normal")
    axes[1].set_ylabel("Quantis dos resíduos")

    fig.tight_layout()
    fig.savefig(c.FIG_RESIDUOS)
    plt.close(fig)