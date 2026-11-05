/**
 * File: RiskPanel.tsx
 * Created: 2026-10-03
 * Description: Overview panel with the risk cards for the selected plot.
 */

import { useTranslation } from 'react-i18next'
import EmptyState from '../../components/EmptyState'
import { toIntlLocale } from '../../i18n'
import { formatDateTime } from '../weather/format'
import RiskDiseaseBlock from './RiskDiseaseBlock'
import { useVineyardRisk } from './useVineyardRisk'

interface RiskPanelProps {
  vineyardId: number
}

function RiskPanel({ vineyardId }: RiskPanelProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const risk = useVineyardRisk(vineyardId)

  if (!risk) {
    return (
      <div className="risk-panel">
        <EmptyState
          icon="weather"
          title={t('risk.noWeatherData')}
          description={t('risk.noWeatherDataHint')}
          actionTo="/weather"
          actionLabel={t('risk.downloadForecast')}
        />
      </div>
    )
  }

  return (
    <div className="risk-panel">
      <p className="risk-updated">{t('risk.updatedFrom', { datetime: formatDateTime(risk.fetchedAt, locale) })}</p>
      {risk.seasonEventCount !== undefined && (
        <p className="risk-updated">{t('risk.seasonEvents', { count: risk.seasonEventCount })}</p>
      )}
      {risk.lastSeasonSync && !risk.lastSeasonSync.ok && (
        <p className="risk-sync-warning">
          {t('risk.seasonSyncStale', { datetime: formatDateTime(risk.lastSeasonSync.syncedAt, locale) })}
        </p>
      )}
      <RiskDiseaseBlock
        title={t('risk.downyPrimary')}
        results={risk.primary}
        daysSinceSpray={risk.daysSinceDownySpray}
        sprayWarning={risk.downySprayWarning}
      />
      {risk.secondaryActive && (
        <RiskDiseaseBlock
          title={t('risk.downySecondary')}
          results={risk.secondary}
          daysSinceSpray={risk.daysSinceDownySpray}
          showStatus
        />
      )}
      <RiskDiseaseBlock
        title={t('risk.powdery')}
        results={risk.powdery}
        daysSinceSpray={risk.daysSincePowderySpray}
        sprayWarning={risk.powderySprayWarning}
      />
    </div>
  )
}

export default RiskPanel
