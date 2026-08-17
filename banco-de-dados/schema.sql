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
-- Decisões de modelagem (fechadas com o time em 17/08/2026):
--  1. Um usuário NÃO é "anfitrião OU motorista" — os papéis derivam
--     das relações. A mesma pessoa pode ser os dois.
--  2. SEM RESERVA: o carregador só é bloqueado quando o plugue
--     conecta fisicamente — quem chegar primeiro leva. Enquanto uma
--     recarga está 'aguardando_plugue', o carregador segue livre.
--     (Reserva com validade fica como evolução futura.)
--  3. O MOTORISTA cadastra seu veículo (marca/modelo/capacidade da
--     bateria) e informa o percentual atual ao conectar — em recarga
--     AC (Tipo 2) o carro não reporta o nível da bateria ao
--     carregador, então o dado vem do usuário.
--  4. PAGAMENTO EM DUAS FASES: na largada o app AUTORIZA (segura) o
--     valor estimado da meta; no fim CAPTURA só o que foi realmente
--     entregue (que pode ser menor, se a recarga foi interrompida).
--     Métodos aceitos: cartão e PIX.
--  5. SPLIT AUTOMÁTICO: a cada pagamento aprovado, os 90% do
--     anfitrião viram um repasse pra conta/chave PIX que ele
--     conectou. A tabela repasses registra cada transferência.
--  6. Cada recarga GUARDA UMA CÓPIA do preço vigente no momento
--     (preco_kwh_aplicado) — recibos antigos nunca mudam.
--  7. Recibo vai por e-mail (pagamentos.recibo_enviado_em registra o
--     envio) e o histórico do motorista é a view vw_historico_motorista.
--  8. O ciclo de vida da recarga é a mesma máquina de estados do
--     protótipo físico (LED/botão): aguardando_plugue → conectando →
--     carregando ⇄ interrompida → concluida, com cada transição
--     auditada em recarga_eventos.
-- ============================================================

BEGIN;

-- ---------- tipos enumerados ----------

-- espelha exatamente a máquina de estados do protótipo
CREATE TYPE status_recarga AS ENUM (
  'aguardando_plugue',  -- motorista iniciou no app, plugue ainda não conectado
  'conectando',         -- plugue conectado, negociando com o veículo (~segundos)
  'carregando',         -- energia fluindo
  'interrompida',       -- plugue solto no meio da carga (kWh preservado)
  'concluida',          -- meta atingida ou encerrada — dispara a captura do pagamento
  'cancelada'           -- desistiu antes de conectar o plugue
);

CREATE TYPE metodo_pagamento AS ENUM ('cartao', 'pix');

-- duas fases: autoriza (segura o estimado) -> aprova (captura o real)
CREATE TYPE status_pagamento AS ENUM ('pendente', 'autorizado', 'aprovado', 'estornado');

CREATE TYPE tipo_conta_repasse AS ENUM ('pix', 'conta_bancaria');

CREATE TYPE status_repasse AS ENUM ('pendente', 'pago', 'falhou');

-- ---------- tabelas ----------

CREATE TABLE usuarios (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome          TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  senha_hash    TEXT        NOT NULL,             -- nunca a senha em texto puro
  cpf           CHAR(11)    NOT NULL UNIQUE,      -- só dígitos; exigido pra pagar e receber
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
  preco_kwh      NUMERIC(8,2) NOT NULL CHECK (preco_kwh >= 0),  -- definido pelo anfitrião
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

-- veículo cadastrado pelo motorista (decisão nº 3)
CREATE TABLE veiculos (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  motorista_id            BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  marca                   TEXT   NOT NULL,        -- ex: BYD
  modelo                  TEXT   NOT NULL,        -- ex: Dolphin
  apelido                 TEXT,                   -- ex: "Meu carro"
  capacidade_bateria_kwh  NUMERIC(5,1) NOT NULL CHECK (capacidade_bateria_kwh > 0)
);

CREATE TABLE recargas (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  carregador_id       BIGINT NOT NULL REFERENCES carregadores(id),
  motorista_id        BIGINT NOT NULL REFERENCES usuarios(id),
  veiculo_id          BIGINT REFERENCES veiculos(id),
  status              status_recarga NOT NULL DEFAULT 'aguardando_plugue',
  pct_inicial         SMALLINT NOT NULL CHECK (pct_inicial BETWEEN 0 AND 100),  -- informado pelo motorista ao conectar
  meta_pct            SMALLINT NOT NULL CHECK (meta_pct BETWEEN 1 AND 100),
  preco_kwh_aplicado  NUMERIC(8,2) NOT NULL,      -- cópia do preço no momento (decisão nº 6)
  kwh_entregue        NUMERIC(8,3) NOT NULL DEFAULT 0 CHECK (kwh_entregue >= 0),
  iniciada_em         TIMESTAMPTZ,                -- quando começou a carregar de fato
  finalizada_em       TIMESTAMPTZ,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (meta_pct > pct_inicial)
);

-- REGRA-CHAVE (decisão nº 2): no máximo UMA recarga "fisicamente ativa"
-- por carregador. 'aguardando_plugue' fica de fora de propósito — sem
-- reserva, o carregador continua livre até o plugue conectar; quem
-- chegar primeiro leva.
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

-- pagamento em duas fases (decisão nº 4):
--   na largada:  status='autorizado', valor_autorizado preenchido (estimativa da meta)
--   no fim:      status='aprovado', valor_total capturado (real <= autorizado) + split 90/10
CREATE TABLE pagamentos (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recarga_id         BIGINT NOT NULL UNIQUE REFERENCES recargas(id),
  metodo             metodo_pagamento NOT NULL,   -- só cartão e PIX
  status             status_pagamento NOT NULL DEFAULT 'pendente',
  valor_autorizado   NUMERIC(10,2) NOT NULL CHECK (valor_autorizado >= 0),  -- "segurado" na largada
  valor_total        NUMERIC(10,2),               -- capturado no fim; nulo até lá
  taxa_plataforma    NUMERIC(10,2),               -- os 10% da GoodWe
  valor_anfitriao    NUMERIC(10,2),               -- os 90% do anfitrião
  autorizado_em      TIMESTAMPTZ,
  processado_em      TIMESTAMPTZ,                 -- momento da captura
  recibo_enviado_em  TIMESTAMPTZ,                 -- quando o recibo foi enviado por e-mail (decisão nº 7)
  -- nunca captura mais do que foi autorizado
  CHECK (valor_total IS NULL OR valor_total <= valor_autorizado),
  -- um pagamento aprovado precisa ter o split completo, e a divisão sempre fecha
  CHECK (
    status <> 'aprovado'
    OR (valor_total IS NOT NULL
        AND taxa_plataforma IS NOT NULL
        AND valor_anfitriao IS NOT NULL
        AND valor_total = taxa_plataforma + valor_anfitriao)
  )
);

-- conta que o anfitrião conecta pra receber (decisão nº 5)
CREATE TABLE contas_repasse (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id   BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo         tipo_conta_repasse NOT NULL,
  chave_pix    TEXT,          -- quando tipo = 'pix'
  banco        TEXT,          -- quando tipo = 'conta_bancaria'
  agencia      TEXT,
  conta        TEXT,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (tipo = 'pix'            AND chave_pix IS NOT NULL)
    OR (tipo = 'conta_bancaria' AND banco IS NOT NULL AND agencia IS NOT NULL AND conta IS NOT NULL)
  )
);

-- split automático: cada pagamento aprovado gera UM repasse com os 90%
CREATE TABLE repasses (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pagamento_id      BIGINT NOT NULL UNIQUE REFERENCES pagamentos(id),
  conta_repasse_id  BIGINT NOT NULL REFERENCES contas_repasse(id),
  valor             NUMERIC(10,2) NOT NULL CHECK (valor >= 0),  -- = valor_anfitriao do pagamento
  status            status_repasse NOT NULL DEFAULT 'pendente',
  processado_em     TIMESTAMPTZ
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

-- fila de repasses pendentes (processamento do split)
CREATE INDEX idx_repasses_pendentes ON repasses (status) WHERE status = 'pendente';

-- ---------- views de apoio ----------

-- painel de ganhos do anfitrião (tela "Ganhos" do app)
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

-- dashboard de histórico do motorista (decisão nº 7)
CREATE VIEW vw_historico_motorista AS
SELECT
  r.motorista_id,
  r.id            AS recarga_id,
  c.nome          AS carregador,
  e.cidade,
  e.uf,
  r.status,
  r.kwh_entregue,
  p.valor_total,
  p.recibo_enviado_em,
  r.criado_em
FROM recargas r
JOIN carregadores c ON c.id = r.carregador_id
JOIN enderecos e    ON e.id = c.endereco_id
LEFT JOIN pagamentos p ON p.recarga_id = r.id;

-- ---------- dados iniciais ----------

-- linha HCA real da GoodWe (fonte: en.goodwe.com/hca-g2)
INSERT INTO modelos_carregador (codigo, potencia_kw, descricao) VALUES
  ('GW7K-HCA-20',  7.0,  'Monofásico · 230V, 32A · Tipo 2'),
  ('GW11K-HCA-20', 11.0, 'Trifásico · 400V, 16A · Tipo 2'),
  ('GW22K-HCA-20', 22.0, 'Trifásico · 400V, 32A · Tipo 2');

COMMIT;
