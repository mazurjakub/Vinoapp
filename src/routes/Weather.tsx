/**
 * File: Weather.tsx
 * Created: 2026-10-20
 * Description: Weather page with the forecast status, chart and hourly table.
 */

import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import EmptyState from '../components/EmptyState'
import { toIntlLocale } from '../i18n'
import { formatWithUnit } from '../i18n/formatNumber'
import { useWeather } from '../features/weather/useWeather'
import DevFixtureButton from '../features/weatherChart/DevFixtureButton'
import { formatDateTime, formatDay, formatHour, localHourKey } from '../features/weather/format'
import { useSelectedVineyard } from '../state/useSelectedVineyard'

// Loaded on demand so the chart code stays out of the main bundle.
const WeatherChart = lazy(() => import('../features/weatherChart/WeatherChart'))

function Weather() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const { selectedVineyardId, vineyards } = useSelectedVineyard()
  const vineyard = vineyards.find((v) => v.id === selectedVineyardId)
  const { cache, refresh, refreshing, failed } = useWeather(vineyard)

  if (!vineyard) {
    return (
      <section>
        <h1>{t('weather.title')}</h1>
        <DevFixtureButton />
        <EmptyState
          icon="plot"
          title={t('noVineyard.title')}
          description={t('weather.noVineyardPrompt')}
          actionTo="/"
          actionLabel={t('noVineyard.action')}
        />
      </section>
    )
  }

  const hourly = cache?.hourly ?? []
  const nowKey = localHourKey(new Date())
  const startIndex = hourly.findIndex((h) => h.time.slice(0, 13) >= nowKey)
  const upcoming = hourly.slice(startIndex === -1 ? 0 : startIndex, (startIndex === -1 ? 0 : startIndex) + 48)

  return (
    <section>
      <h1>{t('weather.title')}</h1>
      <DevFixtureButton />
      <p className="vineyard-meta">{vineyard.name}</p>
      <div className="weather-status">
        <span>
          {cache
            ? t('weather.forecastFrom', { datetime: formatDateTime(cache.fetchedAt, locale) })
            : t('weather.noData')}
        </span>
        <button type="button" onClick={() => void refresh()} disabled={refreshing}>
          {refreshing ? t('weather.updating') : cache ? t('weather.updateForecast') : t('weather.loadForecast')}
        </button>
      </div>
      {failed && (
        <p className="form-error">
          {t('weather.fetchFailed')} {cache && t('weather.lastDataShown')}
        </p>
      )}
      {vineyard.id !== undefined && (
        <Suspense fallback={<p className="empty">{t('weatherChart.loading')}</p>}>
          <WeatherChart vineyardId={vineyard.id} />
        </Suspense>
      )}
      {upcoming.length > 0 && (
        <details className="table-toggle">
          <summary>{t('weather.hourlyTitle', { count: upcoming.length })}</summary>
          <div className="weather-table-wrap">
            <table className="weather-table">
              <thead>
                <tr>
                  <th>{t('weather.columns.day')}</th>
                  <th>{t('weather.columns.hour')}</th>
                  <th>{t('weather.columns.temperature')}</th>
                  <th>{t('weather.columns.humidity')}</th>
                  <th>{t('weather.columns.dewPoint')}</th>
                  <th>{t('weather.columns.precipitation')}</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((h) => (
                  <tr key={h.time} className={h.time.slice(0, 13) === nowKey ? 'current-hour' : ''}>
                    <td>{formatDay(h.time, locale)}</td>
                    <td>{formatHour(h.time)}</td>
                    <td>{formatWithUnit(h.temperature2m, '°C', locale, 1)}</td>
                    <td>{formatWithUnit(h.relativeHumidity2m, '%', locale, 0)}</td>
                    <td>{formatWithUnit(h.dewPoint2m, '°C', locale, 1)}</td>
                    <td>{formatWithUnit(h.precipitation, 'mm', locale, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  )
}

export default Weather
