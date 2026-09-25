/* @ds-bundle: {"format":4,"namespace":"ChargeGrid","components":[{"name":"Button"},{"name":"StatusPill"},{"name":"MetricTile"},{"name":"EnergyMixBar"},{"name":"TariffLock"},{"name":"TabBar"},{"name":"ListRow"},{"name":"Callout"}]} */
(function (global) {
  'use strict';
  var React = global.React;
  var h = React.createElement;

  function cx() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) if (arguments[i]) out.push(arguments[i]);
    return out.join(' ');
  }

  /* ---------------- Button ---------------- */
  function Button(props) {
    var p = props || {};
    var variant = p.variant || 'primary';
    return h('button', {
      type: p.type || 'button',
      className: cx('cg-btn', 'cg-btn--' + variant, p.block && 'cg-btn--block', p.className),
      disabled: p.disabled,
      onClick: p.onClick
    }, p.icon ? h('span', { className: 'cg-btn__icon', 'aria-hidden': 'true' }, p.icon) : null, p.children);
  }

  /* ---------------- StatusPill ---------------- */
  var STATUS = {
    available:   { label: 'Disponível',        glyph: '⬤', tone: 'available' },
    charging:    { label: 'Carregando',        glyph: '⚡', tone: 'charging' },
    reduced:     { label: 'Potência reduzida', glyph: '▼', tone: 'reduced' },
    fault:       { label: 'Falha',             glyph: '⚠', tone: 'fault' },
    maintenance: { label: 'Manutenção',        glyph: '⚒', tone: 'reduced' },
    idle:        { label: 'Ocupado',           glyph: '●', tone: 'idle' },
    done:        { label: 'Concluída',         glyph: '✓', tone: 'charging' }
  };
  function StatusPill(props) {
    var p = props || {};
    var s = STATUS[p.status] || STATUS.idle;
    return h('span', { className: cx('cg-pill', 'cg-pill--' + s.tone, p.className) },
      h('span', { className: 'cg-pill__glyph', 'aria-hidden': 'true' }, s.glyph),
      h('span', { className: 'cg-pill__label' }, p.label || s.label),
      p.detail ? h('span', { className: 'cg-pill__detail' }, p.detail) : null);
  }

  /* ---------------- MetricTile ---------------- */
  function MetricTile(props) {
    var p = props || {};
    return h('div', { className: cx('cg-metric', p.tone ? 'cg-metric--' + p.tone : null, p.className) },
      h('div', { className: 'cg-metric__value' },
        p.value,
        p.unit ? h('span', { className: 'cg-metric__unit' }, p.unit) : null),
      h('div', { className: 'cg-metric__label' }, p.label),
      p.note ? h('div', { className: 'cg-metric__note' }, p.note) : null);
  }

  /* ---------------- EnergyMixBar ---------------- */
  var SOURCES = {
    solar:   { label: 'Solar',   token: 'solar' },
    battery: { label: 'Bateria', token: 'battery' },
    grid:    { label: 'Rede',    token: 'grid-power' }
  };
  function EnergyMixBar(props) {
    var p = props || {};
    var parts = p.parts || [];
    var total = parts.reduce(function (a, b) { return a + (b.value || 0); }, 0) || 1;
    return h('div', { className: cx('cg-mix', p.className) },
      h('div', { className: 'cg-mix__bar', role: 'img', 'aria-label': p.ariaLabel || 'Composição da energia entregue' },
        parts.map(function (part, i) {
          var meta = SOURCES[part.source] || SOURCES.grid;
          return h('span', {
            key: i,
            className: 'cg-mix__seg',
            style: { width: (part.value / total * 100).toFixed(1) + '%', background: 'var(--' + meta.token + ')' }
          });
        })),
      h('ul', { className: 'cg-mix__legend' },
        parts.map(function (part, i) {
          var meta = SOURCES[part.source] || SOURCES.grid;
          return h('li', { key: i, className: 'cg-mix__item' },
            h('span', { className: 'cg-mix__dot', style: { background: 'var(--' + meta.token + ')' }, 'aria-hidden': 'true' }),
            h('span', { className: 'cg-mix__name' }, meta.label),
            h('b', { className: 'cg-mix__pct' }, Math.round(part.value / total * 100) + '%'));
        })));
  }

  /* ---------------- TariffLock ---------------- */
  function TariffLock(props) {
    var p = props || {};
    return h('div', { className: cx('cg-tariff', p.locked ? 'cg-tariff--locked' : null, p.className) },
      h('div', { className: 'cg-tariff__row' },
        h('div', null,
          h('div', { className: 'cg-tariff__price' }, p.price, h('span', { className: 'cg-tariff__per' }, '/kWh')),
          h('div', { className: 'cg-tariff__state' }, p.locked ? 'Tarifa travada até o fim desta sessão' : 'Tarifa vigente agora')),
        p.factor ? h('span', { className: 'cg-tariff__factor' }, 'fator α ' + p.factor) : null),
      p.reason ? h('p', { className: 'cg-tariff__reason' },
        h('span', { className: 'cg-tariff__spark', 'aria-hidden': 'true' }, '✦'), p.reason) : null);
  }

  /* ---------------- TabBar ---------------- */
  function TabBar(props) {
    var p = props || {};
    var items = p.items || [];
    return h('nav', { className: cx('cg-tabs', p.className), 'aria-label': p.ariaLabel || 'Navegação principal' },
      items.map(function (item, i) {
        var active = item.key === p.active;
        return h('button', {
          key: item.key || i,
          type: 'button',
          className: cx('cg-tab', active && 'cg-tab--active'),
          'aria-current': active ? 'page' : undefined,
          onClick: p.onSelect ? function () { p.onSelect(item.key); } : undefined
        },
          h('span', { className: 'cg-tab__glyph', 'aria-hidden': 'true' }, item.glyph),
          h('span', { className: 'cg-tab__label' }, item.label),
          item.dot ? h('span', { className: 'cg-tab__dot', 'aria-hidden': 'true' }) : null);
      }));
  }

  /* ---------------- ListRow ---------------- */
  function ListRow(props) {
    var p = props || {};
    var Tag = p.onClick ? 'button' : 'div';
    return h(Tag, {
      type: p.onClick ? 'button' : undefined,
      className: cx('cg-row', p.onClick && 'cg-row--tappable', p.className),
      onClick: p.onClick
    },
      p.glyph ? h('span', { className: 'cg-row__glyph', 'aria-hidden': 'true' }, p.glyph) : null,
      h('span', { className: 'cg-row__text' },
        h('span', { className: 'cg-row__title' }, p.title),
        p.meta ? h('span', { className: 'cg-row__meta' }, p.meta) : null),
      p.trailing ? h('span', { className: 'cg-row__trailing' }, p.trailing) : null,
      p.onClick ? h('span', { className: 'cg-row__chevron', 'aria-hidden': 'true' }, '›') : null);
  }

  /* ---------------- Callout ---------------- */
  function Callout(props) {
    var p = props || {};
    var tone = p.tone || 'info';
    return h('div', { className: cx('cg-callout', 'cg-callout--' + tone, p.className), role: tone === 'danger' ? 'alert' : 'note' },
      h('span', { className: 'cg-callout__glyph', 'aria-hidden': 'true' }, p.glyph || (tone === 'danger' ? '⚠' : tone === 'reduced' ? '▼' : 'ℹ')),
      h('span', { className: 'cg-callout__body' },
        p.title ? h('b', { className: 'cg-callout__title' }, p.title) : null,
        h('span', { className: 'cg-callout__text' }, p.children)));
  }

  global.ChargeGrid = {
    Button: Button,
    StatusPill: StatusPill,
    MetricTile: MetricTile,
    EnergyMixBar: EnergyMixBar,
    TariffLock: TariffLock,
    TabBar: TabBar,
    ListRow: ListRow,
    Callout: Callout,
    STATUS: STATUS
  };
})(window);
