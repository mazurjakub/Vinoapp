/**
 * File: VineyardList.tsx
 * Created: 2026-10-02
 * Description: List of plot cards with selection, editing, deletion and adding.
 */

import { useState, type MouseEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { toIntlLocale } from '../../i18n'
import { formatNumber } from '../../i18n/formatNumber'
import GrowthStageEditor from '../growthStage/GrowthStageEditor'
import VineyardForm from './VineyardForm'
import { listVarieties } from '../varieties/varietiesRepo'
import { useSelectedVineyard } from '../../state/useSelectedVineyard'
import { createVineyard, deleteVineyard, listVineyards, updateVineyard } from './vineyardsRepo'

function VineyardList() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const vineyards = useLiveQuery(() => listVineyards(), [])
  const varieties = useLiveQuery(() => listVarieties(), [])
  const varietyNameById = new Map((varieties ?? []).map((v) => [v.id, v.name]))
  const { selectedVineyardId, setSelectedVineyardId } = useSelectedVineyard()
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)

  const handleDelete = async (id: number) => {
    const confirmed = window.confirm(t('vineyard.deleteConfirm'))
    if (!confirmed) return
    await deleteVineyard(id)
  }

  const stop = (event: MouseEvent) => event.stopPropagation()

  const selected = vineyards?.find((v) => v.id === selectedVineyardId) ?? vineyards?.[0]
  const visibleVineyards =
    !vineyards || showAll || vineyards.length <= 1 ? vineyards : selected ? [selected] : []

  return (
    <div className="vineyard-list">
      {visibleVineyards?.map((vineyard) => (
        <div
          key={vineyard.id}
          className={`vineyard-card${vineyard.id === selectedVineyardId ? ' selected' : ''}`}
          onClick={() => vineyard.id && setSelectedVineyardId(vineyard.id)}
          role="button"
          tabIndex={0}
        >
          {editingId === vineyard.id ? (
            <div onClick={stop}>
              <VineyardForm
                initial={vineyard}
                onCancel={() => setEditingId(null)}
                onSubmit={async (input) => {
                  await updateVineyard(vineyard.id!, input)
                  setEditingId(null)
                }}
              />
            </div>
          ) : (
            <>
              <div className="vineyard-card-header">
                <strong>{vineyard.name}</strong>
                <span>{varietyNameById.get(vineyard.varietyId) ?? ''}</span>
              </div>
              <p className="vineyard-meta">
                {t('vineyard.plantedIn', { year: vineyard.plantedYear })} ·{' '}
                {formatNumber(vineyard.lat, locale, 5)}; {formatNumber(vineyard.lon, locale, 5)}
              </p>
              <div className="vineyard-card-actions">
                <button
                  type="button"
                  onClick={(e) => {
                    stop(e)
                    setEditingId(vineyard.id!)
                  }}
                >
                  {t('vineyard.edit')}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={(e) => {
                    stop(e)
                    setExpandedId(expandedId === vineyard.id ? null : vineyard.id!)
                  }}
                >
                  {expandedId === vineyard.id ? t('vineyard.hideGrowthStage') : t('vineyard.growthStage')}
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={(e) => {
                    stop(e)
                    if (vineyard.id) void handleDelete(vineyard.id)
                  }}
                >
                  {t('vineyard.delete')}
                </button>
              </div>
              {expandedId === vineyard.id && (
                <div onClick={stop}>
                  <GrowthStageEditor vineyardId={vineyard.id!} />
                </div>
              )}
            </>
          )}
        </div>
      ))}
      {(showAll || !vineyards || vineyards.length <= 1) &&
        (creating ? (
          <div className="vineyard-card">
            <VineyardForm
              onCancel={() => setCreating(false)}
              onSubmit={async (input) => {
                const id = await createVineyard(input)
                setSelectedVineyardId(id)
                setCreating(false)
              }}
            />
          </div>
        ) : (
          <button type="button" className="add-vineyard-button" onClick={() => setCreating(true)}>
            <span className="add-vineyard-icon" aria-hidden="true" />
            {t('vineyard.addVineyard')}
          </button>
        ))}
      {vineyards && vineyards.length > 1 && (
        <button
          type="button"
          className="btn-secondary show-all-button"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? t('vineyard.hideOthers') : t('vineyard.showAll', { count: vineyards.length })}
        </button>
      )}
    </div>
  )
}

export default VineyardList
