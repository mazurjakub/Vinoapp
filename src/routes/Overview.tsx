/**
 * File: Overview.tsx
 * Created: 2026-10-03
 * Description: Overview page with the plots and disease risk.
 */

import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import RiskPanel from '../features/risk/RiskPanel'
import VineyardList from '../features/vineyards/VineyardList'
import { useSelectedVineyard } from '../state/useSelectedVineyard'

function Overview() {
  const { t } = useTranslation()
  const { selectedVineyardId } = useSelectedVineyard()

  return (
    <section>
      <h1>{t('overview.title')}</h1>
      <VineyardList />
      {selectedVineyardId && <RiskPanel vineyardId={selectedVineyardId} />}
      {selectedVineyardId && (
        <p>
          <Link to="/plan-pece">{t('overview.carePlanLink')}</Link>
        </p>
      )}
    </section>
  )
}

export default Overview
