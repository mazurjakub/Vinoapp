/**
 * File: RevokedEventsList.tsx
 * Created: 2026-10-31
 * Description: Journal section with infection events revoked after their weather data was refined.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../db'
import { toIntlLocale } from '../../i18n'
import { listRevokedInfectionEvents } from '../risk/infectionEventsRepo'
import { formatDate, formatTimestampDate } from '../weather/format'

interface RevokedEventsListProps {
  vineyardId: number
}

function RevokedEventsList({ vineyardId }: RevokedEventsListProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const events = useLiveQuery(() => listRevokedInfectionEvents(vineyardId), [vineyardId])
  const vineyard = useLiveQuery(() => db.vineyards.get(vineyardId), [vineyardId])

  if (!events?.length) return null

  return (
    <div className="journal-section">
      <h2>{t('journal.revokedEvents.title')}</h2>
      <ul className="journal-list">
        {events.map((event) => (
          <li key={event.id}>
            <div className="journal-entry-main">
              <strong>{formatDate(event.date, locale)}</strong>
              <span>{t('weatherChart.primaryEvent')}</span>
            </div>
            {vineyard && <p className="journal-entry-detail">{t('journal.revokedEvents.plot', { name: vineyard.name })}</p>}
            <p className="journal-entry-detail">
              {t('journal.revokedEvents.revokedOn', {
                date: formatTimestampDate(event.revokedAt ?? event.updatedAt, locale),
              })}{' '}
              {event.revokedReason && t(`journal.revokedEvents.reasons.${event.revokedReason}`)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default RevokedEventsList
