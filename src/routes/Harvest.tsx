/**
 * File: Harvest.tsx
 * Created: 2026-10-03
 * Description: Harvest page for the selected plot.
 */

import { useTranslation } from 'react-i18next'
import EmptyState from '../components/EmptyState'
import HarvestList from '../features/harvest/HarvestList'
import { useSelectedVineyard } from '../state/useSelectedVineyard'

function Harvest() {
  const { t } = useTranslation()
  const { selectedVineyardId } = useSelectedVineyard()

  if (!selectedVineyardId) {
    return (
      <section>
        <h1>{t('harvest.title')}</h1>
        <EmptyState
          icon="plot"
          title={t('noVineyard.title')}
          description={t('harvest.noVineyardPrompt')}
          actionTo="/"
          actionLabel={t('noVineyard.action')}
        />
      </section>
    )
  }

  return (
    <section>
      <HarvestList vineyardId={selectedVineyardId} />
    </section>
  )
}

export default Harvest
