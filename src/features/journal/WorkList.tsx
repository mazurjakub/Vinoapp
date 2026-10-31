/**
 * File: WorkList.tsx
 * Created: 2026-10-03
 * Description: Journal section that lists work records with photos and adds new ones.
 */

import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { toIntlLocale } from '../../i18n'
import { formatDateTime } from '../weather/format'
import WorkForm from './WorkForm'
import { addWork, deleteWork, listWorksForVineyard } from './worksRepo'

function PhotoThumbnail({ blob }: { blob: Blob }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob])

  useEffect(() => {
    return () => URL.revokeObjectURL(url)
  }, [url])

  return <img src={url} alt="" className="journal-entry-photo" />
}

interface WorkListProps {
  vineyardId: number
}

function WorkList({ vineyardId }: WorkListProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const works = useLiveQuery(() => listWorksForVineyard(vineyardId), [vineyardId])
  const [creating, setCreating] = useState(false)

  return (
    <div className="journal-section">
      <h2>{t('journal.works.title')}</h2>
      {creating ? (
        <WorkForm
          vineyardId={vineyardId}
          onCancel={() => setCreating(false)}
          onSubmit={async (input) => {
            await addWork(input)
            setCreating(false)
          }}
        />
      ) : (
        <button type="button" className="add-vineyard-button" onClick={() => setCreating(true)}>
          <span className="add-vineyard-icon" aria-hidden="true" />
          {t('journal.works.add')}
        </button>
      )}
      <ul className="journal-list">
        {works?.map((work) => (
          <li key={work.id}>
            <div className="journal-entry-main">
              <strong>{formatDateTime(work.datetime, locale)}</strong>
              <span>{t(`journal.works.types.${work.type}`)}</span>
            </div>
            {work.notes && <p className="journal-entry-notes">{work.notes}</p>}
            {work.photoBlob && <PhotoThumbnail blob={work.photoBlob} />}
            <button type="button" className="btn-link" onClick={() => work.id && deleteWork(work.id)}>
              {t('vineyard.delete')}
            </button>
          </li>
        ))}
        {works?.length === 0 && <li className="empty">{t('journal.works.empty')}</li>}
      </ul>
    </div>
  )
}

export default WorkList
