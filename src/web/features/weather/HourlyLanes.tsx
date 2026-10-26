// §03's chart: three lanes over the hourly window in one figure (its aria-label is `hourlySummary`). Snow per hour
// (headline bars over the model band), temperature with the freezing level against the base and summit rules
// (HRRR, then GFS past the dashed seam), wind with gusts. Night hours shaded, midnight rules, the now marker, and
// 6-hourly HTML ticks under the lanes. Labels are HTML so the stretched SVG never distorts them.

import { Band, Bars, ChartFrame, HRule, Line, Plot, PlotLabel, Shade, VRule } from '../../ui/Chart.tsx';
import { slotPct } from '../../ui/chart.ts';
import type { HourlyView } from './hourly-view.ts';

const SNOW_H = 64;
const TEMP_H = 96;
const WIND_H = 56;

function Back({ v, h }: { v: HourlyView; h: number }) {
  return (
    <>
      <Shade spans={v.night} n={v.n} h={h} />
      {v.midnights.map((m) => (
        <VRule key={m} at={m} n={v.n} h={h} edge />
      ))}
    </>
  );
}

const Now = ({ v, h }: { v: HourlyView; h: number }) =>
  v.now === null ? null : <VRule at={v.now} n={v.n} h={h} class="chart-now" />;

function TempLane({ v }: { v: HourlyView }) {
  const { temp, frz, n } = v;
  const seamPct = frz && frz.seam !== null ? slotPct(frz.seam, n) : null;
  const labels = frz ? (
    <>
      <PlotLabel x={100} y={frz.summitY} anchor="end">
        {frz.summit}
      </PlotLabel>
      <PlotLabel x={100} y={frz.baseY} anchor="end">
        {frz.base}
      </PlotLabel>
      {seamPct !== null ? (
        <PlotLabel x={seamPct} y={100} anchor={seamPct > 88 ? 'end' : 'middle'} class="wx-seam">
          HRRR | GFS
        </PlotLabel>
      ) : null}
    </>
  ) : null;
  return (
    <Plot h={TEMP_H} class="wx-h-temp" labels={labels}>
      <Back v={v} h={TEMP_H} />
      {frz ? (
        <>
          <HRule value={frz.summitFt} h={TEMP_H} min={frz.min} max={frz.max} />
          <HRule value={frz.baseFt} h={TEMP_H} min={frz.min} max={frz.max} />
          <Line values={frz.values} h={TEMP_H} min={frz.min} max={frz.max} class="chart-line-alt" />
          {frz.seam !== null ? <VRule at={frz.seam} n={n} h={TEMP_H} class="chart-seam" /> : null}
        </>
      ) : null}
      {temp ? <Line values={temp.values} h={TEMP_H} min={temp.min} max={temp.max} class="chart-line" /> : null}
      <Now v={v} h={TEMP_H} />
    </Plot>
  );
}

export function HourlyLanes({ v, label }: { v: HourlyView; label: string }) {
  return (
    <ChartFrame label={label} class="wx-hourly">
      {v.snow ? (
        <>
          <p class="wx-kicker">{v.snow.text}</p>
          <Plot h={SNOW_H} class="wx-h-snow">
            <Back v={v} h={SNOW_H} />
            <Band lo={v.snow.lo} hi={v.snow.hi} h={SNOW_H} max={v.snow.max} />
            <Bars values={v.snow.values} h={SNOW_H} max={v.snow.max} gap={0.2} />
            <Now v={v} h={SNOW_H} />
          </Plot>
        </>
      ) : null}
      {v.temp || v.frz ? (
        <>
          <p class="wx-kicker">{[v.temp?.text, v.frz?.text].filter(Boolean).join(' · ')}</p>
          <TempLane v={v} />
        </>
      ) : null}
      {v.wind ? (
        <>
          <p class="wx-kicker">{v.wind.text}</p>
          <Plot h={WIND_H} class="wx-h-wind">
            <Back v={v} h={WIND_H} />
            <Line values={v.wind.gust} h={WIND_H} min={0} max={v.wind.max} class="chart-line-gust" />
            <Line values={v.wind.wind} h={WIND_H} min={0} max={v.wind.max} class="chart-line-dim" />
            <Now v={v} h={WIND_H} />
          </Plot>
        </>
      ) : null}
      <div class="wx-ticks">
        {v.ticks.map((t) => (
          <span
            key={t.pct}
            class={`wx-tick wx-tick-${t.anchor}${t.day ? ' is-day' : ''}`}
            style={{ left: `${t.pct}%` }}
          >
            {t.text}
          </span>
        ))}
      </div>
    </ChartFrame>
  );
}
