/**
 * File: smoke.test.tsx
 * Created: 2026-10-31
 * Description: Checks that the main pages render without crashing on an empty and a filled database.
 * @vitest-environment jsdom
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { db } from '../db'
import type { HourlyWeather } from '../db/schema'
import { saveWeatherCache } from '../features/weather/weatherCacheRepo'
import { localDateKey } from '../features/weather/format'
import '../i18n'
import { addDaysUTC } from '../rules'
import { SelectedVineyardProvider } from '../state/SelectedVineyardContext'

const PAGES = [
  { path: '/', title: 'Přehled' },
  { path: '/pocasi', title: 'Počasí' },
  { path: '/denik', title: 'Deník' },
  { path: '/uroda', title: 'Úroda' },
  { path: '/nastaveni', title: 'Nastavení' },
]

const PLOT_NAME = 'Testovací parcela'
const today = localDateKey(new Date())

/** Gives the charts a size, which jsdom doesn't have, so they really draw. */
class SizedResizeObserver {
  private readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }

  observe(target: Element) {
    const entry = { target, contentRect: { width: 360, height: 190 } } as unknown as ResizeObserverEntry
    this.callback([entry], this as unknown as ResizeObserver)
  }

  unobserve() {}
  disconnect() {}
}

function hoursFor(from: number, to: number): HourlyWeather[] {
  const hours: HourlyWeather[] = []
  for (let offset = from; offset <= to; offset++) {
    const date = addDaysUTC(today, offset)
    for (let hour = 0; hour < 24; hour++) {
      hours.push({
        time: `${date}T${String(hour).padStart(2, '0')}:00`,
        temperature2m: 16,
        relativeHumidity2m: 70,
        dewPoint2m: 9,
        precipitation: 0,
      })
    }
  }
  return hours
}

async function fillDatabase() {
  const now = new Date().toISOString()
  const stamps = { createdAt: now, updatedAt: now }
  const varietyId = await db.varieties.add({
    name: 'Ryzlink',
    isPiwi: false,
    susceptibility: { downy: 'medium', powdery: 'medium', botrytis: 'medium' },
    stageOffsetDays: 0,
    ...stamps,
  })
  const vineyardId = await db.vineyards.add({
    name: PLOT_NAME,
    lat: 48.9,
    lon: 16.82,
    regionProfile: 'cz-morava',
    varietyId: varietyId as number,
    plantedYear: 2015,
    ...stamps,
  })
  const event = { vineyardId: vineyardId as number, disease: 'downy' as const, type: 'primary' as const, ...stamps }
  await db.infectionEvents.bulkAdd([
    { ...event, date: addDaysUTC(today, -3), rule: 'manual-test', status: 'active' },
    {
      ...event,
      date: addDaysUTC(today, -5),
      rule: 'downy-primary-cz-morava',
      status: 'revoked',
      revokedAt: now,
      revokedReason: 'refinedDataNotMet',
    },
  ])
  await db.sprays.add({
    vineyardId: vineyardId as number,
    datetime: `${addDaysUTC(today, -10)}T08:00`,
    product: 'Testovací přípravek',
    activeSubstance: 'test',
    dose: '1,5 l/ha',
    target: 'powdery',
    ...stamps,
  })
  await db.works.add({ vineyardId: vineyardId as number, datetime: `${addDaysUTC(today, -9)}T08:00`, type: 'pruning', ...stamps })
  // Last year's: a harvest this year would end the season and hide the incubation.
  await db.harvests.add({
    vineyardId: vineyardId as number,
    year: Number(today.slice(0, 4)) - 1,
    date: addDaysUTC(today, -370),
    weightKg: 1234.5,
    sugar: 18.5,
    sugarUnit: 'NM',
    ...stamps,
  })
  await saveWeatherCache(vineyardId as number, hoursFor(-7, 7))
}

async function renderPage(path: string, title: string) {
  const { container } = render(
    <MemoryRouter initialEntries={[path]}>
      <SelectedVineyardProvider>
        <App />
      </SelectedVineyardProvider>
    </MemoryRouter>,
  )
  await screen.findByRole('heading', { name: title })
  return container
}

/** A crash during a later update unmounts everything, so this checks after the data has loaded. */
async function expectStillRendered(title: string) {
  await new Promise((resolve) => setTimeout(resolve, 150))
  expect(screen.getByRole('heading', { name: title })).toBeTruthy()
}

describe('main pages', () => {
  const unexpectedErrors = () =>
    (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => String(call[0]))
      .filter((message) => !message.includes('not wrapped in act'))

  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', SizedResizeObserver)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(async () => {
    cleanup()
    // A sync started by the Overview may still be writing.
    await new Promise((resolve) => setTimeout(resolve, 50))
    await Promise.all(db.tables.map((table) => table.clear()))
    ;(console.error as unknown as ReturnType<typeof vi.fn>).mockClear()
  })

  describe.each(PAGES)('$title', ({ path, title }) => {
    it('renders on an empty database', async () => {
      await renderPage(path, title)
      await expectStillRendered(title)
      expect(unexpectedErrors()).toEqual([])
    })

    it('renders on a filled database with a revoked event', async () => {
      await fillDatabase()
      await renderPage(path, title)
      await expectStillRendered(title)
      expect(unexpectedErrors()).toEqual([])
    })
  })

  it('shows the revoked event in the journal with the name of its plot', async () => {
    await fillDatabase()
    await renderPage('/denik', 'Deník')
    await screen.findByRole('heading', { level: 2, name: 'Zrušené infekční události' })
    await screen.findByText(`Parcela: ${PLOT_NAME}`)
    expect(screen.getByText(/Podmínky po zpřesnění dat nesplněny/)).toBeTruthy()
  })

  it('counts only the active event on the overview', async () => {
    await fillDatabase()
    await renderPage('/', 'Přehled')
    await screen.findByText('Infekčních událostí v sezóně: 1')
  })

  it('draws the charts on the weather page, without a marker for the revoked event', async () => {
    await fillDatabase()
    const container = await renderPage('/pocasi', 'Počasí')
    await waitFor(() => expect(container.querySelectorAll('.recharts-line').length).toBeGreaterThan(0), { timeout: 3000 })
    const legend = [...container.querySelectorAll('.chart-legend li')].map((item) => item.textContent)
    expect(legend.filter((label) => label === 'Primární infekce plísně')).toHaveLength(1)
    // One in the legend and one in the chart, for the active event only.
    expect(container.querySelectorAll('polygon')).toHaveLength(2)
  })
})
