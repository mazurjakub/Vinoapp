/**
 * File: RiskDiseaseBlock.tsx
 * Created: 2026-10-03
 * Description: Card with one disease's risk today, the 7-day outlook and the explanation.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RiskResult } from '../../rules'
import { toIntlLocale } from '../../i18n'
import { formatDateLong, formatWeekday, localDateKey } from '../weather/format'
import { RISK_CLASS, RISK_LABEL_KEYS } from './riskLabels'
import { formatRiskReason } from './riskReasonText'

interface RiskDiseaseBlockProps {
  title: string
  results: RiskResult[]
  daysSinceSpray?: number | null
  /** Shows today's first reason under the title, for a disease whose state matters more than its level. */
  showStatus?: boolean
}

function RiskDiseaseBlock({ title, results, daysSinceSpray, showStatus }: RiskDiseaseBlockProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const todayKey = localDateKey(new Date())
  const todayResult = results.find((r) => r.date === todayKey)
  const forecast = results.filter((r) => r.date >= todayKey).slice(0, 7)
  const [expandedDate, setExpandedDate] = useState<string | null>(todayKey)
  const expanded = forecast.find((r) => r.date === expandedDate) ?? todayResult

  return (
    <div className="risk-block">
      <div className="risk-block-header">
        <h3>{title}</h3>
        {todayResult && (
          <span className={`risk-pill ${RISK_CLASS[todayResult.risk]}`}>
            {t('risk.today', { level: t(RISK_LABEL_KEYS[todayResult.risk]) })}
          </span>
        )}
      </div>
      {showStatus && todayResult?.reasons[0] && (
        <p className="risk-status">{formatRiskReason(t, todayResult.reasons[0], locale)}</p>
      )}
      {daysSinceSpray !== undefined && (
        <p className="risk-days-since-spray">
          {daysSinceSpray === null
            ? t('risk.noSprayLogged')
            : t('risk.daysSinceSpray', { count: daysSinceSpray })}
        </p>
      )}
      {forecast.length === 0 ? (
        <p className="empty">{t('risk.noForecastForDay')}</p>
      ) : (
        <div className="risk-strip">
          {forecast.map((r) => (
            <button
              key={r.date}
              type="button"
              className={`risk-chip ${RISK_CLASS[r.risk]}${r.date === expandedDate ? ' active' : ''}`}
              onClick={() => setExpandedDate(r.date === expandedDate ? null : r.date)}
              title={t('risk.riskLabel', { level: t(RISK_LABEL_KEYS[r.risk]) })}
            >
              {formatWeekday(r.date, locale)}
            </button>
          ))}
        </div>
      )}
      {expanded && (
        <div className="risk-explanation">
          <strong>
            {formatDateLong(expanded.date, locale)} —{' '}
            {t('risk.riskLabel', { level: t(RISK_LABEL_KEYS[expanded.risk]) })}
          </strong>
          <ul>
            {expanded.reasons.map((reason, i) => (
              <li key={i}>{formatRiskReason(t, reason, locale)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default RiskDiseaseBlock
