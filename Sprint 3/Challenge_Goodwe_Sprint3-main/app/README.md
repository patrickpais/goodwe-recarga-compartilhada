# Aplicativo ChargeGrid — v2

> **Em desenvolvimento.** A versão que roda no hardware é a
> [v1, em `../demo-fisica/`](../demo-fisica/). O porquê das duas está no
> [README principal](../README.md#por-que-duas-versões-do-aplicativo).

Protótipo navegável do ChargeGrid Intelligence: 39 telas, três personas (motorista,
gestor com a solução instalada e gestor prospect), estado em memória, sem back-end.

Foi construído no **Claude Design**, que gera uma página única de ~5 MB. Aqui ela está
desmontada em fontes legíveis e remontada por um script de build.

## Rodar

```bash
python3 -m http.server 8000     # a partir desta pasta
# http://localhost:8000
```

Ou dê dois cliques em `dist/ChargeGrid-app.html` — arquivo único, sem servidor,
sem internet.

## Estrutura

```
app/
├── src/                      ← os fontes: é só aqui que se edita
│   ├── template.html            marcação das telas (sintaxe do runtime: {{ }}, <sc-if>, <sc-for>)
│   ├── app.js                   toda a lógica — class Component extends DCLogic
│   ├── props.json               parâmetros ajustáveis do protótipo
│   └── styles/
│       ├── fonts.css            @font-face da Nunito (5 subconjuntos)
│       └── app.css              base, animações e a classe do fundo da tela de entrada
├── assets/
│   ├── fonts/*.woff2            Nunito, servida localmente (nada de Google Fonts em runtime)
│   └── img/*.png                4 imagens do protótipo
├── vendor/                   ← bibliotecas de terceiros, não editar
│   ├── react.production.min.js       React 18.3.1 UMD
│   ├── react-dom.production.min.js   ReactDOM 18.3.1 UMD
│   └── dc-runtime.js                 runtime do Claude Design
├── build.py                  ← gera os dois arquivos abaixo
├── index.html                ← GERADO — versão multi-arquivo (dev e GitHub Pages)
└── dist/ChargeGrid-app.html  ← GERADO — versão de arquivo único, autocontida
```

## Build

```bash
python3 build.py
```

Regenera `index.html` e `dist/ChargeGrid-app.html` a partir de `src/`. Os dois são
versionados para que um `git clone` já abra o app sem precisar rodar nada.

### Por que existe um build

O runtime do Claude Design lê a lógica do componente pelo **`textContent`** da tag
`<script data-dc-script>`. Ou seja, `src/app.js` precisa estar *embutido* no HTML —
não dá para carregá-lo por `src=""`. O build costura template, estilos e lógica.

Duas particularidades que o build resolve e que vale conhecer antes de mexer em `src/`:

- **Imagem em `style=""` não pode virar `data:` URI.** O runtime quebra o atributo
  `style` em declarações pelo `;`, e um `data:` URI tem `;base64,` no meio — a regra
  seria cortada ao meio. Por isso o fundo da tela de entrada mora em
  `.bg-tela-entrada`, no `app.css`, e não no `style` do elemento.
- **Custom property do CSS não aguenta valor gigante.** O Chromium descarta valores de
  variável acima de ~1 MB, então um `--img-fundo: url("data:...")` de 2,6 MB
  simplesmente some. Regra de classe normal não tem esse limite — daí a escolha acima.

## Verificação

A separação foi conferida contra o arquivo original gerado pelo Claude Design:

- `src/app.js` é **byte a byte idêntico** à lógica do bundle original;
- as 9 imagens e fontes embutidas em `dist/` batem por SHA-256 com os arquivos de `assets/`;
- `index.html` e `dist/ChargeGrid-app.html` renderizam **pixel a pixel idênticos** ao
  original (Chromium headless, 1280×1040, tela de login) e navegam sem erro de console.

Os avisos `Expected length, "{{ c.x }}"` que aparecem no console vêm do navegador
tentando interpretar os placeholders do template antes de o runtime compilá-lo. São
esperados e ocorrem igualmente no arquivo original.

## Limitações

- Nenhuma chamada de rede além dos 4 `<iframe>` de mapa do Google. Não há Supabase,
  não há API, não há persistência: recarregar a página zera o estado.
- **Não conversa com o ESP32.** Religar ao hardware passa pelo Supabase, conforme a
  arquitetura alvo. Hoje quem fala com o equipamento é `../demo-fisica/app-v1/`.
- Tarifação dinâmica, DLM e load shifting rodam no cliente com dados sintéticos.
- A tela de login é navegação, não autenticação.
