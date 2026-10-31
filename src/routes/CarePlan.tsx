/**
 * File: CarePlan.tsx
 * Created: 2026-10-03
 * Description: Care plan page for the selected plot.
 */

import { useTranslation } from 'react-i18next'
import EmptyState from '../components/EmptyState'
import CarePlanTimeline from '../features/carePlan/CarePlanTimeline'
import { useSelectedVineyard } from '../state/useSelectedVineyard'

function CarePlan() {
  const { t } = useTranslation()
  const { selectedVineyardId } = useSelectedVineyard()

  if (!selectedVineyardId) {
    return (
      <section>
        <h1>{t('carePlan.title')}</h1>
        <EmptyState
          icon="plot"
          title={t('noVineyard.title')}
          description={t('carePlan.noVineyardPrompt')}
          actionTo="/"
          actionLabel={t('noVineyard.action')}
        />
      </section>
    )
  }

  return (
    <section>
      <h1>{t('carePlan.title')}</h1>
      <CarePlanTimeline vineyardId={selectedVineyardId} />
    </section>
  )
}

export default CarePlan
