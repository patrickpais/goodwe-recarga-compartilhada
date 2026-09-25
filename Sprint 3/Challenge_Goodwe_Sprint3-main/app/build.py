#!/usr/bin/env python3
"""
Monta o app ChargeGrid a partir dos fontes em src/.

    python3 build.py

Gera dois arquivos, ambos versionados no repositorio:

  index.html                -> versao multi-arquivo. Carrega src/styles/*.css,
                               vendor/*.js e assets/* por caminho relativo.
                               E a versao para desenvolver e para o GitHub Pages.

  dist/ChargeGrid-app.html  -> versao de arquivo unico. CSS, JS, fontes e
                               imagens embutidos (fontes e imagens como data:
                               URI). Abre com dois cliques, sem servidor, e e
                               o arquivo para enviar por e-mail ou pendrive.

Por que existe um build: o runtime do Claude Design (vendor/dc-runtime.js) le a
logica do componente pelo textContent da tag <script data-dc-script>, ou seja,
ela precisa estar embutida no HTML -- nao da para carregar src/app.js por src="".
O build resolve isso costurando os pedacos. Edite sempre src/, nunca os gerados.
"""

import base64
import json
import mimetypes
import os
import re

BASE = os.path.dirname(os.path.abspath(__file__))


def ler(*partes):
    with open(os.path.join(BASE, *partes), encoding="utf-8") as f:
        return f.read()


def ler_bytes(caminho_rel):
    with open(os.path.join(BASE, caminho_rel), "rb") as f:
        return f.read()


def data_uri(caminho_rel):
    mime = mimetypes.guess_type(caminho_rel)[0] or "application/octet-stream"
    if caminho_rel.endswith(".woff2"):
        mime = "font/woff2"
    b64 = base64.b64encode(ler_bytes(caminho_rel)).decode("ascii")
    return "data:%s;base64,%s" % (mime, b64)


template = ler("src", "template.html").strip()
app_js = ler("src", "app.js").rstrip()
fonts_css = ler("src", "styles", "fonts.css").strip()
app_css = ler("src", "styles", "app.css").strip()
props = json.loads(ler("src", "props.json"))

props_attr = (
    json.dumps(props, ensure_ascii=False, separators=(",", ":"))
    .replace("&", "&amp;")
    .replace('"', "&quot;")
    .replace("<", "&lt;")
)

VENDOR = [
    "vendor/react.production.min.js",
    "vendor/react-dom.production.min.js",
    "vendor/dc-runtime.js",
]

CABECALHO = (
    "<!DOCTYPE html>\n"
    "<html lang=\"pt-BR\">\n"
    "<head>\n"
    "<meta charset=\"utf-8\">\n"
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
    "<title>ChargeGrid - Prototipo navegavel</title>\n"
    "<!-- GERADO POR build.py - nao edite este arquivo, edite src/ -->\n"
)


def montar(vendor_tags, style_tags, ancora_assets=lambda t: t):
    return (
        CABECALHO
        + vendor_tags
        + "</head>\n<body>\n<x-dc>\n<helmet data-dc-atomics=\"\">\n"
        + style_tags
        + "\n</helmet>\n"
        + ancora_assets(template)
        + "\n</x-dc>\n"
        + '<script type="text/x-dc" data-dc-script="" data-props="'
        + props_attr
        + '">\n'
        + app_js
        + "\n</script>\n</body>\n</html>\n"
    )


# ---------------------------------------------------------------- multi-arquivo
multi = montar(
    vendor_tags="".join('<script src="%s"></script>\n' % v for v in VENDOR),
    style_tags='<link rel="stylesheet" href="src/styles/fonts.css">\n'
    '<link rel="stylesheet" href="src/styles/app.css">',
)
with open(os.path.join(BASE, "index.html"), "w", encoding="utf-8") as f:
    f.write(multi)

# -------------------------------------------------------------- arquivo unico
def inline_urls_css(css):
    """Troca url("../../assets/...") por data: URI, para a versao de arquivo unico."""
    return re.sub(
        r'url\("\.\./\.\./assets/([^"]+)"\)',
        lambda m: 'url("%s")' % data_uri("assets/" + m.group(1)),
        css,
    )


fonts_inline = inline_urls_css(fonts_css)
app_css_inline = inline_urls_css(app_css)

IMAGENS = sorted(
    os.path.join("assets/img", n) for n in os.listdir(os.path.join(BASE, "assets", "img"))
)

def embutir_imagens(texto):
    for caminho in IMAGENS:
        texto = texto.replace(caminho, data_uri(caminho))
    return texto


unico = montar(
    vendor_tags="".join(
        "<script>\n%s\n</script>\n" % ler_bytes(v).decode("utf-8") for v in VENDOR
    ),
    style_tags="<style>\n%s\n</style>\n<style>\n%s\n</style>"
    % (fonts_inline, app_css_inline),
    ancora_assets=embutir_imagens,
)
os.makedirs(os.path.join(BASE, "dist"), exist_ok=True)
with open(os.path.join(BASE, "dist", "ChargeGrid-app.html"), "w", encoding="utf-8") as f:
    f.write(unico)

print("index.html               %8.1f KB" % (len(multi.encode()) / 1024))
print("dist/ChargeGrid-app.html %8.1f KB" % (len(unico.encode()) / 1024))
