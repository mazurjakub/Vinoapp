/**
 * File: HarvestList.tsx
 * Created: 2026-10-03
 * Description: Harvest page content: yearly summary, chart, records and the add form.
 */

import { lazy, Suspense, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../weather/format'
import { toIntlLocale } from '../../i18n'
import { formatWithUnit } from '../../i18n/formatNumber'
import HarvestForm from './HarvestForm'

// Chart code is loaded on demand, outside the main bundle.
const HarvestBarChart = lazy(() => import('./HarvestBarChart'))
import { summarizeHarvestsByYear } from './harvestSummary'
import { addHarvest, deleteHarvest, listHarvestsForVineyard } from './harvestsRepo'

interface HarvestListProps {
  vineyardId: number
}

const SUGAR_UNIT_LABEL: Record<'NM' | 'Oe', string> = { NM: '°NM', Oe: '°Oe' }

function formatChangePct(pct: number, locale: string): string {
  const rounded = Math.round(pct * 10) / 10
  return `${rounded > 0 ? '+' : ''}${formatWithUnit(rounded, '%', locale)}`
}

function HarvestList({ vineyardId }: HarvestListProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const harvests = useLiveQuery(() => listHarvestsForVineyard(vineyardId), [vineyardId])
  const [creating, setCreating] = useState(false)

  const yearSummaries = summarizeHarvestsByYear(harvests ?? [])

  return (
    <div className="journal-section">
      <h2>{t('harvest.title')}</h2>

      {yearSummaries.length > 0 && (
        <Suspense fallback={<p className="empty">{t('harvest.chart.loading')}</p>}>
          <HarvestBarChart summaries={yearSummaries} />
        </Suspense>
      )}

      {yearSummaries.length > 0 && (
        <div className="harvest-summary-table-wrap">
          <table className="harvest-summary-table">
            <thead>
              <tr>
                <th>{t('harvest.summary.year')}</th>
                <th>{t('harvest.summary.weightKg')}</th>
                <th>{t('harvest.summary.sugar')}</th>
              </tr>
            </thead>
            <tbody>
              {yearSummaries.map((summary) => (
                <tr key={summary.year}>
                  <td>{summary.year}</td>
                  <td>
                    {formatWithUnit(summary.totalWeightKg, 'kg', locale, 1)}
                    {summary.weightChangePct !== undefined && (
                      <span className="harvest-summary-change"> ({formatChangePct(summary.weightChangePct, locale)})</span>
                    )}
                  </td>
                  <td>
                    {summary.avgSugar !== undefined && summary.sugarUnit
                      ? formatWithUnit(summary.avgSugar, SUGAR_UNIT_LABEL[summary.sugarUnit], locale, 1)
                      : '—'}
                    {summary.sugarChangePct !== undefined && (
                      <span className="harvest-summary-change"> ({formatChangePct(summary.sugarChangePct, locale)})</span>
                    )}
                    {summary.sugarUnitMismatch && (
                      <span className="harvest-summary-change"> ({t('harvest.summary.unitMismatch')})</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating ? (
        <HarvestForm
          vineyardId={vineyardId}
          onCancel={() => setCreating(false)}
          onSubmit={async (input) => {
            await addHarvest(input)
            setCreating(false)
          }}
        />
      ) : (
        <button type="button" className="add-vineyard-button" onClick={() => setCreating(true)}>
          <span className="add-vineyard-icon" aria-hidden="true" />
          {t('harvest.add')}
        </button>
      )}

      <ul className="journal-list">
        {harvests?.map((harvest) => (
          <li key={harvest.id}>
            <div className="journal-entry-main">
              <strong>{formatDate(harvest.date, locale)}</strong>
              <span>{formatWithUnit(harvest.weightKg, 'kg', locale, 1)}</span>
            </div>
            {harvest.sugar !== undefined && harvest.sugarUnit && (
              <p className="journal-entry-detail">
                {formatWithUnit(harvest.sugar, SUGAR_UNIT_LABEL[harvest.sugarUnit], locale, 1)}
              </p>
            )}
            {harvest.notes && <p className="journal-entry-notes">{harvest.notes}</p>}
            <button type="button" className="btn-link" onClick={() => harvest.id && deleteHarvest(harvest.id)}>
              {t('vineyard.delete')}
            </button>
          </li>
        ))}
        {harvests?.length === 0 && <li className="empty">{t('harvest.empty')}</li>}
      </ul>
    </div>
  )
}

export default HarvestList
