const BRL = (n) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const KW = 6.8;

// ---- ponte com a demonstração física (ESP32 + fita WS2812B + botão) ----
// Mesmo contrato HTTP da v1 (demo-fisica): GET /led?r&g&b&mode e GET /button —
// então o firmware que já está gravado no ESP32 serve sem alteração.
// Cores seguem o contrato do design system (cor de status = cor do LED):
// azul disponível · verde carregando (girando) · vermelho falha.
// Sem o ESP32 ao alcance, toda chamada falha em silêncio e o app segue normal.
// O carregador pode estar em dois lugares: na rede que ele mesmo cria
// (GoodWe-Demo) ou dentro da rede local da apresentação (modo duplo do
// firmware, com IP fixo). O app testa os dois e usa o que responder.
const HW_URLS = ['http://192.168.4.1', 'http://192.168.15.222', 'http://192.168.0.222'];
const HW_LED = {
  disponivel:  { r: 0, g: 0, b: 255, mode: 0 },   // azul parado
  conectado:   { r: 255, g: 160, b: 0, mode: 1 }, // âmbar respirando (plugue no carro, aguardando liberar)
  carregando:  { r: 0, g: 255, b: 0, mode: 2 },   // verde girando pelo W
  interrompido:{ r: 255, g: 0, b: 0, mode: 1 },   // vermelho respirando (plugue solto no meio da carga)
  falha:       { r: 255, g: 0, b: 0, mode: 1 },   // vermelho respirando
  desligado:   { r: 0, g: 0, b: 0, mode: 0 },     // apagado (vaga desativada pelo gestor)
};

// estado de fábrica das vagas — o reset geral da demo (aperto longo no botão)
// devolve a lista a este ponto, incluindo a Vaga 03 em falha para demonstrar
const CHARGERS_INICIAIS = [
  { id: 'c1', site: 'pn', nome: 'Vaga 01', evse: 'PN-EVSE-01', serie: 'GWH7-2841-BR', conector: 'Tipo 2 · 7 kW', status: 'carregando', kw: 6.8, min: 34, preco: 2.19, hoje: 12.4, total: 4812 },
  { id: 'c2', site: 'pn', nome: 'Vaga 02', evse: 'PN-EVSE-02', serie: 'GWH7-2847-BR', conector: 'Tipo 2 · 7 kW', status: 'carregando', kw: 6.5, min: 52, preco: 2.19, hoje: 6.6, total: 3964 },
  { id: 'c3', site: 'pn', nome: 'Vaga 03', evse: 'PN-EVSE-03', serie: 'GWH7-2853-BR', conector: 'Tipo 2 · 7 kW', status: 'falha', erro: 'Erro 2091 · sem resposta Modbus há 12 min', preco: 2.19, hoje: 0, total: 2107 },
  { id: 'c4', site: 'pn', nome: 'Vaga 04', evse: 'PN-EVSE-04', serie: 'GWH7-2860-BR', conector: 'Tipo 2 · 7 kW', status: 'livre', preco: 2.19, hoje: 3.1, total: 1268 },
];

const QR_CELLS = (() => {
  const N = 25, cells = [];
  let seed = 20260912;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const inFinder = (c, r) => (c < 8 && r < 8) || (c > N - 9 && r < 8) || (c < 8 && r > N - 9);
  const inAlign = (c, r) => c >= 16 && c <= 20 && r >= 16 && r <= 20;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (inFinder(c, r) || inAlign(c, r)) continue;
      if (r === 6) { if (c % 2 === 0) cells.push({ x: c * 10, y: r * 10 }); continue; }
      if (c === 6) { if (r % 2 === 0) cells.push({ x: c * 10, y: r * 10 }); continue; }
      if (rnd() > 0.5) cells.push({ x: c * 10, y: r * 10 });
    }
  }
  return cells;
})();

const SPOTS = [
  { id: 's1', nome: 'Galeria Pátio Norte', status: 'livre', livres: 2, vagas: 3, preco: 2.19, dist: '850 m', eta: '4 min', chegada: '14:36', lat: -23.561414, lng: -46.655881, endereco: 'Av. Paulista, 1578 · Bela Vista, São Paulo/SP', x: '22%', y: '30%', esg: 'Energia com 61% de origem solar neste horário — sua sessão evita ~4,2 kg de CO₂.' },
  { id: 's2', nome: 'Mini Shopping Aurora', status: 'ocupado', livres: 0, vagas: 2, preco: 2.45, dist: '1,4 km', eta: '7 min', chegada: '14:39', lat: -23.573912, lng: -46.642204, endereco: 'R. Treze de Maio, 620 · Bela Vista, São Paulo/SP', x: '54%', y: '54%', esg: 'Galeria sem geração própria: a tarifa acompanha o horário de ponta.' },
  { id: 's3', nome: 'Galeria Sete de Abril', status: 'falha', livres: 0, vagas: 2, preco: 2.05, dist: '2,1 km', eta: '9 min', chegada: '14:41', lat: -23.549772, lng: -46.634249, endereco: 'R. Sete de Abril, 154 · Centro, São Paulo/SP', x: '74%', y: '20%', esg: 'Ponto em manutenção.' },
];

class Component extends DCLogic {
  state = {
    role: null, screen: 'role', tab: 'inicio', toast: null, logged: false, pendingRole: null, hasSolution: null,
    viabFromCadastro: false, vagaSel: null, dlmAtivo: true, alertaFiltro: 'Todos', chatIA: [],
    precoAnf: 1.89, pub: true, qty: 1, cep: '', addr: null,
    cepStatus: 'Digite o CEP para buscar o endereço automaticamente.', addrNumero: '',
    modelo: null, serie: 'GWH7-2841-BR',
    vagasAnf: 1, alloc: 60, tarifaRede: 0.78, margem: 140,
    epFilter: 'Todos', epBusca: '', repEv: 80, baseSites: { pn: 2.49 }, bessSoc: { pn: 92 },
    metragem: 2400, areaBateria: 4, vagasDesejadas: 4, precoVenda: 2.19, tarifaBase: 0.85, parcFilter: 'Fornecedores',
    fontes: { roof: { sel: true, area: 250 }, facade: { sel: true, area: 60 }, carport: { sel: true, area: 90 } },
    anfChargers: [{ id: 'a1', nome: 'Garagem · HCA G2', sub: 'GoodWe HCA G2 7 kW · uso privado', pub: true }],
    spotId: 's1', fav: ['s1'], mapFilter: 'Todos', histFilter: 'Todos',
    goal: 80, pctIni: 41, method: 'pix', modo: null, metaKm: 120, metaMin: 45, metaKwhDireto: 20,
    sess: null, running: false, interrupted: false, plugged: false, hwOnline: false, receipt: null, stars: 0,
    saldo: 48.2,
    base: 2.10, solar: 'alto', ponta: false,
    kwp: 96, reserva: 30,
    siteSel: 'pn',
    sites: [
      { id: 'pn', nome: 'Galeria Pátio Norte', endereco: 'Av. Paulista, 1578 · Bela Vista, SP', kwp: '67,2 kWp instalados' },
    ],
    chargers: CHARGERS_INICIAIS.map(c => ({ ...c })),
    chat: [],
    // previsão (machine learning) — tela Previsão do gestor
    prevModo: 'dia', prevAlvo: 'galeria', prevGraf: 'fonte', prevShiftProg: {}, prevDia: 0, prevTemp: 0, prevVagasSim: null, prevOrigem: 'dash',
  };

  componentWillUnmount() { clearInterval(this._iv); clearTimeout(this._t); clearInterval(this._hwIv); }

  // ---- demonstração física: LED + botão do carregador impresso ----
  componentDidMount() {
    this._hwIv = setInterval(this.hwPoll, 400);
    this.hwFind();
  }

  _hwUrl = null;   // endereço onde o carregador de fato respondeu
  _hwMiss = 0;
  _hwLast = null;

  // testa os endereços possíveis em paralelo; o primeiro que responder vira o oficial
  hwFind = () => {
    if (this.props.hardwareFisico === false) return;
    HW_URLS.forEach(u => {
      const opts = (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? { signal: AbortSignal.timeout(2500) } : {};
      fetch(u + '/state', opts)
        .then(r => {
          if (r.ok && !this._hwUrl) {
            this._hwUrl = u;
            this._hwLast = null;
            this.setState({ hwOnline: true });   // com o carregador na mesa, o plugue passa a ser exigido
            this.hwSet('disponivel');
          }
        })
        .catch(() => {});
    });
  };

  hwSet = (key) => {
    if (this.props.hardwareFisico === false) return;
    if (!this._hwUrl) return;           // carregador ainda não encontrado
    if (key === this._hwLast) return;   // não repete o mesmo estado
    this._hwLast = key;
    const c = HW_LED[key];
    fetch(this._hwUrl + '/led?r=' + c.r + '&g=' + c.g + '&b=' + c.b + '&mode=' + c.mode)
      .catch(() => { /* ESP32 fora do alcance — a demo segue só na tela */ });
  };

  // cor de "repouso": azul só quando o cabo está FORA; com o cabo encaixado
  // (mesmo depois da recarga concluída) a vaga está ocupada — âmbar
  hwIdle = (plugged) => this.hwSet((plugged !== undefined ? plugged : this.state.plugged) ? 'conectado' : 'disponivel');

  // clique curto no botão físico = plugue: conecta o cabo (âmbar, aguardando o
  // app liberar a carga), desconecta no meio da carga (interrompe), reconecta
  // (retoma) ou, com a meta atingida, encerra. Aperto de 1,5s+ = reset geral.
  hwPoll = () => {
    if (this.props.hardwareFisico === false) return;
    if (!this._hwUrl) {
      // ainda não achou o carregador: tenta de novo a cada ~5s
      if (++this._hwMiss % 12 === 0) this.hwFind();
      return;
    }
    fetch(this._hwUrl + '/button').then(r => r.json()).then(d => {
      if (!d) return;
      if (d.long) { this.hwReset(); return; }
      if (!d.event) {
        // sem evento novo: só corrige um eventual dessincronismo com o estado
        // REAL do conector que o firmware reporta (ex.: recarga encerrada pela
        // tela com o cabo ainda encaixado)
        if (typeof d.plugged !== 'undefined' && !!d.plugged !== this.state.plugged) {
          this.setState({ plugged: !!d.plugged }, () => {
            if (!this.state.sess && !this.state.running) this.hwIdle();
          });
        }
        return;
      }
      // estado do conector APÓS este evento (o firmware reporta; sem o campo,
      // trata como alternância)
      const pluggedNow = (typeof d.plugged !== 'undefined') ? !!d.plugged : !this.state.plugged;
      if (this.state.running) this.interruptSession();
      else if (this.state.interrupted) this.resumeSession();
      else if (this.state.sess) this.finishSession(pluggedNow);
      else if (pluggedNow) this.plugIn();
      else this.plugOut();
    }).catch(() => { /* silencioso, como o hwSet */ });
  };

  plugIn = () => {
    this.setState({ plugged: true });
    this.hwSet('conectado');
    this.say('Plugue conectado ao veículo. Toque em Liberar carga para começar.');
  };

  plugOut = () => {
    this.setState({ plugged: false });
    this.hwSet('disponivel');
    this.say('Plugue desconectado.');
  };

  hwReset = () => {
    clearInterval(this._iv);
    this.setState({ screen: 'role', role: null, logged: false, pendingRole: null, hasSolution: null, tab: 'inicio', sess: null, running: false, interrupted: false, plugged: false, receipt: null, stars: 0, spotId: 's1', mapFilter: 'Todos', histFilter: 'Tudo', goal: 80, method: 'pix', pay: null, cep: '', addr: null, modelo: null, chargers: CHARGERS_INICIAIS.map(c => ({ ...c })) });
    this._hwLast = null;
    this.hwSet('disponivel');
  };

  DIAS = [
    { k: 'seg', label: 'Segunda' }, { k: 'ter', label: 'Terça' }, { k: 'qua', label: 'Quarta' },
    { k: 'qui', label: 'Quinta' }, { k: 'sex', label: 'Sexta' }, { k: 'sab', label: 'Sábado' }, { k: 'dom', label: 'Domingo' },
  ];

  ALERTAS = [
    { id: 'a1', sev: 'critico', site: 'pn', titulo: 'Vagas próximas do teto de recarga', quando: 'agora · 14:22', local: 'Galeria Pátio Norte', regra: 'Potência das vagas acima de 90% do teto disponível por mais de 2 minutos', acao: 'Reduzir a alocação das vagas 01 e 02 para 4 kW até as 15h. Ultrapassar a contratada gera multa na fatura do mês.', botao: 'Aplicar redução do DLM' },
    { id: 'a2', sev: 'critico', site: 'pn', titulo: 'Vaga 03 com falha de aterramento', quando: '13:58', local: 'Galeria Pátio Norte · vaga 03', regra: 'OCPP StatusNotification · errorCode GroundFailure', acao: 'Reiniciar remotamente pelo detalhe da vaga. Se a falha persistir, abrir chamado e manter a vaga despublicada.', botao: 'Abrir detalhe da vaga' },
    { id: 'a3', sev: 'atencao', site: 'pn', titulo: 'Bateria BESS em 22% antes da ponta', quando: '11:48', local: 'Galeria Pátio Norte', regra: 'Estado de carga abaixo de 30% com ponta prevista em menos de 7 horas', acao: 'Comprar energia fora de ponta às 3h para cobrir o pico das 18h, ou elevar a tarifa da faixa de ponta.', botao: 'Ver Tarifa' },
    { id: 'a4', sev: 'atencao', site: 'pn', titulo: 'Vaga 02 ocupada há 4h12 sem consumo', quando: '10:30', local: 'Galeria Pátio Norte · vaga 02', regra: 'Permanência acima de 3 horas com potência abaixo de 0,2 kW', acao: 'Cobrar tarifa de permanência ou notificar o motorista para liberar a vaga.', botao: 'Notificar motorista' },
    { id: 'a5', sev: 'info', site: 'pn', titulo: 'Repasse de setembro programado', quando: 'ontem', local: 'Galeria Pátio Norte', regra: 'Fechamento mensal com crédito no dia 5', acao: 'Nenhuma ação necessária. Confira a conta de repasse em Conta antes do fechamento.', botao: 'Ver repasses' },
  ];

  SEV = {
    critico: { label: 'Crítico', cor: '#f5333f', tagBg: '#fdeaec', tagFg: '#a3111c' },
    atencao: { label: 'Atenção', cor: '#b97a08', tagBg: '#faeed3', tagFg: '#7a5406' },
    info: { label: 'Informativo', cor: '#3577f1', tagBg: '#dee9fc', tagFg: '#1d4ea8' },
  };

  // ---- previsão de demanda (machine learning) ----
  // O motor (MLPrev, em src/ml/previsao-motor.js) roda as árvores treinadas em
  // inteligencia/. Aqui só se lê o estado do app que entra no modelo: quantas
  // vagas estão operando agora (a Vaga 03 em falha reduz a capacidade).
  vagasOperando = () => Math.min(4, this.state.chargers
    .filter(c => c.site === 'pn' && (c.status === 'livre' || c.status === 'carregando')).length);

  cenarioML = () => ({ vagas: this.vagasOperando() });

  alertasML = () => MLPrev.alertas(this.cenarioML()).map(a => ({
    ...a, site: 'pn', ml: true,
    local: 'Galeria Pátio Norte · previsão ML',
  }));

  abrirPrevisao = (extra = {}) => this.setState(p => ({
    screen: 'previsao', prevOrigem: p.screen === 'sindico' ? 'sindico' : p.screen === 'alertas' ? 'alertas' : 'dash',
    tab: p.screen === 'sindico' ? 'sindico' : p.screen === 'alertas' ? 'vagas' : 'mais', ...extra,
  }));

  acaoAlertaML = (a) => {
    if (a.acaoTipo === 'vagas') { this.setState({ screen: 'vagas', tab: 'vagas' }); return; }
    if (a.acaoTipo === 'tarifa') { this.setState({ screen: 'tariff', tab: 'fin' }); return; }
    if (a.acaoTipo === 'shift') {
      const dias = (a.dias || [a.d]).map(d => MLPrev.rotuloDia(d).longo + ' ' + MLPrev.rotuloDia(d).data).join(' e ');
      this.say('Compra fora de ponta programada para ' + dias + ', 03:00–06:00. A bateria entra na ponta cheia.');
      return;
    }
    this.abrirPrevisao({ prevModo: 'dia', prevDia: a.d });
  };

  // respostas do Síndico Virtual que saem da previsão
  respostaML = (q) => {
    const x = q.toLowerCase();
    const temaPrev = /ampli|bateria maior|mais bateria|comprar bateria|load|shift|desloc|previs|amanh|semana|pr[óo]xim|prever|feriado|calor|frio|chuv|lot(ar|ad)|encher|pico|alerta|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo/;
    if (!temaPrev.test(x) || /\bfoi\b|fechou|passad/.test(x)) return null;   // passado: outras respostas
    const cen = this.cenarioML();
    const nD = MLPrev.dias();
    const kwh = (v) => Math.round(v).toLocaleString('pt-BR') + ' kWh';
    const ivEv = MLPrev.iv('ev'), ivGal = MLPrev.iv('galeria');
    const d0 = /amanh/.test(x) ? 1 : 0;
    if (/ampli|bateria maior|mais bateria|comprar bateria/.test(x)) {
      const an = MLPrev.analiseDia(d0, cen);
      return an.bateria.titulo + ' (' + an.bateria.valor + '). ' + an.bateria.texto + ' Opções: ' + an.bateria.opcoes.map(o => o.rotulo + ' → ' + o.econ + ', ' + o.inv + ', retorno ' + o.payback).join('; ') + '.';
    }
    if (/load|shift|desloc/.test(x)) {
      const dias = [];
      for (let i = 0; i < nD; i++) { const ls = MLPrev.loadShift(i, cen); if (ls.length) dias.push({ i, ls }); }
      if (!dias.length) return 'Nenhum dia dos próximos ' + nD + ' pede load-shifting: a sobra de sol já enche a bateria antes da ponta e deslocar carga economizaria menos de R$ 3 por dia.';
      const tot = dias.reduce((a, x) => a + x.ls.reduce((b, r) => b + r.econ, 0), 0);
      return 'Load-shifting recomendado em ' + dias.length + ' dos ' + nD + ' dias, economia estimada de R$ ' + Math.round(tot) + '. '
        + dias.slice(0, 3).map(x => MLPrev.quandoDia(x.i).replace(/^./, c => c.toUpperCase()) + ': ' + x.ls.map(r => r.titulo.toLowerCase() + ' (' + Math.round(r.kwh) + ' kWh, ' + r.de + ' → ' + r.para + ', R$ ' + Math.round(r.econ) + ')').join('; ')).join('. ')
        + '. O plano hora a hora está na tela Previsão.';
    }
    if (/alerta|risco|aviso|problema/.test(x)) {
      const al = MLPrev.alertas(cen);
      if (!al.length) return 'A previsão da semana não acende nenhum alerta: a demanda fica abaixo do teto do DLM e há vaga para a procura prevista.';
      return al.length + (al.length > 1 ? ' alertas' : ' alerta') + ' da previsão para os próximos ' + nD + ' dias. '
        + al.slice(0, 3).map(a => a.titulo + ' (' + a.quando + '): ' + a.acao).join(' ') + ' Detalhes na tela Previsão.';
    }
    const nomesDia = ['segunda', 'ter', 'quarta', 'quinta', 'sexta', 's[áa]bado', 'domingo'];
    let d = /amanh/.test(x) ? 1 : 0;
    nomesDia.forEach((n, k) => {
      if (new RegExp(n).test(x)) {
        for (let i = 0; i < nD; i++) if (MLPrev.D.calendario[i].dia_semana === k) { d = i; break; }
      }
    });
    if (/semana|pr[óo]xim(os|as) dias/.test(x) && !/amanh/.test(x)) {
      let te = 0, tg = 0, maior = 0;
      for (let i = 0; i < nD; i++) {
        const e = MLPrev.preverDia('ev', i, cen).total;
        te += e; tg += MLPrev.preverDia('galeria', i, cen).total;
        if (e > MLPrev.preverDia('ev', maior, cen).total) maior = i;
      }
      const rs = MLPrev.resumoSemana(cen);
      return 'Para os próximos ' + nD + ' dias o modelo prevê ' + kwh(te) + ' nas vagas (±' + Math.round(ivEv.semana_q80_rel * 100) + '%) e '
        + kwh(tg) + ' na galeria. O dia mais cheio no eletroposto é ' + MLPrev.quandoDia(maior) + ', com '
        + kwh(MLPrev.preverDia('ev', maior, cen).total) + '. Pico na rede de ' + MLPrev.virg(rs.pico.rede) + ' kW (' + MLPrev.quandoDia(rs.pico.d)
        + ', ' + rs.pico.h + 'h), ' + Math.round(rs.pct * 100) + '% do teto operacional.';
    }
    const e = MLPrev.preverDia('ev', d, cen), g = MLPrev.preverDia('galeria', d, cen);
    const pk = e.horas.reduce((a, v, h) => (v > e.horas[a] ? h : a), 0);
    const fmtFx = (f) => f.label.toLowerCase() + ' ' + (f.kwh > 0 ? '+' : '−') + MLPrev.virg(Math.abs(f.kwh)) + ' kWh';
    const fxEv = MLPrev.explicarDia('ev', d, cen).slice(0, 2).map(fmtFx);
    const fxGal = MLPrev.explicarDia('galeria', d, cen).slice(0, 2).map(fmtFx);
    const quando = MLPrev.quandoDia(d).replace(/^./, c => c.toUpperCase());
    if (/lot|encher|cheio|vaga livre|fila/.test(x)) {
      const cap = Math.max(1, cen.vagas) * 7;
      const hs = e.horas.map((v, h) => (v >= cap * 0.72 ? h : -1)).filter(h => h >= 0);
      return quando + ': ' + (hs.length >= 2
        ? 'sim, a procura prevista passa de 72% das vagas das ' + hs[0] + 'h às ' + (hs[hs.length - 1] + 1) + 'h, com pico de ' + MLPrev.virg(e.horas[pk]) + ' kWh/h às ' + pk + 'h para ' + cap + ' kW de capacidade.'
          + (cen.vagas < 4 ? ' Com a Vaga 03 de volta, a capacidade sobe para 28 kW.' : '')
        : 'não deve lotar. O pico previsto é de ' + MLPrev.virg(e.horas[pk]) + ' kWh/h às ' + pk + 'h, ' + Math.round(e.horas[pk] / cap * 100) + '% da capacidade das vagas.')
        + ' Total previsto: ' + kwh(e.total) + ' (±' + Math.round(e.total * ivEv.dia_q80_rel) + ').';
    }
    return quando + ': ' + kwh(e.total) + ' previstos nas vagas (±' + Math.round(e.total * ivEv.dia_q80_rel)
      + '), com pico às ' + pk + 'h, e ' + kwh(g.total) + ' na galeria (±' + Math.round(g.total * ivGal.dia_q80_rel) + ').'
      + (fxEv.length ? ' Nas vagas pesa ' + fxEv.join(' e ') + '.' : '')
      + (fxGal.length ? ' Na galeria, ' + fxGal.join(' e ') + '.' : '');
  };

  // divide solar, bateria e rede de cada hora entre galeria e eletroposto, na proporção do consumo da hora
  // solar, bateria e rede de cada consumidor pela regra do rateio (calculada no motor, hora a hora)
  porConsumidor = (linhas) => {
    const z = () => ({ need: 0, sol: 0, bat: 0, rede: 0 });
    const g = z(), e = z();
    linhas.forEach(x => {
      g.need += x.gal; g.sol += x.solGal; g.bat += x.disGal; g.rede += x.redeGal;
      e.need += x.ev; e.sol += x.solEv; e.bat += x.disEv; e.rede += x.redeEv;
    });
    return { g, e };
  };
  blocosConsumidor = ({ g, e }, extra = {}) => {
    const R = (n) => Math.round(n).toLocaleString('pt-BR');
    const P = (a, b) => (b > 0 ? a / b * 100 : 0);
    const bloco = (c, nome, ico, cor, sub) => {
      const ps = P(c.sol, c.need), pb = P(c.bat, c.need), pr = Math.max(0, 100 - ps - pb);
      return {
        nome, ico, cor, sub, total: R(c.need) + ' kWh',
        legenda: [['Sol', ps, '#f2b01e'], ['Bateria', pb, '#149d68'], ['Rede', pr, '#0f2a47']].map(([r, p, k]) => ({ t: r + ' ' + Math.round(p) + '%', cor: k })),
        bs: ps.toFixed(1) + '%', bb: pb.toFixed(1) + '%', br: pr.toFixed(1) + '%',
        itens: [
          { ico: '☀️', rot: 'Solar', kwh: R(c.sol), pct: Math.round(ps) + '%', cor: '#b97a08' },
          { ico: '🔋', rot: 'Bateria', kwh: R(c.bat), pct: Math.round(pb) + '%', cor: '#0f7a51' },
          { ico: '🔌', rot: 'Rede', kwh: R(c.rede), pct: Math.round(pr) + '%', cor: '#0f2a47' },
        ],
      };
    };
    return [bloco(g, 'Galeria', '🏬', '#e08a00', extra.gal || 'condomínio'), bloco(e, 'Eletroposto', '⚡', '#3577f1', extra.ev || 'recarga dos carros')];
  };

  // linhas "de onde vem a energia": ícone em bloco, anel de progresso com o percentual
  fontesUI = (lista) => lista.map(f => {
    const fr = Math.max(0, Math.min(1, parseFloat(f.pct) / 100 || 0)), C = 2 * Math.PI * 15;
    const tint = { '#f2b01e': '#fff3d6', '#149d68': '#dcf3ea', '#0f2a47': '#e3e8f0' }[f.cor] || '#eceef2';
    return { ...f, anel: (fr * C).toFixed(1) + ' ' + C.toFixed(1), bgIco: tint };
  });

  // ---- gráfico de linhas suaves (estilo dos cards de finanças: curva, área com
  // degradê, linha pontilhada de comparação e um ponto destacado com balão).
  // Devolve só atributos para o SVG fixo do template (até 3 séries).
  // series: [{ vals, cor, pontilhada, area }]; destaque: { serie, i, texto }; faixa: [i0, i1]
  grafLinhas = ({ series, destaque, faixa, banda, W = 330, H = 150, topo = 30, base = 128, maxY, minY = 0 }) => {
    const n = series[0].vals.length;
    const x0 = 10, x1 = W - 10;
    const X = (i) => x0 + (n === 1 ? 0 : i * (x1 - x0) / (n - 1));
    const M = maxY || Math.max(1e-6, ...series.flatMap(sr => sr.vals.filter(v => v != null)), ...(banda ? banda.sup : []));
    const Y = (v) => base - (Math.min(Math.max(0, v - minY), M - minY) / Math.max(1e-6, M - minY)) * (base - topo);
    // interpolação cúbica monotônica (Fritsch–Carlson): suave e sem passar abaixo de zero
    const curva = (vals) => {
      const p = vals.map((v, i) => [X(i), Y(v || 0)]);
      if (p.length < 2) return '';
      const dx = [], dy = [], m = [];
      for (let i = 0; i < p.length - 1; i++) { dx.push(p[i + 1][0] - p[i][0]); dy.push(p[i + 1][1] - p[i][1]); m.push(dy[i] / dx[i]); }
      const t = [m[0]];
      for (let i = 1; i < p.length - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
      t.push(m[m.length - 1]);
      for (let i = 0; i < m.length; i++) {
        if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
        const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b;
        if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
      }
      const f = (v) => v.toFixed(1);
      let d = 'M' + f(p[0][0]) + ' ' + f(p[0][1]);
      for (let i = 0; i < p.length - 1; i++) {
        const h = dx[i] / 3;
        d += ' C' + f(p[i][0] + h) + ' ' + f(p[i][1] + t[i] * h) + ' ' + f(p[i + 1][0] - h) + ' ' + f(p[i + 1][1] - t[i + 1] * h) + ' ' + f(p[i + 1][0]) + ' ' + f(p[i + 1][1]);
      }
      return d;
    };
    const bandaD = banda ? 'M' + banda.sup.map((v, i) => X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' L')
      + ' L' + banda.inf.map((v, i) => [X(i), Y(v)]).reverse().map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') + ' Z' : '';
    const out = { bd: bandaD, vb: '0 0 ' + W + ' ' + H, base: base.toFixed(1), xs: Array.from({ length: n }, (_, i) => (X(i) / W * 100).toFixed(2) + '%') };
    out.zero = minY < 0 ? 'M' + x0 + ' ' + Y(0).toFixed(1) + ' L' + x1 + ' ' + Y(0).toFixed(1) : '';
    for (let k = 0; k < 4; k++) {
      const sr = series[k];
      const d = sr ? curva(sr.vals) : '';
      out['l' + (k + 1)] = d;
      out['a' + (k + 1)] = sr && sr.area && d ? d + ' L' + X(n - 1).toFixed(1) + ' ' + base + ' L' + X(0).toFixed(1) + ' ' + base + ' Z' : '';
      out['c' + (k + 1)] = sr ? sr.cor : 'none';
      out['p' + (k + 1)] = sr && sr.pontilhada ? '0.1 6' : 'none';
      out['w' + (k + 1)] = sr ? (sr.pontilhada ? '3' : '2.6') : '0';
    }
    // faixa sombreada (ponta 17h–21h)
    if (faixa) {
      const step = (x1 - x0) / (n - 1);
      out.fx = (X(faixa[0]) - step / 2).toFixed(1); out.fw = ((faixa[1] - faixa[0] + 1) * step).toFixed(1); out.fv = 'visible';
    } else { out.fx = '0'; out.fw = '0'; out.fv = 'hidden'; }
    // ponto destacado + balão
    if (destaque) {
      const sr = series[destaque.serie || 0];
      const cx = X(destaque.i), cy = Y(sr.vals[destaque.i] || 0);
      const tw = Math.max(44, destaque.texto.length * 5.6 + 16), th = 20;
      const tx = Math.min(W - tw - 2, Math.max(2, cx - tw / 2)), ty = Math.max(2, cy - th - 12);
      Object.assign(out, {
        hx: cx.toFixed(1), hy: cy.toFixed(1), hcor: sr.cor, hv: 'visible',
        guia: 'M' + cx.toFixed(1) + ' ' + (ty + th).toFixed(1) + ' L' + cx.toFixed(1) + ' ' + base,
        texto: destaque.texto, balaoX: (Math.min(W - tw / 2 - 2, Math.max(tw / 2 + 2, cx)) / W * 100).toFixed(2) + '%', balaoY: (ty / H * 100).toFixed(2) + '%', balaoVis: 'block',
      });
    } else Object.assign(out, { hx: '0', hy: '0', hcor: 'none', hv: 'hidden', guia: '', texto: '', balaoX: '0', balaoY: '0', balaoVis: 'none' });
    return [out];
  };

  // valores de tela da Previsão, do card do Início e do Síndico
  valsPrevisao = (s, scr) => {
    const chip = (on) => ({
      border: on ? '#00d1ff' : '#e4e5e9', espessura: on ? '2px' : '1.5px',
      sombra: on ? '0 0 10px rgba(0,209,255,.55)' : 'none', fg: on ? '#131c2e' : '#5d6572',
    });
    const v = MLPrev.virg;
    const kwh = (n) => (Math.round(n) || 0).toLocaleString('pt-BR');
    const sinal = (n) => (n >= 0 ? '+' : '−') + v(Math.abs(n)) + ' kWh';
    const vagasReais = this.vagasOperando();
    const cenBase = { vagas: vagasReais };
    const cen = { vagas: s.prevVagasSim != null ? s.prevVagasSim : vagasReais, ...(s.prevTemp ? { tempDelta: s.prevTemp } : {}) };
    const simulando = !!s.prevTemp || (s.prevVagasSim != null && s.prevVagasSim !== vagasReais);
    const alvo = s.prevAlvo || 'ev';
    const nD = MLPrev.dias();
    const d = Math.min(nD - 1, s.prevDia || 0);
    const IV = MLPrev.iv(alvo);
    const D = MLPrev.D;
    const met = D.metricas[alvo];

    const dia = MLPrev.preverDia(alvo, d, cen);
    const cal = D.calendario[d];
    const rot = MLPrev.rotuloDia(d);
    const rede = MLPrev.redeDia(d, cen);
    const pr = rede.reduce((a, b) => (b.rede > a.rede ? b : a));
    const pctTeto = pr.rede / MLPrev.LIMITE;
    // balanço de energia do dia: necessária (galeria + vagas) e de onde vem (solar, bateria, rede)
    const B = MLPrev.balanco(d, cen);
    const LS = MLPrev.balancoComShift(d, cen);
    const IVg = MLPrev.iv('galeria'), IVe = MLPrev.iv('ev');
    const faixaNeed = (g, e, k) => Math.sqrt((g * IVg[k]) ** 2 + (e * IVe[k]) ** 2);   // erros independentes
    const BRL0 = (n) => 'R$ ' + Math.round(n).toLocaleString('pt-BR');
    const pct = (a, b) => (b > 0 ? Math.round(a / b * 100) : 0) + '%';
    const COR = { sol: '#f2b01e', bat: '#149d68', rede: '#0f2a47' };
    const graf = s.prevGraf || 'fonte';
    const progDia = (s.prevShiftProg || {})[d];
    const icone = (c) => {
      const irr = c.irradiancia.reduce((a, b) => a + b, 0) / 1000, ch = c.precipitacao.reduce((a, b) => a + b, 0);
      return ch > 2 ? '🌧️' : irr > 6.2 ? '☀️' : irr > 4.5 ? '🌤️' : '☁️';
    };
    const clima = dia.clima;
    const chuvaDia = clima.precipitacao.reduce((a, b) => a + b, 0);

    const semana = [];
    for (let i = 0; i < nD; i++) {
      const e = MLPrev.preverDia('ev', i, cen), g = MLPrev.preverDia('galeria', i, cen);
      const bi = MLPrev.balanco(i, cen), ls = MLPrev.loadShift(i, cen);
      semana.push({ i, e: e.total, g: g.total, b: bi, ls, econ: ls.reduce((a, r) => a + r.econ, 0), clima: e.clima, cal: D.calendario[i], r: MLPrev.rotuloDia(i) });
    }
    const SW = (k) => semana.reduce((a, x) => a + x.b[k], 0);
    const totSem = SW('need');
    const econSem = semana.reduce((a, x) => a + x.econ, 0);
    // semana passada medida (galeria + vagas)
    const somaHist = (arr) => arr.slice(arr.length - 168).reduce((a, b) => a + (b == null ? 0 : b), 0);   // null = hora sem medição
    const semPassada = somaHist(D.historico.ev) + somaHist(D.historico.galeria);
    // referência típica: MEDIANA do histórico medido (6 semanas). A mediana não se deixa puxar
    // por um feriado, um evento ou um dia de recarga fora do comum, como a média faria.
    const mediana = (xs) => { const a = xs.filter(x => x != null).sort((p, q) => p - q); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
    const somaJanela = (arr, i0, n, minimo) => { let t = 0, k = 0; for (let i = i0; i < i0 + n; i++) if (arr[i] != null) { t += arr[i]; k++; } return k >= minimo ? t * n / k : null; };
    const NDH = Math.floor(D.historico.ev.length / 24);
    const medDiaSemana = (arr, dd) => {           // mesmo dia da semana do dia previsto dd, nas 6 semanas medidas
      const xs = []; for (let k = 0; k < NDH; k++) if ((NDH - k + dd) % 7 === 0) xs.push(somaJanela(arr, k * 24, 24, 20));
      return { med: mediana(xs), n: xs.filter(x => x != null).length };
    };
    const medSemanas = (arr) => { const xs = []; for (let w = 0; w < Math.floor(NDH / 7); w++) xs.push(somaJanela(arr, w * 168, 168, 150)); return { med: mediana(xs), n: xs.filter(x => x != null).length }; };
    const pillComp = (val, ref) => {
      if (ref == null || ref <= 0) return { comp: '', compBg: 'transparent', compFg: 'transparent' };
      const dv = (val / ref - 1) * 100;
      return { comp: (dv >= 0 ? '+' : '−') + v(Math.abs(dv), 0) + '% vs mediana', compBg: dv >= 0 ? 'rgba(245,51,63,.18)' : 'rgba(20,157,104,.22)', compFg: dv >= 0 ? '#ffb3b9' : '#8ff0c4' };
    };

    const alertas = MLPrev.alertas(cenBase);
    const fx = [...MLPrev.explicarDia('galeria', d, cen).map(f => ({ ...f, onde: 'Galeria' })),
      ...MLPrev.explicarDia('ev', d, cen).map(f => ({ ...f, onde: 'Eletroposto' }))]
      .sort((a, b) => Math.abs(b.kwh) - Math.abs(a.kwh)).slice(0, 6);
    const maxFx = Math.max(1, ...fx.map(f => Math.abs(f.kwh)));

    const evHoje = MLPrev.preverDia('ev', 0, cenBase), galHoje = MLPrev.preverDia('galeria', 0, cenBase);
    const bt = D.backtest[alvo];
    const imp = Object.entries(met.importancia_grupos).slice(0, 6);
    const grp = met.por_tipo_de_dia_erro_dia_pct || {};
    const mDia = met.modelo, mBase = met.baseline_media_4_semanas;

    return {
      scPrevisao: scr('previsao'),
      goPrevisao: () => this.abrirPrevisao({ prevModo: 'dia', prevDia: 0 }),
      goPrevisaoSemana: () => this.abrirPrevisao({ prevModo: 'semana' }),
      backFromPrevisao: () => this.setState(p => (p.prevOrigem === 'sindico'
        ? { screen: 'sindico', tab: 'sindico' }
        : p.prevOrigem === 'alertas' ? { screen: 'alertas', tab: 'vagas' } : { screen: 'dash', tab: 'mais' })),
      prevSub: D.galeria + ' · ' + (s.prevModo === 'semana' ? 'próximos ' + nD + ' dias' : 'hora a hora'),
      prevModoTabs: [['dia', 'Dia'], ['semana', 'Semana']].map(([k, l]) => ({ label: l, ...chip((s.prevModo || 'dia') === k), onPick: () => this.setState({ prevModo: k }) })),
      prevAlvoTabs: [['galeria', 'Galeria'], ['ev', 'Eletroposto']].map(([k, l]) => ({ label: l, ...chip(alvo === k), onPick: () => this.setState({ prevAlvo: k }) })),
      prevGrafTabs: [['fonte', 'De onde vem'], ['consumo', 'Quem consome']].map(([k, l]) => ({ label: l, ...chip(graf === k), onPick: () => this.setState({ prevGraf: k }) })),
      prevModoDia: (s.prevModo || 'dia') === 'dia',
      prevModoSemana: s.prevModo === 'semana',
      prevDias: semana.map(x => ({
        top: x.r.rel || x.r.curto, num: x.r.num, ...chip(x.i === d),
        border: x.i === d ? '#d31e2c' : '#e4e5e9', espessura: '1.5px', sombra: x.i === d ? '0 6px 14px rgba(211,30,44,.28)' : 'none',
        bg: x.i === d ? '#d31e2c' : '#fff', fg: x.i === d ? '#fff' : '#131c2e', fgTop: x.i === d ? 'rgba(255,255,255,.85)' : '#7c8494',
        marca: x.ls.length ? (x.i === d ? '#fff' : '#0f7a51') : x.cal.feriado ? (x.i === d ? '#fff' : '#00a6cc') : 'transparent',
        onPick: () => this.setState({ prevDia: x.i, prevSindAberto: null, prevSindOpc: null }),
      })),
      // ---- dia
      prevDiaTitulo: 'Previsão de demanda · ' + (rot.rel ? rot.rel.toLowerCase() + ', ' : '') + rot.longo + ' ' + rot.data,
      prevDiaValor: kwh(B.need) + ' kWh',
      prevDiaFaixa: 'entre ' + kwh(B.need - faixaNeed(B.gal, B.ev, 'dia_q80_rel')) + ' e ' + kwh(B.need + faixaNeed(B.gal, B.ev, 'dia_q80_rel')) + ' kWh · 80% de confiança',
      // previsão de demanda separada: galeria e eletroposto, cada um com faixa, pico e comparação
      prevDemandas: (() => {
        const NH = D.historico.ev.length;
        const card = (alvo, nome, ico, cor, det) => {
          const hs = B.linhas.map(x => x[alvo === 'ev' ? 'ev' : 'gal']);
          const tot = hs.reduce((a, b) => a + b, 0), iv = MLPrev.iv(alvo).dia_q80_rel;
          const pk = hs.reduce((a, x, h) => (x > hs[a] ? h : a), 0);
          const md = medDiaSemana(D.historico[alvo === 'ev' ? 'ev' : 'galeria'], d);
          return {
            nome, ico, cor, det, valor: kwh(tot), un: 'kWh',
            faixa: kwh(tot * (1 - iv)) + '–' + kwh(tot * (1 + iv)) + ' kWh',
            pico: 'pico às ' + String(pk).padStart(2, '0') + 'h · ' + v(hs[pk]) + ' kWh',
            ...pillComp(tot, md.med),
            ref: md.med == null ? '' : 'mediana das ' + md.n + ' últimas ' + rot.longo.replace(/^(segunda|terça|quarta|quinta|sexta)$/, '$1s').replace(/^sábado$/, 'sábados').replace(/^domingo$/, 'domingos') + ': ' + kwh(md.med) + ' kWh',
          };
        };
        return [card('galeria', 'Galeria', '🏬', '#ffd27a', 'condomínio · aberta ' + cal.abre + 'h–' + cal.fecha + 'h'),
                card('ev', 'Eletroposto', '⚡', '#7fb2ff', cen.vagas + ' vagas · ' + cal.ep_abre + 'h–' + cal.ep_fecha + 'h')];
      })(),
      // consumo previsto (galeria e eletroposto) e geração solar / bateria no mesmo gráfico
      ...(() => {
        const L = B.linhas;
        const bat = L.map(x => x.dis - x.cargaSol - x.cargaRede);          // + entrega, − carrega
        const ser = [
          { vals: L.map(x => x.gal), cor: '#d31e2c', nome: 'Consumo galeria' },
          { vals: L.map(x => x.ev), cor: '#3577f1', nome: 'Consumo eletroposto' },
          { vals: L.map(x => x.sol), cor: '#e9a000', pontilhada: true, nome: 'Geração solar' },
          { vals: bat, cor: '#149d68', nome: 'Bateria (+ entrega · − carrega)' },
        ];
        const minY = Math.min(0, ...bat) * 1.15;
        const pkS = L.reduce((a, x) => (x.sol > a.sol ? x : a));
        const cheia = B.cheiaAs;
        return {
          prevGC: this.grafLinhas({ H: 190, topo: 30, base: 172, minY, series: ser, faixa: [MLPrev.PONTA[0], MLPrev.PONTA[1] - 1],
            destaque: { serie: 2, i: pkS.h, texto: 'sol ' + String(pkS.h).padStart(2, '0') + 'h · ' + v(pkS.sol) + ' kWh' } }),
          prevGCLeg: ser.map(x => ({ label: x.nome, cor: x.cor, estilo: x.pontilhada ? 'dotted' : 'solid' })),
          prevGCResumo: [
            { cor: '#d31e2c', t: 'Galeria ' + kwh(B.gal) + ' kWh · pico ' + String(L.reduce((a, x) => (x.gal > a.gal ? x : a)).h).padStart(2, '0') + 'h' },
            { cor: '#3577f1', t: 'Eletroposto ' + kwh(B.ev) + ' kWh · pico ' + String(L.reduce((a, x) => (x.ev > a.ev ? x : a)).h).padStart(2, '0') + 'h' },
            { cor: '#e9a000', t: 'Solar ' + kwh(B.sol) + ' kWh gerados · pico ' + String(pkS.h).padStart(2, '0') + 'h' },
            { cor: '#149d68', t: 'Bateria carrega ' + kwh(B.solBat + B.compra) + ' kWh' + (cheia != null ? ' (cheia às ' + String(cheia + 1).padStart(2, '0') + 'h)' : '') + ' e entrega ' + kwh(B.bat) + ' kWh na ponta' },
          ],
        };
      })(),
      // banner de load shifting: comprar da rede no horário mais barato e guardar na bateria para a ponta
      ...(() => {
        const PC = MLPrev.balanco(d, cen, { preCarga: true });
        const econ = B.custo - PC.custo, compra = PC.compra;
        const vis = compra >= 1 && econ >= 1;
        const irr = clima.irradiancia.reduce((a, b) => a + b, 0), irrN = D.normais.irradiancia.reduce((a, b) => a + b, 0);
        const pb = Math.round(B.soc17 / D.bessKwh * 100);
        const prog = (s.prevPcProg || {})[d];
        const T = MLPrev.TARIFA;
        const brl = (n) => 'R$ ' + n.toFixed(2).replace('.', ',');
        return {
          prevPcVis: vis,
          prevPcMotivo: (irr < irrN * 0.7 ? 'Pouco sol hoje (' + Math.round(irr / irrN * 100) + '% do normal de outubro): ' : 'Ainda sobra espaço nas baterias: ')
            + 'sem a compra, as baterias entram na ponta com ' + pb + '% de carga. A compra completa o que o sol não enche.',
          prevPcPassos: [
            { hora: '03h–06h', acao: 'Comprar ' + kwh(compra) + ' kWh da rede', preco: brl(T.fora) + '/kWh · horário mais barato', cor: '#0f7a51', bg: '#dcf3ea' },
            { hora: '17h–21h', acao: 'Usar a energia guardada na ponta', preco: 'em vez de pagar ' + brl(T.ponta) + '/kWh', cor: '#a3111c', bg: '#fdeaec' },
          ],
          prevPcEcon: 'R$ ' + econ.toFixed(2).replace('.', ',') + '/dia',
          prevPcCompra: kwh(compra) + ' kWh',
          prevPcDica: (irr < irrN * 0.7 ? 'Pouco sol hoje (' + Math.round(irr / irrN * 100) + '% do normal): ' : 'Ainda sobra espaço nas baterias: ')
            + 'sem compra, as baterias entram na ponta com ' + pb + '% de carga. Comprar ' + kwh(compra) + ' kWh fora de ponta às 3h, a ' + brl(T.fora)
            + ', e devolver pela bateria das 17h às 21h, no lugar de ' + brl(T.ponta) + '/kWh.',
          prevPcRede: 'Rede na ponta: ' + kwh(B.redePonta) + ' → ' + kwh(PC.redePonta) + ' kWh',
          prevPcBotao: prog ? '✓ Compra fora de ponta programada' : 'Programar compra fora de ponta',
          prevPcBotaoBg: prog ? 'rgba(0,209,255,.16)' : '#00d1ff', prevPcBotaoFg: prog ? '#7fd9f2' : '#08243c',
          prevPcProgramar: () => {
            this.setState(p => ({ prevPcProg: { ...(p.prevPcProg || {}), [d]: true } }));
            this.say('Compra programada para ' + rot.longo + ' ' + rot.data + ': ' + kwh(compra) + ' kWh entre 03h e 06h, para usar na ponta das 17h às 21h.');
          },
        };
      })(),
      ...(() => {
        const T = MLPrev.TARIFA, brl = (n) => 'R$ ' + n.toFixed(2).replace('.', ',');
        const PC = MLPrev.balanco(d, cen, { preCarga: true });
        const econPC = B.custo - PC.custo;
        const progPC = (s.prevPcProg || {})[d];
        const botao = (feito, txt, txtOk) => ({ prevOriBotao: feito ? '✓ ' + txtOk : txt, prevOriBotaoBg: feito ? 'rgba(0,209,255,.16)' : '#00d1ff', prevOriBotaoFg: feito ? '#7fd9f2' : '#08243c' });
        if (PC.compra >= 1 && econPC >= 1) {
          const ocultar = { prevSindCompraVis: false, prevSindShiftVis: true };
          const irr = clima.irradiancia.reduce((a, b) => a + b, 0), irrN = D.normais.irradiancia.reduce((a, b) => a + b, 0);
          return {
            ...ocultar, prevOriTitulo: 'Load shifting recomendado', prevOriJanela: '03:00 → 06:00',
            prevOriDica: (irr < irrN * 0.7 ? 'Pouco sol hoje (' + Math.round(irr / irrN * 100) + '% do normal): ' : 'Ainda sobra espaço nas baterias: ')
              + 'sem compra, as baterias entram na ponta com ' + Math.round(B.soc17 / D.bessKwh * 100) + '% de carga. Comprar fora de ponta às 3h, a ' + brl(T.fora)
              + ', e devolver pela bateria na ponta das 17h às 21h, no lugar de ' + brl(T.ponta) + '/kWh.',
            prevOriT1: 'Comprar fora de ponta', prevOriV1: kwh(PC.compra) + ' kWh',
            prevOriT2: 'Economia estimada', prevOriV2: brl(econPC) + '/dia', prevOriV2Cor: '#9dff33',
            ...botao(progPC, 'Programar compra fora de ponta', 'Compra fora de ponta programada'),
            prevOriAcao: () => { this.setState(p => ({ prevPcProg: { ...(p.prevPcProg || {}), [d]: true } }));
              this.say('Compra programada para ' + rot.longo + ' ' + rot.data + ': ' + kwh(PC.compra) + ' kWh entre 03h e 06h, para usar na ponta das 17h às 21h.'); },
          };
        }
        if (LS) {
          const r = LS.recs[0];
          const econ = B.custo - LS.depois.custo;
          const ev = r.tipo === 'ev';
          const evPonta = B.linhas.filter(x => x.ponta).reduce((a, x) => a + x.ev, 0);
          return {
            prevSindCompraVis: true, prevSindShiftVis: false,
            prevOriTitulo: 'Load shifting recomendado', prevOriJanela: r.para.replace(/h/g, ':00').replace('–', ' → '),
            prevOriDica: ev
              ? 'As vagas devem consumir ' + kwh(evPonta) + ' kWh na ponta, quando a rede custa ' + brl(T.ponta) + '/kWh, enquanto sobra sol das ' + r.para.replace('–', ' às ') + '. Desconto solar maior nesse horário e acréscimo na ponta levam parte das recargas para o sol, e a bateria sobra para a galeria.'
              : 'Dia quente com sol sobrando das ' + r.para.replace('–', ' às ') + ': pré-resfriar a galeria nesse horário e aliviar a climatização na ponta, quando a rede custa ' + brl(T.ponta) + '/kWh.',
            prevOriT1: ev ? 'Recarga deslocada' : 'Climatização deslocada', prevOriV1: kwh(r.kwh) + ' kWh',
            prevOriT2: 'Economia estimada', prevOriV2: brl(econ) + '/dia', prevOriV2Cor: '#9dff33',
            ...botao(progDia, ev ? 'Programar tarifa de load shifting' : 'Programar pré-resfriamento', 'Load shifting programado'),
            prevOriAcao: () => {
              this.setState(p => ({ prevShiftProg: { ...(p.prevShiftProg || {}), [d]: true } }));
              this.say('Load shifting programado para ' + rot.longo + ' ' + rot.data + ': ' + LS.recs.map(x => x.titulo.toLowerCase() + ' (' + Math.round(x.kwh) + ' kWh, ' + x.de + ' → ' + x.para + ')').join('; ') + '.');
            },
          };
        }
        return {
          prevSindCompraVis: true, prevSindShiftVis: true,
          prevOriTitulo: 'Nenhum load shifting hoje', prevOriJanela: 'sem ação',
          prevOriDica: 'O sol enche as baterias antes da ponta e deslocar carga economizaria menos de R$ 3. A operação padrão já é a mais barata hoje.',
          prevOriT1: 'Bateria na ponta', prevOriV1: kwh(B.bat) + ' kWh', prevOriT2: 'Rede na ponta', prevOriV2: kwh(B.redePonta) + ' kWh', prevOriV2Cor: '#f2f6fb',
          prevOriBotao: 'Perguntar ao Síndico', prevOriBotaoBg: 'rgba(255,255,255,.12)', prevOriBotaoFg: '#f2f6fb',
          prevOriAcao: () => { this.setState({ screen: 'sindico', tab: 'sindico' }); this.ask('Qual a previsão para a semana?'); },
        };
      })(),
      prevTotalDia: 'Total do prédio: ' + kwh(B.need) + ' kWh (entre ' + kwh(B.need - faixaNeed(B.gal, B.ev, 'dia_q80_rel')) + ' e ' + kwh(B.need + faixaNeed(B.gal, B.ev, 'dia_q80_rel')) + ')',
      prevSplit: [
        { label: 'Galeria', det: 'condomínio · aberta ' + cal.abre + 'h–' + cal.fecha + 'h', kwh: kwh(B.gal) + ' kWh', pct: pct(B.gal, B.need), barra: pct(B.gal, B.need), cor: '#ffd27a' },
        { label: 'Eletroposto', det: cen.vagas + ' vagas · aberto ' + cal.ep_abre + 'h–' + cal.ep_fecha + 'h', kwh: kwh(B.ev) + ' kWh', pct: pct(B.ev, B.need), barra: pct(B.ev, B.need), cor: '#7fb2ff' },
      ],
      prevConsumidores: this.blocosConsumidor(this.porConsumidor(B.linhas), { gal: 'aberta ' + cal.abre + 'h–' + cal.fecha + 'h', ev: cen.vagas + ' vagas · ' + cal.ep_abre + 'h–' + cal.ep_fecha + 'h' }),
      prevFontes: this.fontesUI([
        { ico: '☀️', label: 'Solar', kwh: kwh(B.solUso) + ' kWh', pct: pct(B.solUso, B.need), barra: pct(B.solUso, B.need), cor: COR.sol,
          det: 'usado na hora, de ' + kwh(B.sol) + ' kWh gerados nas placas' },
        { ico: '🔋', label: 'Bateria', kwh: kwh(B.bat) + ' kWh', pct: pct(B.bat, B.need), barra: pct(B.bat, B.need), cor: COR.bat,
          det: 'na ponta (17h–21h) · entra com ' + Math.round(B.soc17 / D.bessKwh * 100) + '% de ' + v(D.bessKwh, 0) + ' kWh' },
        { ico: '🔌', label: 'Rede', kwh: kwh(B.rede) + ' kWh', pct: pct(B.rede - B.compra, B.need), barra: pct(B.rede - B.compra, B.need), cor: COR.rede,
          det: kwh(B.redePonta) + ' kWh na ponta e ' + kwh(B.redeFora) + ' kWh fora dela' },
      ]),
      // armazenamento: quanto do sol que sobra cabe nas baterias instaladas
      ...(() => {
        const MOD = 15, EFB = 0.95;                                   // módulo de 15 kWh, como no simulador de viabilidade
        const nMod = Math.round(D.bessKwh / MOD), util = D.bessKwh * 0.9;
        const sobra = B.solBat + B.exp;
        const fr = sobra > 0 ? B.solBat / sobra : 0;
        const defPonta = B.linhas.filter(x => x.ponta).reduce((a, x) => a + Math.max(0, x.need - x.sol), 0);
        const aproveitavel = Math.min(sobra * EFB, defPonta / EFB);     // o que caberia E seria usado na ponta
        const capNec = aproveitavel / 0.9;
        const modNec = Math.max(nMod, Math.ceil(capNec / MOD));
        return {
          prevArmChip: nMod + (nMod > 1 ? ' módulos' : ' módulo') + ' · ' + v(D.bessKwh, 0) + ' kWh',
          prevArmVis: sobra > 0.5,
          prevArmNada: sobra <= 0.5,
          prevArmTitulo: 'Sobram ' + kwh(sobra) + ' kWh de sol; as baterias guardam ' + kwh(B.solBat * EFB) + ' kWh (' + Math.round(fr * 100) + '% da sobra)',
          prevArmGuarda: (fr * 100).toFixed(1) + '%', prevArmExporta: ((1 - fr) * 100).toFixed(1) + '%',
          prevArmLegG: 'para a bateria ' + kwh(B.solBat) + ' kWh', prevArmLegE: 'vai para a rede ' + kwh(B.exp) + ' kWh',
          prevArmLinhas: [
            { k: 'Capacidade útil', v: v(util, 0) + ' kWh (de 10% a 100%) · ' + nMod + ' × ' + MOD + ' kWh' },
            { k: 'Bateria cheia', v: B.cheiaAs != null ? 'às ' + String(B.cheiaAs + 1).padStart(2, '0') + 'h · depois disso o sol que sobra é exportado' : 'não enche hoje: todo o sol que sobra é guardado' },
            { k: 'Para cobrir a ponta', v: modNec > nMod
                ? 'a ponta precisa de ' + kwh(defPonta) + ' kWh além do sol: seriam ~' + kwh(capNec) + ' kWh de bateria, ' + modNec + ' módulos (+' + (modNec - nMod) + '). Acima disso a sobra não teria onde ser usada'
                : 'as ' + nMod + ' baterias já bastam: a ponta usa ' + kwh(defPonta) + ' kWh além do sol' },
          ],
        };
      })(),
      prevSolarResumo: '☀️ ' + kwh(B.sol) + ' kWh gerados: ' + kwh(B.solUso) + ' usados na hora, ' + kwh(B.solBat) + ' guardados na bateria, ' + kwh(B.exp) + ' exportados para a rede.',
      // versão simples do "de onde vem a energia" (para o gestor, sem termos técnicos)
      ...(() => {
        const verde = B.solUso + B.bat, pv = B.need > 0 ? Math.round(verde / B.need * 100) : 0;
        const socMax = Math.max(B.socIni, ...B.linhas.filter(x => x.h < MLPrev.PONTA[0]).map(x => x.soc));
        const pb = Math.max(0, Math.min(100, Math.round(socMax / D.bessKwh * 100)));
        const hh = (h) => String(h).padStart(2, '0') + 'h';
        return {
          prevFonteTitulo: pv + '% da energia de hoje vem do sol e da bateria',
          prevFonteSub: 'O restante, ' + kwh(B.rede) + ' kWh, vem da rede da Enel · gasto previsto de R$ ' + Math.round(B.custo).toLocaleString('pt-BR'),
          prevFontePct: pv + '%',
          prevBatPct: pb + '%', prevBatFill: pb + '%', prevBatCor: pb >= 95 ? '#149d68' : pb >= 50 ? '#7cc9a4' : '#f2b01e',
          prevBatTitulo: B.cheiaAs != null ? 'Baterias cheias às ' + hh(B.cheiaAs + 1) : 'Baterias chegam a ' + pb + '%',
          prevBatTexto: (B.cheiaAs != null
            ? 'O sol enche as baterias de manhã, e elas devolvem essa energia no fim da tarde (17h às 21h), quando a energia da rede é mais cara.'
            : 'Hoje o sol é fraco e não chega a encher as baterias. A energia guardada é usada no fim da tarde (17h às 21h).')
            + (B.exp > 1 ? ' Depois de cheias, ' + kwh(B.exp) + ' kWh de sol que sobram vão para a rede.' : ''),
        };
      })(),
      prevCustoTxt: 'Custo estimado da energia da rede: ' + BRL0(B.custo) + ' no dia (ponta R$ 1,50/kWh, fora de ponta R$ 0,85/kWh, menos o crédito do que é exportado).',
      // gráfico hora a hora: linhas suaves; ponto destacado no maior valor da linha principal
      ...(() => {
        const L = B.linhas;
        const ser = graf === 'fonte'
          ? [{ vals: L.map(x => x.need), cor: '#d31e2c', area: true, nome: 'Necessária' },
             { vals: L.map(x => x.sol), cor: '#e9a000', pontilhada: true, nome: 'Geração solar' },
             { vals: L.map(x => x.rede), cor: '#0f2a47', nome: 'Da rede' }]
          : [{ vals: L.map(x => x.gal), cor: '#d31e2c', area: true, nome: 'Galeria' },
             { vals: L.map(x => x.ev), cor: '#0f2a47', pontilhada: true, nome: 'Eletroposto' }];
        const sd = graf === 'fonte' ? 2 : 0;                      // destaque: pico da rede / pico da galeria
        const iMax = ser[sd].vals.reduce((a, v, i, arr) => (v > arr[a] ? i : a), 0);
        return {
          prevGH: this.grafLinhas({ series: ser, faixa: [MLPrev.PONTA[0], MLPrev.PONTA[1] - 1],
            destaque: { serie: sd, i: iMax, texto: String(iMax).padStart(2, '0') + 'h · ' + v(ser[sd].vals[iMax]) + ' kWh' } }),
          prevGrafLegenda: ser.map(x => ({ label: x.nome, cor: x.cor, estilo: x.pontilhada ? 'dotted' : 'solid' })),
          prevHorasLbl: ['00h', '06h', '12h', '18h', '23h'],
          prevGrafPill: graf === 'fonte' ? pct(B.solUso + B.bat, B.need) + ' solar + bateria' : pct(B.ev, B.need) + ' eletroposto',
        };
      })(),
      // Síndico Virtual lendo o gráfico do dia: veredito, 3 números, decisões que abrem ao toque
      ...(() => {
        const an = MLPrev.analiseDia(d, cen), U = an.ui;
        const aberto = s.prevSindAberto || null;
        const iOp = s.prevSindOpc != null ? s.prevSindOpc : U.bateria.melhor;
        const op = U.bateria.opcoes[iOp];
        const selo = (ok, nao) => ({ selo: ok ? 'Vale a pena' : nao, seloBg: ok ? 'rgba(157,255,51,.16)' : 'rgba(255,255,255,.1)', seloFg: ok ? '#9dff33' : '#dbe6f2' });
        const toggle = (k) => () => this.setState(p => ({ prevSindAberto: p.prevSindAberto === k ? null : k }));
        return {
          prevSindVeredito: LS ? LS.recs[0].titulo : U.veredito,
          prevSindShift: {
            selo: LS ? 'Vale a pena' : 'Não hoje', seloBg: LS ? 'rgba(157,255,51,.16)' : 'rgba(255,255,255,.1)', seloFg: LS ? '#9dff33' : '#dbe6f2',
            linha: LS ? 'Economia de R$ ' + Math.round(B.custo - LS.depois.custo) + ' no dia' : (B.exp < 3 ? 'Quase não sobra sol hoje' : 'Ganho abaixo de R$ 3'),
            seta: aberto === 'shift' ? '⌃' : '⌄', onPick: toggle('shift'),
          },
          prevSindShiftAberto: aberto === 'shift',
          prevSindShiftVazio: aberto === 'shift' && !LS,
          prevSindFrase: U.frase,
          prevSindKpis: U.kpis,
          prevSindCompra: { ...selo(U.compra.ok, 'Não agora'), linha: U.compra.linha, aberto: aberto === 'compra', seta: aberto === 'compra' ? '⌃' : '⌄', onPick: toggle('compra') },
          prevSindCompraPontos: U.compra.pontos.map(t => ({ t })),
          prevSindCompraAberto: aberto === 'compra',
          prevSindBat: { ...selo(U.bateria.ok, 'Retorno longo'), linha: U.bateria.linha, seta: aberto === 'bateria' ? '⌃' : '⌄', onPick: toggle('bateria') },
          prevSindBatAberto: aberto === 'bateria',
          prevSindOpcoes: U.bateria.opcoes.map((o, i) => ({
            rotulo: o.rotulo + ' kWh', on: i === iOp, bg: i === iOp ? '#00d1ff' : 'rgba(255,255,255,.08)', fg: i === iOp ? '#08243c' : '#f2f6fb', borda: i === iOp ? '#00d1ff' : 'transparent',
            onPick: () => this.setState({ prevSindOpc: i }),
          })),
          prevSindOpStats: [
            { valor: op.payback, rotulo: 'retorno' },
            { valor: op.econ, rotulo: 'economia/ano' },
            { valor: op.inv, rotulo: 'investimento' },
          ],
          prevSindOpHoje: 'Hoje, rede na ponta: ' + U.bateria.redePontaHoje + ' → ' + op.redePonta + ' kWh · exportação: ' + U.bateria.expHoje + ' → ' + op.exp + ' kWh',
          prevSindOpEquil: 'Compensa (retorno em 8 anos) com o kWh instalado abaixo de ' + op.equilibrio + '.',
          prevSindPremissasAberto: !!s.prevSindPremissas,
          prevSindPremissasLink: s.prevSindPremissas ? 'Ocultar premissas' : 'Ver premissas',
          prevSindPremissasToggle: () => this.setState(p => ({ prevSindPremissas: !p.prevSindPremissas })),
          prevSindPremissa: an.premissa.replace(/^Premissas: /, ''),
          prevSindPerguntar: () => { this.setState({ screen: 'sindico', tab: 'sindico' }); this.ask('Vale a pena ampliar a bateria?'); },
        };
      })(),
      // load-shifting do dia
      prevLsVisivel: !!LS,
      prevLsNenhum: !LS,
      prevLsTitulo: LS ? 'Economia estimada de ' + BRL0(B.custo - LS.depois.custo) + ' no dia' : '',
      prevLsAntesDepois: LS ? 'Rede na ponta: ' + kwh(B.redePonta) + ' → ' + kwh(LS.depois.redePonta) + ' kWh · custo ' + BRL0(B.custo) + ' → ' + BRL0(LS.depois.custo) : '',
      prevLsRecs: LS ? LS.recs.map(r => ({
        titulo: r.titulo, texto: r.texto, de: r.de, para: r.para, kwh: v(r.kwh, 0) + ' kWh', econ: BRL0(r.econ) + '/dia',
      })) : [],
      prevLsBotao: progDia ? '✓ Plano programado' : 'Programar este plano',
      prevLsBotaoBg: progDia ? 'rgba(0,209,255,.16)' : 'rgba(255,255,255,.12)', prevLsBotaoFg: progDia ? '#7fd9f2' : '#f2f6fb',
      prevLsProgramar: () => {
        if (!LS) return;
        this.setState(p => ({ prevShiftProg: { ...(p.prevShiftProg || {}), [d]: true } }));
        this.say('Load-shifting programado para ' + rot.longo + ' ' + rot.data + ': ' + LS.recs.map(r => r.titulo.toLowerCase() + ' (' + Math.round(r.kwh) + ' kWh, ' + r.de + ' → ' + r.para + ')').join('; ') + '.');
      },
      prevLsMotivo: (() => {
        if (LS) return '';
        const motivos = [];
        if (B.soc17 >= D.bessKwh * 0.95) motivos.push('a sobra de sol já enche a bateria antes da ponta, então comprar da rede de madrugada não economiza');
        if (B.exp < 3) motivos.push('quase não sobra sol para receber carga deslocada da ponta');
        else motivos.push('deslocar carga da ponta para as horas de sol economizaria menos de R$ 3 no dia');
        return 'Não é recomendado para este dia: ' + motivos.join('; ') + '.';
      })(),
      ...(() => {
        const pf = MLPrev.perfilDia(d, cen);
        return { prevPerfil: pf ? pf.nome : '', prevPerfilAcao: pf ? pf.acao : '', prevPerfilVisivel: !!pf };
      })(),
      prevDiaNota: (cal.nome_feriado ? cal.nome_feriado + ' · ' : '') + 'dois Random Forest, um para cada consumidor',
      prevSimChip: simulando ? 'Cenário simulado · ' + sinal(B.need - MLPrev.balanco(d, cenBase).need) : '',
      prevSimVisivel: simulando,
      prevClima: icone(clima) + ' máx ' + v(Math.max(...clima.temperatura)) + ' °C · mín ' + v(Math.min(...clima.temperatura)) + ' °C · '
        + v(clima.irradiancia.reduce((a, b) => a + b, 0) / 1000) + ' kWh/m² de sol · ' + (chuvaDia > 0.4 ? v(chuvaDia) + ' mm de chuva' : 'sem chuva'),
      prevClimaFonte: 'Open-Meteo, emitida em ' + D.futuro.emitidaEm.slice(8, 10) + '/' + D.futuro.emitidaEm.slice(5, 7) + ' às ' + D.futuro.emitidaEm.slice(11, 13) + 'h'
        + (s.prevTemp ? ' · ' + (s.prevTemp > 0 ? '+' : '−') + Math.abs(s.prevTemp) + ' °C simulados' : ''),
      prevFatores: fx.map(f => {
        const id = f.onde + f.k, ab = s.prevFatorAb === id;
        const ev = f.onde === 'Eletroposto';
        const tot = ev ? B.ev : B.gal;
        const mais = f.kwh >= 0, q = v(Math.abs(f.kwh)) + ' kWh', pc = tot > 0 ? Math.round(Math.abs(f.kwh) / tot * 100) : 0;
        const tmax = Math.max(...clima.temperatura), tN = Math.max(...D.normais.temperatura);
        const irr = clima.irradiancia.reduce((a, b) => a + b, 0) / 1000, irrN = D.normais.irradiancia.reduce((a, b) => a + b, 0) / 1000;
        const quem = ev ? 'as vagas' : 'a galeria';
        const efeito = (mais ? 'O modelo prevê ' + q + ' a mais' : 'O modelo prevê ' + q + ' a menos') + ' para ' + quem + ' (' + pc + '% do dia) por causa disso.';
        const o = {
          temp: [(tmax < tN ? 'Hoje vai fazer menos calor que o normal de outubro' : 'Hoje vai fazer mais calor que o normal de outubro') + ': máxima de ' + v(tmax) + ' °C, contra ' + Math.round(tN) + ' °C típicos.',
            tmax < tN ? 'Com menos calor, a climatização central liga menos estágios de compressor.' : 'Com mais calor, a climatização central liga mais estágios de compressor e trabalha mais horas.'],
          sol: [(irr < irrN ? 'Hoje o céu deve estar mais encoberto que o normal' : 'Hoje o sol deve estar mais forte que o normal') + ': ' + v(irr) + ' kWh/m², contra ' + v(irrN) + ' típicos.',
            'O sol que bate no prédio aquece o ar interno e aumenta o trabalho da climatização.'],
          chuva: ['Previsão de chuva no horário comercial.', 'Com chuva, o movimento da galeria muda e a climatização trabalha menos.'],
          cal: [cal.feriado ? 'Feriado (' + [cal.nome_feriado, cal.data_comercial].filter(Boolean).join(' · ') + '): a galeria abre só das ' + cal.abre + 'h às ' + cal.fecha + 'h, em vez de 10h às 22h.' : 'Data especial no calendário: ' + [cal.data_comercial].filter(Boolean).join('') + '.',
            ev ? 'Com menos horas abertas, há menos tempo para os motoristas recarregarem.' : 'Menos horas abertas significam menos horas de iluminação, escadas rolantes e climatização.'],
          dow: ['Cada dia da semana tem um movimento próprio. ' + rot.longo.replace(/^./, c => c.toUpperCase()) + ' fica ' + (mais ? 'acima' : 'abaixo') + ' da média dos 7 dias.',
            ev ? 'O sábado é o dia de mais recarga; segunda a quinta costumam ser os mais fracos.' : 'O movimento da galeria muda ao longo da semana e o modelo aprendeu esse padrão com o histórico.'],
          clima: ['Clima do dia: máxima de ' + v(tmax) + ' °C e ' + v(irr) + ' kWh/m² de sol, contra ' + Math.round(tN) + ' °C e ' + v(irrN) + ' típicos.',
            'Em dias quentes e de sol, mais gente vai ao shopping climatizado e o desconto solar da tarifa atrai recargas; em dias amenos, menos.'],
          vagas: ['Uma vaga está fora de operação.', 'Com menos vagas, parte de quem chega encontra o eletroposto cheio e vai embora.'],
        }[f.k] || [f.det, ''];
        return {
          onde: f.onde, label: f.label, det: f.det, valor: sinal(f.kwh),
          cor: f.kwh >= 0 ? '#0f7a51' : '#c01b28', barra: (Math.abs(f.kwh) / maxFx * 100).toFixed(0) + '%',
          barraCor: f.kwh >= 0 ? '#9ddcc0' : '#f3b3b9',
          aberto: ab, seta: ab ? '⌃' : '⌄', bg: ab ? '#fff' : 'transparent', borda: ab ? '#e4e5e9' : 'transparent',
          oQue: o[0], porQue: o[1], efeito,
          // gráfico: previsão com o fator × sem o fator, hora a hora
          ...(() => {
            if (!ab || !f.alt) return { grafFator: [], grafVis: false };
            const com = (ev ? B.linhas.map(x => x.ev) : B.linhas.map(x => x.gal));
            const dif = com.map((x, h) => x - f.alt[h]);
            const iMax = dif.reduce((a, x, h) => (Math.abs(x) > Math.abs(dif[a]) ? h : a), 0);
            const hs = dif.map((x, h) => (Math.abs(x) >= Math.abs(dif[iMax]) * 0.5 ? h : -1)).filter(h => h >= 0);
            const hh = (h) => String(h).padStart(2, '0') + 'h';
            return {
              grafVis: true,
              grafFator: this.grafLinhas({ H: 120, topo: 24, base: 104,
                series: [{ vals: com, cor: f.kwh >= 0 ? '#0f7a51' : '#d31e2c' }, { vals: f.alt, cor: '#9aa1ad', pontilhada: true }],
                destaque: { serie: 0, i: iMax, texto: hh(iMax) + ' · ' + (dif[iMax] >= 0 ? '+' : '−') + v(Math.abs(dif[iMax])) + ' kWh' } }),
              grafLegCom: ({ temp: 'com a temperatura prevista', sol: 'com o sol previsto', chuva: 'com a chuva prevista', clima: 'com o clima previsto',
                cal: cal.feriado ? 'com o feriado' : 'com a data especial', dow: 'neste dia da semana', vagas: 'com a vaga parada' })[f.k] || 'com o fator', grafLegSem: f.k === 'dow' ? 'média dos 7 dias' : f.k === 'cal' ? 'num dia comum' : f.k === 'vagas' ? 'com 4 vagas' : 'no normal de outubro',
              grafOnde: 'O efeito se concentra ' + (hs.length > 1 ? 'das ' + hh(hs[0]) + ' às ' + hh(hs[hs.length - 1] + 1) : 'às ' + hh(iMax)) + '.',
            };
          })(),
          comoCalc: 'Como calculamos: o app roda o modelo de novo trocando só ' + (f.k === 'dow' ? 'o dia da semana pela média dos 7 dias' : f.k === 'cal' ? 'o feriado por um dia comum' : f.k === 'vagas' ? 'a vaga parada por uma vaga operando' : 'este fator pelo normal de outubro') + '; a diferença entre as duas previsões é o número ao lado.',
          onPick: () => this.setState(p => ({ prevFatorAb: p.prevFatorAb === id ? null : id })),
        };
      }),
      prevFatoresVazio: fx.length === 0,
      prevPorQueAberto: !!s.prevPorQue,
      prevPorQueBtn: s.prevPorQue ? 'Recolher ⌃' : 'Expandir ⌄',
      prevPorQueSub: fx.length ? fx.length + (fx.length > 1 ? ' fatores' : ' fator') + ' mudam a previsão de hoje · o maior: ' + fx[0].label.toLowerCase() + ' (' + sinal(fx[0].kwh) + ')' : 'dia típico: nenhum fator relevante',
      prevPorQueToggle: () => this.setState(p => ({ prevPorQue: !p.prevPorQue })),
      prevFatoresNota: 'Toque em um fator para ver a explicação. Cada efeito é calculado separadamente pelo próprio modelo, sem regra fixa, por isso os números não se somam exatamente.',
      prevRedePico: v(pr.rede) + ' kW',
      prevRedeNota: 'às ' + pr.h + 'h · galeria ' + v(pr.gal) + ' + vagas ' + v(pr.ev) + ' − solar ' + v(pr.sol) + ' − bateria ' + v(pr.bess) + ' kW',
      prevRedePct: Math.round(pctTeto * 100) + '% do teto',
      prevRedeBarra: Math.min(100, pctTeto * 100).toFixed(0) + '%',
      prevRedeCor: pctTeto > 1 ? '#f5333f' : pctTeto > 0.9 ? '#b97a08' : '#149d68',
      prevRedeChipBg: pctTeto > 1 ? '#fdeaec' : pctTeto > 0.9 ? '#faeed3' : '#dcf3ea',
      prevRedeChipFg: pctTeto > 1 ? '#a3111c' : pctTeto > 0.9 ? '#7a5406' : '#0f5c3f',
      prevTetoTxt: 'Teto operacional ' + v(MLPrev.LIMITE) + ' kW (55 kW contratados − 12%)',
      prevNivelTxt: (() => {
        if (!D.nivelPrevisto || cen.vagas !== D.vagasNaPrevisao || s.prevTemp) return 'Classificador do nível de demanda: disponível só no cenário real.';
        const n = MLPrev.nivelHoras(d);
        return 'Classificador (Random Forest): ' + n.Alta + ' h de demanda Alta e ' + n['Média'] + ' h de Média previstas no dia.';
      })(),
      // ---- semana
      prevSemTotal: kwh(totSem) + ' kWh',
      prevSemDemandas: (() => {
        const card = (alvo, nome, ico, det) => {
          const vals = semana.map(x => (alvo === 'ev' ? x.e : x.g));
          const tot = vals.reduce((a, b) => a + b, 0), iv = MLPrev.iv(alvo).semana_q80_rel;
          const ms = medSemanas(D.historico[alvo === 'ev' ? 'ev' : 'galeria']);
          const iMax = vals.reduce((a, x, i) => (x > vals[a] ? i : a), 0);
          return {
            nome, ico, det, valor: kwh(tot), un: 'kWh',
            faixa: kwh(tot * (1 - iv)) + '–' + kwh(tot * (1 + iv)) + ' kWh',
            pico: 'maior dia: ' + semana[iMax].r.curto.toLowerCase() + ' ' + semana[iMax].r.num + ' · ' + kwh(vals[iMax]) + ' kWh',
            ...pillComp(tot, ms.med),
            ref: ms.med == null ? '' : 'mediana das ' + ms.n + ' últimas semanas: ' + kwh(ms.med) + ' kWh',
          };
        };
        return [card('galeria', 'Galeria', '🏬', 'condomínio · 7 dias'), card('ev', 'Eletroposto', '⚡', cen.vagas + ' vagas · 7 dias')];
      })(),
      prevSemTotalTxt: (() => { const m = medSemanas(D.historico.ev.map((x, i) => (x == null || D.historico.galeria[i] == null ? null : x + D.historico.galeria[i])));
        return 'Total do prédio: ' + kwh(totSem) + ' kWh' + (m.med ? ' · mediana das últimas semanas: ' + kwh(m.med) + ' kWh' : ''); })(),
      prevSemFaixa: 'galeria ' + kwh(SW('gal')) + ' + eletroposto ' + kwh(SW('ev')) + ' kWh · ±' + kwh(faixaNeed(SW('gal'), SW('ev'), 'semana_q80_rel'))
        + ' · semana passada medida: ' + kwh(semPassada) + ' kWh (' + (totSem >= semPassada ? '+' : '−') + v(Math.abs(totSem / semPassada - 1) * 100, 0) + '%)',
      prevSemConsumidores: this.blocosConsumidor(this.porConsumidor(semana.flatMap(x => x.b.linhas)), { gal: 'condomínio · 7 dias', ev: 'recarga dos carros · 7 dias' }),
      prevSemFontes: this.fontesUI([
        { ico: '☀️', label: 'Solar', kwh: kwh(SW('solUso')) + ' kWh', pct: pct(SW('solUso'), totSem), barra: pct(SW('solUso'), totSem), cor: COR.sol, det: 'de ' + kwh(SW('sol')) + ' kWh gerados · ' + kwh(SW('exp')) + ' exportados' },
        { ico: '🔋', label: 'Bateria', kwh: kwh(SW('bat')) + ' kWh', pct: pct(SW('bat'), totSem), barra: pct(SW('bat'), totSem), cor: COR.bat, det: 'na ponta, carregada com sobra solar' },
        { ico: '🔌', label: 'Rede', kwh: kwh(SW('rede')) + ' kWh', pct: pct(SW('rede') - SW('compra'), totSem), barra: pct(SW('rede') - SW('compra'), totSem), cor: COR.rede, det: kwh(SW('redePonta')) + ' kWh na ponta · ' + BRL0(SW('custo')) + ' estimados' },
      ]),
      prevSemTitulo: (() => { const t = SW('need'); return Math.round((SW('solUso') + SW('bat')) / t * 100) + '% da energia da semana vem do sol e da bateria'; })(),
      prevSemSub: 'O restante, ' + kwh(SW('rede')) + ' kWh, vem da rede da Enel · gasto previsto de R$ ' + Math.round(SW('custo')).toLocaleString('pt-BR'),
      prevSemArm: (() => {
        const so = SW('solBat') + SW('exp');
        const cheias = semana.filter(x => x.b.cheiaAs != null).length;
        return so > 0.5 ? '🔋 As baterias enchem com o sol em ' + cheias + ' dos ' + nD + ' dias e devolvem a energia no fim da tarde.' + (SW('exp') > 1 ? ' ' + kwh(SW('exp')) + ' kWh de sol que sobram vão para a rede.' : '') : '';
      })(),
      prevSemShift: econSem > 0
        ? '⇄ Load-shifting recomendado em ' + semana.filter(x => x.ls.length).length + ' dos ' + nD + ' dias: economia estimada de ' + BRL0(econSem) + ' na semana. Toque no dia para ver o plano.'
        : 'Nenhum dia da semana pede load-shifting.',
      ...(() => {
        const ser = [
          { vals: semana.map(x => x.b.need), cor: '#d31e2c', area: true, nome: 'Necessária' },
          { vals: semana.map(x => x.b.solUso + x.b.bat), cor: '#e9a000', pontilhada: true, nome: 'Solar + bateria' },
          { vals: semana.map(x => x.b.rede), cor: '#0f2a47', pontilhada: true, nome: 'Da rede' },
        ];
        const iMax = ser[0].vals.reduce((a, val, i, arr) => (val > arr[a] ? i : a), 0);
        return {
          prevGS: this.grafLinhas({ series: ser, topo: 34, destaque: { serie: 0, i: iMax, texto: semana[iMax].r.curto + ' ' + semana[iMax].r.num + ' · ' + kwh(ser[0].vals[iMax]) + ' kWh' } }),
          prevSemLegendaSer: ser.map(x => ({ label: x.nome, cor: x.cor, estilo: x.pontilhada ? 'dotted' : 'solid' })),
          prevSemDias: semana.map((x, k) => ({
            left: this.grafLinhas({ series: [{ vals: semana.map(() => 1) }] })[0].xs[k],
            label: x.r.rel === 'Hoje' ? 'Hoje' : x.r.curto, marca: x.ls.length ? '⇄' : '',
            bg: x.r.rel === 'Hoje' ? '#d31e2c' : 'transparent', fg: x.r.rel === 'Hoje' ? '#fff' : '#7c8494',
            onPick: () => this.setState({ prevModo: 'dia', prevDia: x.i }),
          })),
          ...(() => { const m = medSemanas(D.historico.ev.map((x, i) => (x == null || D.historico.galeria[i] == null ? null : x + D.historico.galeria[i]))).med || semPassada;
            return { prevSemPill: (totSem >= m ? '+' : '−') + v(Math.abs(totSem / m - 1) * 100, 1) + '%',
              prevSemPillBg: totSem >= m ? '#fdeaec' : '#dcf3ea', prevSemPillFg: totSem >= m ? '#a3111c' : '#0f5c3f' }; })(),
        };
      })(),
      prevSemLinhas: semana.map(x => ({
        dia: (x.r.rel ? x.r.rel + ' · ' : '') + x.r.curto + ' ' + x.r.data,
        clima: icone(x.clima) + ' ' + v(Math.max(...x.clima.temperatura), 0) + '°',
        tag: x.ls.length ? '⇄ shift ' + BRL0(x.econ) : x.cal.nome_feriado ? 'Feriado' : x.cal.data_comercial ? 'Data comercial' : x.cal.dia_semana >= 5 ? 'Fim de semana' : '',
        tagVis: x.ls.length || x.cal.nome_feriado || x.cal.data_comercial || x.cal.dia_semana >= 5 ? 'inline-block' : 'none',
        tagBg: x.ls.length ? '#dcf3ea' : x.cal.nome_feriado ? '#e0f7fc' : '#eceef2', tagFg: x.ls.length ? '#0f5c3f' : x.cal.nome_feriado ? '#006b85' : '#5d6572',
        need: kwh(x.b.need), sub: kwh(x.g) + ' + ' + kwh(x.e),
        renov: kwh(x.b.solUso + x.b.bat), rede: kwh(x.b.rede),
        onPick: () => this.setState({ prevModo: 'dia', prevDia: x.i }),
      })),
      prevSemLegenda: 'kWh por dia · ⇄ = load-shifting recomendado · toque no dia para abrir o plano',
      // ---- alertas
      prevAlertas: alertas.map(a => ({
        titulo: a.titulo, quando: a.quando, resumo: a.resumo, acao: a.acao, botao: a.botao + ' ›',
        aberto: s.prevAlertaAb === a.id, seta: s.prevAlertaAb === a.id ? '⌃' : '⌄',
        onToggle: () => this.setState(p => ({ prevAlertaAb: p.prevAlertaAb === a.id ? null : a.id })),
        cor: this.SEV[a.sev].cor, tagBg: this.SEV[a.sev].tagBg, tagFg: this.SEV[a.sev].tagFg, sevLabel: this.SEV[a.sev].label,
        onPick: () => this.acaoAlertaML(a),
      })),
      prevAlertasVazio: alertas.length === 0,
      prevAlertasSub: alertas.length ? alertas.length + (alertas.length > 1 ? ' alertas' : ' alerta') + ' para os próximos ' + nD + ' dias' : 'nenhum alerta para os próximos ' + nD + ' dias',
      // ---- cenário (o que acontece se…)
      prevTempTxt: (s.prevTemp > 0 ? '+' : s.prevTemp < 0 ? '−' : '') + Math.abs(s.prevTemp || 0) + ' °C',
      prevTempMenos: () => this.setState(p => ({ prevTemp: Math.max(-5, (p.prevTemp || 0) - 1) })),
      prevTempMais: () => this.setState(p => ({ prevTemp: Math.min(5, (p.prevTemp || 0) + 1) })),
      prevVagasTxt: cen.vagas + ' de 4 vagas',
      prevVagasNota: vagasReais < 4 ? (s.prevVagasSim === 4 ? 'simulando a Vaga 03 reparada' : 'Vaga 03 em falha agora') : 'todas operando agora',
      prevVagasBtn: vagasReais < 4 ? (s.prevVagasSim === 4 ? 'Voltar ao estado real' : 'Simular 4 vagas') : (s.prevVagasSim === 3 ? 'Voltar ao estado real' : 'Simular 1 vaga parada'),
      prevVagasToggle: () => this.setState(p => ({ prevVagasSim: p.prevVagasSim != null ? null : (vagasReais < 4 ? 4 : 3) })),
      prevCenarioReset: () => this.setState({ prevTemp: 0, prevVagasSim: null }),
      prevCenarioNota: simulando
        ? 'No cenário, ' + rot.longo + ' fica com ' + sinal(MLPrev.preverDia('ev', d, cen).total - MLPrev.preverDia('ev', d, cenBase).total) + ' nas vagas e '
          + sinal(MLPrev.preverDia('galeria', d, cen).total - MLPrev.preverDia('galeria', d, cenBase).total) + ' na galeria.'
        : 'Mude a temperatura ou as vagas para ver o modelo recalcular aqui mesmo, sem servidor.',
      // ---- como o modelo foi avaliado
      prevMetDia: v(mDia.erro_dia_pct) + '%', prevMetDiaBase: v(mBase.erro_dia_pct) + '%',
      prevMetSem: v(mDia.erro_semana_pct) + '%', prevMetSemBase: v(mBase.erro_semana_pct) + '%',
      prevMetFeriadoLabel: 'R² por hora',
      prevMetFeriado: v(mDia.r2_hora, alvo === 'ev' ? 2 : 3) + ' vs ' + v(mBase.r2_hora, alvo === 'ev' ? 2 : 3),
      prevMetNota: alvo === 'ev'
        ? 'Com cerca de ' + Math.round(D.sessoesDia) + ' sessões por dia, o acaso das chegadas domina. O Random Forest prevê o formato do dia (hora, dia da semana, clima e calendário) em relação ao nível recente e explica ' + v(mDia.r2_hora * 100, 0) + '% da variação hora a hora (R² ' + v(mDia.r2_hora, 2) + ', contra ' + v(mBase.r2_hora, 2) + ' da média simples). No total de um dia erra ' + v(mDia.erro_dia_pct, 0) + '%; na soma da semana, a média simples das 4 semanas ainda é melhor (' + v(mBase.erro_semana_pct, 0) + '% contra ' + v(mDia.erro_semana_pct, 0) + '%).'
        : 'O consumo da edificação é dominado pelo horário de funcionamento e pela temperatura. O Random Forest explica ' + v(mDia.r2_hora * 100, 0) + '% da variação hora a hora (R² ' + v(mDia.r2_hora, 3) + ') e erra ' + v(mDia.erro_dia_pct) + '% no total do dia, contra ' + v(mBase.erro_dia_pct) + '% da média das 4 semanas.',
      ...(() => {
        const n = bt.datas.length, ult = n - 1;
        const erro = Math.abs(bt.previsto[ult] - bt.real[ult]) / Math.max(1, bt.real[ult]) * 100;
        return {
          prevGB: this.grafLinhas({ H: 130, topo: 34, base: 112, minY: Math.min(...bt.real, ...bt.previsto) * 0.85,
            series: [{ vals: bt.real, cor: '#0f2a47', area: true, nome: 'Medido' }, { vals: bt.previsto, cor: '#d31e2c', pontilhada: true, nome: 'Previsto' }],
            destaque: { serie: 1, i: ult, texto: 'previsto ' + kwh(bt.previsto[ult]) + ' · medido ' + kwh(bt.real[ult]) } }),
          prevBtLbl: [bt.datas[0], bt.datas[Math.round(ult / 2)], bt.datas[ult]].map(dt => dt.slice(8, 10) + '/' + dt.slice(5, 7)),
          prevBtPill: 'erro no dia ' + v(mDia.erro_dia_pct) + '%',
        };
      })(),
      prevImportancia: imp.map(([k, val]) => ({ label: k, pct: v(val, val < 10 ? 1 : 0) + '%', barra: Math.max(2, val / imp[0][1] * 100).toFixed(0) + '%' })),
      prevModeloRodape: 'Random Forest (scikit-learn) com ' + D.modelos[alvo].n_arvores + ' árvores de profundidade até ' + D.modelos[alvo].profundidade_max + ', treinado com '
        + D.modelos[alvo].n_treino.toLocaleString('pt-BR') + ' horas de MeterValues OCPP e smart meter GoodWe (jan/2025 a out/2026, base simulada). Avaliação como na aula: divisão temporal 80/20, sem embaralhar ('
        + met.avaliacao.replace('divisão temporal 80/20 ', '') + '). Comparado com Regressão Linear e KNN no notebook inteligencia/ChargeGrid_ML.ipynb. A inferência roda no app.',
      // ---- card do Início
      dashPrevQuando: (MLPrev.rotuloDia(0).rel || MLPrev.rotuloDia(0).curto) + ' · ' + MLPrev.rotuloDia(0).data,
      ...(() => {
        const b0 = MLPrev.balanco(0, cenBase);
        return {
          dashPrevNeed: kwh(b0.need) + ' kWh',
          dashPrevNeedSub: 'galeria ' + kwh(b0.gal) + ' + vagas ' + kwh(b0.ev),
          dashPrevRede: kwh(b0.rede) + ' kWh',
          dashPrevRedeSub: pct(b0.solUso + b0.bat, b0.need) + ' solar',
        };
      })(),
      dashPrevAlerta: alertas.length ? alertas[0].titulo : 'Nenhum alerta para a semana',
      dashPrevAlertaCor: alertas.length && alertas[0].sev !== 'info' ? '#ffd27a' : '#9dff33',
      dashPrevAlertaIco: alertas.length && alertas[0].sev !== 'info' ? '⚠' : '✓',
      dashPrevNAlertas: alertas.length > 1 ? '+' + (alertas.length - 1) : '',
      dashPrevAlertasN: alertas.length ? alertas.length + (alertas.length > 1 ? ' alertas' : ' alerta') : 'sem alertas',
      // ---- Síndico: abertura com a previsão
      sindicoPrevLinha: 'Previsão para ' + (MLPrev.rotuloDia(0).rel ? MLPrev.rotuloDia(0).rel.toLowerCase() : MLPrev.rotuloDia(0).longo) + ': '
        + kwh(evHoje.total + galHoje.total) + ' kWh necessários (' + kwh(galHoje.total) + ' na galeria e ' + kwh(evHoje.total) + ' nas vagas), '
        + kwh(MLPrev.balanco(0, cenBase).rede) + ' kWh vindos da rede.'
        + (alertas.filter(a => a.sev !== 'info').length ? ' Atenção: ' + alertas.filter(a => a.sev !== 'info').map(a => a.titulo.charAt(0).toLowerCase() + a.titulo.slice(1)).join('; ') + '.' : ''),
    };
  };

  // endpoint da Edge Function supabase/functions/assistente (prop iaModo = api)
  IA_ENDPOINT = 'https://nnxcuagbvgfuuxmozvcd.supabase.co/functions/v1/assistente';
  // chave pública (anon) do projeto Supabase: pode ficar no app; a service_role e a chave da OpenAI nunca
  IA_ANON_KEY = '<anon-key>';

  // números que as ferramentas do agente consultam (o LLM não inventa nenhum)
  snapshotIA = (papel) => {
    const s = this.state;
    if (papel === 'sindico') {
      const site = s.siteSel || 'pn';
      const cs = s.chargers.filter(c => c.site === site);
      const dlm = this.dlmAgora();
      const dia = cs.reduce((t, c) => t + (c.hoje || 0) * (c.preco || 0), 0);
      return SnapshotIA.sindico(MLPrev, this.cenarioML(), {
        vagas: cs.map(c => ({ vaga: c.nome, status: c.status, kw: c.kw || 0, kwh_hoje: c.hoje || 0, erro: c.erro || null })),
        dlm: { contratada_kw: dlm.contratada, teto_vagas_kw: dlm.teto, por_vaga_kw: dlm.porVaga, vagas_em_carga: dlm.n },
        tarifa: { base_rs_kwh: (s.baseSites || {})[site] ?? 2.49, fator_alfa: Math.round(this.alfa() * 100) / 100, horario_ponta_ativo: !!s.ponta, ceu: this.solarTexto() },
        hoje: { sessoes: cs.filter(c => (c.hoje || 0) > 0).length, kwh_entregues: Math.round(cs.reduce((t, c) => t + (c.hoje || 0), 0) * 10) / 10, faturado_rs: Math.round(dia * 100) / 100, vagas_carregando: cs.filter(c => c.status === 'carregando').length, vagas_em_falha: cs.filter(c => c.status === 'falha').map(c => c.nome) },
        faturamento: { hoje_bruto_rs: Math.round(dia * 100) / 100, mes_bruto_rs: Math.round(dia * 26), taxa_plataforma: '10%', mes_repasse_rs: Math.round(dia * 26 * 0.9), kwh_hoje: Math.round(cs.reduce((t, c) => t + (c.hoje || 0), 0) * 10) / 10 },
      });
    }
    return SnapshotIA.motorista({
      bateria_pct: s.pctIni, capacidade_kwh: this.cap(), potencia_kw: 7, preco_casa_rs_kwh: s.precoAnf,
      eletropostos: SPOTS.map(p => ({ nome: p.nome, distancia: p.dist, tempo_ate_la: p.eta, vagas_livres: p.livres, vagas: p.vagas, status: p.status, tarifa_rs_kwh: p.preco })),
      pagamento: { metodos: ['Pix', 'cartão', 'créditos da carteira'], saldo_creditos_rs: s.saldo, pre_autorizacao: 'cartão reserva a estimativa e captura só os kWh entregues; Pix cobra a estimativa e estorna a sobra na hora', ociosidade: { tolerancia_min: 10, rs_por_min: 0.9 } },
      historico_mes: { kwh: 125.7, gasto_eletropostos_rs: 55.44, recargas_eletroposto: 2, recargas_casa: 4 },
    });
  };

  // envia a pergunta ao assistente (Edge Function ou regras locais) e mostra "digitando"
  perguntarIA = (papel, chave, campo, q, local) => {
    AssistenteIA.configurar({ modo: this.props.iaModo === 'api' ? 'api' : 'sandbox', endpoint: this.IA_ENDPOINT, token: this.IA_ANON_KEY });
    const pend = { who: 'ai', text: '•••', pend: true };
    this.setState(p => ({ [chave]: [...p[chave], { who: 'me', text: q }, pend], [campo]: '' }));
    AssistenteIA.perguntar({ papel, pergunta: q, snapshot: this.snapshotIA(papel), local }).then(r => {
      const meta = r.origem === 'api'
        ? 'IA' + (r.ferramentas && r.ferramentas.length ? ' · consultou ' + Array.from(new Set(r.ferramentas)).map(f => f.replace(/^consultar_|^avaliar_|^estimar_/, '').replace(/_/g, ' ')).join(', ') : '') + (r.fontes && r.fontes.length ? ' · ' + r.fontes.length + ' documento(s)' : '')
        : (r.aviso || '');
      this.setState(p => ({ [chave]: p[chave].filter(m => m !== pend).concat({ who: 'ai', text: r.resposta, meta }) }));
    });
  };

  askIA = (q) => {
    const s = this.state;
    const preco = this.spot().preco;
    const respostas = {
      'Onde carrego mais barato agora?':
        'Pátio Norte está a ' + BRL(preco) + '/kWh e é a mais próxima. A Aurora está mais caro por causa do horário de ponta. Se puder esperar até as 22h, em casa sai por ' + BRL(s.precoAnf) + '.',
      'Quanto custa completar a bateria?':
        'Da carga atual até 100% faltam ' + ((100 - s.pctIni) / 100 * this.cap()).toFixed(1).replace('.', ',') + ' kWh, cerca de ' + BRL((100 - s.pctIni) / 100 * this.cap() * preco) + ' na tarifa de agora.',
      'Vale carregar em casa ou no eletroposto?':
        'Em casa, à noite, sai por ' + BRL(s.precoAnf) + '/kWh com boa parte vinda do seu solar. No eletroposto agora está ' + BRL(preco) + '. Só compensa carregar fora se a sua rotina não esperar até a noite.',
    };
    const livre = (t) => {
      const x = t.toLowerCase();
      if (/pre[çc]o|tarifa|custa|quanto/.test(x)) return 'A Pátio Norte está a ' + BRL(preco) + '/kWh agora. Completar sua bateria de ' + s.pctIni + '% até 100% sai por cerca de ' + BRL((100 - s.pctIni) / 100 * this.cap() * preco) + '.';
      if (/casa|noite|solar/.test(x)) return 'Em casa, à noite, sai por ' + BRL(s.precoAnf) + '/kWh com boa parte vinda do seu solar — compensa se a rotina esperar até as 22h.';
      if (/perto|pr[óo]xim|onde|rota|caminho/.test(x)) return 'O eletroposto mais próximo com vaga livre é a Galeria Pátio Norte, a 6 min. Toque em Ir até lá para abrir a rota.';
      if (/tempo|demora|minutos|horas/.test(x)) return 'A 7 kW, completar de ' + s.pctIni + '% a 100% leva cerca de ' + this.fmtMin((100 - s.pctIni) / 100 * this.cap() / 7 * 3600) + '.';
      if (/ociosidade|taxa|multa/.test(x)) return 'Depois de 10 minutos do fim da recarga começa a taxa de ociosidade, avisada na tela de pagamento. Retire o carro ou a vaga fica bloqueada para outros.';
      if (/hist[óo]rico|gastei|m[êe]s/.test(x)) return 'Seu histórico completo, separado por eletroposto e casa, fica na aba Carga. Este mês você recarregou principalmente à noite em casa.';
      return 'Posso ajudar com preço, rota, tempo de recarga, taxa de ociosidade e histórico. Tente perguntar, por exemplo, "quanto custa completar?".';
    };
    this.perguntarIA('motorista', 'chatIA', 'perguntaIA', q, () => respostas[q] || livre(q));
  };

  agoraFmt = () => {
    const d = new Date();
    const p = (v) => String(v).padStart(2, '0');
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' · ' + p(d.getHours()) + ':' + p(d.getMinutes());
  };

  say = (msg) => {
    this.setState({ toast: msg });
    clearTimeout(this._t);
    this._t = setTimeout(() => this.setState({ toast: null }), 2800);
  };

  spot = () => SPOTS.find(s => s.id === this.state.spotId) || SPOTS[0];
  cap = () => 60;
  KM_KWH = 0.17;

  HORARIO_PADRAO = {
    pre: { ini: '06:00', fim: '09:00' },
    oper: { ini: '09:00', fim: '17:00' },
    not: { ini: '17:00', fim: '22:00' },
    ep: { ini: '10:00', fim: '21:00' },
  };

  DATAS_PADRAO = { ini: '2026-09-21', fim: '2026-09-25', motivo: 'Obra civil no estacionamento', ativo: false };

  spotsFiltrados = (s) => {
    const q = (s.busca || '').trim().toLowerCase();
    return SPOTS
      .filter(p => s.mapFilter === 'Livres agora' ? p.status === 'livre' : s.mapFilter === 'Favoritos' ? s.fav.indexOf(p.id) > -1 : true)
      .filter(p => !q || [p.nome, p.endereco, p.bairro, p.dist].some(v => String(v || '').toLowerCase().indexOf(q) > -1));
  };

  FECHAR_PADRAO = { modo: 'periodo', ini: '12:00', fim: '14:00', motivo: 'Manutenção elétrica', ativo: false };

  epAberto = (s) => {
    const cfg = (s && s.horarioCfg) || this.HORARIO_PADRAO;
    const min = (t) => { const p = String(t || '').split(':'); return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0); };
    const d = new Date(), agora = d.getHours() * 60 + d.getMinutes();
    const dentro = (i, f) => { const a = min(i), b = min(f); return a <= b ? agora >= a && agora < b : agora >= a || agora < b; };
    const bloq = (s && s.epFechar) || this.FECHAR_PADRAO;
    if (bloq.ativo && (bloq.modo === 'dia' || dentro(bloq.ini, bloq.fim))) return false;
    return dentro(cfg.ep.ini, cfg.ep.fim);
  };

  metaKwh = () => {
    const s = this.state;
    const modo = s.modo;
    const bruto = modo === 'km' ? (s.metaKm || 0) * this.KM_KWH
      : modo === 'kwh' ? (s.metaKwhDireto || 0)
      : modo === 'min' ? (s.metaMin || 0) / 60 * KW
      : 0;
    const teto = (100 - s.pctIni) / 100 * this.cap();
    return Math.max(0, Math.min(bruto, teto));
  };

  tick = () => {
    // a recarga inteira, qualquer que seja a meta, dura ~duracaoDemo segundos
    // reais na demonstração — a banca não espera as horas da carga simulada
    const dur = this.props.duracaoDemo ?? 10;
    this.setState(p => {
      if (!p.sess) return {};
      const speed = (p.sess.metaKwh / KW) * 3600 / dur;
      const dt = speed / 3600;
      const kwh = Math.min(p.sess.kwh + KW * dt, p.sess.metaKwh);
      const elapsed = p.sess.elapsed + speed;
      const done = kwh >= p.sess.metaKwh - 0.001;
      if (done) clearInterval(this._iv);
      return { sess: { ...p.sess, kwh, elapsed }, running: !done };
    }, () => { if (!this.state.running) this.hwIdle(); });  // meta atingida com cabo encaixado = âmbar
  };

  // endpoint da Edge Function supabase/functions/pagamentos (modo "api")
  PAG_ENDPOINT = 'https://nnxcuagbvgfuuxmozvcd.supabase.co/functions/v1/pagamentos';

  startSession = () => {
    const s = this.spot();
    const meta = this.metaKwh();
    if (meta <= 0.05) {
      this.say('Defina uma meta acima dos ' + this.state.pctIni + '% atuais para liberar a carga.');
      return;
    }
    // com o carregador físico na mesa (e respondendo), o cabo precisa estar no carro
    if (this.props.hardwareFisico !== false && this.state.hwOnline && !this.state.plugged) {
      this.say('Conecte o cabo no carro — aperte o botão do carregador — para liberar a carga.');
      return;
    }
    if (this.state.pay && (this.state.pay.fase === 'autorizando' || this.state.pay.fase === 'pix')) return;
    // 1) pré-autoriza na API de pagamento; 2) só então libera a energia
    Pagamentos.configurar({ modo: this.props.pagamentoModo === 'api' ? 'api' : 'sandbox', endpoint: this.PAG_ENDPOINT, token: this.IA_ANON_KEY });
    const metodo = this.state.method || 'pix';
    const valor = Math.round(meta * s.preco * 100) / 100;
    this.setState({ pay: { fase: 'autorizando', metodo, valor } });
    Pagamentos.autorizar({ metodo, valor, saldo: this.state.saldo })
      .then(r => {
        if (r.status === 'pending' && r.pix) {
          this.setState({ pay: { fase: 'pix', metodo, valor, id: r.id, pix: r.pix } });
          this.esperarPix(r.id, meta, s);
        } else {
          this.iniciarCarga(meta, s, r);
        }
      })
      .catch(e => { this.setState({ pay: { fase: 'erro', metodo, valor, erro: e.message } }); this.say(e.message); });
  };

  esperarPix = (id, meta, s) => {
    clearInterval(this._pixIv);
    this._pixIv = setInterval(() => {
      if (!this.state.pay || this.state.pay.id !== id) { clearInterval(this._pixIv); return; }
      Pagamentos.consultar(id).then(r => {
        if (r.status === 'approved') { clearInterval(this._pixIv); this.say('Pix aprovado. Carga liberada.'); this.iniciarCarga(meta, s, r); }
      }).catch(() => {});
    }, 1000);
  };

  cancelarPagamento = () => {
    const p = this.state.pay;
    clearInterval(this._pixIv);
    if (p && p.id) Pagamentos.cancelar(p.id).catch(() => {});
    this.setState({ pay: null });
  };

  iniciarCarga = (meta, s, autorizacao) => {
    this.setState({
      pay: null,
      sess: { kwh: 0, elapsed: 0, tarifa: s.preco, metaKwh: meta, preauth: autorizacao.valor_autorizado, spot: s.nome, pagId: autorizacao.id, pagStatus: autorizacao.status_detail },
      running: true, interrupted: false, screen: 'live', tab: 'carga', receipt: null, stars: 0,
    });
    clearInterval(this._iv);
    this._iv = setInterval(this.tick, 1000);
    this.hwSet('carregando');
  };

  // plugue desconectado no meio da carga: pausa a medição, não cobra nada a
  // mais e deixa o motorista escolher entre reconectar ou encerrar de vez
  interruptSession = () => {
    if (!this.state.running) return;
    clearInterval(this._iv);
    this.setState({ running: false, interrupted: true, plugged: false, screen: 'live', tab: 'carga' });
    this.hwSet('interrompido');
  };

  resumeSession = () => {
    if (!this.state.sess || !this.state.interrupted) return;
    this.setState({ running: true, interrupted: false, plugged: true });
    clearInterval(this._iv);
    this._iv = setInterval(this.tick, 1000);
    this.hwSet('carregando');
  };

  // pluggedNow: estado do cabo APÓS o encerramento (false quando veio do
  // desencaixe físico; sem argumento — botão da tela — o cabo segue como está)
  finishSession = (pluggedNow) => {
    clearInterval(this._iv);
    const s = this.state.sess;
    if (!s) return;
    const total = s.kwh * s.tarifa;
    const pago = this.state.method === 'creditos';
    const plugged = (typeof pluggedNow === 'boolean') ? pluggedNow : this.state.plugged;
    this.setState(p => ({
      receipt: { kwh: s.kwh, tarifa: s.tarifa, total, elapsed: s.elapsed, preauth: s.preauth, metodo: p.method, spot: s.spot, pagId: s.pagId, captura: 'processando' },
      sess: null, running: false, interrupted: false, plugged, screen: 'receipt',
      saldo: pago ? Math.max(0, p.saldo - total) : p.saldo,
    }));
    this.hwIdle(plugged);  // cabo ainda encaixado = âmbar; cabo fora = azul
    // captura só os kWh entregues (cartão: captura parcial; Pix: estorna a sobra)
    if (s.pagId) {
      Pagamentos.capturar({ id: s.pagId, valor_final: total })
        .then(r => this.setState(p => p.receipt && p.receipt.pagId === s.pagId
          ? { receipt: { ...p.receipt, captura: 'ok', capturado: r.valor_capturado, liberado: r.liberado, split: r.split, pagStatus: r.status_detail } } : {}))
        .catch(e => this.setState(p => p.receipt ? { receipt: { ...p.receipt, captura: 'erro', erro: e.message } } : {}));
    }
  };

  chatIARef = React.createRef();
  chatRef = React.createRef();
  componentDidUpdate() {
    const rolar = (r) => { if (r.current) r.current.scrollTop = r.current.scrollHeight; };
    const nIA = (this.state.chatIA || []).length, nCh = (this.state.chat || []).length;
    if (nIA !== this._lenChatIA) { this._lenChatIA = nIA; rolar(this.chatIARef); }
    if (nCh !== this._lenChat) { this._lenChat = nCh; rolar(this.chatRef); }
  }

  fmtMin = (sec) => {
    const m = Math.round(sec / 60);
    return m >= 60 ? Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0') : m + ' min';
  };

  nivelSolar = () => {
    const ceu = this.state.ceu || 'parcial';
    return ceu === 'limpo' ? 'alto' : ceu === 'parcial' ? 'medio' : ceu === 'noite' ? 'noite' : 'baixo';
  };

  solarTexto = () => {
    const n = this.nivelSolar();
    return n === 'alto' ? 'excedente solar alto (−12%)'
      : n === 'medio' ? 'solar moderado (0%)'
      : n === 'noite' ? 'sem geração à noite (0%)'
      : 'solar baixo (+4%)';
  };

  alfa = () => {
    const n = this.nivelSolar();
    let a = 1;
    if (n === 'alto') a -= 0.12; else if (n === 'baixo') a += 0.04;
    if (this.state.ponta) a += 0.18;
    return a;
  };

  dlmAgora = () => {
    const s = this.state;
    const CONTRATADA = 55;
    const PERC = { 6: .02, 7: .025, 8: .03, 9: .04, 10: .05, 11: .055, 12: .06, 13: .06, 14: .06, 15: .06, 16: .055, 17: .055, 18: .05, 19: .045, 20: .04, 21: .035, 22: .03 };
    const soma = Object.keys(PERC).reduce((t, k) => t + PERC[k], 0);
    const diario = 2400 * 60 / 365;
    const picoMes = diario * (Math.max(...Object.keys(PERC).map(k => PERC[k])) / soma) * 1.18;
    const teto = Math.max(0, CONTRATADA - picoMes - CONTRATADA * 0.12);
    const emCarga = s.chargers.filter(c => c.site === (s.siteSel || 'pn') && c.status === 'carregando');
    const porVaga = emCarga.length ? Math.min(7, Math.floor((teto * 0.96 / emCarga.length) * 10) / 10) : 0;
    const n1 = (v) => v.toFixed(1).replace('.', ',');
    return { contratada: CONTRATADA, teto: n1(teto), n: emCarga.length, porVaga: n1(porVaga) };
  };

  ask = (q) => {
    const answers = {
      'Por que a vaga 02 está limitada?': (() => {
        const d = this.dlmAgora();
        const v2 = this.state.chargers.find(c => c.id === 'c2');
        if (!v2 || v2.status !== 'carregando') return 'A vaga 02 está ' + (v2 && v2.status === 'falha' ? 'em falha' : 'livre') + ' agora, sem alocação. O teto para as vagas é de ' + d.teto + ' kW: ' + d.contratada + ' kW contratados menos o pico da edificação e a margem de segurança.';
        return 'Porque o medidor inteligente lê ' + d.teto + ' kW disponíveis para as vagas (' + d.contratada + ' kW contratados menos pico da edificação e margem) e o DLM divide igualmente entre as ' + d.n + ' em carga — ' + d.porVaga + ' kW cada. Os 7 kW plenos voltam quando uma vaga encerrar ou a edificação reduzir.';
      })(),
      'Vale a pena subir a tarifa hoje?': (() => {
        // ocupação prevista pelo modelo de ML (kWh previstos ÷ capacidade das vagas abertas)
        const cen = this.cenarioML(), cal = MLPrev.D.calendario[0];
        const ev = MLPrev.preverDia('ev', 0, cen).horas;
        const cap = Math.max(1, cen.vagas) * 7;
        const abertas = ev.filter((v, h) => h >= cal.ep_abre && h < cal.ep_fecha);
        const ocup = Math.round(abertas.reduce((a, b) => a + b, 0) / (abertas.length * cap) * 100);
        const cheias = ev.map((v, h) => (v >= cap * 0.85 ? h : -1)).filter(h => h >= 0);
        if (cheias.length >= 2) return 'Só numa faixa. A ocupação prevista para hoje é ' + ocup + '%, mas das ' + cheias[0] + 'h às ' + (cheias[cheias.length - 1] + 1) + 'h a procura passa de 85% das vagas. Subir 5% a 8% ali espalha as chegadas; no resto do dia a base atual atrai mais sessões.';
        return 'Não. A ocupação prevista para hoje é ' + ocup + '%, sem faixa acima de 85% das vagas. Subir a base agora reduz sessões sem ganho líquido — o fator α já aplica +18% no horário de ponta.';
      })(),
      'Como fechou o mês?': (() => {
        const st = this.state;
        const dia = st.chargers.reduce((t, c) => t + (c.hoje || 0) * (c.preco || 0), 0);
        const kwh = st.chargers.reduce((t, c) => t + (c.hoje || 0), 0) * 26;
        const sess = st.chargers.filter(c => (c.hoje || 0) > 0).length * 26;
        return 'Setembro está em ' + BRL(dia * 26) + ' brutos e ' + BRL(dia * 26 * 0.9) + ' de repasse após a taxa de 10%. São '
          + kwh.toFixed(0) + ' kWh em ' + sess + ' sessões, ticket médio de ' + BRL(dia * 26 / sess) + '.';
      })(),
    };
    const livre = (t) => {
      const x = t.toLowerCase();
      if (/rede|ponta|load|compra|barato/.test(x)) return 'Na ponta a rede custa R$ 1,50/kWh contra R$ 0,85 fora de ponta. Quando a previsão indica que a bateria não cobre o pico, recomendo comprar às 3h e devolver pela bateria às 18h — a economia estimada está no card Orientação do Síndico.';
      if (/vaga|limit|dlm|pot[êe]ncia/.test(x)) return answers['Por que a vaga 02 está limitada?'];
      if (/bateria|bess|descarga/.test(x)) return 'A bateria armazena o excedente solar entre 10h e 16h e devolve na faixa de ponta, das 17h às 18h. O estado de carga atual e o ciclo do dia estão no Painel, em Carregamento e descarregamento.';
      if (/tarifa|pre[çc]o|subir|cobrar/.test(x)) return answers['Vale a pena subir a tarifa hoje?'];
      if (/m[êe]s|fatur|receita|repasse/.test(x)) return answers['Como fechou o mês?'];
      if (/carga/.test(x)) return 'A bateria armazena o excedente solar entre 10h e 16h e devolve na faixa de ponta, das 17h às 18h. O estado de carga atual e o ciclo do dia estão no Painel, em Carregamento e descarregamento.';
      if (/falha|erro|ocpp|reset/.test(x)) return 'A Vaga 03 está sem resposta Modbus há 12 min (erro 2091). Está despublicada do mapa e fora da alocação do DLM. Você pode reiniciar remotamente em Vagas e falhas.';
      if (/(mais|maior|pico).*(carregamento|recarga|carga|consumo|movimento)|hor[áa]rio.*(mais|pico|cheio)|teve mais/.test(x)) {
        const hi = SnapshotIA.historico(MLPrev);
        const ev = hi.eletroposto_horas_mais_carregamento, gl = hi.galeria_horas_mais_consumo;
        return 'No histórico medido (' + hi.periodo + '), o eletroposto carrega mais às ' + ev.map(e => e.hora + ' (' + MLPrev.virg(e.kwh_medio) + ' kWh em média)').join(', ')
          + '. A galeria consome mais às ' + gl.map(e => e.hora).join(', ') + '. A previsão hora a hora dos próximos dias está na tela Previsão.';
      }
      if (/resumo|hoje|como (est[áa]|foi) (o )?dia|status/.test(x)) {
        const st = this.state, cs = st.chargers.filter(c => c.site === (st.siteSel || 'pn'));
        const kwhH = cs.reduce((t, c) => t + (c.hoje || 0), 0), fat = cs.reduce((t, c) => t + (c.hoje || 0) * (c.preco || 0), 0);
        const falha = cs.filter(c => c.status === 'falha').map(c => c.nome);
        const b = MLPrev.balanco(0, this.cenarioML());
        return 'Hoje até agora: ' + cs.filter(c => (c.hoje || 0) > 0).length + ' sessões, ' + MLPrev.virg(kwhH) + ' kWh entregues e ' + BRL(fat) + ' faturados. '
          + cs.filter(c => c.status === 'carregando').length + ' vagas carregando' + (falha.length ? ' e ' + falha.join(', ') + ' em falha' : '') + '. '
          + 'Para o dia todo o modelo prevê ' + Math.round(b.need) + ' kWh de consumo, ' + Math.round(b.solUso) + ' kWh do sol e ' + Math.round(b.rede) + ' kWh da rede.';
      }
      if (/hor[áa]rio|abre|fecha|funcionamento/.test(x)) return 'O eletroposto opera das 10h às 21h; fora dessa janela o OCPP bloqueia novas sessões e as em andamento seguem até o fim. Ajuste em Horário de operação.';
      if (/solar|gera[çc][ãa]o|placa/.test(x)) return 'Hoje a geração soma cobertura, fachada BIPV e carport, com 80% destinada às vagas e 20% à edificação pelo rateio. Os valores hora a hora estão no Painel.';
      return 'Posso responder sobre vagas e DLM, tarifa, faturamento, bateria, compra da rede, falhas OCPP, horário de operação e geração solar. Pergunte à vontade.';
    };
    this.perguntarIA('sindico', 'chat', 'perguntaSind', q, () => answers[q] || this.respostaML(q) || livre(q));
  };

  bump = (key, d, min, max) => this.setState(p => ({ [key]: Math.min(max, Math.max(min, p[key] + d)) }));

  viab = () => {
    const s = this.state;
    const AREA_PLACA = 2.256, WP = 450, PR = 0.72, KW_VAGA = 7, BAT_M2 = 1.6, BAT_KWH = 15;
    const FATOR = { roof: 1, facade: 0.55, carport: 0.9 };
    const GER_BASE = [0.5, 1.2, 2.0, 2.8, 2.5, 3.8, 4.5, 4.8, 4.7, 4.2, 3.2, 1.8, 0.5, 0, 0, 0, 0];
    const PERC_BASE = { 6: .02, 7: .025, 8: .03, 9: .04, 10: .05, 11: .055, 12: .06, 13: .06, 14: .06, 15: .06, 16: .055, 17: .055, 18: .05, 19: .045, 20: .04, 21: .035, 22: .03 };
    const SOMA_PERC = Object.keys(PERC_BASE).reduce((t, k) => t + PERC_BASE[k], 0);
    const PERC = {};
    Object.keys(PERC_BASE).forEach(k => { PERC[k] = PERC_BASE[k] / SOMA_PERC; });
    const OCUP = { 10: .5, 11: .75, 12: .75, 13: 1, 14: 1, 15: .75, 16: .25, 17: .5, 18: 1, 19: 1, 20: .75, 21: .5, 22: .5 };

    const fontes = Object.keys(FATOR).map(k => {
      const area = s.fontes[k].sel ? s.fontes[k].area : 0;
      const placas = Math.floor(area / AREA_PLACA);
      const kwp = placas * WP / 1000;
      return { k, area, placas, kwp, kwpEf: kwp * FATOR[k] };
    });
    const placas = fontes.reduce((t, f) => t + f.placas, 0);
    const kwp = fontes.reduce((t, f) => t + f.kwp, 0);
    const kwpEf = fontes.reduce((t, f) => t + f.kwpEf, 0);
    const pico = kwpEf * PR;
    // mesmas regras do simulador do gestor: irradiação de São Paulo (média mensal da base),
    // % do sol para o eletroposto (sugestão 80%), baterias em módulos adequados à área solar
    // e eficiência energética reduzindo a climatização (~45% do consumo da galeria)
    const HSP_MES = [6.78, 6.31, 5.50, 5.15, 4.28, 4.11, 4.32, 5.25, 6.11, 6.74, 6.13, 6.22];
    const HSP_ANO = HSP_MES.reduce((a, b) => a + b, 0) / 12, mesMin = HSP_MES.indexOf(Math.min(...HSP_MES));
    const hsp = s.viabHsp === 'min' ? HSP_MES[mesMin] : HSP_ANO;
    const eDia = kwpEf * hsp * PR;
    const evPct = s.viabEvPct != null ? s.viabEvPct : 80;
    const efPct = s.viabEfPct != null ? s.viabEfPct : 0;
    const consumoBase = s.metragem * 60 / 365;
    const econEf = consumoBase * 0.45 * efPct / 100;
    const solLiberado = Math.min(econEf * 0.7, eDia * (1 - evPct / 100));
    const maxVagas = Math.floor((eDia * evPct / 100 + solLiberado) / (KW_VAGA * HSP_ANO));
    const modRec = Math.max(0, Math.round(kwp * 0.5 / BAT_KWH));
    const baterias = s.viabMod != null ? s.viabMod : modRec;
    const capBat = baterias * BAT_KWH;
    const consumoGaleriaDia = consumoBase - econEf;
    const SOMA_GER = GER_BASE.reduce((a, b) => a + b, 0);
    const vagas = Math.min(s.vagasDesejadas, 12);
    const bandas = { fora: s.tarifaBase, inter: s.tarifaBase * 1.18, ponta: s.tarifaBase * 1.76 };

    let carga = 10;
    const horas = [];
    let gerado = 0, evTotal = 0, galeriaTotal = 0, redeTotal = 0, custo = 0, armazenado = 0, usado = 0;

    for (let h = 6; h <= 22; h++) {
      const solar = GER_BASE[h - 6] / SOMA_GER * eDia;
      const galeria = consumoGaleriaDia * (PERC[h] || 0);
      const carros = Math.round((OCUP[h] || 0) * vagas);
      const demandaEv = carros * KW_VAGA;
      const tarifa = h >= 17 ? bandas.ponta : h >= 10 ? bandas.inter : bandas.fora;
      let arm = 0, uso = 0, rede = 0, solarGaleria = 0, fase;

      if (h < 10) {
        fase = 'Pré-op';
        arm = Math.min(solar, capBat - carga);
        carga += arm;
        rede = galeria;
      } else if (h < 19) {
        fase = 'Operacional';
        let disp = solar;
        const evSolar = Math.min(disp, demandaEv);
        disp -= evSolar;
        arm = Math.min(disp, capBat - carga);
        carga += arm;
        disp -= arm;
        if (carga >= capBat - 0.001) solarGaleria = Math.min(disp, galeria);
        rede = (demandaEv - evSolar) + (galeria - solarGaleria);
      } else {
        fase = 'Noturno';
        const demanda = demandaEv + galeria;
        uso = Math.min(carga, demanda);
        carga -= uso;
        rede = Math.max(0, demanda - uso);
      }

      const custoH = rede * tarifa;
      gerado += solar; evTotal += demandaEv; galeriaTotal += galeria;
      redeTotal += rede; custo += custoH; armazenado += arm; usado += uso;
      horas.push({ h, fase, solar, galeria, carros, demandaEv, rede, tarifa, custo: custoH, soc: carga });
    }

    const maxBar = Math.max(1, ...horas.map(x => Math.max(x.solar, x.demandaEv + x.galeria)));
    const custoKwhEv = evTotal > 0 ? custo / evTotal : 0;
    const piso = custoKwhEv / 0.9;
    const receitaDia = evTotal * s.precoVenda * 0.9;
    const lucroDia = receitaDia - custo;

    return {
      placas, kwp, kwpEf, pico, maxVagas, baterias, capBat, consumoGaleriaDia, vagas, bandas, fontes,
      horas, maxBar, gerado, evTotal, galeriaTotal, redeTotal, custo, armazenado, usado,
      custoKwhEv, piso, receitaDia, lucroDia, lucroMes: lucroDia * 30,
      margemPct: custoKwhEv > 0 ? (s.precoVenda * 0.9 / custoKwhEv - 1) * 100 : 0,
      socFinal: carga,
      eDia, hsp, HSP_ANO, HSP_MES, mesMin, evPct, efPct, econEf, solLiberado, modRec, consumoBase,
    };
  };

  SERIE_SEM = [.94, 1, .72, .38, .86, .97, .91];
  SERIE_MES = [.88, .95, .62, .8, 1, .74, .91, .86, .58, .93, .97, .69, .84, .9, 1, .77, .66, .95, .88, .72, .91, .85, .6, .97, .93, .8, .87, .74, .99, .92];
  SERIE_ANO = [.82, .78, .86, .74, .62, .55, .58, .69, .81, .9, .96, 1];
  SERIE_DIAS_LBL = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
  SERIE_MESES_LBL = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

  renderVals() {
    const s = this.state;
    const mostrarFatoresIA = this.props.mostrarFatoresIA ?? false;
    const spot = this.spot();
    const isDriver = s.role === 'driver';
    const dark = s.screen === 'scan' || s.screen === 'live';
    const scr = (n) => s.screen === n;
    const veiculoOk = this.props.veiculoCadastrado ?? true;
    const paramOk = this.props.parametrizacaoConcluida ?? true;
    const repasseOk = this.props.contaRepasseCadastrada ?? true;

    const driverTabs = [
      { key: 'inicio', label: 'Início', ico: 'w', go: 'inicioDriver' },
      { key: 'casa', label: 'Casa', ico: 'casa', go: 'gateDriver' },
      { key: 'carga', label: 'Carga', ico: 'carga', go: s.sess ? 'live' : 'map' },
      { key: 'ia', label: 'IA', ico: 'ia', go: 'assistente' },
      { key: 'esg', label: 'Impacto', ico: 'impacto', go: 'esg' },
    ];
    const hostTabs = [
      { key: 'mais', label: 'Início', ico: 'w', go: 'dash' },
      { key: 'vagas', label: 'Painel', ico: 'painel', go: 'chargers', dot: true },
      { key: 'fin', label: 'Financeiro', ico: 'financeiro', go: 'more' },
      { key: 'sindico', label: 'Síndico', ico: 'ia', go: 'sindico' },
      { key: 'impacto', label: 'Impacto', ico: 'impacto', go: 'esgGal' },
    ];
    const prospect = s.role === 'host' && s.hasSolution === false;
    const prospectTabs = [
      { key: 'viab', label: 'Viabilidade', ico: 'viab', go: 'viability' },
      { key: 'sim', label: 'Vagas', ico: 'vagas', go: 'sim' },
      { key: 'conta', label: 'Conta', ico: 'conta', go: 'account' },
    ];
    const noTabBase = ['login', 'role', 'registrar', 'gate', 'addCharger', 'scanDevice', 'manualDevice', 'deviceResult', 'box', 'scan', 'live', 'confirm', 'pagamento'];
    const noTab = s.viabFromCadastro ? noTabBase.concat('viability') : noTabBase;
    const tabDef = prospect ? prospectTabs : isDriver ? driverTabs : hostTabs;
    const activeTab = s.tab || (prospect ? 'viab' : isDriver ? 'inicio' : 'mais');
    const V = this.viab();
    const FONTE_META = { roof: { label: 'Telhado', icon: '🏠' }, facade: { label: 'Fachada', icon: '🧱' }, carport: { label: 'Cobertura', icon: '🚗' } };
    const MODELOS = [
      { code: 'GW7K-HCA-20', meta: '7 kW · Monofásico · 230V, 32A · Tipo 2', icon: '⚡' },
      { code: 'GW11K-HCA-20', meta: '11 kW · Trifásico · 400V, 16A · Tipo 2', icon: '⚡' },
      { code: 'GW22K-HCA-20', meta: '22 kW · Trifásico · 400V, 32A · Tipo 2', icon: '⚡' },
      { code: 'Outro modelo', meta: 'Não está na lista? Informe as especificações.', icon: '✏️' },
    ];
    const CEPS = {
      '01310100': { rua: 'Avenida Paulista', bairro: 'Bela Vista', cidade: 'São Paulo/SP' },
      '20040020': { rua: 'Avenida Rio Branco', bairro: 'Centro', cidade: 'Rio de Janeiro/RJ' },
      '30130010': { rua: 'Rua da Bahia', bairro: 'Centro', cidade: 'Belo Horizonte/MG' },
      '80010000': { rua: 'Rua XV de Novembro', bairro: 'Centro', cidade: 'Curitiba/PR' },
      '04538133': { rua: 'Avenida Brigadeiro Faria Lima', bairro: 'Itaim Bibi', cidade: 'São Paulo/SP' },
    };

    const sessKwh = s.sess ? s.sess.kwh : 0;
    const alvoKwh = s.sess ? s.sess.metaKwh : this.metaKwh();
    const alvoPct = Math.round(Math.min(100, s.pctIni + alvoKwh / this.cap() * 100));
    const pctNow = s.sess ? Math.min(alvoPct, s.pctIni + sessKwh / this.cap() * 100) : s.pctIni;
    const restKwh = s.sess ? Math.max(0, s.sess.metaKwh - sessKwh) : 0;

    const base = (s.baseSites || {})[s.siteSel || 'pn'] ?? 2.49;
    const a = this.alfa(), vig = base * a;
    // simulador de vagas: o que JÁ existe na galeria (Painel: 43,2 kWp de cobertura, 9,6 kWp de
    // fachada BIPV, 14,4 kWp de carport, BESS de 30 kWh = 2 módulos, 4 vagas) + o que o gestor
    // digita para ampliar. As vagas a mais saem do total menos as vagas já instaladas.
    // Parâmetros do simulador de viabilidade: placa 450 Wp em 2,256 m², PR 0,72, fachada rende
    // 55% e carport 90% da cobertura, módulo de bateria de 15 kWh em 1,6 m².
    const SIM = (() => {
      const AREA_PLACA = 2.256, WP = 450, PR = 0.72, MOD_KWH = 15, MOD_M2 = 1.6, KWH_POR_KWP = 0.5, KW_VAGA = 7;
      const EXIST = { roof: 43.2, facade: 9.6, carport: 14.4 }, MOD_EXIST = 2, VAGAS_EXIST = 4;
      const add = { roof: 0, facade: 0, carport: 0, ...(s.simAdd || {}) };
      const sup = [
        { k: 'roof', label: 'Cobertura solar', ico: '🏢', fator: 1 },
        { k: 'facade', label: 'Fachada solar (BIPV)', ico: '🪟', fator: 0.55 },
        { k: 'carport', label: 'Carport solar', ico: '🚗', fator: 0.9 },
      ].map(x => {
        const m2Exist = Math.round(EXIST[x.k] * 1000 / WP * AREA_PLACA);
        const placasAdd = Math.floor((add[x.k] || 0) / AREA_PLACA), kwpAdd = placasAdd * WP / 1000;
        return { ...x, m2Exist, kwpExist: EXIST[x.k], add: add[x.k] || 0, placasAdd, kwpAdd, kwpTot: EXIST[x.k] + kwpAdd, kwpEfTot: (EXIST[x.k] + kwpAdd) * x.fator, kwpEfExist: EXIST[x.k] * x.fator };
      });
      const kwpExist = sup.reduce((a, x) => a + x.kwpExist, 0), kwpAdd = sup.reduce((a, x) => a + x.kwpAdd, 0);
      const picoExist = sup.reduce((a, x) => a + x.kwpEfExist, 0) * PR, pico = sup.reduce((a, x) => a + x.kwpEfTot, 0) * PR;
      const modRecAdd = Math.max(0, Math.round((kwpExist + kwpAdd) * KWH_POR_KWP / MOD_KWH) - MOD_EXIST);
      const modAdd = s.simModAdd != null ? s.simModAdd : modRecAdd;
      const mod = MOD_EXIST + modAdd, batKwh = mod * MOD_KWH;
      const evPct = s.simEvPct != null ? s.simEvPct : 80;        // regra de rateio: 80% do sol para o eletroposto
      const fr = evPct / 100;
      // irradiação de São Paulo (kWh/m² por dia no plano horizontal = horas de sol pleno, HSP),
      // média de cada mês do clima da base (Av. Paulista, calibrado nas normais do INMET)
      const HSP_MES = [6.78, 6.31, 5.50, 5.15, 4.28, 4.11, 4.32, 5.25, 6.11, 6.74, 6.13, 6.22];
      const HSP_ANO = HSP_MES.reduce((a, b) => a + b, 0) / 12;
      const iMin = HSP_MES.indexOf(Math.min(...HSP_MES));
      const hsp = s.simHsp === 'min' ? HSP_MES[iMin] : HSP_ANO;
      const kwpEfTot = sup.reduce((a, x) => a + x.kwpEfTot, 0), kwpEfExist = sup.reduce((a, x) => a + x.kwpEfExist, 0);
      const eDia = kwpEfTot * hsp * PR, eDiaExist = kwpEfExist * hsp * PR;      // kWh gerados por dia, em média
      // eficiência energética: materiais e envoltória melhores reduzem a climatização (HVAC) em 15% a 25%.
      // O HVAC é ~45% do consumo do condomínio; ~70% dessa economia acontece com sol, e esse sol
      // que a galeria deixa de usar fica livre para as vagas.
      const galDia = (() => { const h = (typeof MLPrev !== 'undefined' ? MLPrev.D.historico.galeria : []).filter(x => x != null); return h.length ? h.reduce((a, b) => a + b, 0) / h.length * 24 : 440; })();
      const HVAC_FR = 0.45, DIURNO = 0.7;
      const efPct = s.simEfPct != null ? s.simEfPct : 0;
      const econDia = galDia * HVAC_FR * efPct / 100;
      const solLiberado = Math.min(econDia * DIURNO, eDia * (1 - fr));
      // cada vaga de 7 kW recebe sol pelas horas de sol pleno do ano; num mês fraco, cabem menos vagas
      const vagasTot = Math.floor((eDia * fr + solLiberado) / (KW_VAGA * HSP_ANO));
      const vagasSemEf = Math.floor(eDia * fr / (KW_VAGA * HSP_ANO));
      const pontaTot = Math.floor(batKwh * 0.9 / 4 / KW_VAGA), pontaExist = Math.floor(MOD_EXIST * MOD_KWH * 0.9 / 4 / KW_VAGA);
      return { sup, kwpExist, kwpAdd, pico, picoExist, MOD_EXIST, VAGAS_EXIST, modRecAdd, modAdd, mod, batKwh, batM2Add: modAdd * MOD_M2,
        vagasTot, vagasMais: Math.max(0, vagasTot - VAGAS_EXIST), eDia, eDiaExist, hsp, HSP_ANO, mesMin: iMin, HSP_MES, fr, galDia, efPct, econDia, solLiberado, vagasEf: vagasTot - vagasSemEf, hvacDia: galDia * HVAC_FR, pontaTot, pontaMais: Math.max(0, pontaTot - pontaExist), kwpEf: pico / PR };
    })();
    const pico = SIM.pico;
    const evKw = pico * SIM.fr;
    const vagas = Math.floor(evKw / 7);

    const histAll = [
      { tag: 'HOJE', tipo: 'posto', local: 'Pátio Norte · vaga 01', sub: '16/09 · 14:22 · 14,8 kWh · 2h12 · Pix', valor: 'R$ 32,41', kwh: 14.8, custo: 32.41 },
      { tag: 'HOJE', tipo: 'casa', local: 'Garagem · HCA G2', sub: '16/09 · 02:10 · 31,0 kWh · 86% próprio', valor: 'R$ 18,60', kwh: 31, custo: 18.6 },
      { tag: '08/09', tipo: 'posto', local: 'Mini Shopping Aurora', sub: '08/09 · 18:05 · 9,4 kWh · 1h20 · créditos', valor: 'R$ 23,03', kwh: 9.4, custo: 23.03 },
      { tag: '05/09', tipo: 'casa', local: 'Garagem · HCA G2', sub: '05/09 · 01:40 · 22,5 kWh · 86% próprio', valor: 'R$ 13,50', kwh: 22.5, custo: 13.5 },
      { tag: '02/09', tipo: 'casa', local: 'Garagem · HCA G2', sub: '02/09 · 23:15 · 28,4 kWh · 91% próprio', valor: 'R$ 14,20', kwh: 28.4, custo: 14.2 },
      { tag: '28/08', tipo: 'casa', local: 'Garagem · HCA G2', sub: '28/08 · 15:30 · 19,6 kWh · 96% próprio', valor: 'R$ 7,10', kwh: 19.6, custo: 7.1 },
    ];
    const rec = s.receipt;
    const histWithRec = rec
      ? [{ tag: 'AGORA', tipo: 'posto', local: rec.spot + ' · vaga 01', sub: this.agoraFmt() + ' · ' + rec.kwh.toFixed(1).replace('.', ',') + ' kWh · ' + this.fmtMin(rec.elapsed) + ' · ' + (rec.metodo === 'pix' ? 'Pix' : rec.metodo === 'creditos' ? 'créditos' : 'cartão'), valor: BRL(rec.total), kwh: rec.kwh, custo: rec.total }, ...histAll]
      : histAll;
    const histList = histWithRec.filter(h => s.histFilter === 'Todos' ? true : s.histFilter === 'Casa' ? h.tipo === 'casa' : h.tipo === 'posto');

    const DEMANDA_KW = 55;
    // demanda instantânea do site e teto operacional das vagas, pelo mesmo perfil horário do balanço
    const DLM = (() => {
      const PERC = { 6: .02, 7: .025, 8: .03, 9: .04, 10: .05, 11: .055, 12: .06, 13: .06, 14: .06, 15: .06, 16: .055, 17: .055, 18: .05, 19: .045, 20: .04, 21: .035, 22: .03 };
      const soma = Object.keys(PERC).reduce((t, k) => t + PERC[k], 0);
      const diario = 2400 * 60 / 365;
      const hora = Math.min(22, Math.max(6, new Date().getHours()));
      const gal = diario * ((PERC[hora] || 0) / soma);
      const picoMes = diario * (Math.max(...Object.keys(PERC).map(k => PERC[k])) / soma) * 1.18;
      const margem = DEMANDA_KW * 0.12;
      const teto = Math.max(0, DEMANDA_KW - picoMes - margem);
      const evs = s.chargers.filter(c => c.site === (s.siteSel || 'pn') && c.status === 'carregando')
        .reduce((t, c) => t + (c.kw || 0), 0);
      const n = (v) => v.toFixed(1).replace('.', ',');
      return { gal, evs, teto, picoMes, margem, site: gal + evs, n };
    })();
    // potência alocada pelo DLM: reparte 96% do teto entre as vagas em carga (mapa local, sem mutar o estado)
    const emCarga = s.chargers.filter(c => c.site === (s.siteSel || 'pn') && c.status === 'carregando');
    const KW_ALOC = {};
    if (emCarga.length) {
      if (s.dlmReduzido) {
        emCarga.forEach(c => { KW_ALOC[c.id] = 4; });
      } else {
        // medidor inteligente lê a folga real e o DLM reparte igualmente entre as vagas em carga
        const disponivel = Math.round(DLM.teto * 0.96 * 10) / 10;
        const igual = Math.min(7, Math.floor((disponivel / emCarga.length) * 10) / 10);
        emCarga.forEach(c => { KW_ALOC[c.id] = igual; });
      }
      DLM.evs = emCarga.reduce((t, c) => t + KW_ALOC[c.id], 0);
      DLM.site = DLM.gal + DLM.evs;
    }
    const kwDe = (c) => (KW_ALOC[c.id] != null ? KW_ALOC[c.id] : (c.kw || 0));
    const dlmPico = DLM.n(DLM.site);
    const dlmTeto = DLM.n(DLM.teto);
    const dlmEvs = DLM.n(DLM.evs);
    const dlmTetoPct = (DLM.teto > 0 ? Math.round(DLM.evs / DLM.teto * 100) : 0) + '%';

    const chargerRows = s.chargers.filter(c => c.site === (s.siteSel || 'pn')).map(c => ({
      nome: c.nome,
      evse: c.evse || c.id.toUpperCase(),
      serie: 'Série ' + (c.serie || '—'),
      conector: c.conector || 'Tipo 2',
      preco: BRL(c.preco).replace('R$ ', 'R$ '),
      led: c.status === 'carregando' ? '#149d68' : c.status === 'livre' ? '#3577f1' : c.status === 'manutencao' ? '#b97a08' : c.status === 'desativada' ? '#c9cdd6' : '#f5333f',
      anim: c.status === 'carregando' ? 'cgPulse 1.2s ease-in-out infinite' : 'none',
      sub: c.status === 'carregando' ? 'Carregando · ' + String(kwDe(c)).replace('.', ',') + ' kW · faltam ' + c.min + ' min'
        : c.status === 'livre' ? 'Disponível'
        : c.status === 'desativada' ? 'Desativada · ponto apagado e fora do mapa'
        : c.status === 'manutencao' ? 'Em manutenção · oculta no mapa' : c.erro,
      subFg: c.status === 'falha' ? '#f5333f' : c.status === 'manutencao' ? '#7a5406' : c.status === 'desativada' ? '#9aa1ad' : '#7c8494',
      cardBorder: c.status === 'falha' ? '#f2c6ca' : c.status === 'manutencao' ? '#f0dcae' : '#e4e5e9',
      onOpen: () => this.setState({ screen: 'vagaDetail', tab: 'vagas', vagaSel: c.id }),
      temAlerta: c.status === 'falha',
      alerta: c.erro ? c.erro + '. Vaga despublicada automaticamente do mapa.' : '',
      carregando: c.status === 'carregando',
      alocado: String(kwDe(c)).replace('.', ',') + ' kW de 7 kW',
      alocPct: Math.round(kwDe(c) / 7 * 100) + '%',
      onReset: () => {
        this.setState(p => ({ chargers: p.chargers.map(x => x.id === c.id ? { ...x, status: 'livre', erro: null } : x) }));
        this.say('Vaga 03 reiniciada via OCPP e republicada no mapa.');
      },
      onTicket: () => this.say('Chamado #4812 aberto na assistência GoodWe.'),
      podeDesativar: c.status === 'livre',
      desativada: c.status === 'desativada',
      // desativar/ativar espelha no poste físico: apagado ↔ azul disponível
      onToggleAtiva: () => {
        const desativar = c.status === 'livre';
        this.setState(p => ({ chargers: p.chargers.map(x => x.id === c.id ? { ...x, status: desativar ? 'desativada' : 'livre' } : x) }));
        this.hwSet(desativar ? 'desligado' : 'disponivel');
        this.say(desativar ? c.nome + ' desativada — o ponto foi apagado e saiu do mapa.'
          : c.nome + ' reativada — disponível no mapa novamente.');
      },
    }));


    const vagaBase = s.chargers.find(c => c.id === s.vagaSel) || s.chargers.filter(c => c.site === (s.siteSel || 'pn'))[0];
    const vagaAtual = vagaBase ? { ...vagaBase, kw: kwDe(vagaBase) } : vagaBase;
    const liveBar = !dark && noTab.indexOf(s.screen) === -1 && isDriver && !!s.sess;
    const siteAtual = s.sites.find(x => x.id === (s.siteSel || 'pn')) || s.sites[0];
    const alertasTodos = this.ALERTAS.concat(s.role === 'host' ? this.alertasML() : []);
    const alertasFiltrados = alertasTodos.filter(a => (s.alertaFiltro || 'Todos') === 'Todos'
      || ((s.alertaFiltro === 'Críticos' && a.sev === 'critico')
        || (s.alertaFiltro === 'Atenção' && a.sev === 'atencao')
        || (s.alertaFiltro === 'Informativos' && a.sev === 'info')));

    const P = s.role === 'host' ? this.valsPrevisao(s, scr) : { scPrevisao: false };
    return {
      ...P,
      mostrarFatoresIA,
      shellBg: dark ? '#0e1118' : '#efeff1',
      pageInk: dark ? '#f2f3f6' : '#131c2e',
      statusInk: dark || scr('login') ? '#f2f3f6' : '#131c2e',
      pageOverflow: (scr('login') || scr('registrar') || scr('role') || scr('gate')) ? 'hidden' : 'auto',
      pagePad: scr('login') ? '0' : scr('registrar') ? '54px 18px 20px'
        : (noTab.indexOf(s.screen) === -1 ? (liveBar ? '58px 18px 150px' : '58px 18px 92px') : '58px 18px 26px'),
      toast: s.toast,
      toastBottom: noTab.indexOf(s.screen) === -1 ? (liveBar ? '200px' : '108px') : '26px',

      scRole: scr('role'), scMap: scr('map'), scDetail: scr('detail'), scScan: scr('scan'),
      scConfirm: scr('confirm'), scLive: scr('live'), scReceipt: scr('receipt'),
      goWallet: () => this.setState({ screen: 'wallet', tab: 'inicio' }),
      goScanCarga: () => this.setState({ screen: 'scan', tab: 'carga', scanOrigem: 'detail', modo: null }),
      scWallet: scr('wallet'), scHistory: scr('history'), scProfile: scr('profile'),
      horarioAberto: !!s.horarioAberto,
      periodoDataAberto: !!s.periodoDataAberto,
      togglePeriodoData: () => this.setState(p => ({ periodoDataAberto: !p.periodoDataAberto })),
      dataBg: s.periodoDataAberto ? '#e8faff' : '#fafafb',
      dataBorda: s.periodoDataAberto ? '#00d1ff' : '#e4e5e9',
      dataSombra: s.periodoDataAberto ? '0 0 10px rgba(0,209,255,.55)' : 'none',
      dataIni: (s.epDatas || this.DATAS_PADRAO).ini,
      dataFim: (s.epDatas || this.DATAS_PADRAO).fim,
      dataMotivo: (s.epDatas || this.DATAS_PADRAO).motivo,
      setDataIni: (e) => { const v = e.target.value; this.setState(p => ({ epDatas: { ...(p.epDatas || this.DATAS_PADRAO), ini: v } })); },
      setDataFim: (e) => { const v = e.target.value; this.setState(p => ({ epDatas: { ...(p.epDatas || this.DATAS_PADRAO), fim: v } })); },
      setDataMotivo: (e) => { const v = e.target.value; this.setState(p => ({ epDatas: { ...(p.epDatas || this.DATAS_PADRAO), motivo: v } })); },
      dataCardBorda: (s.epDatas || this.DATAS_PADRAO).ativo ? '#f5333f' : '#e4e5e9',
      dataChip: (s.epDatas || this.DATAS_PADRAO).ativo ? 'Programado' : 'Sem programação',
      dataChipBg: (s.epDatas || this.DATAS_PADRAO).ativo ? '#fdeaec' : '#eceef2',
      dataChipFg: (s.epDatas || this.DATAS_PADRAO).ativo ? '#c01b28' : '#5d6572',
      dataBtnBg: (s.epDatas || this.DATAS_PADRAO).ativo ? '#131c2e' : '#f5333f',
      dataBtnLabel: (s.epDatas || this.DATAS_PADRAO).ativo ? 'Cancelar programação' : 'Programar fechamento',
      toggleDataBloqueio: () => this.setState(p => {
        const cur = p.epDatas || this.DATAS_PADRAO;
        const ativo = !cur.ativo;
        const br = (d) => { const x = String(d || '').split('-'); return x.length === 3 ? x[2] + '/' + x[1] : d; };
        this.say(ativo
          ? 'Eletroposto fechado de ' + br(cur.ini) + ' a ' + br(cur.fim) + ' — ' + (cur.motivo || 'sem motivo informado') + '.'
          : 'Programação de fechamento cancelada.');
        return { epDatas: { ...cur, ativo } };
      }),
      toggleHorario: () => this.setState(p => ({ horarioAberto: !p.horarioAberto })),
      horarioBg: s.horarioAberto ? '#e8faff' : '#fafafb',
      horarioBorda: s.horarioAberto ? '#00d1ff' : '#e4e5e9',
      horarioSombra: s.horarioAberto ? '0 0 10px rgba(0,209,255,.55)' : 'none',
      horarios: [
        { k: 'pre', dia: 'Pré-operacional · manhã', tag: 'Galeria', tagBg: '#eceef2', tagFg: '#5d6572', sub: 'Carregamento de baterias e preparação da demanda quando o sol nascer.' },
        { k: 'oper', dia: 'Operacional · diurno', tag: 'Galeria', tagBg: '#dcf3ea', tagFg: '#0f7a51', sub: 'Geração solar para carga de EV, bateria e excedente alimenta a edificação (menos custo da rede).' },
        { k: 'not', dia: 'Operacional · noturno', tag: 'Galeria', tagBg: '#0f172a', tagFg: '#e8faff', sub: 'Descarga de baterias para suprir carga base, ou usar energia comprada em horário mais barato (peak shaving).' },
        { k: 'ep', dia: 'Funcionamento do eletroposto', tag: 'Eletroposto', tagBg: '#0f7a51', tagFg: '#ffffff', sub: 'Fora dessa janela o OCPP bloqueia novas sessões.' },
      ].map(f => ({
        ...f,
        cardBg: f.k === 'pre' ? '#fffbe3' : f.k === 'oper' ? '#ffe9a3' : f.k === 'not' ? '#132546' : '#d9f4e4',
        cardBorda: f.k === 'pre' ? '#f2e3a6' : f.k === 'oper' ? '#e7c757' : f.k === 'not' ? '#2b3f68' : '#8ed5ae',
        ink: f.k === 'not' ? '#ffffff' : '#131c2e',
        subInk: f.k === 'not' ? '#cdd8ea' : '#5d6572',
        ini: (s.horarioCfg || this.HORARIO_PADRAO)[f.k].ini,
        fim: (s.horarioCfg || this.HORARIO_PADRAO)[f.k].fim,
        setIni: (e) => { const v = e.target.value; this.setState(p => ({ horarioCfg: { ...(p.horarioCfg || this.HORARIO_PADRAO), [f.k]: { ...(p.horarioCfg || this.HORARIO_PADRAO)[f.k], ini: v } } })); },
        setFim: (e) => { const v = e.target.value; this.setState(p => ({ horarioCfg: { ...(p.horarioCfg || this.HORARIO_PADRAO), [f.k]: { ...(p.horarioCfg || this.HORARIO_PADRAO)[f.k], fim: v } } })); },
      })),
      horarioStatus: this.epAberto(s) ? 'Aberto agora' : 'Fechado agora',
      epJanelaResumo: (() => {
        const ep = (s.horarioCfg || this.HORARIO_PADRAO).ep;
        return ep.ini + ' às ' + ep.fim + ' · ' + (this.epAberto(s) ? 'aberto agora' : 'fechado agora');
      })(),
      horarioStatusBg: this.epAberto(s) ? '#dcf3ea' : '#eceef2',
      horarioStatusFg: this.epAberto(s) ? '#0f7a51' : '#5d6572',
      horarioNota: 'Sessões já iniciadas seguem até o fim mesmo após o fechamento.',
      fecharPorPeriodo: (s.epFechar || this.FECHAR_PADRAO).modo === 'periodo',
      fecharIni: (s.epFechar || this.FECHAR_PADRAO).ini,
      fecharFim: (s.epFechar || this.FECHAR_PADRAO).fim,
      fecharMotivo: (s.epFechar || this.FECHAR_PADRAO).motivo,
      setFecharIni: (e) => { const v = e.target.value; this.setState(p => ({ epFechar: { ...(p.epFechar || this.FECHAR_PADRAO), ini: v } })); },
      setFecharFim: (e) => { const v = e.target.value; this.setState(p => ({ epFechar: { ...(p.epFechar || this.FECHAR_PADRAO), fim: v } })); },
      setFecharMotivo: (e) => { const v = e.target.value; this.setState(p => ({ epFechar: { ...(p.epFechar || this.FECHAR_PADRAO), motivo: v } })); },
      fecharModos: [
        { key: 'periodo', label: 'Por período' },
        { key: 'dia', label: 'O dia todo' },
      ].map(m => ({
        label: m.label,
        border: (s.epFechar || this.FECHAR_PADRAO).modo === m.key ? '#00d1ff' : '#e4e5e9',
        espessura: (s.epFechar || this.FECHAR_PADRAO).modo === m.key ? '2px' : '1.5px',
        sombra: (s.epFechar || this.FECHAR_PADRAO).modo === m.key ? '0 0 10px rgba(0,209,255,.55)' : 'none',
        onPick: () => this.setState(p => ({ epFechar: { ...(p.epFechar || this.FECHAR_PADRAO), modo: m.key } })),
      })),
      fecharAtivo: (s.epFechar || this.FECHAR_PADRAO).ativo,
      fecharBorda: (s.epFechar || this.FECHAR_PADRAO).ativo ? '#f5333f' : '#e4e5e9',
      fecharChip: (s.epFechar || this.FECHAR_PADRAO).ativo
        ? ((s.epFechar || this.FECHAR_PADRAO).modo === 'dia' ? 'Fechado hoje' : 'Fechado ' + (s.epFechar || this.FECHAR_PADRAO).ini + '–' + (s.epFechar || this.FECHAR_PADRAO).fim)
        : 'Sem bloqueio',
      fecharChipBg: (s.epFechar || this.FECHAR_PADRAO).ativo ? '#fdeaec' : '#eceef2',
      fecharChipFg: (s.epFechar || this.FECHAR_PADRAO).ativo ? '#c01b28' : '#5d6572',
      fecharBtnBg: (s.epFechar || this.FECHAR_PADRAO).ativo ? '#131c2e' : '#f5333f',
      fecharBtnLabel: (s.epFechar || this.FECHAR_PADRAO).ativo ? 'Reabrir eletroposto' : 'Fechar eletroposto',
      toggleFechar: () => this.setState(p => {
        const cur = p.epFechar || this.FECHAR_PADRAO;
        const ativo = !cur.ativo;
        this.say(ativo
          ? (cur.modo === 'dia' ? 'Eletroposto fechado o dia todo — novas sessões bloqueadas via OCPP.' : 'Eletroposto fechado das ' + cur.ini + ' às ' + cur.fim + '.')
          : 'Eletroposto reaberto conforme o horário operacional.');
        return { epFechar: { ...cur, ativo } };
      }),
      scDash: scr('dash'), scChargers: scr('chargers'), scTariff: scr('tariff'),
      scSindico: scr('sindico'), scMore: scr('more'), scSim: scr('sim'),
      scLogin: scr('login'), scAccount: scr('account'), scAnf: scr('anf'),
      scAddCharger: scr('addCharger'), scScanDevice: scr('scanDevice'), scManual: scr('manualDevice'),
      scDeviceResult: scr('deviceResult'), scViability: scr('viability'), scBox: scr('box'),

      logged: s.logged,
      loginRole: s.pendingRole === 'host' ? 'Entrar como gestor da galeria' : s.pendingRole === 'driver' ? 'Entrar como motorista' : 'Login',
      loginHost: s.pendingRole === 'host', loginDriver: s.pendingRole !== 'host',
      loginPapel: s.pendingRole === 'host' ? 'Gestor' : 'Motorista',
      loginTitulo: 'Bem-vindo de volta',
      loginSub: s.pendingRole === 'host' ? 'Entre para acompanhar energia, vagas e faturamento da galeria.' : 'Entre para encontrar um eletroposto e recarregar com energia solar.',
      loginEsqueci: () => this.say('Enviamos um link de redefinição para pa**********@gmail.com.'),
      lembrarMarca: s.lembrar === false ? '' : '✓',
      lembrarBorda: s.lembrar === false ? '#c9cdd6' : '#f5333f',
      lembrarFundo: s.lembrar === false ? 'transparent' : '#f5333f',
      toggleLembrar: () => this.setState(p => ({ lembrar: p.lembrar === false })),
      doLogin: () => this.setState(p => ({
        logged: true,
        role: p.pendingRole,
        screen: p.pendingRole === 'host' ? (p.hasSolution === null ? 'gate' : p.hasSolution ? 'dash' : 'viability') : p.pendingRole === 'driver' ? 'inicioDriver' : 'home',
        tab: p.pendingRole === 'host' ? (p.hasSolution === false ? 'viab' : 'mais') : 'inicio',
      })),
      scRoleFoto: scr('role') && (this.props.estiloEntrada ?? 'Fotográfico') === 'Fotográfico',
      scRoleIlustrado: scr('role') && (this.props.estiloEntrada ?? 'Fotográfico') !== 'Fotográfico',
      scRegistrar: scr('registrar'),
      goRegistrar: () => this.setState({ screen: 'registrar' }),
      regSub: s.regRole === 'host' ? 'Gestor de galeria ou mini-shopping' : 'Motorista de veículo elétrico',
      regPapeis: [
        { key: 'driver', label: 'Motorista', icon: '🚗' },
        { key: 'host', label: 'Gestor', icon: '🏬' },
      ].map(r => ({
        label: r.label, icon: r.icon,
        bg: (s.regRole || 'driver') === r.key ? '#e8faff' : '#fafafb',
        border: (s.regRole || 'driver') === r.key ? '#00d1ff' : '#e4e5e9',
        fg: (s.regRole || 'driver') === r.key ? '#131c2e' : '#131c2e',
        onPick: () => this.setState({ regRole: r.key }),
      })),
      regCampos: ((s.regRole || 'driver') === 'host'
        ? [
          { key: 'regNome', label: 'Responsável', ph: 'Nome completo' },
          { key: 'regEmpresa', label: 'Galeria ou mini-shopping', ph: 'Razão social' },
          { key: 'regDoc', label: 'CNPJ', ph: '00.000.000/0000-00' },
          { key: 'regEmail', label: 'E-mail', ph: 'voce@empresa.com.br' },
          { key: 'regFone', label: 'Telefone', ph: '(11) 90000-0000' },
        ]
        : [
          { key: 'regNome', label: 'Nome', ph: 'Nome completo' },
          { key: 'regDoc', label: 'CPF', ph: '000.000.000-00' },
          { key: 'regEmail', label: 'E-mail', ph: 'voce@email.com' },
          { key: 'regVeiculo', label: 'Veículo elétrico', ph: 'Ex.: Renault Megane E-Tech' },
        ]).map(c => ({
        label: c.label, ph: c.ph, value: s[c.key] || '',
        onChange: (e) => this.setState({ [c.key]: e.target.value }),
      })),
      termosMarca: s.regTermos ? '✓' : '',
      termosBorda: s.regTermos ? '#00d1ff' : '#c9cdd6',
      termosFundo: s.regTermos ? '#00d1ff' : 'transparent',
      toggleTermos: () => this.setState(p => ({ regTermos: !p.regTermos })),
      regBtnBg: s.regTermos ? '#f5333f' : '#e3b2b7',
      regNota: s.regTermos ? 'Confirmação enviada por e-mail para ativar a conta.' : 'Aceite os termos para continuar.',
      criarConta: () => {
        if (!s.regTermos) { this.say('Aceite os termos de uso para criar a conta.'); return; }
        const papel = s.regRole || 'driver';
        this.setState({ pendingRole: papel, screen: 'login' });
        this.say('Conta criada. Entre com seu e-mail para acessar como ' + (papel === 'host' ? 'gestor' : 'motorista') + '.');
      },
      scGate: scr('gate'),
      scGateDriver: scr('gateDriver'),
      scMonitor: scr('monitor'),
      gestaoAberta: !!s.gestaoAberta,
      gestaoSeta: s.gestaoAberta ? '⌃' : '⌄',
      toggleGestao: () => this.setState(p => ({ gestaoAberta: !p.gestaoAberta })),
      ...(() => {
        const HORAS = ['06', '08', '10', '12', '14', '16', '18', '20'];
        const n1 = (v) => v.toFixed(1).replace('.', ',');
        const mk = (vals, cor, corNeg, label, unidade, nota, totalTxt) => {
          const max = Math.max(...vals.map(v => Math.abs(v)));
          const pos = vals.filter(v => v > 0).reduce((t, v) => t + v, 0);
          const neg = vals.filter(v => v < 0).reduce((t, v) => t - v, 0);
          return {
            label, cor, corNeg, nota,
            total: totalTxt !== undefined ? totalTxt
              : neg > 0 ? '+' + n1(pos) + ' / −' + n1(neg) + ' ' + unidade
              : n1(pos) + ' ' + unidade,
            barras: vals.map((v, i) => ({
              h: HORAS[i],
              up: v > 0 ? Math.round(v / max * 100) + '%' : '0%',
              down: v < 0 ? Math.round(-v / max * 100) + '%' : '0%',
              op: Math.abs(v) === max ? 1 : 0.68,
            })),
          };
        };
        return {
          energiaSeries: [
            mk([0.6, 2.4, 3.9, 5.0, 4.4, 2.8, 1.4, 0], '#f2b01e', '#f2b01e', 'Geração solar', 'kWh', 'Pico ao meio-dia com céu limpo. Total do dia medido no inversor.', '20,5 kWh'),
            mk([0.2, 1.4, 2.6, 3.1, 2.2, 0.9, -1.8, -2.4], '#149d68', '#7c8494', 'Bateria', 'kWh', 'Acima da linha, carga no excedente solar; abaixo, descarga no início da noite.'),
            mk([1.1, 1.3, 1.6, 2.2, 2.0, 2.4, 3.6, 3.1], '#3577f1', '#3577f1', 'Consumo da casa e do carro', 'kWh', 'Inclui a wallbox da garagem. Fora do sol, sai da bateria antes da rede.'),
          ],
        };
      })(),
      monTemp: '26°',
      monStatus: 'Excedente para a rede',
      monPeriodos: ['Dia', 'Mês', 'Ano'].map(p => ({
        label: p,
        border: (s.monPeriodo || 'Dia') === p ? '#00d1ff' : '#e4e5e9',
        espessura: (s.monPeriodo || 'Dia') === p ? '2px' : '1.5px',
        sombra: (s.monPeriodo || 'Dia') === p ? '0 0 10px rgba(0,209,255,.55)' : 'none',
        fg: (s.monPeriodo || 'Dia') === p ? '#131c2e' : '#7c8494',
        onPick: () => this.setState({ monPeriodo: p }),
      })),
      monKpis: (() => {
        const per = s.monPeriodo || 'Dia';
        const f = per === 'Mês' ? 28 : per === 'Ano' ? 327 : 1;
        const num = (x, d) => x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
        const en = (x) => { const v = x * f; return v >= 1000 ? { v: num(v / 1000, 2), u: 'MWh' } : { v: num(v, 2), u: 'kWh' }; };
        const money = (x) => { const v = x * f; return v >= 1000 ? { v: 'R$ ' + num(v / 1000, 1) + ' mil', u: '' } : { v: 'R$ ' + num(v, 2), u: '' }; };
        const g = en(20.5), e = en(10.5), m = money(12.3);
        return [
          { v: g.v, u: g.u, label: 'Geração solar' },
          { v: m.v, u: m.u, label: 'Economia gerada' },
          { v: e.v, u: e.u, label: 'Exportado à rede' },
        ];
      })(),
      monTopo: [
        { label: 'Rede', v: '10,00', cor: '#9aa1ad' },
        { label: 'Solar', v: '15,20', cor: '#8a5c00' },
      ],
      monBase: [
        { label: 'Cargas', v: '4,10', cor: '#c01b28' },
        { label: 'Terceiros', v: '0,00', cor: '#5d6572' },
        { label: 'Bateria 40%', v: '1,10', cor: '#0f7a51' },
      ],
      scInicioDriver: scr('inicioDriver'),
      entrarMotorista: () => this.setState({ role: 'driver', screen: 'monitor', tab: 'casa', monOrigem: 'gateDriver' }),
      scParceiros: scr('parceiros'),
      goDash: () => (this.state.screen === 'certificacao' || this.state.screen === 'parceiros') && this.state.tab === 'impacto'
        ? this.setState({ screen: 'esgGal', tab: 'impacto' })
        : this.state.parcVoltaViab && this.state.screen === 'parceiros'
        ? this.setState({ screen: 'viability', parcVoltaViab: false })
        : this.setState({ screen: 'dash', tab: 'mais', parcVoltaViab: false }),
      subTabs: [
        { label: 'Início', tela: 'dash' },
        { label: 'Gestão', tela: 'more' },
      ].map(t => ({
        label: t.label,
        bg: scr(t.tela) ? '#131c2e' : '#fff',
        fg: scr(t.tela) ? '#fff' : '#5d6572',
        border: scr(t.tela) ? '#131c2e' : '#e4e5e9',
        onPick: () => this.setState({ screen: t.tela, tab: 'mais' }),
      })),
      leedPts: 52, leedPct: '47%', leedNivel: 'Nível Silver',

      leedNota: 'Silver alcançado. Faltam 8 pontos para o nível Gold. Materiais de baixa energia incorporada e melhorias na envoltória são o caminho mais curto.',
      certBeneficios: [
        { label: 'Aluguel mais valorizado', sub: 'Lojas certificadas praticam aluguel acima da média e têm menos vacância.', icon: '🏬', bg: '#faeed3' },
        { label: 'Conta de luz menor', sub: 'Geração própria e medição por circuito derrubam o consumo da rede e a demanda contratada.', icon: '⚡', bg: '#dcf3ea' },
        { label: 'Acesso a crédito verde', sub: 'Linhas de financiamento e seguros com taxa reduzida para empreendimentos certificados.', icon: '🏦', bg: '#dee9fc' },
        { label: 'Desconto no IPTU', sub: 'Municípios com IPTU Verde concedem abatimento para edificações certificadas.', icon: '📄', bg: '#eceef2' },
        { label: 'Relatório ESG pronto', sub: 'Os dados de energia e CO₂ evitado saem direto do app para o relatório anual.', icon: '🌱', bg: '#dcf3ea' },
        { label: 'Atrai marcas âncora', sub: 'Redes com meta de carbono priorizam endereços certificados na expansão.', icon: '⭐', bg: '#fdeaec' },
      ],
      leedNiveis: [
        { label: 'Certified', pts: '40', cor: '#4b8c3b', fundo: '#eef6ea', ink: '#2f5c25', labelInk: '#5d6572' },
        { label: 'Silver', pts: '50', cor: '#7f97a8', fundo: '#e8eef2', ink: '#455966', labelInk: '#131c2e' },
        { label: 'Gold', pts: '60', cor: '#e0a52f', fundo: '#fdf4e2', ink: '#7a5406', labelInk: '#5d6572' },
        { label: 'Platinum', pts: '80', cor: '#a8adb4', fundo: '#f1f2f4', ink: '#53585f', labelInk: '#5d6572' },
      ],
      leedCreditos: [        { label: 'LT · Veículos verdes', sub: '3 vagas de recarga em 40 · atende o mínimo de 5%', pts: '+1 pt', icon: '🚗', bg: '#dee9fc' },
        { label: 'EA · Energia renovável no local', sub: '67,2 kWp instalados · cobertura, fachada BIPV e carport', pts: '+3 pts', icon: '☀️', bg: '#faeed3' },
        { label: 'EA · Medição avançada de energia', sub: 'telemetria OCPP e SEMS Plus por circuito', pts: '+1 pt', icon: '📊', bg: '#dcf3ea' },
      ],
      // Parceiros GoodWe: lista escaneável (1 linha de benefício + crédito), detalhes e ações ao tocar
      ...(() => {
        const grupo = s.parcFilter || 'Fornecedores';
        const CRED = {
          MR: { sigla: 'MR', nome: 'Materiais', fg: '#7a5406', bg: '#faeed3' },
          EA: { sigla: 'EA', nome: 'Energia', fg: '#1d4ea8', bg: '#dee9fc' },
          IP: { sigla: 'IP', nome: 'Projeto integrado', fg: '#0f5c3f', bg: '#dcf3ea' },
        };
        const LISTA = [
          { id: 'terracota', nome: 'Terracota Materiais', grupo: 'Fornecedores', tipo: 'Materiais', regiao: 'São Paulo/SP', icon: '🧱', bg: '#faeed3', cred: 'MR', resp: '2 dias',
            curto: 'Blocos e revestimentos com EPD verificada',
            desc: 'Blocos e revestimentos de baixa energia incorporada, com Declaração Ambiental de Produto (EPD) verificada. Soma no crédito MR · Divulgação de produtos.', selos: ['EPD verificada', 'MR · Materiais'] },
          { id: 'araucaria', nome: 'Araucária Madeira Certificada', grupo: 'Fornecedores', tipo: 'Madeira', regiao: 'Curitiba/PR', icon: '🌲', bg: '#dcf3ea', cred: 'MR', resp: '3 dias',
            curto: 'Madeira FSC para brises e mobiliário',
            desc: 'Madeira de manejo com cadeia de custódia FSC para brises e mobiliário da praça central.', selos: ['FSC', 'MR · Fontes responsáveis'] },
          { id: 'veu', nome: 'Véu Solar Envoltórias', grupo: 'Fornecedores', tipo: 'Fachadas e vidros', regiao: 'Campinas/SP', icon: '🪟', bg: '#dee9fc', cred: 'EA', resp: '2 dias',
            curto: 'Vidros que reduzem a climatização',
            desc: 'Vidros de controle solar e fachada ventilada: reduzem a carga da climatização e viabilizam BIPV sem aquecer a envoltória.', selos: ['EA · Eficiência', 'Conforto térmico'] },
          { id: 'vertice', nome: 'Vértice Engenharia', grupo: 'Escritórios', tipo: 'Engenharia', regiao: 'São Paulo/SP', icon: '📐', bg: '#fdeaec', cred: 'EA', resp: '1 dia',
            curto: 'Simulação energética e comissionamento',
            desc: 'Simulação energética no EnergyPlus e comissionamento fundamental, exigido pelo pré-requisito de EA.', selos: ['LEED AP', 'Comissionamento'] },
          { id: 'atelier', nome: 'Atelier Norte Arquitetura', grupo: 'Escritórios', tipo: 'Arquitetura', regiao: 'Belo Horizonte/MG', icon: '✏️', bg: '#eceef2', cred: 'IP', resp: '3 dias',
            curto: 'Projeto de retrofit com estratégias passivas',
            desc: 'Projeto integrado de retrofit com estratégias passivas, sombreamento e integração do carport fotovoltaico.', selos: ['LEED AP BD+C', 'Retrofit'] },
        ];
        const ped = s.parcPedidos || {};
        const nG = (g) => LISTA.filter(p => p.grupo === g).length;
        return {
          parcFiltros: ['Fornecedores', 'Escritórios'].map(f => ({
            label: f, n: nG(f),
            bg: grupo === f ? '#fff' : 'transparent', fg: grupo === f ? '#131c2e' : '#7c8494',
            sombra: grupo === f ? '0 2px 8px rgba(19,28,46,.12)' : 'none',
            nBg: grupo === f ? '#d31e2c' : '#e4e5e9', nFg: grupo === f ? '#fff' : '#5d6572',
            onPick: () => this.setState({ parcFilter: f, parcAberto: null }),
          })),
          parcIntro: grupo === 'Fornecedores'
            ? 'Materiais que somam créditos LEED de Materiais (MR) e Energia (EA).'
            : 'Escritórios que conduzem projeto, simulação e comissionamento.',
          parceiros: LISTA.filter(p => p.grupo === grupo).map(p => {
            const aberto = s.parcAberto === p.id, st = ped[p.id];
            const c = CRED[p.cred];
            return {
              ...p, aberto, seta: aberto ? '⌃' : '⌄',
              borda: aberto ? '#d31e2c' : '#e4e5e9', sombra: aberto ? '0 6px 18px rgba(19,28,46,.08)' : 'none',
              credTxt: c.sigla + ' · ' + c.nome, credFg: c.fg, credBg: c.bg,
              status: st === 'contato' ? '✓ Contato solicitado' : st === 'proposta' ? '✓ Proposta pedida' : '',
              statusVis: st ? 'inline-flex' : 'none',
              onToggle: () => this.setState(q => ({ parcAberto: q.parcAberto === p.id ? null : p.id })),
              btnContato: st === 'contato' ? '✓ Contato solicitado' : 'Solicitar contato',
              btnContatoBg: st === 'contato' ? '#dcf3ea' : '#d31e2c', btnContatoFg: st === 'contato' ? '#0f5c3f' : '#fff',
              onContato: () => { this.setState(q => ({ parcPedidos: { ...(q.parcPedidos || {}), [p.id]: 'contato' } })); this.say('Pedido enviado a ' + p.nome + '. O parceiro responde em até ' + p.resp + ' úteis.'); },
              onProposta: () => { this.setState(q => ({ parcPedidos: { ...(q.parcPedidos || {}), [p.id]: q.parcPedidos && q.parcPedidos[p.id] === 'contato' ? 'contato' : 'proposta' } })); this.say('Briefing da galeria Pátio Norte compartilhado com ' + p.nome + '.'); },
            };
          }),
          parcCount: nG(grupo) + (nG(grupo) === 1 ? ' parceiro' : ' parceiros'),
        };
      })(),
      temSolucao: s.hasSolution !== false,
      viabSub: s.hasSolution === false ? 'Antes de instalar · estimativas paramétricas' : 'Ajuste a tarifa base da galeria',
      entrarComSolucao: () => this.setState({ hasSolution: true, screen: 'dash', tab: 'mais' }),
      entrarSemSolucao: () => this.setState({ hasSolution: false, screen: 'viability', tab: 'viab', viabFromCadastro: false }),
      resetDemo: () => this.hwReset(),
      logout: () => this.setState({ screen: 'role', role: null, logged: false, pendingRole: null, hasSolution: null }),
      goRole: () => this.setState({ screen: 'role', role: null }),
      goAnf: () => this.setState({ role: 'driver', screen: 'anf', tab: 'casa' }),
      backHome: () => this.setState({ screen: s.role === 'host' ? 'more' : 'profile', tab: s.role === 'host' ? 'mais' : 'perfil' }),
      goAddCharger: () => this.setState({ role: 'host', screen: 'addCharger', addOrigem: 'lista' }),
      backFromAdd: () => this.setState(p => p.addOrigem === 'site'
        ? { screen: 'chargers', tab: 'vagas', viabFromCadastro: false }
        : { screen: 'vagas', tab: 'vagas', viabFromCadastro: false }),
      viabSaida: s.hasSolution !== false || s.viabFromCadastro,
      backFromViab: () => this.setState(p => p.viabFromCadastro
        ? { screen: 'addCharger', viabFromCadastro: false }
        : p.hasSolution === false
          ? { screen: 'viability', tab: 'viab' }
          : { screen: 'dash', tab: 'mais' }),
      addComSite: s.addOrigem === 'site',
      addSemSite: s.addOrigem !== 'site',
      addTitulo: s.addOrigem === 'site' ? 'Cadastrar vaga' : 'Novo eletroposto',
      addSub: s.addOrigem === 'site'
        ? (s.sites.find(x => x.id === (s.siteSel || 'pn')) || s.sites[0]).nome
        : 'Informe o endereço da nova galeria',
      addEndereco: (s.sites.find(x => x.id === (s.siteSel || 'pn')) || s.sites[0]).endereco,
      addVagasAtuais: s.chargers.filter(c => c.site === (s.siteSel || 'pn')).length + ' vagas já cadastradas',
      voltarForm: () => this.setState({ screen: 'addCharger' }),
      goScanDevice: () => this.setState({ screen: 'scanDevice' }),
      goManual: () => this.setState({ screen: 'manualDevice' }),
      goViability: () => this.setState({ screen: 'viability', viabFromCadastro: true }),
      concluirLabel: s.hasSolution === false ? 'Continuar para Análise de Viabilidade' : 'Concluir cadastro da vaga',
      concluirCadastro: () => {
        if (s.hasSolution === false) { this.setState({ screen: 'viability', viabFromCadastro: true }); return; }
        if (!paramOk) { this.say('Conclua a parametrização da tarifa base em Tarifa antes de publicar o eletroposto.'); return; }
        if (!repasseOk) { this.say('Cadastre a conta de repasse em Conta antes de receber a primeira sessão.'); return; }
        // cria a vaga de fato na lista, já disponível
        const site = s.siteSel || 'pn';
        const n = s.chargers.filter(c => c.site === site).length + 1;
        const num = String(n).padStart(2, '0');
        const kwTxt = (s.modelo && s.modelo.meta ? s.modelo.meta.split(' · ')[0] : '7 kW');
        const nova = {
          id: 'c' + Date.now(), site, nome: 'Vaga ' + num, evse: 'PN-EVSE-' + num,
          serie: 'GWH7-' + (2860 + n * 7) + '-BR', conector: 'Tipo 2 · ' + kwTxt,
          status: 'livre', preco: (s.chargers.find(c => c.site === site) || {}).preco || 2.19, hoje: 0, total: 0,
        };
        this.setState(p => ({ chargers: [...p.chargers, nova], screen: 'vagas', tab: 'vagas', viabFromCadastro: false }));
        this.say('Vaga ' + num + ' cadastrada e publicada no mapa.');
      },
      registerDevice: () => this.setState({ screen: 'deviceResult', modelo: MODELOS[0] }),
      openBox: () => this.setState({ screen: 'box' }),
      closeBox: () => this.setState({ screen: s.role === 'host' ? 'chargers' : 'anf', tab: 'vagas' }),

      svcIA: () => this.setState({ screen: 'assistente', tab: 'ia' }),
      svcVeiculo: () => this.setState({ screen: 'profile', tab: 'perfil' }),
      svcCarteira: () => this.setState({ screen: 'wallet', tab: 'inicio' }),
      svcComoFunciona: () => this.say('Ache a vaga, leia o QR Code, escolha o modo e pague só os kWh entregues.'),
      svcReportar: () => this.say('Chamado aberto na assistência GoodWe com o último status da vaga.'),
      svcNovidades: () => this.say('Recarga por Km e tarifa travada no plug-in chegaram nesta versão.'),
      accountRows: (s.role === 'host'
        ? [
          { label: 'Detalhes do APP', value: 'Novo', onPick: () => this.say('Versão 3.4.1 · protótipo acadêmico.') },
          { label: 'Galeria', value: 'Pátio Norte', onPick: () => this.say('CNPJ e dados do empreendimento cadastrados.') },
          { label: 'Status ChargeGrid', value: s.hasSolution === false ? 'avaliando' : 'ativo', onPick: () => this.setState({ screen: 'gate' }) },
          { label: 'Conta de repasse', value: 'Pix ***@patio', onPick: () => this.say('Repasse via Pix todo dia 5.') },
          { label: 'Segurança da Conta', value: '2FA', onPick: () => this.say('Autenticação em dois fatores ativa.') },
        ]
        : [
          { label: 'Detalhes do APP', value: 'Novo', onPick: () => this.say('Versão 3.4.1 · protótipo acadêmico.') },
          { label: 'Carteira · Recarga Compartilhada', value: BRL(s.saldo), onPick: () => this.setState({ role: 'driver', screen: 'wallet', tab: 'inicio' }) },
          { label: 'Meu carregador em casa', value: 'HCA G2 · 7 kW', onPick: () => this.setState({ role: 'driver', screen: 'anf' }) },
          { label: 'Notificações', value: 'ativadas', onPick: () => this.say('Notificações de vaga livre e de repasse ativas.') },
          { label: 'Segurança da Conta', value: '2FA', onPick: () => this.say('Autenticação em dois fatores ativa.') },
        ]).map((r, i, arr) => ({ ...r, line: i === arr.length - 1 ? 'transparent' : '#e4e5e9' })),

      meusCarregadores: s.anfChargers.map(c => ({
        nome: c.nome, sub: c.sub,
        chip: c.pub ? '● Online' : '● Desligado',
        chipBg: c.pub ? '#dcf3ea' : '#eceef2',
        chipFg: c.pub ? '#149d68' : '#7c8494',
        onToggle: () => this.setState(p => ({ anfChargers: p.anfChargers.map(x => x.id === c.id ? { ...x, pub: !x.pub } : x) })),
      })),
      pubBg: s.pub ? '#149d68' : '#d6d9df', pubX: s.pub ? '23px' : '3px',
      pubChip: s.pub ? '● Programada para 23h' : '● Programação desligada',
      pubChipBg: s.pub ? '#dcf3ea' : '#eceef2', pubChipFg: s.pub ? '#149d68' : '#7c8494',
      togglePub: () => this.setState(p => ({ pub: !p.pub })),
      precoAnf: BRL(s.precoAnf),
      precoDec: () => this.bump('precoAnf', -0.05, 0.5, 5),
      precoInc: () => this.bump('precoAnf', 0.05, 0.5, 5),
      ganhoHoje: 'R$ 34,78', ganhoMes: 'R$ 612,40',
      ultimasRecargas: [
        { carro: 'Megane E-Tech · noturna', quando: 'Hoje · 23:10 · 31,0 kWh · 86% próprio', valor: 'R$ 18,60' },
        { carro: 'Megane E-Tech · noturna', quando: '05/09 · 23:05 · 22,5 kWh · 86% próprio', valor: 'R$ 13,50' },
        { carro: 'Megane E-Tech · noturna', quando: '02/09 · 23:00 · 28,4 kWh · 91% próprio', valor: 'R$ 14,20' },
      ],

      cep: s.cep, cepStatus: s.cepStatus,
      setCep: (e) => this.setState({ cep: e.target.value }),
      lookupCep: () => {
        const k = (s.cep || '').replace(/\D/g, '');
        const hit = CEPS[k];
        this.setState(hit
          ? { addr: hit, cepStatus: 'Endereço encontrado. Confira e complete o número.' }
          : { addr: null, cepStatus: 'CEP não encontrado na base de demonstração. Tente 01310-100 ou 04538-133.' });
      },
      temEndereco: !!s.addr,
      addrRua: s.addr ? s.addr.rua : '', addrBairro: s.addr ? s.addr.bairro : '', addrCidade: s.addr ? s.addr.cidade : '',
      addrNumero: s.addrNumero, setNumero: (e) => this.setState({ addrNumero: e.target.value }),
      qty: s.qty, qtyDec: () => this.bump('qty', -1, 1, 12), qtyInc: () => this.bump('qty', 1, 1, 12),
      modelos: MODELOS.map(m => ({
        code: m.code, meta: m.meta, icon: m.icon,
        border: s.modelo && s.modelo.code === m.code ? '#00d1ff' : '#e4e5e9',
        onPick: () => this.setState({ modelo: m, screen: 'deviceResult' }),
      })),
      modeloNome: s.modelo ? s.modelo.code : 'GW7K-HCA-20',
      modeloMeta: s.modelo ? s.modelo.meta : '7 kW · Monofásico · 230V, 32A · Tipo 2',
      serie: s.serie,

      vagasAnf: s.vagasAnf,
      vagasDec: () => this.bump('vagasAnf', -1, 1, 12), vagasInc: () => this.bump('vagasAnf', 1, 1, 12),
      tarifaRede: BRL(s.tarifaRede),
      tarifaDec: () => this.bump('tarifaRede', -0.02, 0.2, 3), tarifaInc: () => this.bump('tarifaRede', 0.02, 0.2, 3),

      metragem: s.metragem + ' m²',
      metragemDec: () => this.bump('metragem', -50, 100, 5000), metragemInc: () => this.bump('metragem', 50, 100, 5000),
      areaBateriaFmt: s.areaBateria + ' m²',
      areaBatDec: () => this.bump('areaBateria', -5, 0, 300), areaBatInc: () => this.bump('areaBateria', 5, 0, 300),
      vagasDesejadas: s.vagasDesejadas,
      vagasDesDec: () => this.bump('vagasDesejadas', -1, 1, 12), vagasDesInc: () => this.bump('vagasDesejadas', 1, 1, 12),
      excedeVagas: s.vagasDesejadas > V.maxVagas,
      avisoVagas: 'Acima do suportado pela geração: ' + V.maxVagas + ' vagas com ' + V.evPct + '% do sol para o eletroposto. A rede cobre a diferença e o custo sobe.',
      // ---- simuladores do prospect no mesmo estilo do simulador do gestor
      ...(() => {
        const vv = (n, c = 1) => n.toFixed(c).replace('.', ',');
        const chip = (on) => ({ bg: on ? '#dcf3ea' : '#fff3d6', fg: on ? '#0f5c3f' : '#7a5406' });
        const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
        const num = (key, min, max) => (e) => this.setState({ [key]: Math.max(min, Math.min(max, Math.round(Number(e.target.value) || 0))) });
        return {
          pvMetragem: s.metragem, pvMetragemOn: num('metragem', 100, 50000),
          pvConsumo: 'Consumo estimado: ' + Math.round(V.consumoBase) + ' kWh/dia (60 kWh/m² ao ano)',
          pvVagas: s.vagasDesejadas, pvVagasOn: num('vagasDesejadas', 1, 40),
          pvVagasSug: 'Sugestão pela geração: ' + V.maxVagas + (V.maxVagas === 1 ? ' vaga' : ' vagas'),
          pvSup: [['roof', 'Cobertura solar', '🏢'], ['facade', 'Fachada solar (BIPV)', '🪟'], ['carport', 'Carport solar', '🚗']].map(([k, label, ico]) => {
            const f = V.fontes.find(x => x.k === k);
            return {
              k, label, ico, area: s.fontes[k].area,
              det: f.area > 0 ? f.placas + ' placas · ' + vv(f.kwp) + ' kWp' + (k === 'facade' ? ' · rende 55% da cobertura' : k === 'carport' ? ' · rende 90% da cobertura' : '') : 'digite os m² disponíveis',
              onChange: (e) => { const val = Math.max(0, Math.min(20000, Math.round(Number(e.target.value) || 0))); this.setState(p => ({ fontes: { ...p.fontes, [k]: { sel: val > 0, area: val } } })); },
              obsVis: k === 'carport' ? 'block' : 'none',
              obs: 'Carport conta como área construída não computável (cobertura de estacionamento, LPUOS — Lei 16.402/2016, art. 62) só enquanto a soma das áreas não computáveis dos incisos I a VI ficar em até 59% da área construída total; em ZEU vale ainda o limite de 1 vaga a cada 70 m² de área computável, com até 32 m² por vaga. Passou disso, pode exigir outorga onerosa. Confirmar com o arquiteto.',
            };
          }),
          pvKwp: vv(V.kwp) + ' kWp', pvKwpSub: vv(V.kwpEf) + ' kWp efetivos · ' + V.placas + ' placas',
          pvMod: V.baterias, pvModOn: (e) => this.setState({ viabMod: Math.max(0, Math.min(40, Math.round(Number(e.target.value) || 0))) }),
          pvBatTot: V.capBat + ' kWh · ' + vv(V.baterias * 1.6) + ' m² de sala',
          pvModRecTxt: V.baterias === V.modRec ? '✓ Adequado à área solar' : 'Adequado à área: ' + V.modRec + (V.modRec === 1 ? ' módulo' : ' módulos'),
          pvModRecBg: chip(V.baterias === V.modRec).bg, pvModRecFg: chip(V.baterias === V.modRec).fg,
          pvModRec: () => this.setState({ viabMod: null }),
          pvSolarDia: Math.round(V.eDia).toLocaleString('pt-BR') + ' kWh/dia', pvSolarMes: Math.round(V.eDia * 30).toLocaleString('pt-BR') + ' kWh/mês em média',
          pvHspTabs: [['ano', 'Média do ano', V.HSP_ANO], ['min', meses[V.mesMin] + ' (mês mais fraco)', V.HSP_MES[V.mesMin]]].map(([k, l, h]) => {
            const on = (s.viabHsp || 'ano') === k;
            return { label: l, sub: vv(h) + ' kWh/m²·dia', bg: on ? '#0f2a47' : '#fff', fg: on ? '#fff' : '#131c2e', sub2: on ? '#9fb6cd' : '#7c8494', borda: on ? '#0f2a47' : '#e4e5e9', onPick: () => this.setState({ viabHsp: k }) };
          }),
          pvEvPct: V.evPct, pvEvOn: num('viabEvPct', 0, 100), pvEvGal: 'Galeria fica com ' + (100 - V.evPct) + '% do sol',
          pvEvSug: V.evPct === 80 ? '✓ Sugestão aplicada: 80% (regra de rateio)' : 'Usar sugestão: 80% (regra de rateio)',
          pvEvSugBg: chip(V.evPct === 80).bg, pvEvSugFg: chip(V.evPct === 80).fg, pvEvSugPick: () => this.setState({ viabEvPct: null }),
          pvEfPct: V.efPct, pvEfOn: num('viabEfPct', 0, 40),
          pvEfOpcoes: [0, 15, 20, 25].map(p => ({ label: p ? p + '%' : 'sem', bg: V.efPct === p ? '#0f2a47' : '#fff', fg: V.efPct === p ? '#fff' : '#131c2e', borda: V.efPct === p ? '#0f2a47' : '#e4e5e9', onPick: () => this.setState({ viabEfPct: p }) })),
          pvEfHvac: 'Climatização: ~' + Math.round(V.consumoBase * 0.45) + ' kWh/dia (45% do consumo da galeria) · faixa típica de 15% a 25%',
          pvEfReal: [{ t: 'Vidro de controle solar ou película nas fachadas', p: '8%' }, { t: 'Cobertura fria e isolamento da laje', p: '5%' }, { t: 'Ajuste de setpoint e automação da climatização', p: '5%' }],
          pvEfRealTxt: V.efPct === 18 ? '✓ Estimativa realista aplicada: 18%' : 'Aplicar estimativa realista: 18%',
          pvEfRealBg: chip(V.efPct === 18).bg, pvEfRealFg: chip(V.efPct === 18).fg, pvEfRealPick: () => this.setState({ viabEfPct: 18 }),
          pvEfVis: V.efPct > 0,
          pvEfEcon: Math.round(V.econEf) + ' kWh/dia', pvEfEconMes: 'R$ ' + Math.round(V.econEf * 30).toLocaleString('pt-BR') + '/mês', pvEfSol: Math.round(V.solLiberado) + ' kWh/dia',
          pvSugVagas: String(V.maxVagas),
          pvSugTxt: V.maxVagas > 0 ? (V.maxVagas === 1 ? 'vaga de 7 kW' : 'vagas de 7 kW') + ' alimentadas pelo sol, com ' + V.evPct + '% para o eletroposto' : 'a geração ainda não sustenta uma vaga de 7 kW',
          pvSugConta: '⌊(' + Math.round(V.eDia).toLocaleString('pt-BR') + ' kWh/dia × ' + V.evPct + '%' + (V.solLiberado > 0.5 ? ' + ' + Math.round(V.solLiberado) + ' kWh da eficiência' : '') + ') ÷ (7 kW × ' + V.HSP_ANO.toFixed(1).replace('.', ',') + ' h de sol pleno)⌋',
          pvSugChip: V.vagas === V.maxVagas ? '✓ Simulação já usa as vagas sugeridas' : V.vagas > V.maxVagas ? 'Você pediu ' + V.vagas + ': ' + (V.vagas - V.maxVagas) + ' acima do sol, a rede cobre a diferença' : 'Você pediu ' + V.vagas + ': cabem mais ' + (V.maxVagas - V.vagas) + ' com o sol',
          pvSugBtn: V.vagas !== V.maxVagas && V.maxVagas > 0,
          pvSugUsar: () => this.setState({ vagasDesejadas: Math.max(1, Math.min(12, V.maxVagas)) }),
          pvParceiros: () => this.setState({ screen: 'parceiros', parcFilter: 'Fornecedores', parcAberto: 'veu', parcVoltaViab: true }),
        };
      })(),

      ...(() => {
        const setArea = (k) => (e) => {
          const v = Math.max(0, Math.min(20000, Math.round(Number(e.target.value) || 0)));
          this.setState(p => ({ fontes: { ...p.fontes, [k]: { sel: v > 0, area: v } } }));
        };
        const ger = (k) => {
          const f = V.fontes.find(x => x.k === k);
          const kwhDia = f.kwpEf * (V.kwpEf > 0 ? V.gerado / V.kwpEf : 0);
          return f.area > 0 ? f.placas + ' placas · ' + f.kwp.toFixed(1).replace('.', ',') + ' kWp · ' + kwhDia.toFixed(0) + ' kWh/dia' : 'sem área informada';
        };
        const kwhDia = V.gerado;
        const kwhMes = kwhDia * 30;
        const fatDia = V.evTotal * s.precoVenda * 0.9;
        const co2Ano = kwhDia * 365 * 0.0817 / 1000; // fator médio do SIN, tCO₂/MWh
        const fmtK = (v) => v >= 1000 ? (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MWh' : Math.round(v).toLocaleString('pt-BR') + ' kWh';
        const fmtR = (v) => v >= 100000 ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil' : BRL(v);
        return {
          areaRoof: String(s.fontes.roof.area), areaCarport: String(s.fontes.carport.area), areaFacade: String(s.fontes.facade.area),
          setAreaRoof: setArea('roof'), setAreaCarport: setArea('carport'), setAreaFacade: setArea('facade'),
          gerRoof: ger('roof'), gerCarport: ger('carport'), gerFacade: ger('facade'),
          resKwp: V.kwp.toFixed(1).replace('.', ','),
          resPlacas: V.placas,
          resGeracao: V.kwp > 0 ? 'Geração = kWp efetivo × irradiação de São Paulo (' + V.hsp.toFixed(1).replace('.', ',') + ' kWh/m²·dia) × 0,72; fachada rende 55% e carport 90% da cobertura.' : 'Informe ao menos uma área para estimar a geração.',
          resVagas: String(V.maxVagas),
          resVagasSub: V.maxVagas > 0 ? 'com ' + V.evPct + '% do sol para o eletroposto' + (V.solLiberado > 0.5 ? ' e a eficiência energética' : '') : 'geração insuficiente para uma vaga',
          resKwhDia: fmtK(kwhDia),
          resKwhMes: fmtK(kwhMes),
          resFatMes: fmtR(fatDia * 26),
          resFatAno: fmtR(fatDia * 26 * 12),
          resFatNota: 'Com ' + V.vagas + (V.vagas === 1 ? ' vaga' : ' vagas') + ' a ' + BRL(s.precoVenda) + '/kWh e a ocupação do perfil, ' + V.evTotal.toFixed(0) + ' kWh/dia entregues em 26 dias de operação por mês. Custo da rede já descontado abaixo, no Balanço do dia.',
          usarSugestao: () => this.setState({ vagasDesejadas: Math.max(1, Math.min(12, V.maxVagas)) }),
          usarSugestaoLabel: s.vagasDesejadas === V.maxVagas ? 'Simulando com as ' + V.maxVagas + ' vagas sugeridas' : 'Simular com ' + V.maxVagas + (V.maxVagas === 1 ? ' vaga sugerida' : ' vagas sugeridas'),
          instAberto: !!s.instAberto,
          instToggle: () => this.setState(q => ({ instAberto: !q.instAberto })),
          instBtnLabel: s.instAberto ? 'Fechar instaladores' : 'Instalar · contate um instalador GoodWe',
          instBriefing: [
            { k: 'Solar', v: V.kwp.toFixed(1).replace('.', ',') + ' kWp · ' + V.placas + ' placas' },
            { k: 'Baterias', v: V.baterias + ' mód. · ' + V.baterias * 15 + ' kWh' },
            { k: 'Eletroposto', v: Math.max(1, V.maxVagas) + ' vagas de 7 kW' },
            { k: 'Inversor', v: 'híbrido GoodWe · ~' + Math.max(10, Math.ceil(V.kwp * 0.8 / 5) * 5) + ' kW' },
          ],
          instLista: [
            { id: 'i1', nome: 'Sollar Prime Instalações', ini: 'SP', cor: '#0f2a47', regiao: 'São Paulo capital e ABC', espec: 'Comercial · BESS · eletropostos', visita: 'visita em até 3 dias úteis', nota: '4,9' },
            { id: 'i2', nome: 'Ampere Engenharia Solar', ini: 'AE', cor: '#f5333f', regiao: 'Grande São Paulo', espec: 'Fachada BIPV · carport solar', visita: 'visita em até 5 dias úteis', nota: '4,8' },
            { id: 'i3', nome: 'Raio Verde Energia', ini: 'RV', cor: '#0f8a5f', regiao: 'São Paulo e interior', espec: 'Retrofit de galerias · O&M', visita: 'visita em até 7 dias úteis', nota: '4,7' },
          ].map(i => {
            const ped = (s.instPedidos || {})[i.id];
            return { ...i, pedido: !!ped, livre: !ped,
              onPedir: () => { this.setState(q => ({ instPedidos: { ...(q.instPedidos || {}), [i.id]: true } })); this.say('Pedido de visita técnica enviado a ' + i.nome + ' com o dimensionamento da simulação.'); } };
          }),
          instPedidosN: Object.keys(s.instPedidos || {}).length,
          instResumo: Object.keys(s.instPedidos || {}).length ? '✓ ' + Object.keys(s.instPedidos || {}).length + ' pedido(s) enviado(s). O instalador confirma a visita técnica e faz o projeto executivo.' : 'O dimensionamento acima vai junto no pedido; o orçamento final sai depois da visita técnica.',
          verdeItens: [
            { valor: co2Ano.toFixed(1).replace('.', ',') + ' t', label: 'CO₂ evitado por ano' },
            { valor: Math.round(co2Ano * 1000 / 22).toLocaleString('pt-BR'), label: 'árvores equivalentes' },
            { valor: Math.round(kwhDia * 365 / 1500).toLocaleString('pt-BR'), label: 'casas abastecidas por ano' },
            { valor: '+' + (V.kwp >= 20 ? 3 : V.kwp > 0 ? 1 : 0) + ' pts', label: 'LEED · energia renovável no local' },
          ],
          verdeNota: 'Argumentos prontos para fachada, site e negociação com lojistas: recarga movida a sol, painel de impacto em tempo real no app e trilha para certificação LEED e AQUA-HQE.',
        };
      })(),

      dimLinhas: [
        { k: 'Placas instaláveis', v: V.placas + ' un · ' + (2.256).toFixed(3).replace('.', ',') + ' m² cada' },
        { k: 'Potência instalada', v: V.kwp.toFixed(2).replace('.', ',') + ' kWp' },
        { k: 'Potência efetiva (orientação)', v: V.kwpEf.toFixed(2).replace('.', ',') + ' kWp' },
        { k: 'Geração de pico (×0,72)', v: V.pico.toFixed(2).replace('.', ',') + ' kW' },
        { k: 'Máximo de vagas suportadas', v: V.maxVagas + ' vagas de 7 kW' },
        { k: 'Baterias na sala', v: V.baterias + ' módulos · ' + V.capBat + ' kWh' },
        { k: 'Consumo médio da galeria', v: V.consumoGaleriaDia.toFixed(2).replace('.', ',') + ' kWh/dia' },
        { k: 'Distribuído entre 6h e 22h', v: V.galeriaTotal.toFixed(2).replace('.', ',') + ' kWh (curva horária da galeria)' },
      ],

      curva: V.horas.map(x => ({
        rotulo: x.h % 3 === 0 ? String(x.h) + 'h' : '',
        hSolar: Math.max(2, x.solar / V.maxBar * 100).toFixed(0) + '%',
        hCarga: Math.max(2, (x.demandaEv + x.galeria) / V.maxBar * 100).toFixed(0) + '%',
        hRede: (x.rede / V.maxBar * 100).toFixed(0) + '%',
        temRede: x.rede > 0.05,
      })),
      tabelaHoras: V.horas.filter(x => x.h % 2 === 0).map(x => ({
        hora: (x.h < 10 ? '0' + x.h : x.h) + 'h',
        fase: x.fase,
        carros: x.carros + ' EV',
        solar: x.solar.toFixed(1).replace('.', ',') + ' kWh',
        rede: x.rede.toFixed(1).replace('.', ',') + ' kWh',
        custo: BRL(x.custo),
        soc: Math.round(V.capBat > 0 ? x.soc / V.capBat * 100 : 0) + '%',
        bg: x.rede > 0.05 ? '#fdeaec' : 'transparent',
      })),

      resumoLinhas: [
        { k: 'Gerado pelo solar', v: V.gerado.toFixed(1).replace('.', ',') + ' kWh/dia' },
        { k: 'Entregue aos EVs', v: V.evTotal.toFixed(1).replace('.', ',') + ' kWh/dia' },
        { k: 'Consumo da galeria', v: V.galeriaTotal.toFixed(1).replace('.', ',') + ' kWh/dia' },
        { k: 'Armazenado na bateria', v: V.armazenado.toFixed(1).replace('.', ',') + ' kWh/dia' },
        { k: 'Importado da rede', v: V.redeTotal.toFixed(1).replace('.', ',') + ' kWh/dia' },
      ],
      custoDia: BRL(V.custo),
      custoKwh: BRL(V.custoKwhEv),
      bandaFora: BRL(V.bandas.fora), bandaInter: BRL(V.bandas.inter), bandaPonta: BRL(V.bandas.ponta),
      tarifaBase: BRL(s.tarifaBase),
      baseDec: () => this.bump('tarifaBase', -0.05, 0.3, 3), baseInc: () => this.bump('tarifaBase', 0.05, 0.3, 3),
      precoVenda: BRL(s.precoVenda),
      vendaDec: () => this.bump('precoVenda', -0.05, 0.5, 6), vendaInc: () => this.bump('precoVenda', 0.05, 0.5, 6),
      margemFmt: V.custoKwhEv < 0.005 ? 'sem custo de rede' : V.margemPct > 900 ? '> 900%' : Math.round(V.margemPct) + '%',
      pisoPreco: BRL(V.piso),
      receitaDia: BRL(V.receitaDia),
      lucroDia: BRL(V.lucroDia), lucroMes: BRL(V.lucroMes),
      applyPrice: () => {
        this.setState(p => ({
          baseSites: { ...p.baseSites, [p.siteSel || 'pn']: Math.round(p.precoVenda * 100) / 100 },
          baseTexto: undefined, baseTextoSite: undefined,
          screen: p.hasSolution === false ? 'sim' : 'tariff', tab: p.hasSolution === false ? 'sim' : 'tarifa', role: 'host',
        }));
        this.say(s.hasSolution === false
          ? 'Preço de referência de ' + BRL(s.precoVenda) + '/kWh salvo na sua simulação.'
          : 'Tarifa base ajustada para ' + BRL(s.precoVenda) + '/kWh. A IA modula a partir dela.');
      },

      boxLed: s.running ? '#149d68' : '#3577f1',
      boxAnim: s.running ? 'cgPulse 1.2s ease-in-out infinite' : 'none',
      boxStatus: s.running ? '🟢 Carregando · 6,8 kW' : '🔵 Disponível para recarga',
      recHost: rec ? BRL(rec.split ? rec.split.anfitriao : rec.total * 0.9) : '', recFee: rec ? BRL(rec.split ? rec.split.plataforma : rec.total * 0.1) : '',

      screenCaption: scr('account') ? 'Gestor · conta'
        : scr('anf') ? 'Motorista · carregador residencial'
        : scr('addCharger') || scr('scanDevice') || scr('manualDevice') || scr('deviceResult') || scr('viability') || scr('box')
          ? 'Gestor · ' + (scr('addCharger') ? 'cadastro da vaga e CEP' : scr('scanDevice') ? 'leitura do QR da wallbox' : scr('manualDevice') ? 'escolha do modelo' : scr('deviceResult') ? 'equipamento identificado' : scr('viability') ? 'viabilidade e preço' : 'wallbox em demonstração')
        : scr('registrar') ? 'Criar conta'
        : scr('gate') ? 'Gestor · acessar ChargeGrid'
        : prospect ? 'Gestor sem a solução · ' + (scr('sim') ? 'simulador de vagas' : 'análise de viabilidade')
        : !s.role ? 'Login · escolha de papel'
        : isDriver ? 'Motorista · ' + (scr('map') ? 'carga · QR, histórico e carteira' : scr('detail') ? 'detalhe do ponto' : scr('scan') ? 'liberação por QR Code' : scr('confirm') ? 'modo de carregamento' : scr('quantidade') ? 'quantidade e estimativa' : scr('pagamento') ? 'forma de pagamento e pré-autorização' : scr('live') ? 'sessão ao vivo' : scr('receipt') ? 'recibo e captura' : scr('wallet') ? 'carteira e créditos' : scr('history') ? 'histórico casa + eletropostos' : scr('esg') ? 'métricas de sustentabilidade' : scr('inicioDriver') ? 'início · serviços e mapa' : scr('gateDriver') ? 'casa · entrada residencial' : scr('monitor') ? 'casa · fluxo de energia' : scr('anf') ? 'casa · carregador residencial' : scr('assistente') ? 'assistente IA · conversa' : scr('rota') ? 'encontrar eletroposto · busca e sugestões' : scr('rotaGo') ? 'ir até lá · rota no Google Maps' : 'perfil e veículo')
        : scr('vagaDetail') ? 'Gestor · detalhe da vaga · DLM e OCPP'
        : scr('alertas') ? 'Gestor · alertas por severidade'
        : scr('certificacao') ? 'Gestor · ESG e certificação'
        : scr('esgGal') ? 'Gestor · impacto ambiental da galeria'
        : scr('horarios') ? 'Gestor · fases operacionais e horário'
        : scr('vagas') ? 'Gestor · vagas e falhas OCPP'
        : 'Gestor · ' + (scr('dash') ? 'início · eletroposto e serviços' : scr('chargers') ? 'painel · energia e balanço do dia' : scr('tariff') ? 'tarifa base e fator α' : scr('sindico') ? 'Síndico Virtual' : scr('previsao') ? 'previsão de demanda · machine learning' : scr('sim') ? 'simulador de vagas' : scr('eletropostos') ? 'lista de eletropostos' : scr('parceiros') ? 'parceiros GoodWe e LEED' : 'financeiro · receita, economia e repasse'),

      enterDriver: () => this.setState(p => p.logged
        ? { role: 'driver', screen: 'inicioDriver', tab: 'inicio' }
        : { pendingRole: 'driver', screen: 'login' }),
      enterHost: () => this.setState(p => p.logged
        ? { role: 'host', screen: p.hasSolution === null ? 'gate' : p.hasSolution ? 'dash' : 'viability', tab: p.hasSolution === false ? 'viab' : 'mais' }
        : { pendingRole: 'host', screen: 'login' }),
      switchRole: () => isDriver
        ? this.setState(p => ({ role: 'host', screen: p.hasSolution === null ? 'gate' : p.hasSolution ? 'dash' : 'viability', tab: p.hasSolution === false ? 'viab' : 'mais' }))
        : this.setState({ role: 'driver', screen: 'inicioDriver', tab: 'inicio' }),
      switchLabel: isDriver ? 'Entrar como gestor da galeria' : 'Entrar como motorista',
      roleLabel: isDriver ? 'Motorista' : 'Gestor',

      showTabs: noTab.indexOf(s.screen) === -1,
      showCtaBar: scr('confirm') || scr('pagamento'),
      ctaLabel: scr('pagamento') ? (s.pay && s.pay.fase === 'autorizando' ? 'Autorizando pagamento…' : s.pay && s.pay.fase === 'pix' ? 'Aguardando o Pix…' : 'Pagar e liberar carga') : 'Continuar',
      ctaAction: scr('pagamento')
        ? this.startSession
        : () => {
          if (!s.modo) { this.say('Selecione o modo de carregamento para seguir.'); return; }
          if (this.metaKwh() <= 0.05) { this.say('Informe quanto você quer carregar para seguir.'); return; }
          this.setState({ screen: 'pagamento', tab: 'carga' });
        },
      tabs: tabDef.map(t => ({
        label: t.label, r: t.r,
        wmark: t.ico === 'w',
        icoCasa: t.ico === 'casa', icoCarga: t.ico === 'carga', icoIA: t.ico === 'ia', icoImpacto: t.ico === 'impacto',
        icoPainel: t.ico === 'painel', icoFinanceiro: t.ico === 'financeiro',
        icoDisp: t.ico === 'disp', icoServ: t.ico === 'serv', icoConta: t.ico === 'conta',
        icoViab: t.ico === 'viab', icoVagas: t.ico === 'vagas',
        shape: !t.ico,
        dot: t.dot && s.chargers.some(c => c.status === 'falha'),
        color: activeTab === t.key ? '#f5333f' : '#9aa0ac',
        fill: activeTab === t.key ? '#f5333f' : 'transparent',
        onPick: () => this.setState({ tab: t.key, screen: t.go }),
      })),

      pins: SPOTS.map(p => ({
        x: p.x, y: p.y, badge: p.status === 'falha' ? '!' : String(p.livres),
        color: p.status === 'livre' ? '#149d68' : p.status === 'ocupado' ? '#3577f1' : '#f5333f',
        aberto: s.spotAberto === p.id,
        seta: s.spotAberto === p.id ? '⌃' : '⌄',
        borda: s.spotAberto === p.id ? '#00d1ff' : '#e4e5e9',
        sombra: s.spotAberto === p.id ? '0 0 10px rgba(0,209,255,.45)' : 'none',
        embed: 'https://maps.google.com/maps?q=' + p.lat + ',' + p.lng + '&z=16&output=embed',
        endereco: p.endereco,
        onToggle: () => this.setState(q => ({ spotAberto: q.spotAberto === p.id ? null : p.id })),
        onPick: () => this.setState({ spotId: p.id, screen: 'detail', tab: 'carga' }),
      })),
      mapCaption: s.mapFilter === 'Favoritos' ? 'favoritos · 1 ponto' : '6 vagas em 3 pontos a 2 km',
      mapFilters: ['Todos', 'Livres agora', 'Favoritos'].map(f => ({
        label: f,
        bg: s.mapFilter === f ? '#131c2e' : 'transparent',
        fg: s.mapFilter === f ? '#fff' : '#7c8494',
        border: s.mapFilter === f ? '#131c2e' : '#e4e5e9',
        onPick: () => this.setState({ mapFilter: f }),
      })),
      busca: s.busca || '',
      temBusca: !!(s.busca || '').trim(),
      buscaBorda: (s.busca || '').trim() ? '#00d1ff' : '#e4e5e9',
      buscaSombra: (s.busca || '').trim() ? '0 0 10px rgba(0,209,255,.5)' : 'none',
      setBusca: (e) => this.setState({ busca: e.target.value }),
      limparBusca: () => this.setState({ busca: '' }),
      buscaVazia: this.spotsFiltrados(s).length === 0,
      spotList: this.spotsFiltrados(s).map(p => ({
        nome: p.nome, preco: BRL(p.preco), eta: p.eta, opacity: p.status === 'falha' ? '.6' : '1',
        chipText: p.status === 'falha' ? 'off' : '7kW',
        chipBg: p.status === 'livre' ? '#dee9fc' : p.status === 'ocupado' ? '#dcf3ea' : '#fdeaec',
        chipFg: p.status === 'livre' ? '#3577f1' : p.status === 'ocupado' ? '#149d68' : '#f5333f',
        sub: p.status === 'livre' ? p.livres + ' de ' + p.vagas + ' livres · HCA G2 · ' + p.dist
          : p.status === 'ocupado' ? 'Ocupado · libera ~18:40 · ' + p.dist : 'Falha de comunicação',
        aberto: s.spotAberto === p.id,
        seta: s.spotAberto === p.id ? '⌃' : '⌄',
        borda: s.spotAberto === p.id ? '#00d1ff' : '#e4e5e9',
        sombra: s.spotAberto === p.id ? '0 0 10px rgba(0,209,255,.45)' : 'none',
        embed: 'https://maps.google.com/maps?q=' + p.lat + ',' + p.lng + '&z=16&output=embed',
        endereco: p.endereco,
        onToggle: () => this.setState(q => ({ spotAberto: q.spotAberto === p.id ? null : p.id })),
        onPick: () => this.setState({ spotId: p.id, screen: 'detail', tab: 'carga' }),
      })),

      spotNome: spot.nome, spotPreco: BRL(spot.preco), spotDist: spot.dist, spotEsg: spot.esg,
      spotStatus: spot.status === 'livre' ? spot.livres + ' de ' + spot.vagas + ' livres' : spot.status === 'ocupado' ? 'Ocupado' : 'Em falha',
      spotStatusBg: spot.status === 'livre' ? '#dee9fc' : spot.status === 'ocupado' ? '#dcf3ea' : '#fdeaec',
      spotStatusFg: spot.status === 'livre' ? '#3577f1' : spot.status === 'ocupado' ? '#149d68' : '#f5333f',
      favIcon: s.fav.indexOf(spot.id) > -1 ? '★' : '☆',
      toggleFav: () => this.setState(p => ({ fav: p.fav.indexOf(spot.id) > -1 ? p.fav.filter(x => x !== spot.id) : [...p.fav, spot.id] })),

      qrCells: QR_CELLS,
      scEsg: scr('esg'),
      arvores: 11, solarKwh: '842 kWh', kmSolar: '4.953 km',
      goProfile: () => this.setState(p => p.role === 'driver'
        ? { screen: 'profile', tab: 'perfil' }
        : { screen: 'account', tab: 'conta' }),
      avatarIniciais: 'PP',
      esgBars: (() => {
        const M = [['Mar', 26], ['Abr', 24], ['Mai', 31], ['Jun', 26], ['Jul', 36], ['Ago', 33], ['Set', 38]];
        const mx = 42;
        return M.map((b, i) => ({ d: b[0], v: String(b[1]), h: Math.round(b[1] / mx * 100) + '%', color: i === M.length - 1 ? '#9dff33' : '#dcf8b8', fg: i === M.length - 1 ? '#3f6a0a' : '#7c8494' }));
      })(),
      esgMesDelta: '▲ 15% vs agosto',
      esgEquiv: [
        { d: 'M12 3l-5.5 7.5h11zM12 8l-6.5 8.5h13zM12 16.5V21', v: '2', l: 'árvores no mês' },
        { d: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6', v: '150 kWh', l: 'de sol no carro' },
        { d: 'M4.5 16h15M6.5 16v2.4M17.5 16v2.4M4.5 16v-4l1.8-4.2A2 2 0 0 1 8.1 6.5h7.8a2 2 0 0 1 1.8 1.3L19.5 12v4M4.5 12h15', v: '882 km', l: 'sem emissão' },
      ],
      esgAcum: [
        { v: '214 kg', l: 'CO₂ evitado', cor: '#0f5c3f' },
        { v: '11', l: 'árvores equivalentes', cor: '#0f5c3f' },
        { v: '842 kWh', l: 'carregados com sol', cor: '#131c2e' },
        { v: '4.953 km', l: 'rodados com essa energia', cor: '#131c2e' },
      ],
      esgSolarPct: '71%', esgSolarDash: (71 * 1.885).toFixed(1) + ' 188.5',
      esgSolarDica: 'Dica: recarregue entre 10h e 15h, quando o sol cobre quase toda a vaga, para subir essa fatia.',
      esgBadges: [
        { d: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6', t: 'Primeira recarga solar', sub: 'março', ok: true, bg: '#fdeaec', op: '1', w: '100%' },
        { d: 'M5 19c0-8 5-13 14-14c0 9-5 14-13 14M5 19l7-7', t: '100 kg evitados', sub: 'junho', ok: true, bg: '#fdeaec', op: '1', w: '100%' },
        { d: 'M12 3l-5.5 7.5h11zM12 8l-6.5 8.5h13zM12 16.5V21', t: '250 kg evitados', sub: 'faltam 36 kg', ok: false, bg: '#eceef2', op: '.55', w: '86%' },
      ],
      esgCompartilhar: () => this.say('Card "Meu impacto" pronto para compartilhar: 214 kg de CO₂ evitados desde março.'),
      esgMetodoAberto: !!s.esgMetodo, esgMetodoToggle: () => this.setState(q => ({ esgMetodo: !q.esgMetodo })),
      esgMetodoLabel: s.esgMetodo ? 'Fechar' : 'Como calculamos',
      esgMetrics: [
        { k: 'CO₂ evitado no mês', v: '38 kg', sub: 'vs. um carro a combustão equivalente' },
        { k: 'Acumulado desde março', v: '214 kg', sub: 'equivale a 11 árvores plantadas' },
        { k: 'Energia de origem solar', v: '71%', sub: 'do total carregado em casa e em galerias' },
      ],

      navOpen: !!s.nav,
      openNav: () => this.setState({ nav: true }),
      closeNav: () => this.setState({ nav: false }),
      scRota: scr('rota'),
      scRotaGo: scr('rotaGo'),
      backToRota: () => this.setState({ screen: 'rota', tab: 'inicio' }),
      goRota: () => this.setState({ screen: 'rota', tab: 'inicio' }),
      backFromRota: () => this.setState({ screen: 'inicioDriver', tab: 'inicio' }),
      goScanRota: () => this.setState({ screen: 'scan', tab: 'inicio', scanOrigem: 'rota', modo: null }),
      ...(() => {
        const alvo = s.sites ? null : null;
        const lista = this.spotsFiltrados(s);
        const sel = lista.find(p => p.id === s.rotaSpot) || lista[0] || this.spot();
        const ORIGEM = '-23.5629,-46.6544';
        return {
          rotaLista: lista.map(p => ({
            nome: p.nome, eta: p.eta,
            sub: p.status === 'livre' ? p.livres + ' de ' + p.vagas + ' livres · ' + p.dist
              : p.status === 'ocupado' ? 'Ocupado · libera ~18:40 · ' + p.dist : 'Falha de comunicação',
            borda: sel && p.id === sel.id ? '#00d1ff' : '#e4e5e9',
            sombra: sel && p.id === sel.id ? '0 0 10px rgba(0,209,255,.45)' : 'none',
            radio: sel && p.id === sel.id ? '#00d1ff' : '#c9cdd6',
            radioFill: sel && p.id === sel.id ? '#00d1ff' : 'transparent',
            onPick: () => this.setState({ rotaSpot: p.id, spotId: p.id, screen: 'rotaGo', tab: 'inicio' }),
          })),
          buscaRotaUrl: 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + ORIGEM + '&destination=' + sel.lat + ',' + sel.lng,
          rotaEmbed: 'https://maps.google.com/maps?saddr=' + ORIGEM + '&daddr=' + sel.lat + ',' + sel.lng + '&z=15&output=embed',
          rotaNome: sel.nome,
          rotaEndereco: sel.endereco,
          rotaResumo: sel.dist + ' · ' + sel.eta + ' de carro · chegada prevista ' + sel.chegada,
          rotaApps: [
            { label: 'Google Maps', sub: 'abrir a rota no aplicativo', icon: '🗺️', bg: '#dee9fc',
              url: 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + ORIGEM + '&destination=' + sel.lat + ',' + sel.lng },
            { label: 'Waze', sub: 'navegação com trânsito ao vivo', icon: '🚗', bg: '#dcf3ea',
              url: 'https://waze.com/ul?ll=' + sel.lat + ',' + sel.lng + '&navigate=yes' },
          ],
        };
      })(),
      spotEta: spot.eta,
      spotEndereco: spot.endereco,
      mapEmbed: 'https://maps.google.com/maps?q=' + spot.lat + ',' + spot.lng + '&z=16&output=embed',
      navResumo: spot.dist + ' · ' + spot.eta + ' de carro · chegada prevista ' + spot.chegada,
      navApps: [
        { label: 'Google Maps', sub: 'rota mais rápida agora', icon: '🗺️', bg: '#dee9fc', url: 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + spot.lat + ',' + spot.lng + '&destination_place_id=' },
      ].map(n => ({
        label: n.label, sub: n.sub, icon: n.icon, bg: n.bg,
        onPick: () => {
          this.setState({ nav: false });
          this.say('Abrindo rota para ' + spot.nome + ' no ' + n.label + ' · vaga reservada por 15 min.');
          try { window.open(n.url, '_blank', 'noopener'); } catch (e) {}
        },
      })),
      goMap: () => this.setState({ screen: 'map', tab: 'carga' }),
      goDetail: () => this.setState({ screen: 'detail', tab: 'carga' }),
      goScan: () => this.setState({ screen: 'scan', tab: 'carga' }),
      goConfirm: () => {
        if (this.state.pay) this.cancelarPagamento();
        if (!veiculoOk) { this.say('Cadastre seu veículo elétrico em Perfil para estimarmos a recarga.'); return; }
        this.setState({ screen: 'confirm', tab: 'carga' });
      },
      goScanReset: () => this.setState({ screen: 'scan', tab: 'carga', modo: null }),
      goScanInicio: () => this.setState({ screen: 'scan', tab: 'carga', scanOrigem: 'inicio', modo: null }),
      goScanDetail: () => this.setState({ screen: 'scan', tab: 'carga', scanOrigem: 'detail' }),
      backFromScan: () => this.setState(p => p.scanOrigem === 'inicio'
        ? { screen: 'inicioDriver', tab: 'inicio' }
        : p.scanOrigem === 'rota' ? { screen: 'rotaGo', tab: 'inicio' }
        : { screen: 'detail', tab: 'carga' }),
      goHistory: () => this.setState({ screen: 'history', tab: 'carga' }),
      backToCarga: () => this.setState({ screen: 'map', tab: 'carga' }),
      goMore: () => this.setState({ screen: 'more', tab: 'fin' }),
      goSim: () => this.setState({ screen: 'sim', tab: 'mais' }),
      minimizeLive: () => this.setState({ screen: 'map', tab: 'carga' }),
      backGateDriver: () => this.setState({ screen: 'gateDriver', tab: 'casa' }),

      goal: s.goal, goalPct: alvoPct + '%', pctIniPct: s.pctIni + '%',
      setGoal: (e) => this.setState({ goal: Number(e.target.value) }),
      scPagamento: scr('pagamento'),
      modoEscolhido: !!s.modo,
      semModo: !s.modo,
      scQuantidade: scr('quantidade'),
      modoBtnBg: s.modo && this.metaKwh() > 0.05 ? '#f5333f' : '#e3b2b7',
      modoTitulo: s.modo === 'km' ? 'Quantos quilômetros' : s.modo === 'kwh' ? 'Quantos kWh' : 'Quanto tempo',
      modoLabel: s.modo === 'km' ? 'Distância desejada' : s.modo === 'kwh' ? 'Energia desejada' : 'Tempo de permanência',
      goQuantidade: () => {
        if (!s.modo) { this.say('Selecione o modo de carregamento para seguir.'); return; }
        if (this.metaKwh() <= 0.05) { this.say('Informe quanto você quer carregar para seguir.'); return; }
        this.setState({ screen: 'pagamento', tab: 'carga' });
      },
      goPagamento: () => {
        if (this.metaKwh() <= 0.05) { this.say('Informe quanto você quer carregar para seguir.'); return; }
        this.setState({ screen: 'pagamento', tab: 'carga' });
      },
      modoOpcoes: [
        { key: 'min', label: 'Tempo de permanência' },
        { key: 'kwh', label: 'kWh' },
        { key: 'km', label: 'Km' },
      ].map(m => ({
        label: m.label,
        bg: '#fff',
        fg: (s.modo || '') === m.key ? '#131c2e' : '#7c8494',
        border: (s.modo || '') === m.key ? '#00d1ff' : '#e4e5e9',
        sombra: (s.modo || '') === m.key ? '0 0 10px rgba(0,209,255,.55)' : 'none',
        espessura: (s.modo || '') === m.key ? '2px' : '1.5px',
        onPick: () => this.setState({ modo: m.key }),
      })),
      metaValor: (() => {
        const modo = s.modo;
        const v = modo === 'km' ? (s.metaKm ?? 120) : modo === 'kwh' ? (s.metaKwhDireto ?? 20) : (s.metaMin ?? 45);
        return v === 0 ? '' : v;
      })(),
      metaValida: this.metaKwh() > 0.05,
      liberarBg: this.metaKwh() > 0.05 ? '#f5333f' : '#e3b2b7',
      liberarCargaBg: this.metaKwh() > 0.05 && (this.props.hardwareFisico === false || !s.hwOnline || s.plugged) ? '#f5333f' : '#e3b2b7',
      plugStatusTxt: this.props.hardwareFisico === false || !s.hwOnline ? ''
        : s.plugged ? '🟡 Plugue conectado ao veículo — pronto para liberar'
        : '🔌 Conecte o cabo no carro (botão do carregador) para liberar',
      plugStatusFg: s.plugged ? '#b97a08' : '#7c8494',
      plugChipTxt: s.plugged ? 'plugue conectado' : 'trava ao plugar',
      plugChipBg: s.plugged ? '#f2b01e' : '#00d1ff',
      plugChipFg: s.plugged ? '#3d2c02' : '#06263a',
      metaUnidade: (s.modo || '') === 'km' ? 'km' : s.modo === 'kwh' ? 'kWh' : 'minutos',
      setMeta: (e) => {
        const v = Math.max(0, Number(e.target.value) || 0);
        const modo = s.modo;
        this.setState(modo === 'km' ? { metaKm: Math.min(v, 400) }
          : modo === 'kwh' ? { metaKwhDireto: Math.min(v, 60) }
          : { metaMin: Math.min(v, 480) });
      },
      metaHint: this.metaKwh() <= 0.05
        ? 'Informe um valor acima de zero para calcular a recarga.'
        : (s.modo || '') === 'km'
        ? '0,17 kWh/km → ' + this.metaKwh().toFixed(1).replace('.', ',') + ' kWh · bateria a ' + Math.round(s.pctIni + this.metaKwh() / this.cap() * 100) + '%'
        : s.modo === 'kwh'
          ? 'A 6,8 kW · bateria a ' + Math.round(s.pctIni + this.metaKwh() / this.cap() * 100) + '% · rende ' + Math.round(this.metaKwh() / this.KM_KWH) + ' km'
          : 'A 6,8 kW → ' + this.metaKwh().toFixed(1).replace('.', ',') + ' kWh · bateria a ' + Math.round(s.pctIni + this.metaKwh() / this.cap() * 100) + '%',
      estKwh: this.metaKwh().toFixed(1).replace('.', ',') + ' kWh',
      estTempo: this.fmtMin(this.metaKwh() / KW * 3600),
      estValor: BRL(this.metaKwh() * spot.preco),
      preauth: BRL((s.sess ? s.sess.preauth : this.metaKwh() * spot.preco)),
      fatoresLinha: 'Fator α ' + a.toFixed(2).replace('.', ',') + ' — ' + this.solarTexto() + (s.ponta ? ' e horário de ponta' : ', fora de ponta') + '.',
      methods: [
        { key: 'pix', label: 'Pix', sub: 'Aprovação na hora' },
        { key: 'creditos', label: 'Créditos da carteira', sub: 'Saldo ' + BRL(s.saldo) },
        { key: 'cartao', label: 'Visa ···· 4417', sub: 'Pré-autoriza e captura depois' },
      ].map(m => ({
        label: m.label, sub: m.sub,
        border: s.method === m.key ? '#00d1ff' : '#e4e5e9',
        sombra: s.method === m.key ? '0 0 10px rgba(0,209,255,.55)' : 'none',
        dot: s.method === m.key ? '#00d1ff' : '#c9cdd6',
        dotFill: s.method === m.key ? '#00d1ff' : 'transparent',
        onPick: () => this.setState({ method: m.key }),
      })),
      startSession: this.startSession,
      payProvedor: (this.props.pagamentoModo === 'api' ? '' : 'Sandbox · ') + 'Mercado Pago · PCI DSS',
      payAutorizando: !!(s.pay && s.pay.fase === 'autorizando'),
      payAutorizandoTxt: s.pay ? (s.pay.metodo === 'pix' ? 'Gerando o QR Code Pix de ' : s.pay.metodo === 'creditos' ? 'Reservando ' : 'Pré-autorizando ') + BRL(s.pay.valor) + '…' : '',
      payPix: !!(s.pay && s.pay.fase === 'pix'),
      payPixValor: s.pay ? BRL(s.pay.valor) : '',
      payPixCodigo: s.pay && s.pay.pix ? s.pay.pix.copia_e_cola : '',
      payPixCodigoCurto: s.pay && s.pay.pix ? s.pay.pix.copia_e_cola.slice(0, 34) + '…' : '',
      payPixExpira: s.pay && s.pay.pix ? 'expira às ' + new Date(s.pay.pix.expira_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
      payPixCopiar: () => {
        const c = s.pay && s.pay.pix ? s.pay.pix.copia_e_cola : '';
        try { navigator.clipboard && navigator.clipboard.writeText(c); } catch (e) { /* sem área de transferência */ }
        this.say('Código Pix copiado. Cole no app do seu banco.');
      },
      payCancelar: this.cancelarPagamento,
      payAvisoA: s.method === 'pix' ? 'Você paga ' : s.method === 'creditos' ? 'Vamos reservar ' : 'Vamos pré-autorizar ',
      payAvisoB: s.method === 'pix' ? ' por Pix agora e recebe de volta, na hora, o valor dos kWh que não usar.' : s.method === 'creditos' ? ' do seu saldo e debitar somente os kWh entregues.' : ' no cartão e capturar somente os kWh entregues ao final.',
      payLivre: !(s.pay && (s.pay.fase === 'autorizando' || s.pay.fase === 'pix')),
      payErro: !!(s.pay && s.pay.fase === 'erro'), payErroTxt: s.pay && s.pay.erro ? s.pay.erro : '',
      payPixCells: (() => {
        if (!(s.pay && s.pay.pix)) return [];
        // QR ilustrativo determinístico a partir do payload (o QR real vem em point_of_interaction.transaction_data.qr_code_base64)
        const txt = s.pay.pix.copia_e_cola; let h = 2166136261;
        const out = [];
        for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) {
          const fin = (x < 7 && y < 7) || (x > 17 && y < 7) || (x < 7 && y > 17);
          if (fin) continue;
          h ^= txt.charCodeAt((x * 25 + y) % txt.length); h = Math.imul(h, 16777619) >>> 0;
          if (h % 100 < 46) out.push({ x: x * 10, y: y * 10 });
        }
        return out;
      })(),

      livePct: Math.round(pctNow) + '%',
      ringPct: Math.round(pctNow) + '%',
      ringColor: s.interrupted ? '#f5333f' : s.running ? '#9dff33' : '#149d68',
      ringGlow: s.interrupted ? 'rgba(245,51,63,.6)' : s.running ? 'rgba(157,255,51,.65)' : 'rgba(20,157,104,.4)',
      ringGlowSoft: s.interrupted ? 'rgba(245,51,63,.25)' : s.running ? 'rgba(157,255,51,.3)' : 'rgba(20,157,104,.18)',
      ringAnim: s.running || s.interrupted ? 'cgRingGlow 1.8s ease-in-out infinite' : 'none',
      liveKwh: sessKwh.toFixed(1).replace('.', ',') + ' kWh',
      liveValor: BRL(sessKwh * (s.sess ? s.sess.tarifa : spot.preco)),
      liveElapsed: this.fmtMin(s.sess ? s.sess.elapsed : 0),
      liveEta: s.interrupted ? 'carga pausada' : s.running ? 'faltam ' + this.fmtMin(restKwh / KW * 3600) : 'meta atingida',
      liveKw: s.interrupted ? '0 kW' : s.running ? '6,8 kW' : 'em espera',
      lockedPreco: BRL(s.sess ? s.sess.tarifa : spot.preco),
      scInterrupted: s.interrupted,
      scNotInterrupted: !s.interrupted,
      resumeSession: this.resumeSession,
      dlmBarCor: s.interrupted ? '#f5333f' : '#9dff33',
      dlmLinha: s.interrupted ? 'A cobrança parou junto com a carga: só os kWh já entregues contam no recibo.'
        : s.running ? 'O DLM reparte ' + dlmTeto + ' kW igualmente entre as vagas em carga: ' + (emCarga[0] ? String(kwDe(emCarga[0])).replace('.', ',') : '6,8') + ' kW para você agora.' : 'Meta atingida. Encerre para liberar a vaga e emitir o recibo.',
      finishSession: this.finishSession,

      showLiveBar: liveBar,
      barBg: isDriver ? '#0e1118' : 'linear-gradient(115deg,#3a1d20,#7a2630)',
      barLed: !isDriver ? '#f2b01e' : s.interrupted ? '#f5333f' : s.running ? '#9dff33' : '#149d68',
      barAnim: !isDriver || s.running || s.interrupted ? 'cgPulse 1.2s ease-in-out infinite' : 'none',
      barTitle: !isDriver ? 'Controle dinâmico atuando agora'
        : s.interrupted ? 'Recarga interrompida · plugue desconectado'
        : s.running ? 'Carregando · ' + s.pctIni + '% → ' + alvoPct + '%' : 'Meta atingida · ' + alvoPct + '%',
      barSub: !isDriver ? '2 sessões limitadas · 8,4 kW realocados para a edificação'
        : sessKwh.toFixed(1).replace('.', ',') + ' kWh · ' + BRL(sessKwh * (s.sess ? s.sess.tarifa : 0)) + ' · ' + this.fmtMin(s.sess ? s.sess.elapsed : 0),
      barSubFg: isDriver ? '#8d94a2' : '#f0d8da',
      barCta: isDriver ? 'Abrir' : 'Ver alertas',
      barAction: () => this.setState(isDriver ? { screen: 'live', tab: 'carga' } : { screen: 'alertas', tab: 'vagas' }),

      receiptLines: rec ? [
        { k: 'Local', v: rec.spot },
        { k: 'Energia entregue', v: rec.kwh.toFixed(2).replace('.', ',') + ' kWh' },
        { k: 'Tarifa travada', v: BRL(rec.tarifa) + '/kWh' },
        { k: 'Duração', v: this.fmtMin(rec.elapsed) },
        { k: 'Pré-autorizado', v: BRL(rec.preauth) },
      ] : [],
      receiptTotal: rec ? BRL(rec.total) : '',
      captureLinha: !rec ? '' : rec.captura === 'processando' ? 'Capturando o valor na API de pagamento…'
        : rec.captura === 'erro' ? 'A captura falhou (' + rec.erro + '). Nova tentativa automática em instantes.'
        : rec.metodo === 'pix' ? 'Pix de ' + BRL(rec.preauth) + ' pago no início; ' + BRL(rec.liberado || 0) + ' estornados para a sua conta.'
        : rec.metodo === 'creditos' ? 'Debitamos ' + BRL(rec.total) + ' do saldo; ' + BRL(rec.liberado || 0) + ' de reserva liberados.'
        : 'Capturamos ' + BRL(rec.capturado != null ? rec.capturado : rec.total) + ' dos ' + BRL(rec.preauth) + ' pré-autorizados; ' + BRL(rec.liberado || 0) + ' liberados no cartão.',
      recPagId: rec && rec.pagId ? 'Transação #' + rec.pagId + ' · ' + Pagamentos.config().provedor + (Pagamentos.config().modo === 'sandbox' ? ' (sandbox)' : '') : '',
      recPagOk: !!(rec && rec.captura === 'ok'), recPagProc: !!(rec && rec.captura === 'processando'),
      receiptEsg: rec ? (rec.kwh * 0.28).toFixed(1).replace('.', ',') + ' kg de CO₂ evitados nesta sessão' : '',
      stars: [1, 2, 3, 4, 5].map(n => ({
        color: n <= s.stars ? '#f2b01e' : '#d5d8de',
        onPick: () => this.setState({ stars: n }),
      })),

      saldo: BRL(s.saldo), saldoKwh: (s.saldo / 2.19).toFixed(1).replace('.', ',') + ' kWh',
      topups: [20, 50, 100].map(v => ({
        label: '+ ' + BRL(v).replace(',00', ''),
        onPick: () => { this.setState(p => ({ saldo: p.saldo + v })); this.say('Pix de ' + BRL(v) + ' confirmado. Créditos na conta.'); },
      })),
      ledger: [
        { t: 'Recarga · Pátio Norte', d: 'hoje, 14:32 · Pix', v: '− R$ 32,41', color: '#131c2e' },
        { t: 'Créditos via Pix', d: '09/09 · aprovado', v: '+ R$ 50,00', color: '#149d68' },
        { t: 'Recarga · Mini Shopping Aurora', d: '08/09 · créditos', v: '− R$ 23,03', color: '#131c2e' },
      ],

      histFilters: ['Eletroposto', 'Casa', 'Todos'].map(f => ({
        label: f,
        bg: s.histFilter === f ? '#131c2e' : 'transparent',
        fg: s.histFilter === f ? '#fff' : '#7c8494',
        border: s.histFilter === f ? '#131c2e' : '#e4e5e9',
        onPick: () => this.setState({ histFilter: f }),
      })),
      histKwh: histList.reduce((t, h) => t + h.kwh, 0).toFixed(1).replace('.', ',') + ' kWh',
      histGasto: BRL(histList.filter(h => h.tipo === 'posto').reduce((t, h) => t + h.custo, 0)),
      isCasa: s.histFilter === 'Casa',
      histLabel2: s.histFilter === 'Casa' ? 'Economia no mês' : 'Gasto em eletropostos',
      histColor2: s.histFilter === 'Casa' ? '#149d68' : '#131c2e',
      histValor2: s.histFilter === 'Casa'
        ? BRL(histList.reduce((t, h) => t + h.kwh, 0) * 0.86 * s.tarifaRede)
        : BRL(histList.filter(h => h.tipo === 'posto').reduce((t, h) => t + h.custo, 0)),
      sessions: histList.map(h => ({
        ...h,
        tagBg: h.tipo === 'casa' ? '#dcf3ea' : '#dee9fc',
        tagFg: h.tipo === 'casa' ? '#149d68' : '#3577f1',
        valor: h.tipo === 'casa' ? h.kwh.toFixed(1).replace('.', ',') + ' kWh' : h.valor,
      })),

      vehLine: 'Renault Megane E-Tech · ' + s.pctIni + '%',
      vehModelo: 'Renault Megane E-Tech', vehCap: '60 kWh', vehConsumo: '0,17 kWh/km',
      vehPlaca: 'FPD 4E71',
      pontosSaldo: '1.240 pts', pontosValor: 'vale R$ 24,80', pontosSub: 'Acumulados em recargas solares · 1 pt a cada R$ 1',
      graceLinha: '10 min para desocupar depois de encerrar',
      graceRestante: '10 min',
      graceRegra: 'Passado o prazo, a vaga cobra R$ 0,90/min de ociosidade até você desconectar.',
      esgKg: '38 kg', esgArvores: 'equivale a 2 árvores',
      profileRows: [
        { label: 'Eletropostos favoritos', value: s.fav.length + ' pontos' },
        { label: 'Carregador na residência', value: 'HCA G2 · 7 kW' },
        { label: 'Recibos por e-mail', value: 'ativado' },
        { label: 'Notificações de vaga livre', value: 'favoritos' },
      ],

      ocppLabel: s.chargers.some(c => c.status === 'falha') ? '1 falha OCPP' : 'OCPP ok',
      ocppBg: s.chargers.some(c => c.status === 'falha') ? '#fdeaec' : '#dcf3ea',
      ocppFg: s.chargers.some(c => c.status === 'falha') ? '#a3111c' : '#0f5c3f',
      siteNome: (s.sites.find(x => x.id === (s.siteSel || 'pn')) || s.sites[0]).nome,
      ...(() => {
        const site = s.sites.find(x => x.id === (s.siteSel || 'pn')) || s.sites[0];
        const vagas = s.chargers.filter(c => c.site === site.id);
        const livres = vagas.filter(c => c.status === 'livre').length;
        const falha = vagas.filter(c => c.status === 'falha').length;
        const kw = vagas.filter(c => c.status === 'carregando').reduce((t, c) => t + (c.kw || 0), 0);
        return {
          epHeroNome: site.nome,
          epHeroChip: falha > 0 ? '● ' + falha + (falha > 1 ? ' vagas em falha' : ' vaga em falha') : '● Operando normalmente',
          epHeroLivres: String(livres),
          dashSub: site.endereco,
        };
      })(),
      ...(() => {
        const site = s.siteSel || 'pn';
        const base = (s.baseSites || {})[site] ?? 2.49;
        const a = this.alfa();
        const vigente = base * a;
        return {
          baseSiteValor: s.baseTexto !== undefined && s.baseTextoSite === site
            ? s.baseTexto
            : base.toFixed(2).replace('.', ','),
          setBaseSite: (e) => {
            let txt = String(e.target.value).replace(/[^0-9.,]/g, '').replace('.', ',');
            const p1 = txt.indexOf(',');
            if (p1 > -1) txt = txt.slice(0, p1 + 1) + txt.slice(p1 + 1).replace(/,/g, '');
            const [int = '', dec = ''] = txt.split(',');
            txt = int.slice(0, 1) + (txt.indexOf(',') > -1 ? ',' + dec.slice(0, 2) : '');
            const v = Math.max(0, Number(txt.replace(',', '.')) || 0);
            this.setState(p => ({ baseTexto: txt, baseTextoSite: site, baseSites: { ...p.baseSites, [site]: v } }));
          },
          baseVigente: BRL(vigente),
          baseAlfa: 'α ' + a.toFixed(2).replace('.', ','),
          baseAlfaBg: a > 1 ? '#fdeaec' : '#dcf3ea',
          baseAlfaFg: a > 1 ? '#a3111c' : '#0f5c3f',
          baseNota: 'A IA parte da sua base e aplica o fator α do cenário: '
            + this.solarTexto()
            + (s.ponta ? ', horário de ponta (+18%)' : ', fora de ponta')
            + '. O motorista vê apenas o preço final, travado no plug-in.',
        };
      })(),
      ...(() => {
        const kwh = s.chargers.reduce((t, c) => t + (c.hoje || 0), 0);
        const bruto = s.chargers.reduce((t, c) => t + (c.hoje || 0) * (c.preco || 0), 0);
        const sessoes = s.chargers.filter(c => (c.hoje || 0) > 0).length;
        const DIAS = 26;
        const mBruto = bruto * DIAS;
        const falhas = s.chargers.filter(c => c.status === 'falha').length;
        return {
          hojeBruto: BRL(bruto),
          hojeRepasse: BRL(bruto * 0.9),
          hojeKwh: kwh.toFixed(1).replace('.', ',') + ' kWh',
          hojeSessoes: sessoes + (sessoes > 1 ? ' sessões' : ' sessão') + ' hoje',
          mesBruto: BRL(mBruto),
          mesTaxa: '− ' + BRL(mBruto * 0.1),
          mesRepasse: BRL(mBruto * 0.9),
          sindicoAbertura: 'Bom dia. Hoje até agora: ' + sessoes + (sessoes > 1 ? ' sessões' : ' sessão') + ', '
            + kwh.toFixed(1).replace('.', ',') + ' kWh e ' + BRL(bruto) + ' faturados.'
            + (falhas ? ' ' + falhas + (falhas > 1 ? ' vagas' : ' vaga') + ' em falha aguardando reinício.' : ' Nenhuma falha aberta.'),
        };
      })(),
      dlmUso: '25,8', dlmPct: '34% da contratada', dlmFg: '#149d68',
      wEv: '9%', wBat: '0%', wEdif: '25%',
      despacho: [
        { label: '1º EVs conectados · vaga 01', kw: '6,8 kW', color: '#3577f1' },
        { label: '2º Bateria BESS · 92%, cheia', kw: '0 kW', color: '#149d68' },
        { label: '3º Edificação', kw: '19,0 kW', color: '#f2b01e' },
      ],
      semanaTotal: 'R$ 2.106',
      bars: [['S', '44%'], ['T', '62%'], ['Q', '38%'], ['Q', '71%'], ['S', '88%'], ['S', '52%'], ['D', '29%']].map((b, i) => ({
        d: b[0], h: b[1], color: i === 4 ? '#f5333f' : '#e9b6ba',
      })),
      ...(() => {
        const CEUS = {
          limpo: {
            chip: '☀️ Céu limpo', fator: 1, temp: '31 °C',
            bg: 'linear-gradient(180deg,#14548f 0%,#2478bd 24%,#4e9bd4 48%,#8cc4e6 72%,#c9e4f3 89%,#eaf2f3 100%)',
            camada: 'radial-gradient(38px 38px at 84% 11%,rgba(255,253,240,1) 0%,rgba(255,246,206,.98) 46%,rgba(255,236,170,0) 100%), radial-gradient(170px 170px at 84% 11%,rgba(255,240,190,.5) 0%,rgba(255,236,170,.16) 38%,rgba(255,236,170,0) 72%), radial-gradient(150% 60% at 50% 104%,rgba(255,244,222,.55) 0%,rgba(255,244,222,0) 70%), linear-gradient(180deg,rgba(9,40,74,.18) 0%,rgba(9,40,74,0) 34%)',
            nota: 'Irradiância de 912 W/m² medida no inversor · sem nuvens previstas até as 15h.',
          },
          parcial: {
            chip: '🌤️ Parcialmente nublado', fator: 0.72, temp: '27 °C',
            bg: 'linear-gradient(180deg,#1d6096 0%,#3d86bd 26%,#79aed2 54%,#b9d3e3 80%,#dee7ec 100%)',
            camada: 'radial-gradient(34px 34px at 79% 13%,rgba(255,252,236,.98),rgba(255,246,214,0) 100%), radial-gradient(140px 140px at 79% 13%,rgba(255,243,206,.4),rgba(255,243,206,0) 70%), radial-gradient(64px 30px at 26% 22%,rgba(255,255,255,.98),rgba(255,255,255,0) 72%), radial-gradient(46px 24px at 34% 25%,rgba(255,255,255,.95),rgba(255,255,255,0) 74%), radial-gradient(54px 18px at 30% 30%,rgba(146,168,188,.55),rgba(146,168,188,0) 78%), radial-gradient(76px 32px at 62% 42%,rgba(255,255,255,.9),rgba(255,255,255,0) 74%), radial-gradient(60px 18px at 64% 48%,rgba(140,162,182,.5),rgba(140,162,182,0) 78%), radial-gradient(48px 22px at 14% 52%,rgba(255,255,255,.7),rgba(255,255,255,0) 76%), linear-gradient(180deg,rgba(12,44,78,.16) 0%,rgba(12,44,78,0) 36%)',
            nota: 'Nuvens intermitentes: a IA usa a bateria para suavizar as quedas de geração.',
          },
          nublado: {
            chip: '☁️ Nublado', fator: 0.34, temp: '23 °C',
            bg: 'linear-gradient(180deg,#5d6a78 0%,#78858f 30%,#97a2ab 58%,#b8c0c7 82%,#d4d9dd 100%)',
            camada: 'radial-gradient(130px 46px at 22% 16%,rgba(255,255,255,.5),rgba(255,255,255,0) 76%), radial-gradient(160px 40px at 70% 24%,rgba(255,255,255,.38),rgba(255,255,255,0) 78%), radial-gradient(180px 44px at 40% 38%,rgba(72,82,92,.4),rgba(72,82,92,0) 78%), radial-gradient(150px 36px at 84% 46%,rgba(68,78,88,.34),rgba(68,78,88,0) 80%), radial-gradient(200% 46% at 62% 8%,rgba(255,255,255,.3),rgba(255,255,255,0) 68%), linear-gradient(180deg,rgba(46,54,64,.3) 0%,rgba(46,54,64,0) 40%)',
            nota: 'Geração baixa. Load shifting acionado: compra fora de ponta para cobrir o pico da noite.',
          },
          chuva: {
            chip: '🌧️ Chuva', fator: 0.18, temp: '20 °C',
            bg: 'linear-gradient(180deg,#2f3a45 0%,#465360 28%,#5f6c79 56%,#7d8892 82%,#98a1aa 100%)',
            camada: 'repeating-linear-gradient(76deg,rgba(226,238,248,.3) 0 1px,rgba(226,238,248,0) 1px 7px), repeating-linear-gradient(72deg,rgba(226,238,248,.16) 0 2px,rgba(226,238,248,0) 2px 15px), radial-gradient(170px 44px at 34% 12%,rgba(26,33,41,.55),rgba(26,33,41,0) 78%), radial-gradient(150px 38px at 78% 20%,rgba(26,33,41,.42),rgba(26,33,41,0) 80%), radial-gradient(160% 40% at 50% 104%,rgba(206,220,232,.4),rgba(206,220,232,0) 72%), linear-gradient(180deg,rgba(20,26,33,.36) 0%,rgba(20,26,33,0) 42%)',
            nota: 'Chuva forte: a galeria opera com bateria e rede, e as vagas seguem liberadas.',
          },
          noite: {
            chip: '🌙 Noite', fator: 0, temp: '18 °C',
            bg: 'linear-gradient(180deg,#050a20 0%,#0b1433 26%,#152449 54%,#26365c 80%,#3d4f72 100%)',
            camada: 'radial-gradient(22px 22px at 82% 15%,rgba(248,250,255,1),rgba(240,246,255,.9) 60%,rgba(240,246,255,0) 100%), radial-gradient(110px 110px at 82% 15%,rgba(214,229,255,.32),rgba(214,229,255,0) 70%), radial-gradient(2.4px 2.4px at 18% 20%,rgba(255,255,255,.95),rgba(255,255,255,0) 100%), radial-gradient(1.6px 1.6px at 31% 12%,rgba(255,255,255,.8),rgba(255,255,255,0) 100%), radial-gradient(1.2px 1.2px at 44% 27%,rgba(255,255,255,.6),rgba(255,255,255,0) 100%), radial-gradient(2px 2px at 57% 9%,rgba(255,255,255,.85),rgba(255,255,255,0) 100%), radial-gradient(1.3px 1.3px at 66% 33%,rgba(255,255,255,.55),rgba(255,255,255,0) 100%), radial-gradient(1.8px 1.8px at 9% 38%,rgba(255,255,255,.7),rgba(255,255,255,0) 100%), radial-gradient(1.1px 1.1px at 72% 22%,rgba(255,255,255,.5),rgba(255,255,255,0) 100%), radial-gradient(1.5px 1.5px at 38% 44%,rgba(255,255,255,.6),rgba(255,255,255,0) 100%), radial-gradient(180% 34% at 34% 30%,rgba(190,206,240,.14),rgba(190,206,240,0) 70%), radial-gradient(150% 34% at 50% 106%,rgba(255,214,150,.3),rgba(255,214,150,0) 72%)',
            nota: 'Sem geração. O BESS supre os carregadores e a galeria até o amanhecer.',
          },
        };
        const ordem = ['limpo', 'parcial', 'nublado', 'chuva', 'noite'];
        const key = s.ceu || 'parcial';
        const C = CEUS[key];
        const fatorSite = 1;
        const BASE = { roof: 16.1 * fatorSite, facade: 3.6 * fatorSite, carport: 5.8 * fatorSite };
        const kw = { roof: BASE.roof * C.fator, facade: BASE.facade * C.fator, carport: BASE.carport * C.fator };
        const solar = kw.roof + kw.facade + kw.carport;
        const cargaEv = s.chargers.filter(c => c.site === (s.siteSel || 'pn') && c.status === 'carregando').reduce((t, c) => t + (c.kw || 0), 0);
        const cargaEdif = 19 * fatorSite, cargaTotal = cargaEv + cargaEdif;
        const fmt = (n) => n.toFixed(1).replace('.', ',') + ' kW';
        const capBess = fatorSite === 1 ? 30 : 15;
        const DIA = (() => {
          const GER_BASE = [0.5, 1.2, 2.0, 2.8, 2.5, 3.8, 4.5, 4.8, 4.7, 4.2, 3.2, 1.8, 0.5, 0, 0, 0, 0];
          const PERC_BASE = { 6: .02, 7: .025, 8: .03, 9: .04, 10: .05, 11: .055, 12: .06, 13: .06, 14: .06, 15: .06, 16: .055, 17: .055, 18: .05, 19: .045, 20: .04, 21: .035, 22: .03 };
          const SOMA_PERC = Object.keys(PERC_BASE).reduce((t, k) => t + PERC_BASE[k], 0);
          const PERC_GAL = {};
          Object.keys(PERC_BASE).forEach(k => { PERC_GAL[k] = PERC_BASE[k] / SOMA_PERC; });
          const PERFIL_EV = { 10: .5, 11: .75, 12: 1, 13: 1, 14: 1, 15: .75, 16: .5, 17: .75, 18: 1, 19: 1, 20: .75, 21: .5, 22: .5 };
          const kwpTotal = fatorSite === 1 ? 67.2 : 36.7;
          const metragem = fatorSite === 1 ? 2400 : 1500;
          const consumoDiario = metragem * 60 / 365;
          const horaBal = Math.min(22, Math.max(6, new Date().getHours()));
          let galAgora = 0;
          const vagasSite = s.chargers.filter(c => c.site === (s.siteSel || 'pn'));
          const vagasPub = Math.max(1, vagasSite.filter(c => c.status !== 'manutencao').length);
          const capBat = capBess;
          let carga = capBat * 0.33;
          let gerado = 0, armTotal = 0, usaTotal = 0, redeDia = 0, evTotal = 0, galTotal = 0, custoTotal = 0;
          let solarEv = 0, solarGal = 0, sobraDia = 0, expAberta = 0, horasArm = [];
          let redeEv = 0, redeGal = 0, usaEv = 0, usaGal = 0, cortadoDlm = 0;
          const TETO_EV = DLM.teto;
          const n2 = (v) => v.toFixed(2).replace('.', ',');
          const linhas = [];
          for (let hora = 6; hora <= 22; hora++) {
            const solar = (GER_BASE[hora - 6] / 9.0) * kwpTotal * C.fator;
            const consGal = consumoDiario * (PERC_GAL[hora] || 0);
            if (hora === horaBal) galAgora = consGal;
            const carros = Math.round((PERFIL_EV[hora] || 0) * vagasPub);
            const fase = hora < 10 ? 'Pré-op' : hora < 19 ? 'Operacional' : 'Noturno';
            const tarifa = hora >= 17 ? 1.5 : hora >= 10 ? 1.0 : 0.85;
            let arm = 0, usa = 0, rede = 0, exp = 0;
            const cotaGal = solar * (100 - (s.repEv ?? 80)) / 100;
            if (fase === 'Pré-op') {
              let disp = solar;
              const galSolar = Math.min(disp, consGal, cotaGal);
              disp -= galSolar;
              arm = Math.min(disp, capBat - carga);
              carga += arm;
              disp -= arm;
              solarGal += galSolar;
              exp = Math.max(0, disp);
              rede = consGal - galSolar;
              redeGal += rede;
            } else if (fase === 'Operacional') {
              const demEv = carros * 7;
              let disp = solar;
              const energiaEv = Math.min(disp, demEv, solar * (s.repEv ?? 80) / 100);
              disp -= energiaEv;
              const galSolar = Math.min(disp, consGal, cotaGal);
              disp -= galSolar;
              arm = Math.min(disp, capBat - carga);
              carga += arm;
              disp -= arm;
              solarEv += energiaEv; solarGal += galSolar;
              exp = Math.max(0, disp);
              const defEv = demEv - energiaEv, defGal = consGal - galSolar;
              const pisoReserva = hora >= 17 ? 0 : capBat * 0.8;
              const dispBat = Math.min(Math.max(0, carga - pisoReserva), capBat * 0.5);
              const uEv = Math.min(dispBat, defEv);
              const uGal = Math.min(dispBat - uEv, defGal);
              usa = uEv + uGal; carga -= usa;
              const rEv = Math.min(defEv - uEv, TETO_EV);
              const rGal = Math.max(0, defGal - uGal);
              cortadoDlm += Math.max(0, defEv - uEv - rEv);
              usaEv += uEv; usaGal += uGal; redeEv += rEv; redeGal += rGal;
              rede = rEv + rGal;
            } else {
              const demEv = carros * 7;
              const dispBat = Math.min(carga, capBat * 0.5);
              const uEv = Math.min(dispBat, demEv);
              const uGal = Math.min(dispBat - uEv, consGal);
              usa = uEv + uGal; carga -= usa;
              const rEv = Math.min(demEv - uEv, TETO_EV);
              const rGal = Math.max(0, consGal - uGal);
              cortadoDlm += Math.max(0, demEv - uEv - rEv);
              usaEv += uEv; usaGal += uGal; redeEv += rEv; redeGal += rGal;
              rede = rEv + rGal;
            }
            sobraDia += exp;
            if (exp > 0.05 && fase === 'Operacional') expAberta += exp;
            if (arm > 0.05) horasArm.push(hora);
            const custo = rede * tarifa;
            gerado += solar; armTotal += arm; usaTotal += usa; redeDia += rede;
            evTotal += carros * 7; galTotal += consGal; custoTotal += custo;
            linhas.push({
              hora: String(hora).padStart(2, '0') + 'h',
              fase, evs: String(carros),
              solar: n2(solar), galeria: n2(consGal),
              arm: n2(arm), usa: n2(usa), exp: n2(exp), rede: n2(rede),
              custo: 'R$ ' + n2(custo),
              faseBg: fase === 'Pré-op' ? '#fffbe3' : fase === 'Operacional' ? '#ffe9a3' : '#132546',
              faseFg: fase === 'Pré-op' ? '#5d4a06' : fase === 'Operacional' ? '#5a4708' : '#ffffff',
              linhaBg: hora % 2 === 0 ? '#ffffff' : '#f6f7f9',
              redeFg: rede > 0.05 ? '#a3111c' : '#7c8494',
            });
          }
          return { linhas, gerado, armTotal, usaTotal, redeDia, evTotal: evTotal - cortadoDlm, evDemanda: evTotal, cortadoDlm, galTotal, custoTotal, solarEv, solarGal, sobraDia, socFinal: carga, capBat, expAberta, horasArm, galAgora, redeEv, redeGal, usaEv, usaGal };
        })();
        const socBess = Math.round(DIA.socFinal / DIA.capBat * 100);
        const evSolar = Math.min(solar, cargaEv);
        const edifSolar = Math.min(Math.max(0, solar - evSolar), cargaEdif);
        const excedente = Math.max(0, solar - cargaTotal);
        const evFalta = cargaEv - evSolar;
        const edifFalta = cargaEdif - edifSolar;
        const bessCarga = socBess < 100 ? Math.min(excedente, capBess * 0.5) : 0;
        const bessUso = socBess > 20 ? Math.min(evFalta + edifFalta, capBess * 0.5) : 0;
        const evBess = Math.min(bessUso, evFalta);
        const edifBess = bessUso - evBess;
        const evRede = Math.max(0, evFalta - evBess);
        const edifRede = Math.max(0, edifFalta - edifBess);
        const redeTotal = evRede + edifRede;
        const bessCarregando = bessCarga > 0.05;
        const bessDescarregando = !bessCarregando && bessUso > 0.05;
        const bessKwNum = bessCarregando ? bessCarga : bessDescarregando ? bessUso : 0;
        const bessDisp = capBess * socBess / 100;
        return {
          ceuBg: C.bg, ceuCamada: C.camada, ceuChip: C.chip, ceuTemp: C.temp,
          ceuIcon: C.chip.split(' ')[0],
          ceuCond: C.chip.split(' ').slice(1).join(' '),
          ceuNota: C.chip.split(' ').slice(1).join(' ') + '. ' + C.nota,
          ciclarCeu: () => this.setState({ ceu: ordem[(ordem.indexOf(key) + 1) % ordem.length] }),
          geracaoAgora: fmt(solar),
          ...(() => {
            const gerCarport = DIA.gerado * 0.227, gerFach = DIA.gerado * 0.141;
            const gerCob = Math.max(0, DIA.gerado - gerCarport - gerFach);
            const kn = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
            const k1 = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' kWh';
            const soc = socBess;
            return {
              fxCarportValor: kn(gerCarport), fxCarportLabel: 'Carport',
              fxFachValor: kn(gerFach), fxFachLabel: 'Fachada BIPV',
              fxCobValor: kn(gerCob), fxCobLabel: 'Cobertura',
              fxRedeValor: kn(DIA.redeDia), fxRedeLabel: 'Rede · importado',
              fxRedeExp: '↑ ' + kn(DIA.sobraDia) + ' kWh exportados',
              fxEdifValor: kn(DIA.galTotal), fxEdifLabel: 'Edificação',
              fxEvValor: kn(DIA.evTotal), fxEvLabel: 'Carregadores',
              fxBatValor: kn(DIA.socFinal),
              fxBatEstado: bessCarregando ? 'Carregando' : bessDescarregando ? 'Em uso' : 'Stand by',
              fxBatPct: soc + '%',
              fxBatChipBg: bessCarregando ? '#34d399' : bessDescarregando ? '#3577f1' : '#e4e5e9',
              fxBatChipFg: bessCarregando || bessDescarregando ? '#ffffff' : '#5d6572',
              fxBatPctFg: bessCarregando ? '#0f7a51' : bessDescarregando ? '#1d4ea8' : '#5d6572',
              ...(() => {
                const CONTRATADA = DEMANDA_KW, MARGEM = 0.12;
                // pico do mês: maior demanda de 15 min da edificação, base do faturamento
                const picoMes = Math.max(...DIA.linhas.map(l => Number(l.galeria.replace(',', '.')))) * 1.18;
                const margem = CONTRATADA * MARGEM;
                const teto = Math.max(0, CONTRATADA - picoMes - margem);
                return {
                  demContratada: CONTRATADA + ' kW',
                  demPicoMes: kn(picoMes) + ' kW',
                  demMargem: '− ' + kn(margem) + ' kW',
                  demMargemPct: Math.round(MARGEM * 100) + '%',
                  demEletroposto: kn(teto) + ' kW',
                  demEdificacao: kn(DIA.galAgora) + ' kW',
                  demFolgaAgora: kn(Math.max(0, Math.min(teto, CONTRATADA - margem - DIA.galAgora))) + ' kW',
                  ...(() => {
                    const tarM = DIA.redeDia > 0.05 ? DIA.custoTotal / DIA.redeDia : s.tarifaBase;
                    const bat = DIA.usaEv, rede = DIA.redeEv;
                    return {
                      estEvDia: kn(DIA.evTotal) + ' kWh/dia',
                      estEvDemanda: kn(DIA.evDemanda) + ' kWh/dia',
                      estEvCortado: '− ' + kn(DIA.cortadoDlm) + ' kWh/dia',
                      estEvProprio: kn(DIA.solarEv + bat) + ' kWh/dia',
                      estEvRede: kn(rede) + ' kWh/dia',
                      estEvRedeMes: Math.round(rede * 26).toLocaleString('pt-BR') + ' kWh',
                      estEvRedeCusto: 'Custo estimado de ' + BRL(rede * 26 * tarM) + '/mês ao preço médio de ' + BRL(tarM) + '/kWh pago à rede hoje; é esse volume que o load shifting desloca para fora de ponta.',
                    };
                  })(),
                };
              })(),
              fxConsumoTotal: k1(DIA.evTotal + DIA.galTotal),
              fxSolarConsumido: k1(DIA.solarEv + DIA.solarGal),
              fxExpValor: k1(DIA.sobraDia),
            };
          })(),
          gerRoofKw: fmt(kw.roof),
          gerFacadeKw: fmt(kw.facade),
          gerCarportKw: fmt(kw.carport),
          gerRoofSub: fatorSite === 1 ? '96 placas · 43,2 kWp' : '52 placas · 23,4 kWp',
          gerFacadeSub: fatorSite === 1 ? '48 módulos · 9,6 kWp' : '26 módulos · 5,2 kWp',
          gerCarportSub: fatorSite === 1 ? '32 placas · 14,4 kWp' : '18 placas · 8,1 kWp',
          geracaoFontes: [
            { label: 'Placas na cobertura', kw: fmt(kw.roof), pct: (kw.roof / BASE.roof * 100).toFixed(0) + '%', color: '#f2b01e', sub: fatorSite === 1 ? '96 placas · 450 Wp · 43,2 kWp' : '52 placas · 450 Wp · 23,4 kWp' },
            { label: 'Fachada solar BIPV', kw: fmt(kw.facade), pct: (kw.facade / BASE.roof * 100).toFixed(0) + '%', color: '#ffd166', sub: fatorSite === 1 ? '48 módulos · 200 Wp · 9,6 kWp · face oeste' : '26 módulos · 200 Wp · 5,2 kWp · face oeste' },
            { label: 'Carport', kw: fmt(kw.carport), pct: (kw.carport / BASE.roof * 100).toFixed(0) + '%', color: '#e0a52f', sub: fatorSite === 1 ? '32 placas · 450 Wp · 14,4 kWp · sobre as vagas' : '18 placas · 450 Wp · 8,1 kWp · sobre as vagas' },
          ],
          consumoDiaTotal: (DIA.evTotal + DIA.galTotal).toFixed(1).replace('.', ',') + ' kWh no dia',
          ...(() => {
            const vagasTot = Math.max(1, s.chargers.filter(c => c.site === (s.siteSel || 'pn') && c.status !== 'manutencao').length);
            const linhas = DIA.linhas;
            const abertas = linhas.filter(l => l.fase !== 'Pré-op');
            const horaAtual = (() => {
              const hs = linhas.map(l => Number(l.hora.replace('h', '')));
              const agora = new Date().getHours();
              return hs.indexOf(agora) > -1 ? agora : hs[Math.min(hs.length - 1, Math.max(0, hs.findIndex(x => x >= agora)))] ?? hs[0];
            })();
            const somaOcup = abertas.reduce((t, l) => t + Number(l.evs), 0);
            const media = abertas.length ? somaOcup / (abertas.length * vagasTot) * 100 : 0;
            const picoN = linhas.reduce((m, l) => Math.max(m, Number(l.evs)), 0);
            const horasPico = linhas.filter(l => Number(l.evs) === picoN).map(l => l.hora);
            const ociosas = abertas.length ? (abertas.length * vagasTot - somaOcup) / (abertas.length * vagasTot) * 100 : 0;
            return {
              ocupVagas: vagasTot + (vagasTot > 1 ? ' vagas ativas' : ' vaga ativa'),
              ocupNota: 'Média calculada sobre as ' + abertas.length + ' horas de operação. Pico de ' + picoN + (picoN > 1 ? ' vagas' : ' vaga') + ' às ' + horasPico.join(', ') + '. A faixa ociosa é onde a tarifa dinâmica pode atrair mais sessões.',
              ocupAoVivo: (() => {
                const agoraN = Number((linhas.find(l => Number(l.hora.replace('h', '')) === horaAtual) || {}).evs || 0);
                const media = abertas.length ? abertas.reduce((t, l) => t + Number(l.evs), 0) / abertas.length : 0;
                if (agoraN === 0) return 'Nenhuma vaga em uso agora';
                if (agoraN >= vagasTot) return 'Lotado · ' + agoraN + ' de ' + vagasTot + ' vagas';
                return (agoraN > media * 1.2 ? 'Um pouco movimentado' : agoraN < media * 0.8 ? 'Mais tranquilo que o normal' : 'Movimento habitual')
                  + ' · ' + agoraN + ' de ' + vagasTot + ' vagas';
              })(),
              ocupBarras: linhas.map((l, i) => {
                const n = Number(l.evs);
                const agora = Number(l.hora.replace('h', '')) === horaAtual;
                return {
                  label: i % 2 === 0 ? l.hora.replace('h', '') : '',
                  titulo: l.hora + ' · ' + n + ' de ' + vagasTot + ' vagas em uso',
                  alt: n === 0 ? '4px' : Math.max(10, Math.round(n / Math.max(1, vagasTot) * 100)) + '%',
                  cor: agora ? '#f5333f' : n === 0 ? '#e4e5e9' : '#7fa9f5',
                };
              }),
            };
          })(),
          consumoLinhas: (() => {            const n1 = (v) => v.toFixed(1).replace('.', ',') + ' kWh';
            // rede e bateria rateadas pelo déficit de cada consumidor
            const partes = { ev: { bat: DIA.usaEv, rede: DIA.redeEv }, gal: { bat: DIA.usaGal, rede: DIA.redeGal } };
            const lados = [
              {
                key: 'ev', label: 'Carregadores EV', icon: '🔌', bg: '#dee9fc', fg: '#3577f1',                sub: 'pico de ' + DIA.linhas.reduce((m, l) => Math.max(m, Number(l.evs)), 0) + ' carros simultâneos · ' + DIA.linhas.reduce((t, l) => t + Number(l.evs), 0) + ' carro-hora',
                total: DIA.evTotal, solar: DIA.solarEv,
                nota: 'O rateio reserva ' + (s.repEv ?? 80) + '% da geração às vagas; depois entram bateria e, por último, a rede.',
              },
              {
                key: 'gal', label: 'Edificação', icon: '🏬', bg: '#faeed3', fg: '#b97a08',
                sub: 'lojas, praça e climatização',
                total: DIA.galTotal, solar: DIA.solarGal,
                nota: 'O rateio destina ' + (100 - (s.repEv ?? 80)) + '% da geração à edificação; o que passa disso vem da bateria na ponta e da rede no restante do dia.',
              },
            ];
            return lados.map(x => {
              const bat = partes[x.key].bat;
              const rede = partes[x.key].rede;
              const base = Math.max(0.01, x.solar + bat + rede);
              const pSolar = Math.round(x.solar / base * 100);
              const pBat = Math.round(bat / base * 100);
              const pRede = Math.max(0, 100 - pSolar - pBat);
              const pct = (v) => Math.round(v / base * 100) + '%';
              return {
                label: x.label, sub: x.sub, icon: x.icon, bg: x.bg, fg: x.fg, nota: x.nota,
                kw: n1(x.total),
                kwNum: x.total.toFixed(1).replace('.', ','),
                aberto: s.consumoAberto === x.key,
                borda: s.consumoAberto === x.key ? '#00d1ff' : '#e4e5e9',
                sombra: s.consumoAberto === x.key ? '0 0 10px rgba(0,209,255,.55)' : 'none',
                icoEv: x.key === 'ev', icoGal: x.key === 'gal',
                seta: s.consumoAberto === x.key ? '⌃' : '⌄',
                onToggle: () => this.setState(p => ({ consumoAberto: p.consumoAberto === x.key ? null : x.key })),
                barSolar: pct(x.solar), barBat: pct(bat), barRede: pct(rede),
                centroValor: x.total.toFixed(1).replace('.', ','),
                resumoFontes: 'Solar ' + n1(x.solar) + ' · bateria ' + n1(bat) + ' · rede ' + n1(rede),
                donut: 'conic-gradient(#f5c445 0 ' + pSolar + '%, #34d399 ' + pSolar + '% ' + (pSolar + pBat) + '%, #9aa1ad ' + (pSolar + pBat) + '% 100%)',
                fontes: [
                  { label: 'Solar direto', swatch: '#f5c445', cor: '#b97a08', kwh: n1(x.solar), pct: pSolar + '%' },
                  { label: 'Bateria BESS', swatch: '#34d399', cor: '#0f7a51', kwh: n1(bat), pct: pBat + '%' },
                  { label: 'Rede', swatch: '#9aa1ad', cor: '#5d6572', kwh: n1(rede), pct: pRede + '%' },
                ],
              };
            });
          })(),
          ...(() => {
            const cap = capBess, soc = Math.round(DIA.socFinal / DIA.capBat * 100), disp = DIA.socFinal;
            const vazia = disp < 0.05;
            const carregando = !vazia && bessCarregando, descarregando = !vazia && bessDescarregando, kw = vazia ? 0 : bessKwNum;
            return {
              bessPct: soc + '%',
              bessBar: soc + '%',
              bessDiaCarga: DIA.armTotal.toFixed(1).replace('.', ',') + ' kWh',
              bessDiaCargaSub: DIA.horasArm.length ? 'do excedente solar entre ' + String(DIA.horasArm[0]).padStart(2, '0') + 'h e ' + String(DIA.horasArm[DIA.horasArm.length - 1] + 1).padStart(2, '0') + 'h' : 'sem excedente solar para armazenar hoje',
              bessDiaDescarga: DIA.usaTotal.toFixed(1).replace('.', ',') + ' kWh',
              bessDiaDescargaSub: 'concentrada na faixa de ponta, 17h–18h · inclui a reserva da noite anterior',
              bessSaldo: disp.toFixed(1).replace('.', ',') + ' kWh',
              bessCapSub: cap + ' kWh instalados',
              bessCap: cap + ' kWh instalados · ' + disp.toFixed(1).replace('.', ',') + ' kWh disponíveis ao fim do dia',
              bessModo: vazia ? 'Esgotada' : carregando ? 'Carregando' : descarregando ? 'Descarregando' : 'Em espera',
              bessKw: vazia ? '0,0 kW' : (carregando ? '+' : descarregando ? '−' : '') + kw.toFixed(1).replace('.', ',') + ' kW',
              bessChipBg: vazia ? '#fdeaec' : carregando ? '#dcf3ea' : descarregando ? '#dee9fc' : '#eceef2',
              bessChipFg: vazia ? '#a3111c' : carregando ? '#0f5c3f' : descarregando ? '#1d4ea8' : '#4b5563',
              bessBarCor: vazia ? '#f5333f' : carregando ? '#149d68' : descarregando ? '#3577f1' : '#9aa1a9',
              bessNota: vazia
                ? 'A bateria entregou toda a reserva na faixa de ponta, entre 17h e 18h. Daí em diante a rede assume até o sol voltar.'
                : carregando
                ? 'Excedente solar de ' + excedente.toFixed(1).replace('.', ',') + ' kW sendo armazenado para a faixa de ponta.'
                : descarregando
                  ? 'Cobrindo ' + kw.toFixed(1).replace('.', ',') + ' kW que o solar não supre — autonomia de ' + (kw > 0 ? (disp / kw).toFixed(1).replace('.', ',') : '0') + ' h no ritmo atual' + (redeTotal < 0.05 ? ', sem puxar da rede.' : '; a rede complementa ' + fmt(redeTotal) + '.')
                  : 'Geração e consumo equilibrados: a bateria fica em espera, preservando ciclos.',
            };
          })(),
          ...(() => {
            return {
              ...(() => {
                const n1 = (v) => v.toFixed(1).replace('.', ',') + ' kWh';
                const rEv = DIA.redeEv;
                const rGal = DIA.redeGal;
                const pcD = (v) => (DIA.redeDia > 0 ? Math.round(v / DIA.redeDia * 100) : 0) + '%';
                return {
                  redeDiaKwh: n1(DIA.redeDia),
                  redeDiaCusto: BRL(DIA.custoTotal),
                  redeDiaEv: n1(rEv), redeDiaEdif: n1(rGal),
                  redeDiaEvBar: pcD(rEv), redeDiaEdifBar: pcD(rGal),
                  redeDiaNota: DIA.redeDia < 0.05
                    ? 'Nenhum kWh comprado hoje: solar e bateria cobriram carregadores e edificação.'
                    : 'Pela hierarquia de despacho os carregadores são atendidos primeiro por solar e bateria; a rede entra no que falta, sobretudo na faixa de ponta. Custo ao preço médio de '
                      + BRL(DIA.custoTotal / DIA.redeDia) + '/kWh pago hoje.',
                };
              })(),
            };
          })(),
          ...(() => {
            const solarDia = DIA.gerado;
            const paraBateria = DIA.armTotal;
            const ev = DIA.solarEv;
            const edif = DIA.solarGal;
            const sobra = Math.max(0, DIA.sobraDia);
            const pc = (v) => Math.round(v / Math.max(0.01, solarDia) * 100) + '%';
            const n1 = (v) => v.toFixed(1).replace('.', ',') + ' kWh';
            return {
              solarDiaTotal: n1(solarDia) + ' gerados',
              solarDiaEv: n1(ev),
              solarDiaEdif: n1(edif),
              solarDiaEvBar: pc(ev),
              solarDiaEdifBar: pc(edif),
              solarDiaBatBar: pc(paraBateria),
              solarDiaSobraBar: pc(sobra),
              solarDiaSobra: n1(sobra),
              solarDiaSobraSub: sobra < 0.05 ? 'nada exportado: tudo consumido ou armazenado' : DIA.expAberta < 0.05 ? 'gerado antes da abertura, com a bateria cheia · vira crédito na fatura' : 'excedente sem consumo no local · vira crédito na fatura',
              solarDiaEvSub: 'solar entregue nas vagas · ' + BRL(DIA.solarEv * ((s.chargers.filter(c => c.site === (s.siteSel || 'pn'))[0] || {}).preco || 2.19)) + ' de receita atribuída ao solar',
              solarDiaEdifSub: 'solar nas lojas, praça e climatização · ' + BRL(edif * (DIA.redeDia > 0.05 ? DIA.custoTotal / DIA.redeDia : s.tarifaBase)) + ' economizados',
              solarDiaNota: 'Toda a geração de hoje tem destino: consumo direto nos carros e na edificação, carga da bateria e, quando ninguém consome, exportação à rede como crédito.',
            };
          })(),
          ...(() => {
            const per = s.periodoSel || 'Dia';
            const diaKwh = DIA.gerado;
            const SEM = this.SERIE_SEM, MES = this.SERIE_MES, ANO = this.SERIE_ANO;
            const DIAS_LBL = this.SERIE_DIAS_LBL, MESES_LBL = this.SERIE_MESES_LBL;
            const conf = per === 'Dia'
              ? { vals: DIA.linhas.map(l => Number(l.solar.replace(',', '.'))), labels: DIA.linhas.map((l, i) => (i % 2 === 0 ? l.hora.replace('h', '') : '')), total: diaKwh, nota: 'Geração hora a hora de hoje, com a condição do céu selecionada.' }
              : per === 'Semana'
                ? { vals: SEM.map(f => diaKwh * f), labels: DIAS_LBL, total: SEM.reduce((t, f) => t + diaKwh * f, 0), nota: 'Últimos 7 dias. A queda de quinta foi um dia encoberto.' }
                : per === 'Mês'
                  ? { vals: MES.map(f => diaKwh * f), labels: MES.map((v, i) => ((i + 1) % 5 === 0 ? String(i + 1) : '')), total: MES.reduce((t, f) => t + diaKwh * f, 0), nota: 'Setembro, dia a dia. Medição pelo inversor via SEMS Plus.' }
                  : { vals: ANO.map(f => diaKwh * 30 * f), labels: MESES_LBL, total: ANO.reduce((t, f) => t + diaKwh * 30 * f, 0), nota: 'Doze meses. O inverno derruba a geração e o verão a recupera.' };
            const max = Math.max(...conf.vals, 0.01);
            const fmtKwh = (v) => v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + ' MWh' : v.toFixed(1).replace('.', ',') + ' kWh';
            return {
              periodoAberto: !!s.periodoAberto,
              periodoSeta: s.periodoAberto ? '⌃' : '⌄',
              periodoBorda: s.periodoAberto ? '#00d1ff' : '#e4e5e9',
              periodoSombra: s.periodoAberto ? '0 0 10px rgba(0,209,255,.55)' : 'none',
              togglePeriodo: () => this.setState(p => ({ periodoAberto: !p.periodoAberto })),
              periodoTabs: ['Dia', 'Semana', 'Mês', 'Ano'].map(x => ({
                label: x,
                border: per === x ? '#00d1ff' : '#e4e5e9',
                espessura: per === x ? '2px' : '1.5px',
                sombra: per === x ? '0 0 10px rgba(0,209,255,.55)' : 'none',
                fg: per === x ? '#131c2e' : '#5d6572',
                onPick: () => this.setState({ periodoSel: x }),
              })),
              perGerado: fmtKwh(conf.total),
              ...(() => {
                const tarM = DIA.redeDia > 0.05 ? DIA.custoTotal / DIA.redeDia : s.tarifaBase;
                const precoEv = (s.chargers.filter(c => c.site === (s.siteSel || 'pn'))[0] || {}).preco || 2.19;
                const esc = DIA.gerado > 0.01 ? conf.total / DIA.gerado : 0;
                const rec = DIA.solarEv * esc * precoEv;
                const eco = (DIA.solarGal + DIA.armTotal + DIA.sobraDia) * esc * tarM;
                return {
                  perReceita: BRL(rec).replace('R$ ', 'R$\u00a0'),
                  perReceitaSub: 'solar vendido nas vagas a ' + BRL(precoEv) + '/kWh',
                  perEconomia: BRL(eco).replace('R$ ', 'R$\u00a0'),
                  perEconomiaSub: 'energia não comprada da rede a ' + BRL(tarM) + '/kWh',
                };
              })(),
              perNota: conf.nota,
              perFontes: (() => {
                const B = { roof: 16.1, carport: 5.8, facade: 3.6 };
                const soma = B.roof + B.carport + B.facade;
                const META = [
                  { k: 'roof', label: 'Cobertura', sub: '96 placas · 43,2 kWp',
                    d1: 'M3.4 14.6 12 5.4l8.6 9.2M6.8 14.6v5.8h10.4v-5.8',
                    d2: 'M9.8 20.4v-3.2h4.4v3.2' },
                  { k: 'carport', label: 'Carport', sub: '32 placas · 14,4 kWp',
                    d1: 'M3.4 10.8 12 6l8.6 4.8M5.6 10.8v9.6M18.4 10.8v9.6',
                    d2: 'M8.6 15.4h6.8' },
                  { k: 'facade', label: 'Fachada BIPV', sub: '48 módulos · 9,6 kWp',
                    d1: 'M5.6 3.6h12.8v16.8H5.6zM5.6 9.2h12.8M5.6 14.8h12.8',
                    d2: 'M12 3.6v16.8' },
                ];
                return META.map(m => {
                  const frac = B[m.k] / soma;
                  return {
                    label: m.label, sub: m.sub, d1: m.d1, d2: m.d2,
                    kwh: fmtKwh(conf.total * frac),
                    pct: Math.round(frac * 100) + '%',
                  };
                });
              })(),
              perBarras: conf.vals.map((v, i) => ({
                label: conf.labels[i] || '',
                alt: v <= 0 ? '0%' : Math.max(3, Math.round(v / max * 100)) + '%',
                op: v === max ? 1 : 0.7,
              })),
            };
          })(),
          ...(() => {
            const per = s.consPerSel || 'Dia';
            const tarM = DIA.redeDia > 0.05 ? DIA.custoTotal / DIA.redeDia : s.tarifaBase;
            const diaSolar = DIA.solarEv + DIA.solarGal + DIA.usaTotal;
            const diaRede = DIA.redeDia;
            const SEM = this.SERIE_SEM, MES = this.SERIE_MES, ANO = this.SERIE_ANO;
            const DIAS_LBL = this.SERIE_DIAS_LBL, MESES_LBL = this.SERIE_MESES_LBL;
            const mk = (fatores, labels, esc) => ({
              solar: fatores.map(f => diaSolar * f * esc),
              rede: fatores.map(f => (diaRede + diaSolar * (1 - f)) * esc),
              labels,
            });
            const conf = per === 'Dia'
              ? {
                  solar: DIA.linhas.map(l => Math.max(0,
                    Number(l.solar.replace(',', '.'))
                    - Number(l.exp.replace(',', '.'))
                    - Number(l.arm.replace(',', '.'))
                    + Number(l.usa.replace(',', '.')))),
                  rede: DIA.linhas.map(l => Number(l.rede.replace(',', '.'))),
                  labels: DIA.linhas.map((l, i) => (i % 2 === 0 ? l.hora.replace('h', '') : '')),
                  nota: 'Consumo hora a hora: o que veio da geração e da bateria e o que foi comprado da rede.',
                }
              : per === 'Semana'
                ? { ...mk(SEM, DIAS_LBL, 1), nota: 'Últimos 7 dias. Na quinta encoberta a rede cobriu a maior parte.' }
                : per === 'Mês'
                  ? { ...mk(MES, MES.map((v, i) => ((i + 1) % 5 === 0 ? String(i + 1) : '')), 1), nota: 'Setembro, dia a dia. Medição por circuito no SEMS Plus.' }
                  : { ...mk(ANO, MESES_LBL, 30), nota: 'Doze meses. No inverno a fatia da rede cresce.' };
            const totSolar = conf.solar.reduce((t, v) => t + v, 0);
            const totRede = conf.rede.reduce((t, v) => t + v, 0);
            const maxC = Math.max(...conf.solar.map((v, i) => v + conf.rede[i]), 0.01);
            const fmtKwh = (v) => v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + ' MWh' : v.toFixed(1).replace('.', ',') + ' kWh';
            return {
              ...(() => {
                const bp = s.bessPerSel || 'Dia';
                const SEM_B = [.92, 1, .64, .32, .84, .96, .9];
                const MES_B = MES, ANO_B = ANO;
                const cargaDia = DIA.armTotal, descDia = DIA.usaTotal;
                const mkB = (fat, labels, esc) => ({
                  carga: fat.map(f => cargaDia * f * esc),
                  desc: fat.map(f => descDia * f * esc),
                  labels,
                });
                const faixa = (ls) => {
                  if (!ls.length) return '';
                  const hs = ls.map(l => Number(l.hora.replace('h', '')));
                  const p = (n) => String(n).padStart(2, '0') + 'h';
                  return hs.length === 1 ? p(hs[0]) : p(hs[0]) + '–' + p(hs[hs.length - 1] + 1);
                };
                const lsArm = DIA.linhas.filter(l => Number(l.arm.replace(',', '.')) > 0.01);
                const lsUsa = DIA.linhas.filter(l => Number(l.usa.replace(',', '.')) > 0.01);
                const janelaTexto = (lsArm.length ? 'Armazena o excedente solar em ' + faixa(lsArm) + ' (' + lsArm.length + ' h)' : 'Sem excedente solar para armazenar hoje')
                  + (lsUsa.length ? ' e devolve em ' + faixa(lsUsa) + ' (' + lsUsa.length + ' h), priorizando a faixa de ponta.' : '. A bateria não foi acionada.');
                const cb = bp === 'Dia'
                  ? {
                      carga: DIA.linhas.map(l => Number(l.arm.replace(',', '.'))),
                      desc: DIA.linhas.map(l => Number(l.usa.replace(',', '.'))),
                      labels: DIA.linhas.map((l, i) => (i % 2 === 0 ? l.hora.replace('h', '') : '')),
                      nota: janelaTexto,
                    }
                  : bp === 'Semana'
                    ? { ...mkB(SEM_B, DIAS_LBL, 1), nota: 'Últimos 7 dias. Na quinta encoberta sobrou pouco excedente para armazenar.' }
                    : bp === 'Mês'
                      ? { ...mkB(MES_B, MES.map((v, i) => ((i + 1) % 5 === 0 ? String(i + 1) : '')), 1), nota: 'Setembro, dia a dia. Um ciclo completo por dia preserva a vida útil do BESS.' }
                      : { ...mkB(ANO_B, MESES_LBL, 30), nota: 'Doze meses. No inverno há menos excedente solar para armazenar.' };
                const maxB = Math.max(...cb.carga, ...cb.desc, 0.01);
                return {
                  bessPerAberto: !!s.bessPerAberto,
                  bessPerSeta: s.bessPerAberto ? '⌃' : '⌄',
                  bessPerBorda: s.bessPerAberto ? '#00d1ff' : '#e4e5e9',
                  bessPerSombra: s.bessPerAberto ? '0 0 10px rgba(0,209,255,.55)' : 'none',
                  toggleBessPer: () => this.setState(p => ({ bessPerAberto: !p.bessPerAberto })),
                  bessPerTabs: ['Dia', 'Semana', 'Mês', 'Ano'].map(x => ({
                    label: x,
                    border: bp === x ? '#00d1ff' : '#e4e5e9',
                    espessura: bp === x ? '2px' : '1.5px',
                    sombra: bp === x ? '0 0 10px rgba(0,209,255,.55)' : 'none',
                    fg: bp === x ? '#131c2e' : '#5d6572',
                    onPick: () => this.setState({ bessPerSel: x }),
                  })),
                  bessPerCarga: fmtKwh(cb.carga.reduce((t, v) => t + v, 0)),
                  bessPerDescarga: fmtKwh(cb.desc.reduce((t, v) => t + v, 0)),
                  bessPerNota: cb.nota,
                  bessKpis: (() => {
                    const cargaT = cb.carga.reduce((t, v) => t + v, 0);
                    const descT = cb.desc.reduce((t, v) => t + v, 0);
                    const ciclos = cargaT / Math.max(0.01, DIA.capBat);
                    // SoC mínimo real percorrendo o dia
                    let carga = DIA.capBat * 0.92, minSoc = carga;
                    DIA.linhas.forEach(l => {
                      carga += Number(l.arm.replace(',', '.')) - Number(l.usa.replace(',', '.'));
                      carga = Math.max(0, Math.min(DIA.capBat, carga));
                      if (carga < minSoc) minSoc = carga;
                    });
                    const dod = (1 - minSoc / DIA.capBat) * 100;
                    const horasDesc = DIA.linhas.filter(l => Number(l.usa.replace(',', '.')) > 0.01).length;
                    const medPorHora = horasDesc ? descT / (horasDesc * (bp === 'Dia' ? 1 : bp === 'Semana' ? 7 : bp === 'Mês' ? 26 : 312)) : 0;
                    const n1b = (v, d) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
                    return [
                      { label: 'Ciclos equivalentes', valor: n1b(ciclos, 2), cor: '#131c2e', sub: 'carga total ÷ ' + DIA.capBat + ' kWh de capacidade' },
                      { label: 'Descarga média por hora', valor: n1b(medPorHora, 1) + ' kWh', cor: '#1d4ea8', sub: 'nas ' + horasDesc + ' horas em que a bateria entrega' },
                      { label: 'Profundidade máxima', valor: n1b(dod, 0) + '%', cor: dod > 90 ? '#a3111c' : '#131c2e', sub: 'SoC mínimo de ' + n1b(minSoc, 1) + ' kWh no dia' },
                      { label: 'Janela de carga', valor: DIA.horasArm.length + ' h/dia', cor: '#131c2e', sub: DIA.horasArm.length ? 'horas com excedente solar, por dia' : 'sem excedente solar hoje' },
                    ];
                  })(),
                  bessPerResumo: 'Estado de carga ' + Math.round(DIA.socFinal / DIA.capBat * 100) + '% · '
                    + fmtKwh(DIA.armTotal) + ' carregados e ' + fmtKwh(DIA.usaTotal) + ' devolvidos hoje',
                  bessPerBarras: cb.carga.map((v, i) => ({
                    label: cb.labels[i] || '',
                    altCarga: Math.round(v / maxB * 100) + '%',
                    altDesc: Math.round(cb.desc[i] / maxB * 100) + '%',
                  })),
                };
              })(),
              consPerAberto: !!s.consPerAberto,
              consPerSeta: s.consPerAberto ? '⌃' : '⌄',
              consPerBorda: s.consPerAberto ? '#00d1ff' : '#e4e5e9',
              consPerSombra: s.consPerAberto ? '0 0 10px rgba(0,209,255,.55)' : 'none',
              toggleConsumoPer: () => this.setState(p => ({ consPerAberto: !p.consPerAberto })),
              consPerTabs: ['Dia', 'Semana', 'Mês', 'Ano'].map(x => ({
                label: x,
                border: per === x ? '#00d1ff' : '#e4e5e9',
                espessura: per === x ? '2px' : '1.5px',
                sombra: per === x ? '0 0 10px rgba(0,209,255,.55)' : 'none',
                fg: per === x ? '#131c2e' : '#5d6572',
                onPick: () => this.setState({ consPerSel: x }),
              })),
              consPerSolar: fmtKwh(totSolar),
              consPerRede: fmtKwh(totRede),
              consPerSolarPct: Math.round(totSolar / Math.max(0.01, totSolar + totRede) * 100) + '%',
              consPerCusto: BRL(per === 'Dia' ? DIA.custoTotal : totRede * tarM),
              consPerDiaVisivel: per === 'Dia',
              consPerNota: conf.nota,
              consPerBarras: conf.solar.map((v, i) => ({
                label: conf.labels[i] || '',
                altSolar: Math.round(v / maxC * 100) + '%',
                altRede: Math.round(conf.rede[i] / maxC * 100) + '%',
              })),
            };
          })(),
          tabelaLinhas: DIA.linhas.filter(l => !s.balFase || s.balFase === 'Todas' || l.fase === s.balFase),
          balMenu: !!s.balMenu,
          balSeta: s.balMenu ? '⌃' : '⌄',
          balSetaFg: s.balFase && s.balFase !== 'Todas' ? '#00d1ff' : '#9aa1ad',
          toggleBalMenu: () => this.setState(p => ({ balMenu: !p.balMenu })),
          balFiltros: ['Todas', 'Pré-op', 'Operacional', 'Noturno'].map(f => {
            const on = (s.balFase || 'Todas') === f;
            const n = f === 'Todas' ? DIA.linhas.length : DIA.linhas.filter(l => l.fase === f).length;
            return {
              label: f === 'Todas' ? 'Todas · ' + n : f + ' · ' + n,
              onPick: () => this.setState({ balFase: f, balMenu: false }),
              bg: '#fff', fg: on ? '#131c2e' : '#5d6572',
              border: on ? '#00d1ff' : '#e4e5e9',
              espessura: on ? '2px' : '1.5px',
              sombra: on ? '0 0 10px rgba(0,209,255,.55)' : 'none',
            };
          }),
          ...(() => {
            const precoEv = (s.chargers.filter(c => c.site === (s.siteSel || 'pn'))[0] || {}).preco || 2.19;
            const tarM = DIA.redeDia > 0.05 ? DIA.custoTotal / DIA.redeDia : s.tarifaBase;
            const DIAS = 26;
            const brutoDia = DIA.evTotal * precoEv;
            const mBruto = brutoDia * DIAS;
            const pontaKwh = DIA.linhas.filter(l => Number(l.hora.replace('h', '')) >= 17).reduce((t, l) => t + Number(l.rede.replace(',', '.')), 0);
            const ganhoPorKwh = 1.5 - 0.85;
            const coberto = Math.min(pontaKwh, DIA.capBat);
            return {
              hojeBruto: BRL(brutoDia),
              hojeRepasse: BRL(brutoDia * 0.9),
              hojeKwh: DIA.evTotal.toFixed(1).replace('.', ',') + ' kWh',
              mesBruto: BRL(mBruto),
              mesTaxa: '− ' + BRL(mBruto * 0.1),
              mesRepasse: BRL(mBruto * 0.9),
              mesNota: DIAS + ' dias de operação · ' + BRL(brutoDia) + '/dia no ritmo de hoje',
                      sindicoJanela: '03:00 → 06:00',
              sindicoDica: 'A ponta de hoje puxou ' + pontaKwh.toFixed(1).replace('.', ',') + ' kWh da rede a R$ 1,50/kWh. Comprar fora de ponta às 3h, a R$ 0,85, e devolver pela bateria no pico corta essa diferença.',
              sindicoDeficit: pontaKwh.toFixed(1).replace('.', ',') + ' kWh',
              sindicoEconomia: BRL(coberto * ganhoPorKwh) + '/dia',
              repEconomia: BRL(solar * (100 - (s.repEv ?? 80)) / 100 * tarM) + '/h',
            };
          })(),
          ...(() => {
            const preco = (s.chargers.filter(c => c.site === (s.siteSel || 'pn'))[0] || {}).preco || 2.19;
            const receita = DIA.evTotal * preco;
            const custoRede = DIA.custoTotal;
            const tarMedia = DIA.redeDia > 0.05 ? DIA.custoTotal / DIA.redeDia : s.tarifaBase;
            const economia = (DIA.solarGal + DIA.armTotal + DIA.sobraDia) * tarMedia;
            const resultado = receita + economia - custoRede;
            const atendido = DIA.solarEv + DIA.solarGal + DIA.usaTotal + DIA.redeDia;
            const pc = (v) => Math.round(v / Math.max(0.01, atendido) * 100) + '%';
            const n1 = (v) => v.toFixed(1).replace('.', ',') + ' kWh';
            const opRows = DIA.linhas.map(l => Number(l.evs) * 7 * (l.fase === 'Noturno' ? 1.5 : l.fase === 'Operacional' ? 1 : 0.85));
            const maxRec = Math.max(...opRows, 0.01);
            return {
              finResultado: BRL(resultado),
              finResultadoNota: 'Receita das vagas mais a energia que a galeria deixou de comprar, menos o que veio da rede.',
              finReceita: BRL(receita),
              finEconomia: BRL(economia),
              finCustoRede: BRL(custoRede),
              finSolarBar: pc(DIA.solarEv + DIA.solarGal),
              finBatBar: pc(DIA.usaTotal),
              finRedeBar: pc(DIA.redeDia),
              finPropriaBar: pc(DIA.solarEv + DIA.solarGal + DIA.usaTotal),
              finPropriaKwh: n1(DIA.solarEv + DIA.solarGal + DIA.usaTotal),
              finRedeKwh: n1(DIA.redeDia),
              finPrecoKwh: BRL(preco),
              epResumoSolar: DIA.gerado.toFixed(1).replace('.', ','),
              epResumoSolarUn: 'kWh gerados',
              epResumoTarifa: BRL((s.baseSites || {})[s.siteSel || 'pn'] ?? 2.49),
              epResumoTarifaUn: 'por kWh',
              epResumoVendido: DIA.evTotal.toFixed(1).replace('.', ','),
              epResumoVendidoUn: 'kWh vendidos',
              epResumoBateria: DIA.socFinal.toFixed(1).replace('.', ',') + ' kWh',
              epResumoBateriaUn: bessCarregando ? 'carregando' : bessDescarregando ? 'em uso' : 'em stand by',
              finEvKwh: n1(DIA.evTotal),
              finEdifKwh: n1(DIA.galTotal),
              finEvBar: Math.round(DIA.evTotal / Math.max(0.01, DIA.evTotal + DIA.galTotal) * 100) + '%',
              finEdifBar: Math.round(DIA.galTotal / Math.max(0.01, DIA.evTotal + DIA.galTotal) * 100) + '%',
              finEvSub: DIA.linhas.reduce((t, l) => t + Number(l.evs), 0) + ' carro-hora nas vagas',
              finMargemSub: 'líquido ' + BRL(receita * 0.9) + ' após a taxa de 10%',
              fatAberto: !!s.fatAberto,
              fatSeta: s.fatAberto ? '⌃' : '⌄',
              fatBorda: s.fatAberto ? '#00d1ff' : '#e4e5e9',
              fatSombra: s.fatAberto ? '0 0 10px rgba(0,209,255,.55)' : 'none',
              fatToggle: () => this.setState(p => ({ fatAberto: !p.fatAberto })),
              greAberto: !!s.greAberto,
              greSeta: s.greAberto ? '⌃' : '⌄',
              greBorda: s.greAberto ? '#00d1ff' : '#e4e5e9',
              greSombra: s.greAberto ? '0 0 10px rgba(0,209,255,.55)' : 'none',
              greToggle: () => this.setState(p => ({ greAberto: !p.greAberto })),
              ...(() => {
                const perR = s.redePer || 'Dia';
                const DIAS_MES = 26;
                const multR = perR === 'Dia' ? 1 : perR === 'Mês' ? DIAS_MES : DIAS_MES * 12;
                const subR = perR === 'Dia' ? 'hoje' : perR === 'Mês' ? DIAS_MES + ' dias de operação' : '312 dias de operação';
                const BRLnb = (v) => BRL(v).replace('R$ ', 'R$\u00a0');
                const mil = (v) => Math.round(v).toLocaleString('pt-BR');
                // rateio do custo da rede pelo déficit de cada consumidor
                const dEv = Math.max(0, DIA.evTotal - DIA.solarEv);
                const dGal = Math.max(0, DIA.galTotal - DIA.solarGal);
                const sd = dEv + dGal;
                const parteR = (v, d) => (sd > 0 ? v * d / sd : 0);
                const kwhEv = parteR(DIA.redeDia, dEv), kwhGal = parteR(DIA.redeDia, dGal);
                const custoEv = parteR(DIA.custoTotal, dEv) * multR, custoGal = parteR(DIA.custoTotal, dGal) * multR;
                const credito = DIA.sobraDia * tarMedia * multR;
                const total = DIA.custoTotal * multR;
                return {
                  redeTabs: ['Dia', 'Mês', 'Ano'].map(x => ({
                    label: x,
                    border: perR === x ? '#00d1ff' : '#e4e5e9',
                    espessura: perR === x ? '2px' : '1.5px',
                    sombra: perR === x ? '0 0 10px rgba(0,209,255,.55)' : 'none',
                    fg: perR === x ? '#131c2e' : '#5d6572',
                    onPick: () => this.setState({ redePer: x }),
                  })),
                  redeTarifaMedia: BRL(tarMedia),
                  redeTotalCusto: BRLnb(total),
                  redeTotalSub: mil(DIA.redeDia * multR) + ' kWh importados da rede · ' + subR,
                  redeGalCusto: BRLnb(custoGal),
                  redeGalSub: mil(kwhGal * multR) + ' kWh · lojas, praça e climatização',
                  redeEvCusto: BRLnb(custoEv),
                  redeEvSub: mil(kwhEv * multR) + ' kWh · vagas de recarga',
                  redeCredito: '+ ' + BRLnb(credito),
                  redeCreditoSub: mil(DIA.sobraDia * multR) + ' kWh injetados na rede a ' + BRL(tarMedia) + '/kWh',
                  ...(() => {
                    const pontaKwh = DIA.linhas
                      .filter(l => Number(l.hora.replace('h', '')) >= 17)
                      .reduce((t, l) => t + Number(l.rede.replace(',', '.')), 0);
                    const coberto = Math.min(pontaKwh, DIA.capBat);
                    const ganho = coberto * (1.5 - 0.85) * multR;
                    return {
                      redeShift: BRLnb(ganho),
                      redeShiftSub: coberto < 0.05
                        ? 'a bateria cobriu a ponta sem precisar comprar da rede'
                        : 'ainda não programada · ' + mil(coberto * multR) + ' kWh poderiam ser comprados a R$ 0,85 fora de ponta em vez de R$ 1,50 na ponta',
                      redeLiquido: BRLnb(Math.max(0, total - credito)),
                    };
                  })(),
                  redeNota: 'O custo é rateado entre galeria e eletroposto pelo déficit de cada um após o solar e a bateria. Os créditos de exportação abatem a conta no ciclo seguinte; a economia de load shifting só entra depois de programada no Síndico.',
                };
              })(),
              ...(() => {
                const per = s.fatPer || 'Dia';
                const DIAS_MES = 26, MESES_ANO = 12;
                const mult = per === 'Dia' ? 1 : per === 'Mês' ? DIAS_MES : DIAS_MES * MESES_ANO;
                const rec = receita * mult, eco = economia * mult;
                const sub = per === 'Dia' ? 'hoje' : per === 'Mês' ? DIAS_MES + ' dias de operação' : '312 dias de operação';
                const BRLnb = (v) => BRL(v).replace('R$ ', 'R$\u00a0');
                const mil = (v) => Math.round(v).toLocaleString('pt-BR');
                const MES = this.SERIE_MES, ANO = this.SERIE_ANO, MESES_LBL = this.SERIE_MESES_LBL;
                const serie = per === 'Dia'
                  ? { vals: DIA.linhas.map(l => Number(l.evs) * 7 * (l.fase === 'Noturno' ? 1.5 : l.fase === 'Operacional' ? 1 : 0.85)),
                      labels: DIA.linhas.map((l, i) => (i % 3 === 0 ? l.hora.replace('h', '') : '')),
                      nota: 'Receita por hora das vagas hoje. O pico segue a ocupação e a faixa tarifária de ponta.' }
                  : per === 'Mês'
                    ? { vals: MES.map(f => receita * f),
                        labels: MES.map((v, i) => ((i + 1) % 5 === 0 ? String(i + 1) : '')),
                        nota: 'Receita por dia em setembro. Fins de semana e dias encobertos puxam o faturamento para baixo.' }
                    : { vals: ANO.map(f => receita * f * DIAS_MES),
                        labels: MESES_LBL,
                        nota: 'Receita por mês nos últimos doze meses. O verão concentra geração e ocupação.' };
                const maxF = Math.max(...serie.vals, 0.01);
                return {
                  fatTabs: ['Dia', 'Mês', 'Ano'].map(x => ({
                    label: x,
                    border: per === x ? '#00d1ff' : '#e4e5e9',
                    espessura: per === x ? '2px' : '1.5px',
                    sombra: per === x ? '0 0 10px rgba(0,209,255,.55)' : 'none',
                    fg: per === x ? '#131c2e' : '#5d6572',
                    onPick: () => this.setState({ fatPer: x }),
                  })),
                  fatTotal: BRLnb(rec + eco),
                  fatTotalSub: 'receita das vagas mais a energia não comprada · ' + sub,
                  fatReceita: BRLnb(rec),
                  fatReceitaSub: mil(DIA.evTotal * mult) + ' kWh vendidos a ' + BRL(preco) + '/kWh',
                  fatGraficoNota: serie.nota,
                  finBarras: serie.vals.map((v, i) => ({
                    label: serie.labels[i] || '',
                    alt: v <= 0 ? '0%' : Math.max(3, Math.round(v / maxF * 100)) + '%',
                    op: v === maxF ? 1 : 0.7,
                  })),
                  fatEconomia: BRLnb(eco),
                  fatEconomiaSub: 'autoconsumo solar e bateria a ' + BRL(tarMedia) + '/kWh',
                };
              })(),
              finFontesNota: 'Economia = o que essa energia custaria vinda da rede, ao preço médio de ' + BRL(tarMedia) + '/kWh pago hoje. Receita atribuída ao solar = a parcela dos ' + BRL(receita) + ' faturados nas vagas que veio da geração própria.',
              distAberto: s.distAberto !== false,
              distSeta: s.distAberto !== false ? '⌃' : '⌄',
              distLabel: s.distAberto !== false ? 'ocultar' : 'ver',
              toggleDist: () => this.setState(p => ({ distAberto: p.distAberto === false })),
              ...(() => {
                const perD = s.distPer || 'Dia';
                const DIAS_MES = 26;
                const multD = perD === 'Dia' ? 1 : perD === 'Mês' ? DIAS_MES : DIAS_MES * 12;
                const subD = perD === 'Dia' ? 'gerados hoje' : perD === 'Mês' ? 'gerados no mês' : 'gerados no ano';
                const k = (v) => v * multD;
                const pc = (v) => Math.round(v / Math.max(0.01, DIA.gerado) * 100) + '%';
                const kwh = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
                return {
                  distTabs: ['Dia', 'Mês', 'Ano'].map(x => ({
                    label: x,
                    border: perD === x ? '#00d1ff' : '#e4e5e9',
                    espessura: perD === x ? '2px' : '1.5px',
                    sombra: perD === x ? '0 0 10px rgba(0,209,255,.55)' : 'none',
                    fg: perD === x ? '#131c2e' : '#5d6572',
                    onPick: () => this.setState({ distPer: x }),
                  })),
                  finSolarTotal: kwh(k(DIA.gerado)) + ' kWh ' + subD,
                  distEvBar: pc(DIA.solarEv),
                  distBatBar: pc(DIA.armTotal),
                  distGalBar: pc(DIA.solarGal),
                  distRedeBar: pc(DIA.sobraDia),
                  distTotalKwh: kwh(k(DIA.solarEv + DIA.armTotal + DIA.solarGal + DIA.sobraDia)),
                  distTotalEco: BRL(k(DIA.armTotal + DIA.solarGal + DIA.sobraDia) * tarMedia),
                  distTotalRec: BRL(k(DIA.solarEv) * preco),
                  distLinhas: [
                    { label: 'Eletroposto', cor: '#3577f1', kwh: kwh(k(DIA.solarEv)), eco: '—', ecoFg: '#7c8494', rec: BRL(k(DIA.solarEv) * preco), recFg: '#1d4ea8' },
                    { label: 'Bateria', cor: '#149d68', kwh: kwh(k(DIA.armTotal)), eco: BRL(k(DIA.armTotal) * tarMedia), ecoFg: '#0f5c3f', rec: '—', recFg: '#7c8494' },
                    { label: 'Galeria', cor: '#f2b01e', kwh: kwh(k(DIA.solarGal)), eco: BRL(k(DIA.solarGal) * tarMedia), ecoFg: '#0f5c3f', rec: '—', recFg: '#7c8494' },
                    { label: 'Rede', cor: '#c9cdd6', kwh: kwh(k(DIA.sobraDia)), eco: BRL(k(DIA.sobraDia) * tarMedia), ecoFg: '#0f5c3f', rec: '—', recFg: '#7c8494' },
                  ],
                };
              })(),
            };
          })(),          tabelaGerado: DIA.gerado.toFixed(1).replace('.', ',') + ' kWh',
          tabelaCusto: BRL(DIA.custoTotal),
          tabelaRede: DIA.redeDia.toFixed(1).replace('.', ',') + ' kWh',
          tabelaEv: DIA.evTotal.toFixed(1).replace('.', ',') + ' kWh',
          repEvPct: (s.repEv ?? 80) + '%',
          repEdifPct: (100 - (s.repEv ?? 80)) + '%',
          repEvKw: fmt(solar * (s.repEv ?? 80) / 100),
          repEdifKw: fmt(solar * (100 - (s.repEv ?? 80)) / 100),
          ...(() => {
            const horaBal = Math.min(22, Math.max(6, new Date().getHours()));
          let galAgora = 0;
          const vagasSite = s.chargers.filter(c => c.site === (s.siteSel || 'pn'));
            const precoSite = vagasSite.length ? vagasSite[0].preco : 2.19;
            const kwEntregando = vagasSite.filter(c => c.status === 'carregando').reduce((t, c) => t + (c.kw || 0), 0);
            const evKw = solar * (s.repEv ?? 80) / 100;
            return {
              repReceita: BRL(kwEntregando * precoSite) + '/h',
              repReceitaNota: kwEntregando > 0
                ? 'entregando agora a ' + BRL(precoSite) + '/kWh'
                : 'nenhuma vaga ocupada agora',
              repPotencial: 'potencial ' + BRL(evKw * precoSite) + '/h com as vagas ocupadas',
            };
          })(),
          repEvDec: () => this.setState(p => ({ repEv: Math.max(0, (p.repEv ?? 80) - 5) })),
          repEvInc: () => this.setState(p => ({ repEv: Math.min(100, (p.repEv ?? 80) + 5) })),
          repEdifDec: () => this.setState(p => ({ repEv: Math.min(100, (p.repEv ?? 80) + 5) })),
          repEdifInc: () => this.setState(p => ({ repEv: Math.max(0, (p.repEv ?? 80) - 5) })),
          repRecomendado: (100 - (s.repEv ?? 80)) === 20 ? 'no valor recomendado de 20%' : 'recomendado 20%',
          repEdifBorda: (100 - (s.repEv ?? 80)) === 20 ? '#00d1ff' : '#e4e5e9',
          autossuficiencia: Math.min(100, Math.round(solar / cargaTotal * 100)) + '% solar · ' + (redeTotal > 0.05 ? fmt(redeTotal) + ' vindos da rede' : 'sem importar da rede'),
          fronteira: redeTotal > 0.05 ? fmt(redeTotal) : '0 kW',
        };
      })(),
      sindicoAplicar: () => this.say('Compra fora de ponta programada para 03:00. A bateria entra no pico das 18h sem puxar da rede na tarifa cara.'),

      scVagaDetail: scr('vagaDetail'),
      backToChargers: () => this.setState({ screen: 'vagas', tab: 'vagas' }),
      goAlertas: () => this.setState({ screen: 'alertas', tab: 'vagas' }),
      alertaCount: String(alertasTodos.filter(a => a.sev !== 'info').length),
      vagaNome: vagaAtual ? vagaAtual.nome : 'Vaga',
      vagaSub: siteAtual.nome + ' · OCPP 1.6',
      vagaChip: !vagaAtual ? '—' : vagaAtual.status === 'carregando' ? '● Carregando'
        : vagaAtual.status === 'livre' ? '● Disponível'
        : vagaAtual.status === 'manutencao' ? '● Em manutenção' : '● Falha',
      vagaChipBg: !vagaAtual ? '#eceef2' : vagaAtual.status === 'carregando' ? '#dcf3ea'
        : vagaAtual.status === 'livre' ? '#dee9fc'
        : vagaAtual.status === 'manutencao' ? '#faeed3' : '#fdeaec',
      vagaChipFg: !vagaAtual ? '#7c8494' : vagaAtual.status === 'carregando' ? '#0f7a51'
        : vagaAtual.status === 'livre' ? '#1d4ea8'
        : vagaAtual.status === 'manutencao' ? '#7a5406' : '#a3111c',
      vagaKw: !vagaAtual || vagaAtual.status !== 'carregando' ? '0,0 kW' : String(vagaAtual.kw).replace('.', ',') + ' kW',
      vagaTeto: '7,0 kW',
      vagaBar: (!vagaAtual || vagaAtual.status !== 'carregando' ? 0 : Math.round(vagaAtual.kw / 7 * 100)) + '%',
      vagaBarCor: !vagaAtual || vagaAtual.status !== 'carregando' ? '#c9cdd6' : vagaAtual.kw < 6.5 ? '#f2b01e' : '#149d68',
      vagaNota: !vagaAtual ? ''
        : vagaAtual.status === 'carregando'
          ? 'O medidor inteligente lê ' + dlmTeto + ' kW disponíveis para as vagas e o DLM reparte igualmente entre as ' + emCarga.length + ' em carga: ' + String(vagaAtual.kw).replace('.', ',') + ' kW cada (' + dlmTetoPct + ' do teto em uso). Os 7 kW plenos só voltam quando uma vaga encerra ou a edificação reduz.'
        : vagaAtual.status === 'livre' ? 'Vaga publicada no mapa e pronta para receber uma sessão. Sem alocação ativa.'
        : vagaAtual.status === 'manutencao' ? 'Vaga oculta do mapa por decisão do gestor. Nenhuma sessão nova será aceita.'
        : 'Vaga despublicada automaticamente depois da falha reportada pela wallbox.',
      vagaEmSessao: !!vagaAtual && vagaAtual.status === 'carregando',
      vagaSessao: !vagaAtual ? [] : [
        { valor: String(vagaAtual.hoje || 0).replace('.', ',') + ' kWh', label: 'entregues nesta sessão' },
        { valor: (vagaAtual.min || 0) + ' min', label: 'restantes para a meta' },
        { valor: BRL((vagaAtual.hoje || 0) * vagaAtual.preco), label: 'faturado até agora' },
      ],
      vagaSessaoNota: !vagaAtual ? '' : 'Tarifa travada em ' + BRL(vagaAtual.preco) + '/kWh no momento do plug-in. Leitura MeterValues a cada 30 s.',
      vagaDlmLog: [
        { hora: '14:22', acao: 'Limitado a ' + (vagaAtual ? String(vagaAtual.kw).replace('.', ',') : '—') + ' kW', motivo: 'Teto de ' + dlmTeto + ' kW dividido igualmente entre ' + emCarga.length + ' vagas em carga · ' + dlmTetoPct + ' em uso', cor: '#f2b01e' },
        { hora: '13:05', acao: 'Liberado a 7,0 kW', motivo: 'Geração solar passou a cobrir a edificação, liberando a rede', cor: '#149d68' },
        { hora: '11:48', acao: 'Limitado a 4,0 kW', motivo: 'Bateria BESS em 22% e ponta prevista para as 18h', cor: '#f5333f' },
        { hora: '09:30', acao: 'Sessão iniciada a 7,0 kW', motivo: 'Pré-autorização aprovada e tarifa travada em ' + BRL(vagaAtual ? vagaAtual.preco : 2.19), cor: '#9aa1ad' },
      ],
      ...(() => {
        const st = vagaAtual ? vagaAtual.status : 'livre';
        if (st === 'falha') return {
          ocppBg: '#fdeaec', ocppInk: '#a3111c', ocppCode: 'StatusNotification',
          ocppPayload: 'status: Faulted · errorCode: GroundFailure · vendorId: GoodWe',
          ocppHuman: 'A wallbox detectou falha de aterramento e interrompeu a entrega por segurança. A vaga foi despublicada do mapa automaticamente.',
        };
        if (st === 'carregando') return {
          ocppBg: '#dee9fc', ocppInk: '#1d4ea8', ocppCode: 'MeterValues',
          ocppPayload: 'Energy.Active.Import.Register: ' + (vagaAtual.hoje || 0) + ' kWh · Power.Active.Import: ' + Math.round((vagaAtual.kw || 0) * 1000) + ' W',
          ocppHuman: 'A wallbox reporta a energia acumulada e a potência instantânea a cada 30 segundos. É essa leitura que fatura a sessão.',
        };
        if (st === 'manutencao') return {
          ocppBg: '#faeed3', ocppInk: '#7a5406', ocppCode: 'ChangeAvailability',
          ocppPayload: 'type: Inoperative · status: Accepted',
          ocppHuman: 'O gestor colocou a vaga como inoperante. A wallbox aceitou o comando e recusa novas sessões até a reativação.',
        };
        return {
          ocppBg: '#dcf3ea', ocppInk: '#0f7a51', ocppCode: 'StatusNotification',
          ocppPayload: 'status: Available · errorCode: NoError',
          ocppHuman: 'A vaga está livre, publicada no mapa e pronta para receber uma sessão.',
        };
      })(),
      vagaAcoes: (() => {
        if (!vagaAtual) return [];
        const id = vagaAtual.id;
        const set = (patch, msg) => () => {
          this.setState(p => ({ chargers: p.chargers.map(x => x.id === id ? { ...x, ...patch } : x) }));
          this.say(msg);
        };
        const acoes = [];
        if (vagaAtual.status === 'carregando') acoes.push({
          label: 'Encerrar sessão remotamente', bg: '#f5333f', fg: '#fff', borda: 'none',
          onPick: set({ status: 'livre', kw: undefined, min: undefined }, 'RemoteStopTransaction enviado. Sessão encerrada e recibo emitido ao motorista.'),
        });
        acoes.push(vagaAtual.status === 'manutencao'
          ? { label: 'Retirar da manutenção', bg: '#131c2e', fg: '#fff', borda: 'none', onPick: set({ status: 'livre', erro: null }, 'ChangeAvailability: Operative. Vaga republicada no mapa.') }
          : { label: 'Colocar em manutenção', bg: '#fff', fg: '#7a5406', borda: '1.5px solid #f0dcae', onPick: set({ status: 'manutencao' }, 'ChangeAvailability: Inoperative. Vaga oculta do mapa.') });
        acoes.push({
          label: 'Reiniciar remotamente (Reset)', bg: '#fff', fg: '#131c2e', borda: '1.5px solid #e4e5e9',
          onPick: set({ status: 'livre', erro: null }, 'Reset soft enviado por OCPP. Vaga reiniciada e republicada no mapa.'),
        });
        return acoes;
      })(),

      scAlertas: scr('alertas'),
      alertaSub: alertasTodos.filter(a => a.sev === 'critico').length + ' críticos · ' + alertasTodos.filter(a => a.sev === 'atencao').length + ' em atenção · ' + alertasTodos.filter(a => a.ml).length + ' da previsão',
      alertaFiltros: ['Todos', 'Críticos', 'Atenção', 'Informativos'].map(f => ({
        label: f,
        border: (s.alertaFiltro || 'Todos') === f ? '#00d1ff' : '#e4e5e9',
        espessura: (s.alertaFiltro || 'Todos') === f ? '2px' : '1.5px',
        sombra: (s.alertaFiltro || 'Todos') === f ? '0 0 10px rgba(0,209,255,.55)' : 'none',
        fg: (s.alertaFiltro || 'Todos') === f ? '#131c2e' : '#7c8494',
        onPick: () => this.setState({ alertaFiltro: f }),
      })),
      alertaLista: alertasFiltrados.map(a => ({
        titulo: a.titulo, quando: a.quando, local: a.local, regra: a.ml ? a.resumo + ' ' + a.regra : a.regra, acao: a.acao, botao: a.botao,
        cor: this.SEV[a.sev].cor, tagBg: this.SEV[a.sev].tagBg, tagFg: this.SEV[a.sev].tagFg, sevLabel: this.SEV[a.sev].label + (a.ml ? ' · previsão' : ''),
        onPick: () => {
          if (a.ml) { this.acaoAlertaML(a); return; }
          if (a.id === 'a1') {
            this.setState({ dlmReduzido: true, screen: 'vagas', tab: 'vagas' });
            this.say('Alocação das vagas em carga reduzida a 4 kW. Potência somada projetada em 8 kW, dentro do teto.');
            return;
          }
          if (a.id === 'a2') { const f = s.chargers.find(c => c.status === 'falha'); this.setState({ screen: 'vagaDetail', tab: 'vagas', vagaSel: f ? f.id : null }); return; }
          if (a.id === 'a3') { this.setState({ screen: 'tariff', tab: 'fin' }); return; }
          if (a.id === 'a5') { this.setState({ screen: 'more', tab: 'mais' }); return; }
          this.say('Motorista notificado por push. Tarifa de permanência passa a contar em 15 min.');
        },
      })),
      alertaRodape: 'Alertas críticos disparam por regra de negócio, não por limiar fixo. A demanda contratada é de ' + DEMANDA_KW + ' kW e, descontados o pico da edificação e a margem, sobram ' + dlmTeto + ' kW para as vagas — ultrapassar a contratada gera multa sobre a fatura do mês.',

      scVagas: scr('vagas'),
      vagasEmUso: String(s.chargers.filter(c => c.site === (s.siteSel || 'pn') && c.status === 'carregando').length),
      vagasEmFalha: String(s.chargers.filter(c => c.site === (s.siteSel || 'pn') && c.status === 'falha').length),
      scHorarios: scr('horarios'),
      goHorarios: () => this.setState({ screen: 'horarios', tab: 'mais' }),

      chargers: chargerRows,

      goAddVaga: () => this.setState({ role: 'host', screen: 'addCharger', addOrigem: 'site' }),

      base: s.base, baseRaw: Math.round(s.base * 100), baseFmt: BRL(base),
      setBase: (e) => this.setState({ base: Number(e.target.value) / 100 }),
      precoVigente: BRL(vig),
      alfa: a.toFixed(2).replace('.', ','),
      alfaBg: a > 1 ? 'rgba(245,51,63,.18)' : 'rgba(20,157,104,.18)',
      alfaFg: a > 1 ? '#ff8b93' : '#5fd3a3',
      fatores: (() => {
        const n = this.nivelSolar();
        const ativos = s.chargers.filter(c => c.site === (s.siteSel || 'pn') && c.status === 'carregando').length;
        return [
          { label: 'Excedente solar · ' + (s.ceu || 'parcial'), v: n === 'alto' ? '−12%' : n === 'baixo' ? '+4%' : '0%', color: n === 'alto' ? '#5fd3a3' : n === 'baixo' ? '#ff8b93' : '#c9ced8' },
          { label: 'Horário de ponta', v: s.ponta ? '+18%' : '0%', color: s.ponta ? '#ff8b93' : '#c9ced8' },
          { label: 'Demanda concorrente', v: ativos + (ativos === 1 ? ' EV · neutro' : ' EVs · neutro'), color: '#c9ced8' },
        ];
      })(),
      solarOpts: [['alto', 'Alto'], ['medio', 'Médio'], ['baixo', 'Baixo']].map(o => ({
        label: o[1],
        bg: s.solar === o[0] ? '#131c2e' : 'transparent',
        fg: s.solar === o[0] ? '#fff' : '#7c8494',
        border: s.solar === o[0] ? '#131c2e' : '#e4e5e9',
        onPick: () => this.setState({ solar: o[0] }),
      })),
      togglePonta: () => this.setState(p => ({ ponta: !p.ponta })),
      pontaBg: s.ponta ? '#149d68' : '#d6d9df', pontaX: s.ponta ? '23px' : '3px',

      chat: [{ who: 'ai', text: 'Bom dia. Hoje até agora: ' + s.chargers.filter(c => (c.hoje || 0) > 0).length + ' sessões, '
        + s.chargers.reduce((t, c) => t + (c.hoje || 0), 0).toFixed(1).replace('.', ',') + ' kWh e '
        + BRL(s.chargers.reduce((t, c) => t + (c.hoje || 0) * (c.preco || 0), 0)) + ' faturados.'
        + (s.chargers.some(c => c.status === 'falha') ? ' A Vaga 03 do Pátio Norte segue em falha.' : ' Nenhuma falha aberta.') }]
        .concat(P.sindicoPrevLinha ? [{ who: 'ai', text: P.sindicoPrevLinha }] : []).concat(s.chat).map(c => ({
        text: c.text,
        meta: c.meta || '', temMeta: !!c.meta, op: c.pend ? '.5' : '1',
        align: c.who === 'me' ? 'flex-end' : 'flex-start',
        bg: c.who === 'me' ? '#131c2e' : '#fafafb',
        fg: c.who === 'me' ? '#fff' : '#131c2e',
        radius: c.who === 'me' ? '18px 18px 6px 18px' : '18px 18px 18px 6px',
      })),
      scAssistente: scr('assistente'),
      chatIA: [{ who: 'ai', text: 'Oi, Patrick. A tarifa da Pátio Norte está em ' + BRL(spot.preco) + '/kWh agora e sua bateria está em ' + s.pctIni + '%. Pergunte o que quiser.' }].concat(s.chatIA).map(c => ({
        text: c.text,
        meta: c.meta || '', temMeta: !!c.meta, op: c.pend ? '.5' : '1',
        align: c.who === 'me' ? 'flex-end' : 'flex-start',
        bg: c.who === 'me' ? '#131c2e' : '#fafafb',
        fg: c.who === 'me' ? '#fff' : '#131c2e',
        radius: c.who === 'me' ? '18px 18px 6px 18px' : '18px 18px 18px 6px',
      })),
      chatIARef: this.chatIARef, chatRef: this.chatRef,
      perguntaIA: s.perguntaIA || '',
      setPerguntaIA: (e) => this.setState({ perguntaIA: e.target.value }),
      enviarIA: () => { const q = (s.perguntaIA || '').trim(); if (q) this.askIA(q); },
      keyIA: (e) => { if (e.key === 'Enter') { const q = (e.target.value || '').trim(); if (q) this.askIA(q); } },
      perguntaSind: s.perguntaSind || '',
      setPerguntaSind: (e) => this.setState({ perguntaSind: e.target.value }),
      enviarSind: () => { const q = (s.perguntaSind || '').trim(); if (q) this.ask(q); },
      keySind: (e) => { if (e.key === 'Enter') { const q = (e.target.value || '').trim(); if (q) this.ask(q); } },
      promptsIA: ['Onde carrego mais barato agora?', 'Quanto custa completar a bateria?', 'Vale carregar em casa ou no eletroposto?'].map(q => ({
        label: q, onAsk: () => this.askIA(q),
      })),
      prompts: ['Qual a previsão para a semana?', 'Algum alerta da previsão?', 'Por que a vaga 02 está limitada?', 'Vale a pena subir a tarifa hoje?', 'Como fechou o mês?'].map(q => ({
        label: q, onAsk: () => this.ask(q),
      })),

      goVagasFalhas: () => this.setState({ screen: 'vagas', tab: 'vagas' }),
      goParceiros: () => this.setState({ screen: 'parceiros', tab: 'mais' }),
      goTarifa: () => this.setState(p => ({ screen: 'tariff', tab: p.screen === 'more' ? 'fin' : 'mais', tarifaOrigem: p.screen })),
      backFromTarifa: () => this.setState(p => p.tarifaOrigem === 'more'
        ? { screen: 'more', tab: 'fin' }
        : { screen: 'dash', tab: 'mais' }),
      svcEsgGestor: () => this.setState({ screen: 'certificacao', tab: 'mais' }),
      scCertificacao: scr('certificacao'),
      ...(() => {
        const st = this.state;
        const perE = st.esgPer || 'Mês';
        const DIAS_MES = 26;
        const multE = perE === 'Dia' ? 1 : perE === 'Mês' ? DIAS_MES : DIAS_MES * 12;
        const subE = perE === 'Dia' ? 'hoje' : perE === 'Mês' ? '26 dias de operação' : '312 dias de operação';
        const num = (v, d) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
        // fatores: 0,0385 tCO₂/MWh na matriz brasileira; 1 árvore absorve ~22 kg CO₂/ano
        const solarKwh = 392.4 * multE;
        const evKwh = 217 * multE;
        const co2 = solarKwh * 0.0385 / 1000 * 1000;
        const co2Ev = evKwh * 0.118;
        const total = co2 + co2Ev;
        return {
          esgTabs: ['Dia', 'Mês', 'Ano'].map(x => ({
            label: x,
            border: perE === x ? '#00d1ff' : '#e4e5e9',
            espessura: perE === x ? '2px' : '1.5px',
            sombra: perE === x ? '0 0 10px rgba(0,209,255,.55)' : 'none',
            fg: perE === x ? '#131c2e' : '#5d6572',
            onPick: () => this.setState({ esgPer: x }),
          })),
          esgPerSub: subE,
          esgCo2: total >= 1000 ? num(total / 1000, 2) + ' t' : num(total, 1) + ' kg',
          esgCo2Sub: 'geração própria mais a substituição de combustível nas recargas',
          esgCards: [
            { label: 'Energia limpa', cor: '#f5c445', valor: num(solarKwh, 1) + ' kWh', sub: 'gerada por cobertura, fachada e carport' },
            { label: 'Recargas elétricas', cor: '#3577f1', valor: num(evKwh, 1) + ' kWh', sub: num(evKwh * 6.2, 0) + ' km rodados sem emissão' },
            { label: 'Árvores equivalentes', cor: '#149d68', valor: num(total / 22, 0), sub: 'absorção anual equivalente ao CO₂ evitado' },
            { label: 'Gasolina evitada', cor: '#9aa1ad', valor: num(evKwh * 6.2 / 12, 0) + ' L', sub: 'a 12 km/L em um carro a combustão' },
          ],
          esgNota: 'Fator de emissão da matriz brasileira (0,0385 tCO₂/MWh) e 0,118 kgCO₂ evitados por kWh entregue nas vagas. Valores acumulados em ' + subE + '.',
        };
      })(),
      svcEquipe: () => this.say('2 gestores e 1 operador com acesso.'),
      svcSuporte: () => this.say('Assistência GoodWe · chamado #4812 em aberto.'),

      esgGaleria: '1,2 t', esgGaleriaArv: 'equivale a 61 árvores',
      scEsgGal: scr('esgGal'),
      ...(() => {
        const st = this.state;
        const perE = st.esgPer || 'Mês';
        const mult = perE === 'Dia' ? 1 : perE === 'Mês' ? 26 : 312;
        const num = (v, d) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
        const solarKwh = 392.4 * mult, evKwh = 217 * mult;
        const co2Sol = solarKwh * 0.0385, co2Ev = evKwh * 0.118, total = co2Sol + co2Ev;
        const fmtKg = (v) => v >= 1000 ? num(v / 1000, 2) + ' t' : num(v, v < 100 ? 1 : 0) + ' kg';
        const pSol = Math.round(co2Sol / total * 100);
        const MES = [['Abr', 0.71], ['Mai', 0.78], ['Jun', 0.66], ['Jul', 0.74], ['Ago', 0.9], ['Set', 1]];
        const base = 392.4 * 26 * 0.0385 + 217 * 26 * 0.118;
        return {
          egPerLabel: perE === 'Dia' ? 'hoje' : perE === 'Mês' ? 'em setembro' : 'nos últimos 12 meses',
          egSeg: ['Dia', 'Mês', 'Ano'].map(x => ({ label: x, bg: perE === x ? '#fff' : 'transparent', fg: perE === x ? '#131c2e' : '#5d6572', sombra: perE === x ? '0 1px 4px rgba(19,28,46,.14)' : 'none', onPick: () => this.setState({ esgPer: x }) })),
          egTotal: fmtKg(total),
          egDelta: perE === 'Mês' ? '▲ 11% vs agosto' : perE === 'Dia' ? '▲ 4% vs média do mês' : '▲ 38% vs ano anterior',
          // origem da energia das recargas (balanço do motor: ~62% sol direto, ~26% bateria carregada com sol, ~12% rede)
          egOrigem: [
            { k: 'Sol direto', p: '62%', cor: '#f5c445' },
            { k: 'Bateria solar', p: '26%', cor: '#9dff33' },
            { k: 'Rede', p: '12%', cor: 'rgba(255,255,255,.45)' },
          ],
          egOrigemTit: '88% das recargas com energia solar',
          egEquiv: [
            { d: 'M12 3l-5.5 7.5h11zM12 8l-6.5 8.5h13zM12 16.5V21', v: num(total / 22, 0), l: 'árvores' },
            { d: 'M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3.5 21h13M7.5 7.5h5M15 9.5h2a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 0 3 0V8l-3-3', v: num(evKwh * 6.2 / 12, 0) + ' L', l: 'gasolina evitada' },
            { d: 'M4.5 16h15M6.5 16v2.4M17.5 16v2.4M4.5 16v-4l1.8-4.2A2 2 0 0 1 8.1 6.5h7.8a2 2 0 0 1 1.8 1.3L19.5 12v4M4.5 12h15', v: num(evKwh * 6.2, 0) + ' km', l: 'sem emissão' },
          ],
          egBars: MES.map((m, i) => ({ d: m[0], v: num(base * m[1], 0), h: Math.round(m[1] * 92) + '%', color: i === MES.length - 1 ? '#9dff33' : '#dcf8b8', fg: i === MES.length - 1 ? '#3f6a0a' : '#7c8494' })),
          egFontes: [
            { d: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6', t: 'Energia solar gerada', v: num(solarKwh, 0) + ' kWh', sub: 'cobertura, fachada e carport' },
            { d: 'M13 2.8L5.6 13.4h5.6l-1 7.8 7.4-10.6h-5.6z', t: 'Recargas elétricas', v: num(evKwh, 0) + ' kWh', sub: num(evKwh / 22, 0) + ' recargas · 88% com energia solar' },
          ],
          egRelatorio: () => this.say('Relatório ESG de ' + (perE === 'Ano' ? '12 meses' : perE === 'Mês' ? 'setembro' : 'hoje') + ' gerado com os dados medidos pelo inversor GoodWe.'),
          egSelo: () => this.say('Selo "Galeria movida a sol" pronto para site, redes e fachada digital.'),
          egCert: () => this.setState({ screen: 'parceiros', tab: 'impacto', parcFilter: 'Fornecedores', parcAberto: null }),
          egMetodoAberto: !!st.egMetodo, egMetodoToggle: () => this.setState(q => ({ egMetodo: !q.egMetodo })),
          egMetodoLabel: st.egMetodo ? 'Fechar' : 'Como calculamos',
        };
      })(),

      kwp: s.kwp, kwpFmt: (SIM.kwpExist + SIM.kwpAdd).toFixed(1).replace('.', ',') + ' kWp',
      setKwp: (e) => this.setState({ kwp: Number(e.target.value) }),
      simSup: SIM.sup.map(x => ({
        ...x,
        exist: x.kwpExist.toFixed(1).replace('.', ',') + ' kWp · ~' + x.m2Exist + ' m²',
        addTxt: x.add > 0 ? '+' + x.placasAdd + ' placas · +' + x.kwpAdd.toFixed(1).replace('.', ',') + ' kWp' : 'digite os m² a acrescentar',
        obsVis: x.k === 'carport' ? 'block' : 'none',
        obs: 'Carport conta como área construída não computável (cobertura de estacionamento, LPUOS — Lei 16.402/2016, art. 62) só enquanto a soma das áreas não computáveis dos incisos I a VI ficar em até 59% da área construída total; na Av. Paulista (ZEU) vale ainda o limite de 1 vaga a cada 70 m² de área computável, com até 32 m² por vaga. Passou disso, a área vira computável e pode exigir outorga onerosa. Confirmar com o arquiteto na versão vigente da lei.',
        onChange: (e) => { const val = Math.max(0, Math.min(5000, Number(e.target.value) || 0)); this.setState(p => ({ simAdd: { ...(p.simAdd || {}), [x.k]: val } })); },
      })),
      simKwpTxt: (SIM.kwpExist + SIM.kwpAdd).toFixed(1).replace('.', ',') + ' kWp',
      simKwpSub: SIM.kwpExist.toFixed(1).replace('.', ',') + ' kWp hoje' + (SIM.kwpAdd > 0 ? ' + ' + SIM.kwpAdd.toFixed(1).replace('.', ',') + ' kWp novos' : ''),
      simModAdd: SIM.modAdd,
      simModOnChange: (e) => this.setState({ simModAdd: Math.max(0, Math.min(40, Math.round(Number(e.target.value) || 0))) }),
      simBatExist: SIM.MOD_EXIST + ' módulos · ' + SIM.MOD_EXIST * 15 + ' kWh',
      simBatTot: 'Total: ' + SIM.mod + ' módulos · ' + SIM.batKwh + ' kWh' + (SIM.modAdd > 0 ? ' · +' + SIM.batM2Add.toFixed(1).replace('.', ',') + ' m² de sala' : ''),
      simModRecTxt: SIM.modAdd === SIM.modRecAdd ? '✓ Adequado à área solar' : 'Adequado à área: +' + SIM.modRecAdd + (SIM.modRecAdd === 1 ? ' módulo' : ' módulos'),
      simModRecBg: SIM.modAdd === SIM.modRecAdd ? '#dcf3ea' : '#fff3d6', simModRecFg: SIM.modAdd === SIM.modRecAdd ? '#0f5c3f' : '#7a5406',
      simModRec: () => this.setState({ simModAdd: null }),
      simVagasMais: '+' + SIM.vagasMais,
      simVagasMaisTxt: SIM.vagasTot < SIM.VAGAS_EXIST ? 'o sol cobre só ' + SIM.vagasTot + ' das ' + SIM.VAGAS_EXIST + ' vagas atuais com ' + Math.round(SIM.fr * 100) + '% para o eletroposto'
        : SIM.vagasMais === 0 ? 'Nenhuma vaga a mais com essa ampliação' : (SIM.vagasMais === 1 ? 'vaga a mais pode ser instalada' : 'vagas a mais podem ser instaladas'),
      simVagasConta: 'Hoje ' + SIM.VAGAS_EXIST + ' vagas → até ' + SIM.vagasTot + ' vagas com a ampliação' + (SIM.vagasEf > 0 ? ' (' + SIM.vagasEf + ' pela eficiência)' : ''),
      simVagasPonta: SIM.pontaTot > 0 ? '🔋 a bateria sustenta ' + SIM.pontaTot + (SIM.pontaTot > 1 ? ' vagas' : ' vaga') + ' na ponta (17h–21h)' + (SIM.pontaMais > 0 ? ', +' + SIM.pontaMais + ' com os novos módulos' : '') : '🔋 bateria pequena para sustentar uma vaga na ponta',
      simLimpar: () => this.setState({ simAdd: {}, simModAdd: null }),
      reserva: s.reserva, reservaFmt: s.reserva + '%',
      setReserva: (e) => this.setState({ reserva: Number(e.target.value) }),
      simEvPct: Math.round(SIM.fr * 100),
      simEfPct: SIM.efPct,
      simEfOnChange: (e) => this.setState({ simEfPct: Math.max(0, Math.min(40, Math.round(Number(e.target.value) || 0))) }),
      simEfOpcoes: [0, 15, 20, 25].map(p => ({ label: p ? p + '%' : 'sem', on: SIM.efPct === p, bg: SIM.efPct === p ? '#0f2a47' : '#fff', fg: SIM.efPct === p ? '#fff' : '#131c2e', borda: SIM.efPct === p ? '#0f2a47' : '#e4e5e9', onPick: () => this.setState({ simEfPct: p }) })),
      simEfHvac: 'Climatização hoje: ~' + Math.round(SIM.hvacDia) + ' kWh/dia (45% dos ' + Math.round(SIM.galDia) + ' kWh do condomínio)',
      simEfVis: SIM.efPct > 0,
      simEfEcon: Math.round(SIM.econDia) + ' kWh/dia',
      simEfEconMes: 'R$ ' + Math.round(SIM.econDia * 30 * 1.0).toLocaleString('pt-BR') + '/mês',
      simEfSol: Math.round(SIM.solLiberado) + ' kWh/dia',
      simEfVagas: SIM.vagasEf > 0 ? '+' + SIM.vagasEf + (SIM.vagasEf > 1 ? ' vagas' : ' vaga') + ' pela eficiência' : 'não muda o número de vagas',
      // estimativa realista para uma galeria comercial em São Paulo (retrofit sem trocar o sistema central)
      simEfReal: [
        { t: 'Vidro de controle solar ou película nas fachadas', p: '8%' },
        { t: 'Cobertura fria e isolamento da laje', p: '5%' },
        { t: 'Ajuste de setpoint e automação da climatização', p: '5%' },
      ],
      simEfRealTxt: SIM.efPct === 18 ? '✓ Estimativa realista aplicada: 18%' : 'Aplicar estimativa realista: 18%',
      simEfRealBg: SIM.efPct === 18 ? '#dcf3ea' : '#fff3d6', simEfRealFg: SIM.efPct === 18 ? '#0f5c3f' : '#7a5406',
      simEfRealPick: () => this.setState({ simEfPct: 18 }),
      simEfAviso: SIM.efPct > 0 && (SIM.efPct < 15 || SIM.efPct > 25) ? 'Fora da faixa típica de 15% a 25% para retrofit de envoltória e materiais.' : '',
      simEfParceiros: () => this.setState({ screen: 'parceiros', tab: 'mais', parcFilter: 'Fornecedores', parcAberto: 'veu' }),
      simEvOnChange: (e) => this.setState({ simEvPct: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) }),
      simEvGal: 'Galeria fica com ' + (100 - Math.round(SIM.fr * 100)) + '% do sol',
      simEvSug: Math.round(SIM.fr * 100) === 80 ? '✓ Sugestão aplicada: 80% (regra de rateio)' : 'Usar sugestão: 80% (regra de rateio)',
      simEvSugBg: Math.round(SIM.fr * 100) === 80 ? '#dcf3ea' : '#fff3d6', simEvSugFg: Math.round(SIM.fr * 100) === 80 ? '#0f5c3f' : '#7a5406',
      simEvSugPick: () => this.setState({ simEvPct: null }),
      vagas: vagas,
      formulaLinha: '⌊(' + Math.round(SIM.eDia).toLocaleString('pt-BR') + ' kWh/dia × ' + Math.round(SIM.fr * 100) + '%' + (SIM.solLiberado > 0.5 ? ' + ' + Math.round(SIM.solLiberado) + ' kWh da eficiência' : '') + ') ÷ (7 kW × ' + SIM.HSP_ANO.toFixed(1).replace('.', ',') + ' h de sol pleno)⌋',
      picoFmt: pico.toFixed(1).replace('.', ',') + ' kW',
      evKwFmt: evKw.toFixed(1).replace('.', ',') + ' kW',
      receitaPot: BRL(vagas * 7 * 4 * 26 * 0.35),
      simSolarDia: Math.round(SIM.eDiaExist).toLocaleString('pt-BR') + ' → ' + Math.round(SIM.eDia).toLocaleString('pt-BR') + ' kWh/dia',
      simSolarMes: Math.round(SIM.eDia * 30).toLocaleString('pt-BR') + ' kWh/mês',
      simHspTabs: [['ano', 'Média do ano', SIM.HSP_ANO], ['min', ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][SIM.mesMin] + ' (mês mais fraco)', SIM.HSP_MES[SIM.mesMin]]].map(([k, l, h]) => {
        const on = (s.simHsp || 'ano') === k;
        return { label: l, sub: h.toFixed(1).replace('.', ',') + ' kWh/m²·dia', bg: on ? '#0f2a47' : '#fff', fg: on ? '#fff' : '#131c2e', sub2: on ? '#9fb6cd' : '#7c8494', borda: on ? '#0f2a47' : '#e4e5e9', onPick: () => this.setState({ simHsp: k }) };
      }),
      simIrrNota: 'Geração média = kWp efetivo × irradiação de São Paulo × 0,72 (perdas). Irradiação: média de cada mês do clima da base (Av. Paulista).',
      simPicoTxt: SIM.picoExist.toFixed(1).replace('.', ',') + ' → ' + SIM.pico.toFixed(1).replace('.', ',') + ' kW',
    };
  }
}
