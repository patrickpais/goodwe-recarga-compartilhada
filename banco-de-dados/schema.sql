-- ============================================================
-- GoodWe · Recarga Compartilhada — Modelo de dados (PostgreSQL)
-- ============================================================
-- Marketplace peer-to-peer de recarga de veículos elétricos:
-- anfitriões cadastram seus carregadores GoodWe e cobram por kWh;
-- motoristas encontram, usam e pagam pelo app. A GoodWe fica com
-- 10% de cada transação (o anfitrião recebe 90%).
--
-- Como executar (PostgreSQL 14+):
--   createdb recarga_compartilhada
--   psql -d recarga_compartilhada -f schema.sql
--
-- Decisões de modelagem importantes:
--  1. Um usuário NÃO é "anfitrião OU motorista" — os papéis derivam
--     das relações (tem carregador cadastrado = age como anfitrião;
--     faz recarga = age como motorista). A mesma pessoa pode ser os
--     dois, como acontece no mundo real.
--  2. O preço por kWh vigente fica no carregador, mas cada recarga
--     GUARDA UMA CÓPIA do preço no momento do uso (preco_kwh_aplicado).
--     Se o anfitrião mudar o preço depois, recibos antigos não mudam.
--  3. O ciclo de vida da recarga é uma máquina de estados — a mesma
--     do protótipo físico (LED/botão): aguardando_plugue → conectando
--     → carregando ⇄ interrompida → concluida. Cada transição fica
--     registrada em recarga_eventos (auditoria/histórico).
--  4. Enquanto está "aguardando_plugue", o carregador continua livre
--     pra outros motoristas — só bloqueia quando o plugue conecta de
--     verdade. Essa regra vira um índice único parcial (ver abaixo).
-- ============================================================

BEGIN;

-- ---------- tipos enumerados ----------

-- espelha exatamente a máquina de estados do protótipo
CREATE TYPE status_recarga AS ENUM (
  'aguardando_plugue',  -- motorista iniciou no app, plugue ainda não conectado
  'conectando',         -- plugue conectado, negociando com o veículo (~segundos)
  'carregando',         -- energia fluindo
  'interrompida',       -- plugue solto no meio da carga (kWh preservado)
  'concluida',          -- meta atingida ou encerrada — vira pagamento
  'cancelada'           -- desistiu antes de conectar o plugue
);

CREATE TYPE metodo_pagamento AS ENUM ('cartao', 'pix', 'carteira');

CREATE TYPE status_pagamento AS ENUM ('pendente', 'aprovado', 'estornado');

-- ---------- tabelas ----------

CREATE TABLE usuarios (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome          TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  senha_hash    TEXT        NOT NULL,             -- nunca a senha em texto puro
  telefone      TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE usuarios IS
  'Todas as pessoas do sistema. Papéis (anfitrião/motorista) derivam das relações, não de coluna.';

-- catálogo dos modelos GoodWe suportados (dados reais da linha HCA)
CREATE TABLE modelos_carregador (
  codigo        TEXT PRIMARY KEY,                 -- ex: GW7K-HCA-20
  potencia_kw   NUMERIC(4,1) NOT NULL CHECK (potencia_kw > 0),
  descricao     TEXT NOT NULL                     -- fases, tensão, conector
);

CREATE TABLE enderecos (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cep           CHAR(8)     NOT NULL,             -- só dígitos, ex: 01310100
  logradouro    TEXT        NOT NULL,
  numero        TEXT        NOT NULL,
  complemento   TEXT,
  bairro        TEXT        NOT NULL,
  cidade        TEXT        NOT NULL,
  uf            CHAR(2)     NOT NULL,
  latitude      NUMERIC(9,6),                     -- pro mapa do motorista
  longitude     NUMERIC(9,6)
);

CREATE TABLE carregadores (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  anfitriao_id   BIGINT      NOT NULL REFERENCES usuarios(id),
  endereco_id    BIGINT      NOT NULL REFERENCES enderecos(id),
  modelo_codigo  TEXT        NOT NULL REFERENCES modelos_carregador(codigo),
  numero_serie   TEXT        NOT NULL UNIQUE,     -- vem do QR code do equipamento
  nome           TEXT        NOT NULL,            -- ex: "Garagem do Patrick"
  preco_kwh      NUMERIC(8,2) NOT NULL CHECK (preco_kwh >= 0),
  publicado      BOOLEAN     NOT NULL DEFAULT false,  -- visível no mapa?
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN carregadores.publicado IS
  'false = o anfitrião desativou (status "Indisponível" no app; LED apagado no protótipo).';

-- janelas de horário em que o carregador fica disponível
CREATE TABLE disponibilidades (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  carregador_id  BIGINT   NOT NULL REFERENCES carregadores(id) ON DELETE CASCADE,
  dia_semana     SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),  -- 0=domingo
  hora_inicio    TIME     NOT NULL,
  hora_fim       TIME     NOT NULL,
  CHECK (hora_fim > hora_inicio)
);

CREATE TABLE veiculos (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  motorista_id            BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  apelido                 TEXT   NOT NULL,        -- ex: "Meu Dolphin"
  capacidade_bateria_kwh  NUMERIC(5,1) NOT NULL CHECK (capacidade_bateria_kwh > 0)
);

CREATE TABLE recargas (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  carregador_id       BIGINT NOT NULL REFERENCES carregadores(id),
  motorista_id        BIGINT NOT NULL REFERENCES usuarios(id),
  veiculo_id          BIGINT REFERENCES veiculos(id),
  status              status_recarga NOT NULL DEFAULT 'aguardando_plugue',
  pct_inicial         SMALLINT NOT NULL CHECK (pct_inicial BETWEEN 0 AND 100),
  meta_pct            SMALLINT NOT NULL CHECK (meta_pct BETWEEN 1 AND 100),
  preco_kwh_aplicado  NUMERIC(8,2) NOT NULL,      -- cópia do preço no momento (decisão nº 2)
  kwh_entregue        NUMERIC(8,3) NOT NULL DEFAULT 0 CHECK (kwh_entregue >= 0),
  iniciada_em         TIMESTAMPTZ,                -- quando começou a carregar de fato
  finalizada_em       TIMESTAMPTZ,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (meta_pct > pct_inicial)
);

-- REGRA-CHAVE (decisão nº 4): no máximo UMA recarga "fisicamente ativa"
-- por carregador. 'aguardando_plugue' fica de fora de propósito — antes
-- do plugue conectar, o carregador continua livre pra outros motoristas.
CREATE UNIQUE INDEX uma_recarga_ativa_por_carregador
  ON recargas (carregador_id)
  WHERE status IN ('conectando', 'carregando', 'interrompida');

-- histórico de transições da máquina de estados (auditoria)
CREATE TABLE recarga_eventos (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recarga_id   BIGINT NOT NULL REFERENCES recargas(id) ON DELETE CASCADE,
  status       status_recarga NOT NULL,
  ocorrido_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pagamentos (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recarga_id       BIGINT NOT NULL UNIQUE REFERENCES recargas(id),
  valor_total      NUMERIC(10,2) NOT NULL CHECK (valor_total >= 0),
  taxa_plataforma  NUMERIC(10,2) NOT NULL CHECK (taxa_plataforma >= 0),  -- os 10% da GoodWe
  valor_anfitriao  NUMERIC(10,2) NOT NULL CHECK (valor_anfitriao >= 0),  -- os 90%
  metodo           metodo_pagamento NOT NULL,
  status           status_pagamento NOT NULL DEFAULT 'pendente',
  processado_em    TIMESTAMPTZ,
  -- a divisão sempre fecha com o total (independente do percentual vigente)
  CHECK (valor_total = taxa_plataforma + valor_anfitriao)
);

CREATE TABLE avaliacoes (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recarga_id   BIGINT NOT NULL UNIQUE REFERENCES recargas(id),  -- 1 avaliação por recarga
  nota         SMALLINT NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario   TEXT,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- índices de consulta ----------

-- mapa do motorista: carregadores publicados por região
CREATE INDEX idx_carregadores_publicados ON carregadores (publicado) WHERE publicado;
CREATE INDEX idx_enderecos_cidade        ON enderecos (cidade, uf);

-- históricos por pessoa
CREATE INDEX idx_recargas_motorista  ON recargas (motorista_id, criado_em DESC);
CREATE INDEX idx_recargas_carregador ON recargas (carregador_id, criado_em DESC);

-- ---------- visão de apoio: painel de ganhos do anfitrião ----------

CREATE VIEW vw_ganhos_anfitriao AS
SELECT
  c.anfitriao_id,
  date_trunc('month', p.processado_em) AS mes,
  COUNT(*)                             AS recargas,
  SUM(p.valor_anfitriao)               AS total_recebido,
  SUM(p.taxa_plataforma)               AS total_taxas_goodwe
FROM pagamentos p
JOIN recargas r     ON r.id = p.recarga_id
JOIN carregadores c ON c.id = r.carregador_id
WHERE p.status = 'aprovado'
GROUP BY c.anfitriao_id, date_trunc('month', p.processado_em);

-- ---------- dados iniciais ----------

-- linha HCA real da GoodWe (fonte: en.goodwe.com/hca-g2)
INSERT INTO modelos_carregador (codigo, potencia_kw, descricao) VALUES
  ('GW7K-HCA-20',  7.0,  'Monofásico · 230V, 32A · Tipo 2'),
  ('GW11K-HCA-20', 11.0, 'Trifásico · 400V, 16A · Tipo 2'),
  ('GW22K-HCA-20', 22.0, 'Trifásico · 400V, 32A · Tipo 2');

COMMIT;
