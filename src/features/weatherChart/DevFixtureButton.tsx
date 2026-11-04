/**
 * File: DevFixtureButton.tsx
 * Created: 2026-10-20
 * Description: Development-only buttons that add or remove the synthetic chart data.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { deleteWeatherChartDevFixture, seedWeatherChartDevFixture, type DevFixtureVariant } from './devFixture'

const VARIANTS: DevFixtureVariant[] = ['active', 'cold', 'offSeason']

/**
 * Dev-only control: seeds (or removes) a synthetic spring/summer season into
 * a dedicated "DEV fixture" vineyard, so the chart's layout can be checked
 * against real variety (forecast boundary, a null Goidanich gap, a
 * Gubler-Thomas ramp) without a real weather fetch and without ever
 * touching the user's own vineyards. `import.meta.env.DEV` is replaced with
 * `false` in a production build, so Vite drops this whole component as dead
 * code — it never reaches the shipped bundle.
 */
function DevFixtureButton() {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<DevFixtureVariant | 'delete' | null>(null)
  if (!import.meta.env.DEV) return null

  return (
    <div className="dev-fixture-panel">
      <span className="dev-fixture-label">DEV</span>
      {VARIANTS.map((variant) => (
        <button
          key={variant}
          type="button"
          disabled={busy !== null}
          onClick={() => {
            setBusy(variant)
            void seedWeatherChartDevFixture(variant).finally(() => setBusy(null))
          }}
        >
          {busy === variant ? '…' : t(`weatherChart.dev.${variant}`)}
        </button>
      ))}
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => {
          setBusy('delete')
          void deleteWeatherChartDevFixture().finally(() => setBusy(null))
        }}
      >
        {busy === 'delete' ? '…' : t('weatherChart.dev.delete')}
      </button>
    </div>
  )
}

export default DevFixtureButton
