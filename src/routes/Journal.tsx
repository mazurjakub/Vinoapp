/**
 * File: Journal.tsx
 * Created: 2026-10-03
 * Description: Journal page with sprays and work for the selected plot.
 */

import { useTranslation } from 'react-i18next'
import EmptyState from '../components/EmptyState'
import RevokedEventsList from '../features/journal/RevokedEventsList'
import SprayList from '../features/journal/SprayList'
import WorkList from '../features/journal/WorkList'
import { useSelectedVineyard } from '../state/useSelectedVineyard'

function Journal() {
  const { t } = useTranslation()
  const { selectedVineyardId } = useSelectedVineyard()

  if (!selectedVineyardId) {
    return (
      <section>
        <h1>{t('journal.title')}</h1>
        <EmptyState
          icon="plot"
          title={t('noVineyard.title')}
          description={t('journal.noVineyardPrompt')}
          actionTo="/"
          actionLabel={t('noVineyard.action')}
        />
      </section>
    )
  }

  return (
    <section>
      <h1>{t('journal.title')}</h1>
      <SprayList vineyardId={selectedVineyardId} />
      <WorkList vineyardId={selectedVineyardId} />
      <RevokedEventsList vineyardId={selectedVineyardId} />
    </section>
  )
}

export default Journal
