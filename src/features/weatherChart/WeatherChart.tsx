/**
 * File: WeatherChart.tsx
 * Created: 2026-10-25
 * Description: Recharts weather and risk chart for the last 7 and next 7 days, with a table of values.
 */

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { db } from '../../db'
import type { DailyRisk, InfectionEvent } from '../../db/schema'
import { getSetting } from '../../db/settingsRepo'
import {
  addDaysUTC,
  goidanichDayStatus,
  groupByDay,
  REGION_PROFILES,
  resolveGublerStart,
  secondarySeasonEnded,
  type GoidanichCycleState,
  type GublerThomasState,
} from '../../rules'
import { toIntlLocale } from '../../i18n'
import { formatNumber, formatWithUnit } from '../../i18n/formatNumber'
import { getPhenologyDatesForYear } from '../growthStage/growthStageRepo'
import { getLastSprayDatetime } from '../journal/spraysRepo'
import { listDailyRiskWindow } from '../risk/dailyRiskRepo'
import { isActiveInfectionEvent } from '../risk/infectionEventsRepo'
import type { DailyAccumulatorRecord } from '../risk/dailyAccumulator'
import { resolveGoidanichActiveSince } from '../risk/goidanichActivation'
import { projectGoidanich, projectGublerScore } from '../risk/riskProjection'
import { getWeatherCache } from '../weather/weatherCacheRepo'
import { localDateKey } from '../weather/format'
import { forecastBoundaryIndex, isForecastDate } from './chartLayout'
import { GOIDANICH_END_BAND_PCT, GOIDANICH_ZONES, GUBLER_THRESHOLDS, goidanichBandRange, gublerRiskForScore } from './riskZones'
import { isLonePoint, splitCycles, splitForecastSeries } from './splitForecastSeries'
import { buildWeatherSeries, type WeatherPoint } from './weatherSeries'
import ChartLegend, { type LegendItem } from './ChartLegend'
import DaySummary from './DaySummary'

const WINDOW_DAYS = 7
const PANEL_HEIGHT = 190
const GOIDANICH_MIN_AXIS_MAX = 120
const GOIDANICH_TICKS = [0, 25, 50, 75, 100]
const GUBLER_TICKS = [0, 20, 40, 60, 80, 100]
/** Room below zero, so an index at 0 stays visible above the X axis. */
const INDEX_AXIS_MIN = -4

interface ChartRow extends WeatherPoint {
  tempMeasured: number | null
  tempForecast: number | null
  goidanichMeasured: number | null
  goidanichForecast: number | null
  goidanichNextMeasured: number | null
  goidanichNextForecast: number | null
  gublerMeasured: number | null
  gublerForecast: number | null
  goidanichBand: [number, number] | null
}

/** An index changes once a day, so its line is stepped. A lone day has no segment, so it gets a dot. */
function indexLine(rows: ChartRow[], dataKey: keyof ChartRow, color: string, dashed: boolean, firstOwnIndex = 0) {
  const values = rows.map((row) => row[dataKey] as number | null)
  return (
    <Line
      key={dataKey}
      type="stepAfter"
      dataKey={dataKey}
      stroke={color}
      strokeWidth={1.8}
      strokeDasharray={dashed ? '4 3' : undefined}
      dot={({ cx, cy, index }: { cx?: number; cy?: number; index: number }) =>
        isLonePoint(values, index, firstOwnIndex) && cx !== undefined && cy !== undefined ? (
          <circle key={index} cx={cx} cy={cy} r={2.5} fill={color} />
        ) : (
          <g key={index} />
        )
      }
      activeDot={false}
      connectNulls={false}
      legendType="none"
      isAnimationActive={false}
    />
  )
}

/** One day's Goidanich band: near-end from 90%, with the end band on top once the index reached 100%. */
function GoidanichBandDay(props: { x?: number; y?: number; width?: number; height?: number; payload?: ChartRow }) {
  const { x, y, width, height, payload } = props
  const band = payload?.goidanichBand
  if (x === undefined || y === undefined || width === undefined || height === undefined || !band) return <g />
  const reachedEnd = band[1] > GOIDANICH_ZONES.urgent
  const endHeight = reachedEnd ? (height * GOIDANICH_END_BAND_PCT) / (band[1] - band[0]) : 0
  return (
    <g>
      {reachedEnd && <rect x={x} y={y} width={width} height={endHeight} fill="var(--zone-high)" />}
      <rect x={x} y={y + endHeight} width={width} height={height - endHeight} fill="var(--zone-medium)" />
    </g>
  )
}

/** Small triangle marker for a primary-infection event, placed at the top of its panel. */
function EventMarker(props: { cx?: number; cy?: number }) {
  const { cx, cy } = props
  if (cx === undefined || cy === undefined) return <g />
  return <polygon points={`${cx},${cy + 7} ${cx - 6},${cy - 5} ${cx + 6},${cy - 5}`} fill="var(--chart-event)" />
}

function WeatherChart({ vineyardId }: { vineyardId: number }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const year = new Date().getFullYear()
  const today = localDateKey(new Date())
  const from = addDaysUTC(today, -WINDOW_DAYS)
  const to = addDaysUTC(today, WINDOW_DAYS)
  // The day the synced cursor is on, shared by all three panels (same
  // syncId) and shown in the fixed row above them — set on hover/click/touch,
  // never cleared on mouse-leave so a tapped day stays selected until another
  // one is touched.
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const vineyard = useLiveQuery(() => db.vineyards.get(vineyardId), [vineyardId])
  const cache = useLiveQuery(() => getWeatherCache(vineyardId), [vineyardId])
  const storedRows = useLiveQuery<DailyRisk[]>(() => listDailyRiskWindow(vineyardId, from, to), [vineyardId, from, to])
  const phenology = useLiveQuery(() => getPhenologyDatesForYear(vineyardId, year), [vineyardId, year])
  const goidanichRecord = useLiveQuery(
    () => getSetting<DailyAccumulatorRecord<GoidanichCycleState>>(`goidanichState:${vineyardId}:${year}`),
    [vineyardId, year],
  )
  const gublerRecord = useLiveQuery(
    () => getSetting<DailyAccumulatorRecord<GublerThomasState>>(`gublerThomasState:${vineyardId}:${year}`),
    [vineyardId, year],
  )
  const primaryEvents = useLiveQuery<InfectionEvent[]>(
    () =>
      db.infectionEvents
        .where('vineyardId')
        .equals(vineyardId)
        .and((e) => isActiveInfectionEvent(e) && e.disease === 'downy' && e.type === 'primary' && e.date.startsWith(String(year)))
        .toArray(),
    [vineyardId, year],
  )
  const lastDownySprayDatetime = useLiveQuery(() => getLastSprayDatetime(vineyardId, 'downy'), [vineyardId])
  const lastPowderySprayDatetime = useLiveQuery(() => getLastSprayDatetime(vineyardId, 'powdery'), [vineyardId])

  if (
    !vineyard ||
    !cache ||
    !phenology ||
    storedRows === undefined ||
    primaryEvents === undefined ||
    lastDownySprayDatetime === undefined ||
    lastPowderySprayDatetime === undefined
  ) {
    return <p className="empty">{t('weatherChart.loading')}</p>
  }

  const days = groupByDay(cache.hourly)
  // A stale stored record from before a spray deactivated the index is
  // discarded by `projectGoidanichPct`.
  const goidanichReset = resolveGoidanichActiveSince(
    primaryEvents.map((e) => e.date),
    lastDownySprayDatetime?.slice(0, 10) ?? undefined,
  )
  const secondaryProfile = REGION_PROFILES[vineyard.regionProfile].secondaryInfection
  const isSecondarySeasonOver = (date: string) =>
    secondarySeasonEnded(date, phenology.harvest, secondaryProfile.seasonEndMonthDay)
  const goidanichProjection = goidanichReset
    ? projectGoidanich(
        goidanichRecord,
        goidanichReset,
        days,
        {
          primaryEventDates: new Set(primaryEvents.map((e) => e.date)),
          stallDays: secondaryProfile.stallDays,
          requireWetHours: secondaryProfile.requireWetHours,
        },
        isSecondarySeasonOver,
      )
    : undefined
  const goidanichProjected = goidanichProjection?.pctByDate ?? new Map<string, number>()
  const gublerStart = resolveGublerStart(phenology.budbreak ?? `${year}-01-01`, lastPowderySprayDatetime?.slice(0, 10))
  const gublerProjected = projectGublerScore(gublerRecord, gublerStart.resetFromDate, days, gublerStart.initialState)

  const points = buildWeatherSeries({
    from,
    to,
    storedRows,
    liveDays: days,
    goidanichProjected,
    gublerProjected,
    primaryEventDates: new Set(primaryEvents.map((e) => e.date)),
  })

  const boundaryIndex = forecastBoundaryIndex(points.map((p) => p.date), today)
  const temp = splitForecastSeries(points.map((p) => p.meanTempC), boundaryIndex)
  const [goidanichCycle, goidanichNextCycle] = splitCycles(points.map((p) => p.goidanichPct))
  const goidanich = splitForecastSeries(goidanichCycle, boundaryIndex)
  const goidanichNext = splitForecastSeries(goidanichNextCycle, boundaryIndex)
  const gubler = splitForecastSeries(points.map((p) => p.gublerScore), boundaryIndex)

  const rows: ChartRow[] = points.map((p, i) => ({
    ...p,
    tempMeasured: temp.measured[i],
    tempForecast: temp.forecast[i],
    goidanichMeasured: goidanich.measured[i],
    goidanichForecast: goidanich.forecast[i],
    goidanichNextMeasured: goidanichNext.measured[i],
    goidanichNextForecast: goidanichNext.forecast[i],
    gublerMeasured: gubler.measured[i],
    gublerForecast: gubler.forecast[i],
    goidanichBand: goidanichBandRange(p.goidanichPct),
  }))

  const forecastFrom = boundaryIndex === -1 ? null : rows[boundaryIndex].date
  const forecastTo = rows[rows.length - 1].date
  const todayIndex = rows.findIndex((p) => p.date === today)
  const displayIndex = activeIndex ?? (todayIndex === -1 ? null : todayIndex)
  const activeRow = displayIndex === null ? undefined : rows[displayIndex]

  const precipitationThresholdMm = REGION_PROFILES[vineyard.regionProfile].primaryInfection.minPrecipitation24hMm
  const precips = rows.map((p) => p.precipitationMm).filter((v): v is number => v !== null)
  const precipMax = Math.max(precipitationThresholdMm + 2, 5, Math.ceil(Math.max(0, ...precips)))
  const goidanichValues = rows.map((p) => p.goidanichPct).filter((v): v is number => v !== null)
  const goidanichMax = Math.max(GOIDANICH_MIN_AXIS_MAX, Math.ceil(Math.max(0, ...goidanichValues)) + 5)
  const hasForecastValue = (value: (p: WeatherPoint) => number | null) =>
    boundaryIndex !== -1 && points.slice(boundaryIndex).some((p) => value(p) !== null)
  const eventRows = rows.filter((p) => p.primaryEvent)
  const axisNumber = (value: number) => formatNumber(value, locale)

  const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'numeric' })
  const summary = t('weatherChart.summary', { from: dateLabel(from), to: dateLabel(to) })

  const xAxis = (
    <XAxis
      dataKey="date"
      scale="band"
      tickFormatter={dateLabel}
      interval="preserveStartEnd"
      minTickGap={24}
      tick={{ fontSize: 10 }}
      padding={{ left: 8, right: 8 }}
    />
  )
  // Panels with a single Y axis use Recharts' default id ("0") and don't
  // need to say so; the precip+temp panel has two explicitly-id'd axes, and
  // a reference component with neither matches none of them — Recharts then
  // can't resolve a vertical extent to draw against and silently omits it.
  const forecastBand = (showLabel: boolean, yAxisId?: string) =>
    forecastFrom && (
      <ReferenceArea
        {...(yAxisId ? { yAxisId } : {})}
        x1={forecastFrom}
        x2={forecastTo}
        fill="var(--chart-forecast-bg)"
        stroke="none"
        ifOverflow="extendDomain"
        label={
          showLabel
            ? { value: t('weatherChart.forecastBandLabel'), position: 'insideTopRight', style: { fill: 'var(--chart-muted)', fontSize: 10 } }
            : undefined
        }
      />
    )
  const todayLine = (yAxisId?: string) => (
    <ReferenceLine
      {...(yAxisId ? { yAxisId } : {})}
      x={today}
      stroke="var(--chart-today)"
      strokeDasharray="2 2"
      label={{ value: t('weatherChart.today'), position: 'insideTop', style: { fill: 'var(--chart-today)', fontSize: 10, fontWeight: 600 } }}
    />
  )
  // No floating box (`content={() => null}`) — just the synced vertical
  // cursor line (`cursor`), shared across all three panels via `syncId`. The
  // selected day's values show in the fixed `DaySummary` row above the
  // panels instead, so nothing ever overlaps the plot.
  const cursorTooltip = <Tooltip content={() => null} cursor={{ stroke: 'var(--chart-muted)', strokeOpacity: 0.6 }} />

  const zoneMedium = { kind: 'zone', fill: 'var(--zone-medium)', border: 'var(--zone-medium-border)', dashedBorder: true } as const
  const zoneHigh = { kind: 'zone', fill: 'var(--zone-high)', border: 'var(--zone-high-border)' } as const
  const gublerThreshold = (y: number, label: string, position: 'insideTopLeft' | 'insideBottomLeft') => (
    <ReferenceLine
      y={y}
      stroke="var(--chart-threshold)"
      strokeDasharray="4 2"
      label={{ value: label, position, style: { fill: 'var(--chart-threshold)', fontSize: 9 } }}
    />
  )
  const precipTempLegend: LegendItem[] = [
    ...(rows.some((p) => p.tempMeasured !== null)
      ? [{ label: t('weatherChart.legend.tempHistory'), swatch: { kind: 'line', color: 'var(--chart-temp)' } } as const]
      : []),
    ...(hasForecastValue((p) => p.meanTempC)
      ? [{ label: t('weatherChart.legend.tempForecast'), swatch: { kind: 'line', color: 'var(--chart-temp)', dashed: true } } as const]
      : []),
    { label: t('weatherChart.precip'), swatch: { kind: 'bar', color: 'var(--chart-precip)' } },
    { label: t('weatherChart.legend.precipThreshold'), swatch: { kind: 'line', color: 'var(--chart-threshold)', dashed: true } },
  ]
  const goidanichLegend: LegendItem[] = [
    ...(rows.some((p) => p.goidanichMeasured !== null || p.goidanichNextMeasured !== null)
      ? [{ label: t('weatherChart.legend.indexHistory'), swatch: { kind: 'line', color: 'var(--chart-goidanich)' } } as const]
      : []),
    ...(hasForecastValue((p) => p.goidanichPct)
      ? [{ label: t('weatherChart.legend.indexForecast'), swatch: { kind: 'line', color: 'var(--chart-goidanich)', dashed: true } } as const]
      : []),
    ...(rows.some((p) => p.goidanichBand)
      ? [{ label: t('weatherChart.legend.incubationNearEnd'), swatch: zoneMedium }]
      : []),
    ...(rows.some((p) => p.goidanichPct !== null && p.goidanichPct >= GOIDANICH_ZONES.urgent)
      ? [{ label: t('weatherChart.legend.incubationEnd'), swatch: zoneHigh }]
      : []),
    ...(eventRows.length > 0
      ? [{ label: t('weatherChart.primaryEvent'), swatch: { kind: 'marker', color: 'var(--chart-event)' } } as const]
      : []),
  ]
  const gublerLegend: LegendItem[] = [
    ...(rows.some((p) => p.gublerMeasured !== null)
      ? [{ label: t('weatherChart.legend.indexHistory'), swatch: { kind: 'line', color: 'var(--chart-gubler)' } } as const]
      : []),
    ...(hasForecastValue((p) => p.gublerScore)
      ? [{ label: t('weatherChart.legend.indexForecast'), swatch: { kind: 'line', color: 'var(--chart-gubler)', dashed: true } } as const]
      : []),
  ]

  // Recharts passes its internal chart state (not a DOM event) to these.
  // Touch is handled the same way — Recharts maps touchmove to the same
  // active-index tracking as mousemove — and nothing clears the selection on
  // mouse-leave/touch-end, so a tapped day stays shown until another is touched.
  const handleChartActivity = (state: { activeTooltipIndex?: number | string | null }) => {
    const index = Number(state?.activeTooltipIndex)
    if (Number.isInteger(index)) setActiveIndex(index)
  }

  return (
    <figure className="weather-chart">
      <figcaption className="weather-chart-caption">
        {t('weatherChart.caption')} <span className="empty">({t('weatherChart.indicative')})</span>
      </figcaption>

      <DaySummary
        row={activeRow}
        today={today}
        t={t}
        dateLabel={dateLabel}
        locale={locale}
        goidanichStatus={
          activeRow
            ? goidanichDayStatus(goidanichProjection?.state, activeRow.date, isSecondarySeasonOver(activeRow.date))
            : { kind: 'none' }
        }
        gublerRiskForScore={gublerRiskForScore}
      />

      <div aria-label={summary}>
        <div className="chart-panel">
          <h3 className="chart-panel-title">{t('weatherChart.panelPrecipTemp')}</h3>
          <ChartLegend items={precipTempLegend} />
          <ResponsiveContainer width="100%" height={PANEL_HEIGHT}>
            <ComposedChart
              data={rows}
              syncId="weatherChart"
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              onMouseMove={handleChartActivity}
              onTouchMove={handleChartActivity}
              onClick={handleChartActivity}
            >
              <CartesianGrid strokeDasharray="2 3" stroke="var(--border)" />
              {xAxis}
              <YAxis yAxisId="precip" domain={[0, precipMax]} tick={{ fontSize: 10 }} tickFormatter={axisNumber} width={28} />
              <YAxis yAxisId="temp" orientation="right" tick={{ fontSize: 10 }} tickFormatter={axisNumber} width={28} />
              {forecastBand(true, 'precip')}
              {todayLine('precip')}
              <ReferenceLine
                yAxisId="precip"
                y={precipitationThresholdMm}
                stroke="var(--chart-threshold)"
                strokeDasharray="4 2"
                label={{ value: t('weatherChart.thresholdPrecip'), position: 'insideBottomLeft', style: { fill: 'var(--chart-threshold)', fontSize: 9 } }}
              />
              {/* isAnimationActive={false} on every Bar/Line in this chart: when `data`
                  swaps to another plot without remounting, Recharts' draw-in animation
                  can get stuck mid-transition and leave a line almost invisible, even
                  though its data is correct. */}
              <Bar yAxisId="precip" dataKey="precipitationMm" name={t('weatherChart.precip')} fill="var(--chart-precip)" isAnimationActive={false} />
              <Line
                yAxisId="temp"
                type="monotone"
                dataKey="tempMeasured"
                name={t('weatherChart.temp')}
                stroke="var(--chart-temp)"
                strokeWidth={1.8}
                dot={false} activeDot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="temp"
                type="monotone"
                dataKey="tempForecast"
                stroke="var(--chart-temp)"
                strokeWidth={1.8}
                strokeDasharray="4 3"
                dot={false} activeDot={false}
                connectNulls={false}
                legendType="none"
                isAnimationActive={false}
              />
              {cursorTooltip}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-panel">
          <h3 className="chart-panel-title">{t('weatherChart.goidanich')}</h3>
          {goidanichValues.length === 0 && <p className="empty">{t('weatherChart.noIncubation')}</p>}
          {goidanichValues.length > 0 && <ChartLegend items={goidanichLegend} />}
          {goidanichValues.length > 0 && (
          <ResponsiveContainer width="100%" height={PANEL_HEIGHT}>
            <ComposedChart
              data={rows}
              syncId="weatherChart"
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              onMouseMove={handleChartActivity}
              onTouchMove={handleChartActivity}
              onClick={handleChartActivity}
            >
              <CartesianGrid strokeDasharray="2 3" stroke="var(--border)" />
              {xAxis}
              <YAxis domain={[INDEX_AXIS_MIN, goidanichMax]} ticks={GOIDANICH_TICKS} interval={0} tick={{ fontSize: 10 }} tickFormatter={axisNumber} width={28} />
              {forecastBand(false)}
              {/* A full-width bar per day: the bands appear only on days the index really reached them. */}
              <Bar dataKey="goidanichBand" barSize={1000} shape={GoidanichBandDay} legendType="none" isAnimationActive={false} />
              {todayLine()}
              {/* The 90% label sits below its line and the 100% label above its own, so they can't overlap. */}
              <ReferenceLine y={GOIDANICH_ZONES.warning} stroke="var(--chart-threshold)" strokeDasharray="4 2" label={{ value: t('weatherChart.thresholdWarning'), position: 'insideTopLeft', style: { fill: 'var(--chart-threshold)', fontSize: 9 } }} />
              <ReferenceLine y={GOIDANICH_ZONES.urgent} stroke="var(--chart-threshold)" strokeDasharray="4 2" label={{ value: t('weatherChart.thresholdUrgent'), position: 'insideBottomLeft', offset: 8, style: { fill: 'var(--chart-threshold)', fontSize: 9 } }} />
              {indexLine(rows, 'goidanichMeasured', 'var(--chart-goidanich)', false)}
              {indexLine(rows, 'goidanichForecast', 'var(--chart-goidanich)', true, boundaryIndex)}
              {indexLine(rows, 'goidanichNextMeasured', 'var(--chart-goidanich)', false)}
              {indexLine(rows, 'goidanichNextForecast', 'var(--chart-goidanich)', true, boundaryIndex)}
              {eventRows.map((p) => (
                <ReferenceDot
                  key={p.date}
                  x={p.date}
                  y={goidanichMax}
                  shape={EventMarker}
                  label={{ value: t('weatherChart.primaryEvent'), position: 'top', style: { fill: 'var(--chart-event)', fontSize: 9 } }}
                />
              ))}
              {cursorTooltip}
            </ComposedChart>
          </ResponsiveContainer>
          )}
        </div>

        <div className="chart-panel">
          <h3 className="chart-panel-title">{t('weatherChart.gubler')}</h3>
          <ChartLegend items={gublerLegend} />
          <ResponsiveContainer width="100%" height={PANEL_HEIGHT}>
            <ComposedChart
              data={rows}
              syncId="weatherChart"
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              onMouseMove={handleChartActivity}
              onTouchMove={handleChartActivity}
              onClick={handleChartActivity}
            >
              <CartesianGrid strokeDasharray="2 3" stroke="var(--border)" />
              {xAxis}
              <YAxis domain={[INDEX_AXIS_MIN, 100]} ticks={GUBLER_TICKS} interval={0} tick={{ fontSize: 10 }} tickFormatter={axisNumber} width={28} />
              {forecastBand(false)}
              {todayLine()}
              {/* The low label sits below its line and the medium label above its own, so they can't overlap. */}
              {gublerThreshold(GUBLER_THRESHOLDS.lowTo, t('weatherChart.gublerLow'), 'insideTopLeft')}
              {gublerThreshold(GUBLER_THRESHOLDS.mediumFrom, t('weatherChart.gublerMedium'), 'insideBottomLeft')}
              {gublerThreshold(GUBLER_THRESHOLDS.highFrom, t('weatherChart.gublerHigh'), 'insideBottomLeft')}
              {indexLine(rows, 'gublerMeasured', 'var(--chart-gubler)', false)}
              {indexLine(rows, 'gublerForecast', 'var(--chart-gubler)', true, boundaryIndex)}
              {cursorTooltip}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <details className="chart-table">
        <summary>{t('weatherChart.tableTitle')}</summary>
        <table>
          <thead>
            <tr>
              <th>{t('weatherChart.columns.date')}</th>
              <th>{t('weatherChart.columns.source')}</th>
              <th>{t('weatherChart.columns.temp')}</th>
              <th>{t('weatherChart.columns.precip')}</th>
              <th>{t('weatherChart.columns.rh')}</th>
              <th>{t('weatherChart.columns.goidanich')}</th>
              <th>{t('weatherChart.columns.gubler')}</th>
              <th>{t('weatherChart.columns.event')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.date}>
                <td>{dateLabel(p.date)}</td>
                <td>
                  {p.date === today
                    ? t('weatherChart.today')
                    : isForecastDate(p.date, today)
                      ? t('weatherChart.sourceForecast')
                      : t('weatherChart.sourceHistory')}
                </td>
                <td>{p.meanTempC === null ? '—' : formatWithUnit(p.meanTempC, '°C', locale, 1)}</td>
                <td>{p.precipitationMm === null ? '—' : formatWithUnit(p.precipitationMm, 'mm', locale, 1)}</td>
                <td>{p.meanRhPct === null ? '—' : formatWithUnit(p.meanRhPct, '%', locale, 0)}</td>
                <td>{p.goidanichPct === null ? '—' : formatNumber(p.goidanichPct, locale, 0)}</td>
                <td>{p.gublerScore === null ? '—' : formatNumber(p.gublerScore, locale, 0)}</td>
                <td>{p.primaryEvent ? '✓' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

export default WeatherChart
