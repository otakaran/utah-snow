// The conditions feature's only import surface (spec §8.2, §8.7.5): RoadsPanel, AvalanchePanel and ForecastPanel,
// shared by the briefing, the resort page and the wall, and the resort page's ModelTable (HRRR/NBM/ECMWF/GFS).
// `roadView` gives other features (resort cards, wall tiles) a corridor's status word, tone and staleness for
// ui/StatusChip; `range` / `dayOf` format NWS snow ranges (the wall's snow table).
import './conditions.css';

export { AvalanchePanel, type AvalanchePanelProps } from './AvalanchePanel.tsx';
export { ForecastPanel, type ForecastPanelProps } from './ForecastPanel.tsx';
export { dayOf, range } from './forecast-rows.ts';
export { ModelTable, type ModelTableProps } from './ModelTable.tsx';
export { RoadsPanel, type RoadsPanelProps } from './RoadsPanel.tsx';
export { CORRIDOR_NAME, CORRIDOR_ORDER, type RoadView, roadView } from './road-view.ts';
