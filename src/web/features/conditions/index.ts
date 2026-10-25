// The conditions feature's only import surface (spec §8.2, §8.7.5): RoadsPanel and AvalanchePanel (briefing, resort
// page, wall sidebar), ForecastPanel (briefing only) and the resort page's ModelTable (HRRR/NBM/ECMWF/GFS).
// `roadView` gives other features (resort cards, wall tiles) a corridor's status word, tone and staleness for
// ui/StatusChip, and `showTraction` its extra "Traction law" chip; `range` / `dayOf` format NWS snow ranges (the
// wall's snow table); `SourceLine` + `worstMeta` give any section heading the conditions panels'
// 'SOURCE ◆ Down · 16 h ago' sub-line.
import './conditions.css';

export { AvalanchePanel, type AvalanchePanelProps } from './AvalanchePanel.tsx';
export { ForecastPanel, type ForecastPanelProps } from './ForecastPanel.tsx';
export { dayOf, range } from './forecast-rows.ts';
export { ModelTable, type ModelTableProps } from './ModelTable.tsx';
export { worstMeta } from './panel-meta.ts';
export { RoadsPanel, type RoadsPanelProps } from './RoadsPanel.tsx';
export { CORRIDOR_NAME, CORRIDOR_ORDER, type RoadView, roadView, showTraction } from './road-view.ts';
export { SourceLine } from './SourceLine.tsx';
