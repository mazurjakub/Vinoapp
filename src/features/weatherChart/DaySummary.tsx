/**
 * File: DaySummary.tsx
 * Created: 2026-10-25
 * Description: Row above the weather chart showing the values of the selected day.
 */

import { formatNumber, formatWithUnit } from '../../i18n/formatNumber'
import { GOIDANICH_TABLE_MIN_TEMP_C, type GoidanichDayStatus, type Risk } from '../../rules'
import { isForecastDate } from './chartLayout'
import { RISK_LABEL_KEYS } from '../risk/riskLabels'
import type { WeatherPoint } from './weatherSeries'

interface DaySummaryProps {
  row: (WeatherPoint & { goidanichIncrementPct: number | null; goidanichCold: boolean }) | undefined
  today: string
  t: (key: string, options?: Record<string, unknown>) => string
  dateLabel: (date: string) => string
  locale: string
  goidanichStatus: GoidanichDayStatus
  gublerRiskForScore: (score: number) => Risk
}

/** Values of the selected day, shown above the charts instead of a tooltip. */
function DaySummary({ row, today, t, dateLabel, locale, goidanichStatus, gublerRiskForScore }: DaySummaryProps) {
  if (!row) return <div className="chart-day-summary chart-day-summary-empty">{t('weatherChart.daySummaryHint')}</div>

  const riskText = (risk: Risk) => t(RISK_LABEL_KEYS[risk])
  const goidanichStatusText = () => {
    switch (goidanichStatus.kind) {
      case 'complete':
        return t('weatherChart.cycleComplete', { date: dateLabel(goidanichStatus.endDate) })
      case 'stalled':
        return t('weatherChart.cycleStalled', { date: dateLabel(goidanichStatus.endDate), days: goidanichStatus.days })
      case 'seasonOver':
        return t('weatherChart.cycleSeasonOver')
      case 'none':
        return t('weatherChart.notActive')
    }
  }
  // By date, not by row.source, which can still say 'forecast' for a past day.
  const forecast = isForecastDate(row.date, today)
  // Today is part measured, part forecast — neither label fits, so it gets its own.
  const isToday = row.date === today
  const tagClass = isToday
    ? 'chart-day-summary-tag chart-day-summary-tag-today'
    : forecast
      ? 'chart-day-summary-tag chart-day-summary-tag-forecast'
      : 'chart-day-summary-tag'

  return (
    <div className="chart-day-summary">
      <span className="chart-day-summary-date">{dateLabel(row.date)}</span>
      <span className={tagClass}>
        {isToday ? t('weatherChart.today') : forecast ? t('weatherChart.sourceForecast') : t('weatherChart.sourceHistory')}
      </span>
      <span className="chart-day-summary-item">
        <strong>{t('weatherChart.temp')}:</strong> {row.meanTempC === null ? '—' : formatWithUnit(row.meanTempC, '°C', locale, 1)}
      </span>
      <span className="chart-day-summary-item">
        <strong>{t('weatherChart.precip')}:</strong> {row.precipitationMm === null ? '—' : formatWithUnit(row.precipitationMm, 'mm', locale, 1)}
      </span>
      <span className="chart-day-summary-item">
        <strong>{t('weatherChart.rh')}:</strong> {row.meanRhPct === null ? '—' : formatWithUnit(row.meanRhPct, '%', locale, 0)}
      </span>
      <span className="chart-day-summary-item">
        <strong>{t('weatherChart.columns.goidanich')}:</strong>{' '}
        {row.goidanichPct === null ? goidanichStatusText() : formatWithUnit(row.goidanichPct, '%', locale, 0)}
      </span>
      {row.goidanichIncrementPct !== null && (
        <span className="chart-day-summary-item">
          <strong>{t('weatherChart.increment')}:</strong>{' '}
          {row.goidanichCold
            ? t('weatherChart.incrementCold', { temperature: GOIDANICH_TABLE_MIN_TEMP_C })
            : `+${formatWithUnit(row.goidanichIncrementPct, '%', locale, 1)}`}
        </span>
      )}
      <span className="chart-day-summary-item">
        <strong>{t('weatherChart.columns.gubler')}:</strong>{' '}
        {row.gublerScore === null
          ? t('weatherChart.notActive')
          : `${formatNumber(row.gublerScore, locale, 0)} (${riskText(gublerRiskForScore(row.gublerScore)).toLocaleLowerCase(locale)})`}
      </span>
    </div>
  )
}

export default DaySummary
