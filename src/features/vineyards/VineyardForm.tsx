/**
 * File: VineyardForm.tsx
 * Created: 2026-10-03
 * Description: Form for creating or editing a plot, including geolocation and the regional profile.
 */

import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../db'
import type { RegionProfileId, Vineyard } from '../../db/schema'
import { defaultRegionProfileFor } from '../../db/regionProfile'
import { toIntlLocale } from '../../i18n'
import { parseDecimal, toDecimalInput } from '../../i18n/parseDecimal'
import { REGION_PROFILES } from '../../rules'
import { resolveVarietyId } from '../varieties/varietiesRepo'
import type { VineyardInput } from './vineyardsRepo'

const REGION_PROFILE_IDS = Object.keys(REGION_PROFILES) as RegionProfileId[]

interface VineyardFormProps {
  initial?: Vineyard
  onSubmit: (input: VineyardInput) => Promise<void>
  onCancel: () => void
}

function VineyardForm({ initial, onSubmit, onCancel }: VineyardFormProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const initialVariety = useLiveQuery(
    () => (initial?.varietyId ? db.varieties.get(initial.varietyId) : undefined),
    [initial?.varietyId],
  )

  const [name, setName] = useState(initial?.name ?? '')
  const [varietyName, setVarietyName] = useState('')
  const [plantedYear, setPlantedYear] = useState(
    initial?.plantedYear ? String(initial.plantedYear) : '',
  )
  const [area, setArea] = useState(initial?.area ? toDecimalInput(initial.area, locale) : '')
  const [vineHeadCount, setVineHeadCount] = useState(
    initial?.vineHeadCount ? String(initial.vineHeadCount) : '',
  )
  const [lat, setLat] = useState(initial?.lat ? toDecimalInput(initial.lat, locale) : '')
  const [lon, setLon] = useState(initial?.lon ? toDecimalInput(initial.lon, locale) : '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [geoError, setGeoError] = useState<string | null>(null)
  const [numberError, setNumberError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [regionProfile, setRegionProfile] = useState<RegionProfileId>(
    initial?.regionProfile ?? defaultRegionProfileFor(parseDecimal(lat) ?? 0, parseDecimal(lon) ?? 0),
  )
  // Once the user picks a profile explicitly, stop overwriting it on every
  // coordinate change — otherwise typing lat/lon digit by digit would keep
  // snapping the select back to the auto-guessed value.
  const [regionManuallySet, setRegionManuallySet] = useState(Boolean(initial))

  const applyCoordinates = (nextLat: string, nextLon: string) => {
    if (!regionManuallySet) {
      setRegionProfile(defaultRegionProfileFor(parseDecimal(nextLat) ?? 0, parseDecimal(nextLon) ?? 0))
    }
  }

  // Pre-fill the variety name field once the linked variety loads (editing an existing vineyard).
  if (initialVariety && varietyName === '' && initial) {
    setVarietyName(initialVariety.name)
  }

  const useGeolocation = () => {
    setGeoError(null)
    if (!navigator.geolocation) {
      setGeoError(t('vineyard.form.geolocationUnavailable'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLat = toDecimalInput(Number(position.coords.latitude.toFixed(6)), locale)
        const nextLon = toDecimalInput(Number(position.coords.longitude.toFixed(6)), locale)
        setLat(nextLat)
        setLon(nextLon)
        applyCoordinates(nextLat, nextLon)
      },
      () => setGeoError(t('vineyard.form.geolocationFailed')),
    )
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const latNum = parseDecimal(lat)
    const lonNum = parseDecimal(lon)
    const areaNum = area.trim() ? parseDecimal(area) : undefined
    if (latNum === null || lonNum === null || areaNum === null) {
      setNumberError(t('common.invalidNumber'))
      return
    }
    if (Math.abs(latNum) > 90 || Math.abs(lonNum) > 180) {
      setNumberError(t('vineyard.form.invalidCoordinates'))
      return
    }
    setNumberError(null)
    setSubmitting(true)
    try {
      const varietyId = await resolveVarietyId(varietyName)
      await onSubmit({
        name: name.trim(),
        varietyId,
        regionProfile,
        plantedYear: Number(plantedYear),
        lat: latNum,
        lon: lonNum,
        area: areaNum,
        vineHeadCount: vineHeadCount ? Number(vineHeadCount) : undefined,
        notes: notes.trim() || undefined,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="vineyard-form" onSubmit={handleSubmit}>
      <label>
        {t('vineyard.form.name')}
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        {t('vineyard.form.variety')}
        <input value={varietyName} onChange={(e) => setVarietyName(e.target.value)} required />
      </label>
      <div className="form-row">
        <label>
          {t('vineyard.form.plantedYear')}
          <input
            type="number"
            value={plantedYear}
            onChange={(e) => setPlantedYear(e.target.value)}
            required
          />
        </label>
        <label>
          {t('vineyard.form.area')}
          <input
            inputMode="decimal"
            value={area}
            onChange={(e) => setArea(e.target.value)}
          />
        </label>
        <label>
          {t('vineyard.form.vineHeadCount')}
          <input
            type="number"
            value={vineHeadCount}
            onChange={(e) => setVineHeadCount(e.target.value)}
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          {t('vineyard.form.lat')}
          <input
            inputMode="decimal"
            value={lat}
            onChange={(e) => {
              setLat(e.target.value)
              applyCoordinates(e.target.value, lon)
            }}
            required
          />
        </label>
        <label>
          {t('vineyard.form.lon')}
          <input
            inputMode="decimal"
            value={lon}
            onChange={(e) => {
              setLon(e.target.value)
              applyCoordinates(lat, e.target.value)
            }}
            required
          />
        </label>
      </div>
      <button type="button" className="btn-secondary" onClick={useGeolocation}>
        {t('vineyard.form.useGeolocation')}
      </button>
      {geoError && <p className="form-error">{geoError}</p>}
      <label>
        {t('vineyard.form.regionProfile')}
        <select
          value={regionProfile}
          onChange={(e) => {
            setRegionManuallySet(true)
            setRegionProfile(e.target.value as RegionProfileId)
          }}
        >
          {REGION_PROFILE_IDS.map((id) => (
            <option key={id} value={id}>
              {t(`vineyard.form.regionProfileOptions.${id}`)}
            </option>
          ))}
        </select>
      </label>
      <p className="growth-stage-hint">
        {t(
          REGION_PROFILES[regionProfile].verified === 'verified-partial'
            ? 'vineyard.form.regionProfileVerifiedHint'
            : 'vineyard.form.regionProfileGenericHint',
        )}
      </p>
      <label>
        {t('vineyard.form.notes')}
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </label>
      {numberError && <p className="form-error">{numberError}</p>}
      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          {initial ? t('vineyard.save') : t('vineyard.add')}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          {t('vineyard.cancel')}
        </button>
      </div>
    </form>
  )
}

export default VineyardForm
