/** ChargeGrid Intelligence — tipos dos componentes expostos em window.ChargeGrid. */

import type { ReactNode } from 'react';

/** Estados do ciclo de vida da sessão (RN019), espelhados no LED do carregador GoodWe. */
export type ChargeStatus =
  | 'available'
  | 'charging'
  | 'reduced'
  | 'fault'
  | 'maintenance'
  | 'idle'
  | 'done';

export type EnergySource = 'solar' | 'battery' | 'grid';

export interface ButtonProps {
  /** primary: ação única da tela. secondary: alternativa. ghost: ação textual. */
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Ocupa a largura do container. Use em toda ação que conclui um fluxo. */
  block?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  className?: string;
  children?: ReactNode;
}
export declare function Button(props: ButtonProps): JSX.Element;

export interface StatusPillProps {
  status: ChargeStatus;
  /** Substitui o rótulo padrão. Nunca passe string vazia: a pílula exige palavra escrita. */
  label?: string;
  /** Dado que qualifica o estado: potência, previsão de liberação, código do erro. */
  detail?: string;
  className?: string;
}
export declare function StatusPill(props: StatusPillProps): JSX.Element;

export interface MetricTileProps {
  value: ReactNode;
  unit?: string;
  label: string;
  note?: string;
  tone?: 'solar' | 'battery' | 'inverse';
  className?: string;
}
export declare function MetricTile(props: MetricTileProps): JSX.Element;

export interface EnergyMixBarProps {
  parts: Array<{ source: EnergySource; value: number }>;
  ariaLabel?: string;
  className?: string;
}
export declare function EnergyMixBar(props: EnergyMixBarProps): JSX.Element;

export interface TariffLockProps {
  /** Preço formatado, já em reais: "R$ 1,12". */
  price: string;
  /** true depois do plug-in: a tarifa não muda mais nesta sessão (RN002). */
  locked?: boolean;
  /** Fator de modulação da IA sobre a tarifa base: "0,92". */
  factor?: string;
  /** Justificativa legível do fator. Obrigatória sempre que factor é passado. */
  reason?: string;
  className?: string;
}
export declare function TariffLock(props: TariffLockProps): JSX.Element;

export interface TabItem {
  key: string;
  label: string;
  glyph: ReactNode;
  /** Marcador de pendência, usado na aba Painel do gestor. */
  dot?: boolean;
}
export interface TabBarProps {
  items: TabItem[];
  active: string;
  onSelect?: (key: string) => void;
  ariaLabel?: string;
  className?: string;
}
export declare function TabBar(props: TabBarProps): JSX.Element;

export interface ListRowProps {
  title: ReactNode;
  meta?: ReactNode;
  glyph?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
}
export declare function ListRow(props: ListRowProps): JSX.Element;

export interface CalloutProps {
  tone?: 'info' | 'reduced' | 'danger' | 'success';
  title?: string;
  glyph?: ReactNode;
  className?: string;
  children?: ReactNode;
}
export declare function Callout(props: CalloutProps): JSX.Element;
