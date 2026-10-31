/**
 * File: HarvestBarChart.tsx
 * Created: 2026-10-03
 * Description: SVG bar chart of total harvest weight per year.
 */

import { useTranslation } from 'react-i18next'
import { toIntlLocale } from '../../i18n'
import { formatNumber } from '../../i18n/formatNumber'
import type { HarvestYearSummary } from './harvestSummary'

const WIDTH = 360
const HEIGHT = 160
const LEFT = 36
const RIGHT = 6
const TOP = 16
const BOTTOM = 22

interface HarvestBarChartProps {
  /** Oldest first for the chart; the summary table keeps its own order. */
  summaries: HarvestYearSummary[]
}

function HarvestBarChart({ summaries }: HarvestBarChartProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const years = [...summaries].sort((a, b) => a.year - b.year)
  if (years.length === 0) return null

  const max = Math.max(1, ...years.map((s) => s.totalWeightKg))
  const innerW = WIDTH - LEFT - RIGHT
  const innerH = HEIGHT - TOP - BOTTOM
  const slot = innerW / years.length
  const barW = Math.max(6, slot * 0.6)
  const summary = t('harvest.chart.summary', { count: years.length })

  return (
    <figure className="harvest-chart">
      <figcaption className="weather-chart-caption">{t('harvest.chart.caption')}</figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={summary} className="weather-chart-svg">
        <line x1={LEFT} x2={WIDTH - RIGHT} y1={TOP + innerH} y2={TOP + innerH} className="chart-grid" />
        <text x={LEFT - 4} y={TOP + 4} textAnchor="end" className="chart-tick">
          {formatNumber(max, locale, 0)}
        </text>
        <text x={LEFT - 4} y={TOP + innerH} textAnchor="end" className="chart-tick">
          0
        </text>
        {years.map((s, i) => {
          const h = (s.totalWeightKg / max) * innerH
          const cx = LEFT + slot * i + slot / 2
          return (
            <g key={s.year}>
              <rect x={cx - barW / 2} y={TOP + innerH - h} width={barW} height={h} className="chart-bar" />
              <text x={cx} y={TOP + innerH - h - 3} textAnchor="middle" className="chart-tick">
                {formatNumber(s.totalWeightKg, locale, 0)}
              </text>
              <text x={cx} y={HEIGHT - 6} textAnchor="middle" className="chart-tick">
                {s.year}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="empty">{t('harvest.chart.tableHint')}</p>
    </figure>
  )
}

export default HarvestBarChart
