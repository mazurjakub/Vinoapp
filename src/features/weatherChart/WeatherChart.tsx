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
  daysBetween,
  GOIDANICH_TABLE_MIN_TEMP_C,
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
import { GUBLER_THRESHOLDS, gublerRiskForScore } from './riskZones'
import { firstOffSeasonDate, goidanichIncrements, goidanichOutlook, type GoidanichOutlook } from './goidanichOutlook'
import { isLonePoint, splitCycles, splitForecastSeries } from './splitForecastSeries'
import { buildWeatherSeries, type WeatherPoint } from './weatherSeries'
import ChartLegend, { type LegendItem } from './ChartLegend'
import DaySummary from './DaySummary'

const WINDOW_DAYS = 7
const PANEL_HEIGHT = 190
/** A bit taller than the other panels, so the two threshold labels fit between their lines. */
const GOIDANICH_PANEL_HEIGHT = 210
/** The season-end label moves to the bottom when "today" is this many days away or closer, so the two don't overlap. */
const SEASON_END_LABEL_NEAR_TODAY_DAYS = 4
const OFF_SEASON_PATTERN_ID = 'goidanich-off-season'
/** Below this many in-season days in the window, the threshold labels show only the number. */
const SHORT_THRESHOLD_LABEL_DAYS = 7
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
  goidanichIncrementPct: number | null
  goidanichCold: boolean
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

function goidanichValues(rows: ChartRow[]): number[] {
  return rows.map((p) => p.goidanichPct).filter((v): v is number => v !== null)
}

type Translate = (key: string, options?: Record<string, unknown>) => string

/**
 * The one sentence above the Goidanich panel: where the index is now and what
 * the forecast says. `null` when there is no cycle to talk about.
 */
function goidanichOutlookText(outlook: GoidanichOutlook, t: Translate, dateLabel: (date: string) => string): string | null {
  if (outlook.kind === 'none') return null
  if (outlook.kind === 'seasonOver') return t('weatherChart.outlook.seasonOver')
  const { alert, urgent, cold } = outlook
  const coldParams = { temperature: GOIDANICH_TABLE_MIN_TEMP_C }
  if (urgent.status === 'reached') return t('weatherChart.outlook.ended', { date: dateLabel(urgent.date) })
  if (alert.status === 'estimated') return t('weatherChart.outlook.alertEstimated', { date: dateLabel(alert.date) })
  if (alert.status === 'reached') {
    if (urgent.status === 'estimated') return t('weatherChart.outlook.aboveAlertEndEstimated', { date: dateLabel(urgent.date) })
    return cold ? t('weatherChart.outlook.aboveAlertCold', coldParams) : t('weatherChart.outlook.aboveAlertNoEnd')
  }
  return cold ? t('weatherChart.outlook.belowAlertCold', coldParams) : t('weatherChart.outlook.belowAlert')
}

/** Triangle on the X axis for a primary-infection event, pointing up into the panel. */
function EventMarker(props: { cx?: number; cy?: number }) {
  const { cx, cy } = props
  if (cx === undefined || cy === undefined) return <g />
  return <polygon points={`${cx},${cy - 8} ${cx - 6},${cy + 3} ${cx + 6},${cy + 3}`} fill="var(--chart-event)" />
}

/** Square on the X axis for a downy spray, which restarts the index. */
function SprayMarker(props: { cx?: number; cy?: number }) {
  const { cx, cy } = props
  if (cx === undefined || cy === undefined) return <g />
  return <rect x={cx - 5} y={cy - 7} width={10} height={10} fill="var(--chart-spray)" />
}

/** Diagonal hatching for the days after the season end, unlike the plain grey of the forecast. */
function OffSeasonPattern() {
  return (
    <svg width={0} height={0} aria-hidden="true" style={{ position: 'absolute' }}>
      <defs>
        <pattern id={OFF_SEASON_PATTERN_ID} patternUnits="userSpaceOnUse" width={7} height={7} patternTransform="rotate(45)">
          <rect width={7} height={7} fill="var(--chart-off-season-bg)" />
          <line x1={0} y1={0} x2={0} y2={7} stroke="var(--chart-off-season)" strokeWidth={2.5} />
        </pattern>
      </defs>
    </svg>
  )
}

function WeatherChart({ vineyardId }: { vineyardId: number }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const year = new Date().getFullYear()
  const today = localDateKey(new Date())
  const from = addDaysUTC(today, -WINDOW_DAYS)
  const to = addDaysUTC(today, WINDOW_DAYS)
  // Selected day, shared by all three panels. Not cleared on mouse leave, so a tapped day stays.
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const vineyard = useLiveQuery(() => db.vineyards.get(vineyardId), [vineyardId])
  const cache = useLiveQuery(() => getWeatherCache(vineyardId), [vineyardId])
  // One day before the window too, so the first day's increment can be told.
  const seriesFrom = addDaysUTC(from, -1)
  const storedRows = useLiveQuery<DailyRisk[]>(() => listDailyRiskWindow(vineyardId, seriesFrom, to), [vineyardId, seriesFrom, to])
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
  const downySprayDates = useLiveQuery(
    async () =>
      (await db.sprays.where('vineyardId').equals(vineyardId).and((s) => s.target === 'downy').toArray()).map((s) =>
        s.datetime.slice(0, 10),
      ),
    [vineyardId],
  )

  if (
    !vineyard ||
    !cache ||
    !phenology ||
    storedRows === undefined ||
    primaryEvents === undefined ||
    lastDownySprayDatetime === undefined ||
    lastPowderySprayDatetime === undefined ||
    downySprayDates === undefined
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
          thresholds: secondaryProfile.thresholdsPct,
          requireWetHours: secondaryProfile.requireWetHours,
        },
        isSecondarySeasonOver,
      )
    : undefined
  const goidanichProjected = goidanichProjection?.pctByDate ?? new Map<string, number>()
  const gublerStart = resolveGublerStart(phenology.budbreak ?? `${year}-01-01`, lastPowderySprayDatetime?.slice(0, 10))
  const gublerProjected = projectGublerScore(gublerRecord, gublerStart.resetFromDate, days, gublerStart.initialState)

  const extendedPoints = buildWeatherSeries({
    from: seriesFrom,
    to,
    storedRows,
    liveDays: days,
    goidanichProjected,
    gublerProjected,
    primaryEventDates: new Set(primaryEvents.map((e) => e.date)),
  })
  const increments = goidanichIncrements(
    extendedPoints.map((p) => ({ date: p.date, pct: p.goidanichPct, meanTempC: p.meanTempC })),
    GOIDANICH_TABLE_MIN_TEMP_C,
  ).slice(1)
  const points = extendedPoints.slice(1)

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
    goidanichIncrementPct: increments[i].incrementPct,
    goidanichCold: increments[i].cold,
  }))
  const goidanichThresholds = secondaryProfile.thresholdsPct
  const alertPct = goidanichThresholds.warning
  const offSeasonFrom = firstOffSeasonDate(rows.map((p) => p.date), isSecondarySeasonOver)
  // The risk bands stop where the season ends; outside it nothing warns.
  const lastInSeasonDate = offSeasonFrom === null ? to : offSeasonFrom > from ? addDaysUTC(offSeasonFrom, -1) : null
  const outlook = goidanichOutlook({
    days: points.map((p) => ({ date: p.date, pct: p.goidanichPct, meanTempC: p.meanTempC })),
    today,
    thresholds: { alert: alertPct, urgent: goidanichThresholds.urgent },
    isSeasonOver: isSecondarySeasonOver,
    minTempC: GOIDANICH_TABLE_MIN_TEMP_C,
  })
  const sprayRows = rows.filter((p) => downySprayDates.includes(p.date))
  const showGoidanichChart = goidanichValues(rows).length > 0 || offSeasonFrom !== null || outlook.kind !== 'none'

  const forecastFrom = boundaryIndex === -1 ? null : rows[boundaryIndex].date
  const forecastTo = rows[rows.length - 1].date
  const todayIndex = rows.findIndex((p) => p.date === today)
  const displayIndex = activeIndex ?? (todayIndex === -1 ? null : todayIndex)
  const activeRow = displayIndex === null ? undefined : rows[displayIndex]

  const precipitationThresholdMm = REGION_PROFILES[vineyard.regionProfile].primaryInfection.minPrecipitation24hMm
  const precips = rows.map((p) => p.precipitationMm).filter((v): v is number => v !== null)
  const precipMax = Math.max(precipitationThresholdMm + 2, 5, Math.ceil(Math.max(0, ...precips)))
  const goidanichMax = Math.max(GOIDANICH_MIN_AXIS_MAX, Math.ceil(Math.max(0, ...goidanichValues(rows))) + 5)
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
  // The precip+temp panel has two Y axes with ids, reference components there need yAxisId or Recharts skips them.
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
  const todayLine = (yAxisId?: string, showLabel = true) => (
    <ReferenceLine
      {...(yAxisId ? { yAxisId } : {})}
      x={today}
      stroke="var(--chart-today)"
      strokeDasharray="2 2"
      label={
        showLabel
          ? { value: t('weatherChart.today'), position: 'insideTop', style: { fill: 'var(--chart-today)', fontSize: 10, fontWeight: 600 } }
          : undefined
      }
    />
  )
  // No tooltip box, just the cursor line. The values are shown in DaySummary.
  const cursorTooltip = <Tooltip content={() => null} cursor={{ stroke: 'var(--chart-muted)', strokeOpacity: 0.6 }} />

  // The line stops at the season end. Each label sits just above its own line at the right end,
  // away from where a cycle usually starts. The warning edge needs no line of its own: the area shows it.
  const seasonOverToday = isSecondarySeasonOver(today)
  const goidanichThreshold = (y: number, label: string, withLine: boolean) =>
    lastInSeasonDate && [
      withLine && (
        <ReferenceLine
          key={`line-${y}`}
          segment={[
            { x: from, y },
            { x: lastInSeasonDate, y },
          ]}
          stroke="var(--chart-threshold)"
          strokeWidth={1}
          ifOverflow="hidden"
        />
      ),
      !seasonOverToday && (
      <ReferenceDot
        key={`label-${y}`}
        x={lastInSeasonDate}
        y={y}
        r={0}
        ifOverflow="hidden"
        label={(props: { viewBox?: { x?: number; y?: number } }) => (
          <text x={props.viewBox?.x} y={(props.viewBox?.y ?? 0) - 3} textAnchor="end" fontSize={9} fill="var(--chart-threshold)">
            {label}
          </text>
        )}
      />
      ),
    ]
  // A faint line from a marker on the axis up to its label at the top, where the index line rarely is
  // (a cycle starts at 0). On today the label goes a little lower, below the "today" label.
  const markerLine = (date: string, label: string, color: string) => (
    <ReferenceLine
      key={`marker-${label}-${date}`}
      x={date}
      stroke={color}
      strokeOpacity={0.45}
      strokeDasharray="2 3"
      label={{ value: label, position: 'insideTop', offset: date === today ? 18 : 4, style: { fill: color, fontSize: 9 } }}
    />
  )
  // One warning area from the alert threshold up, only until the season end.
  const alertArea = lastInSeasonDate && (
    <ReferenceArea x1={from} x2={lastInSeasonDate} y1={alertPct} y2={goidanichMax} fill="var(--zone-alert)" fillOpacity={1} stroke="none" ifOverflow="hidden" />
  )
  const seasonEndNearToday = offSeasonFrom !== null && Math.abs(daysBetween(offSeasonFrom, today)) <= SEASON_END_LABEL_NEAR_TODAY_DAYS
  const offSeasonArea = (showLabel: boolean) =>
    offSeasonFrom && (
      <ReferenceArea
        x1={offSeasonFrom}
        x2={to}
        fill={`url(#${OFF_SEASON_PATTERN_ID})`}
        fillOpacity={1}
        stroke="none"
        ifOverflow="hidden"
        label={
          showLabel
            ? { value: t('weatherChart.offSeason'), position: 'center', style: { fill: 'var(--chart-muted)', fontSize: 11, fontWeight: 600 } }
            : undefined
        }
      />
    )
  const seasonEndLine = (showLabel: boolean) =>
    offSeasonFrom &&
    offSeasonFrom > from && (
      <ReferenceLine
        x={offSeasonFrom}
        position="start"
        stroke="var(--chart-muted)"
        label={
          showLabel
            ? {
                value: t('weatherChart.seasonEnd'),
                // "today" is labelled at the top, so near it this label goes to the bottom.
                position: seasonEndNearToday ? 'insideBottomLeft' : 'insideTopLeft',
                style: { fill: 'var(--chart-muted)', fontSize: 9 },
              }
            : undefined
        }
      />
    )
  const goidanichForecastBand = (showLabel: boolean) =>
    forecastFrom &&
    (offSeasonFrom === null || forecastFrom < offSeasonFrom) && (
      <ReferenceArea
        x1={forecastFrom}
        x2={offSeasonFrom ? addDaysUTC(offSeasonFrom, -1) : forecastTo}
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
  const outlookText = goidanichOutlookText(outlook, t, dateLabel)
  // With only a few in-season days left in the window, the full labels would run over the axis.
  const inSeasonDays = lastInSeasonDate ? rows.filter((p) => p.date <= lastInSeasonDate).length : 0
  const thresholdLabel = (key: string, value: number) =>
    inSeasonDays < SHORT_THRESHOLD_LABEL_DAYS ? t('weatherChart.thresholdShort', { value }) : t(key, { value })
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
  // Hidden on a narrow screen: the chart labels the markers itself, and solid/dashed is self-evident next to the grey forecast.
  const goidanichLegend: LegendItem[] = [
    ...(rows.some((p) => p.goidanichMeasured !== null || p.goidanichNextMeasured !== null)
      ? [{ label: t('weatherChart.legend.indexHistory'), swatch: { kind: 'line', color: 'var(--chart-goidanich)' }, wideOnly: true } as const]
      : []),
    ...(hasForecastValue((p) => p.goidanichPct)
      ? [{ label: t('weatherChart.legend.indexForecast'), swatch: { kind: 'line', color: 'var(--chart-goidanich)', dashed: true }, wideOnly: true } as const]
      : []),
    ...(eventRows.length > 0
      ? [{ label: t('weatherChart.primaryEvent'), swatch: { kind: 'marker', color: 'var(--chart-event)' }, wideOnly: true } as const]
      : []),
    ...(sprayRows.length > 0
      ? [{ label: t('weatherChart.legend.spray'), swatch: { kind: 'square', color: 'var(--chart-spray)' }, wideOnly: true } as const]
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

  // Recharts passes its chart state here, not a DOM event. Touch works the same way.
  const handleChartActivity = (state: { activeTooltipIndex?: number | string | null }) => {
    const index = Number(state?.activeTooltipIndex)
    if (Number.isInteger(index)) setActiveIndex(index)
  }

  return (
    <figure className="weather-chart">
      <OffSeasonPattern />
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
              <CartesianGrid strokeDasharray="2 3" stroke="var(--border)" vertical={false} />
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
          {!showGoidanichChart && <p className="empty">{t('weatherChart.noIncubation')}</p>}
          {showGoidanichChart && outlookText && (
            <p className={`chart-outlook${outlook.kind === 'seasonOver' ? ' chart-outlook-muted' : ''}`}>{outlookText}</p>
          )}
          {showGoidanichChart && goidanichLegend.length > 0 && <ChartLegend items={goidanichLegend} />}
          {showGoidanichChart && (
          <>
          <ResponsiveContainer width="100%" height={GOIDANICH_PANEL_HEIGHT}>
            <ComposedChart
              data={rows}
              syncId="weatherChart"
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              onMouseMove={handleChartActivity}
              onTouchMove={handleChartActivity}
              onClick={handleChartActivity}
            >
              <CartesianGrid strokeDasharray="2 3" stroke="var(--border)" vertical={false} />
              {xAxis}
              <YAxis domain={[INDEX_AXIS_MIN, goidanichMax]} ticks={GOIDANICH_TICKS} interval={0} tick={{ fontSize: 10 }} tickFormatter={axisNumber} width={28} />
              {alertArea}
              {goidanichForecastBand(true)}
              {offSeasonArea(true)}
              {seasonEndLine(true)}
              {todayLine()}
              {goidanichThreshold(alertPct, thresholdLabel('weatherChart.thresholdWarning', alertPct), false)}
              {goidanichThreshold(goidanichThresholds.urgent, thresholdLabel('weatherChart.thresholdUrgent', goidanichThresholds.urgent), true)}
              {indexLine(rows, 'goidanichMeasured', 'var(--chart-goidanich)', false)}
              {indexLine(rows, 'goidanichForecast', 'var(--chart-goidanich)', true, boundaryIndex)}
              {indexLine(rows, 'goidanichNextMeasured', 'var(--chart-goidanich)', false)}
              {indexLine(rows, 'goidanichNextForecast', 'var(--chart-goidanich)', true, boundaryIndex)}
              {eventRows.map((p) => markerLine(p.date, t('weatherChart.eventShort'), 'var(--chart-event)'))}
              {sprayRows.map((p) => markerLine(p.date, t('weatherChart.sprayShort'), 'var(--chart-spray)'))}
              {eventRows.map((p) => (
                <ReferenceDot key={`event-${p.date}`} x={p.date} y={INDEX_AXIS_MIN} shape={EventMarker} ifOverflow="visible" />
              ))}
              {sprayRows.map((p) => (
                <ReferenceDot key={`spray-${p.date}`} x={p.date} y={INDEX_AXIS_MIN} shape={SprayMarker} ifOverflow="visible" />
              ))}
              {cursorTooltip}
            </ComposedChart>
          </ResponsiveContainer>
          </>
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
              <CartesianGrid strokeDasharray="2 3" stroke="var(--border)" vertical={false} />
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

      <details className="table-toggle">
        <summary>{t('weatherChart.tableTitle')}</summary>
        <div className="weather-table-wrap">
          <table className="weather-table">
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
                  <td>
                    {p.goidanichPct !== null
                      ? formatNumber(p.goidanichPct, locale, 0)
                      : isSecondarySeasonOver(p.date)
                        ? t('weatherChart.cycleSeasonOver')
                        : '—'}
                  </td>
                  <td>{p.gublerScore === null ? '—' : formatNumber(p.gublerScore, locale, 0)}</td>
                  <td>{p.primaryEvent ? '✓' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}

export default WeatherChart
