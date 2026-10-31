/**
 * File: SprayList.tsx
 * Created: 2026-10-03
 * Description: Journal section that lists spray records and adds new ones.
 */

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { toIntlLocale } from '../../i18n'
import { formatDateTime } from '../weather/format'
import SprayForm from './SprayForm'
import { addSpray, deleteSpray, listSpraysForVineyard } from './spraysRepo'

interface SprayListProps {
  vineyardId: number
}

function SprayList({ vineyardId }: SprayListProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const sprays = useLiveQuery(() => listSpraysForVineyard(vineyardId), [vineyardId])
  const [creating, setCreating] = useState(false)

  return (
    <div className="journal-section">
      <h2>{t('journal.sprays.title')}</h2>
      {creating ? (
        <SprayForm
          vineyardId={vineyardId}
          onCancel={() => setCreating(false)}
          onSubmit={async (input) => {
            await addSpray(input)
            setCreating(false)
          }}
        />
      ) : (
        <button type="button" className="add-vineyard-button" onClick={() => setCreating(true)}>
          <span className="add-vineyard-icon" aria-hidden="true" />
          {t('journal.sprays.add')}
        </button>
      )}
      <ul className="journal-list">
        {sprays?.map((spray) => (
          <li key={spray.id}>
            <div className="journal-entry-main">
              <strong>{formatDateTime(spray.datetime, locale)}</strong>
              <span>{t(`journal.sprays.targets.${spray.target}`)}</span>
            </div>
            <p className="journal-entry-detail">
              {spray.product} ({spray.activeSubstance}) — {spray.dose}
            </p>
            {spray.notes && <p className="journal-entry-notes">{spray.notes}</p>}
            <button type="button" className="btn-link" onClick={() => spray.id && deleteSpray(spray.id)}>
              {t('vineyard.delete')}
            </button>
          </li>
        ))}
        {sprays?.length === 0 && <li className="empty">{t('journal.sprays.empty')}</li>}
      </ul>
    </div>
  )
}

export default SprayList
