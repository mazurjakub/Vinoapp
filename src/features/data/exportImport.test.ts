/**
 * File: exportImport.test.ts
 * Created: 2026-10-20
 * Description: Tests the export payload and the import round trip.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import type { Harvest } from '../../db/schema'
import { buildExportPayload, EXPORT_FORMAT, EXPORT_SCHEMA_VERSION, type ExportPayload } from './exportRepo'
import { importData, isExportPayload } from './importRepo'

const VINEYARD_ID = 333000111

async function cleanup() {
  await db.vineyards.where('id').equals(VINEYARD_ID).delete()
  await db.works.where('vineyardId').equals(VINEYARD_ID).delete()
  await db.sprays.where('vineyardId').equals(VINEYARD_ID).delete()
  await db.harvests.where('vineyardId').equals(VINEYARD_ID).delete()
}

afterEach(cleanup)

describe('export/import round trip', () => {
  it('recognizes a valid payload and rejects garbage', () => {
    expect(
      isExportPayload({
        format: EXPORT_FORMAT,
        schemaVersion: EXPORT_SCHEMA_VERSION,
        tables: { vineyards: [], varieties: [], growthStages: [], sprays: [], works: [], harvests: [], infectionEvents: [], settings: [] },
      }),
    ).toBe(true)
    expect(isExportPayload({ format: 'something-else', schemaVersion: 1, tables: {} })).toBe(false)
    expect(isExportPayload(null)).toBe(false)
    expect(isExportPayload('not an object')).toBe(false)
    expect(isExportPayload({ format: EXPORT_FORMAT, tables: { vineyards: 'not-an-array' } })).toBe(false)
    expect(
      isExportPayload({ format: EXPORT_FORMAT, tables: { vineyards: [], varieties: [], growthStages: [], sprays: [], works: [], harvests: [], infectionEvents: [], settings: [] } }),
    ).toBe(false) // missing schemaVersion
  })

  it('gives an event from an older export the active status', async () => {
    const payload = await buildExportPayload()
    const old = { vineyardId: VINEYARD_ID, date: '2026-05-01', disease: 'downy', type: 'primary', rule: 'test', createdAt: 'x', updatedAt: 'x' }
    await importData({ ...payload, tables: { ...payload.tables, infectionEvents: [old as never] } })
    try {
      expect((await db.infectionEvents.toArray())[0].status).toBe('active')
    } finally {
      await db.infectionEvents.clear()
    }
  })

  it('exports numbers with a decimal point, whatever the UI language', async () => {
    const now = new Date().toISOString()
    await db.vineyards.put({
      id: VINEYARD_ID,
      name: 'Export number test',
      lat: 49.1,
      lon: 17.2,
      regionProfile: 'cz-morava',
      varietyId: 1,
      plantedYear: 2021,
      createdAt: now,
      updatedAt: now,
    })
    const json = JSON.stringify(await buildExportPayload())
    expect(json).toContain('"lat":49.1')
  })

  it('preserves vineyard data and a photo blob through export then import', async () => {
    const now = new Date().toISOString()
    await db.vineyards.put({
      id: VINEYARD_ID,
      name: 'Export test',
      lat: 49.1,
      lon: 17.2,
      regionProfile: 'cz-morava',
      varietyId: 1,
      plantedYear: 2021,
      createdAt: now,
      updatedAt: now,
    })
    const photoBlob = new Blob(['fake-image-bytes'], { type: 'image/png' })
    await db.works.add({
      vineyardId: VINEYARD_ID,
      datetime: '2026-05-01T10:00',
      type: 'pruning',
      notes: 'test note',
      photoBlob,
      createdAt: now,
      updatedAt: now,
    })
    await db.sprays.add({
      vineyardId: VINEYARD_ID,
      datetime: '2026-05-02T08:00',
      product: 'Test product',
      activeSubstance: 'test',
      dose: '1 l/ha',
      target: 'downy',
      createdAt: now,
      updatedAt: now,
    })

    const payload = await buildExportPayload()
    expect(payload.format).toBe(EXPORT_FORMAT)
    expect(payload.tables.vineyards.some((v) => v.id === VINEYARD_ID)).toBe(true)
    const exportedWork = payload.tables.works.find((w) => w.vineyardId === VINEYARD_ID)
    expect(typeof exportedWork?.photoBlob).toBe('string')
    expect(exportedWork?.photoBlob).toMatch(/^data:/)

    await cleanup()
    expect(await db.vineyards.get(VINEYARD_ID)).toBeUndefined()

    await importData(payload)

    const restoredVineyard = await db.vineyards.get(VINEYARD_ID)
    expect(restoredVineyard?.name).toBe('Export test')

    const restoredWork = await db.works.where('vineyardId').equals(VINEYARD_ID).first()
    expect(restoredWork?.notes).toBe('test note')
    expect(restoredWork?.photoBlob).toBeInstanceOf(Blob)
    expect(restoredWork?.photoBlob?.type).toBe('image/png')
    const restoredText = await restoredWork?.photoBlob?.text()
    expect(restoredText).toBe('fake-image-bytes')

    const restoredSpray = await db.sprays.where('vineyardId').equals(VINEYARD_ID).first()
    expect(restoredSpray?.product).toBe('Test product')
  })

  it('normalizes an older export file that still has harvests.sugarOe', async () => {
    const now = new Date().toISOString()
    await db.vineyards.put({
      id: VINEYARD_ID,
      name: 'Export test',
      lat: 49.1,
      lon: 17.2,
      regionProfile: 'cz-morava',
      varietyId: 1,
      plantedYear: 2021,
      createdAt: now,
      updatedAt: now,
    })

    const legacyHarvest = {
      vineyardId: VINEYARD_ID,
      year: 2024,
      date: '2024-09-20',
      weightKg: 150,
      sugarOe: 88,
      createdAt: now,
      updatedAt: now,
    } as unknown as Harvest

    const payload: ExportPayload = {
      format: EXPORT_FORMAT,
      schemaVersion: 1,
      exportedAt: now,
      tables: {
        vineyards: [
          {
            id: VINEYARD_ID,
            name: 'Export test',
            lat: 49.1,
            lon: 17.2,
            regionProfile: 'cz-morava',
            varietyId: 1,
            plantedYear: 2021,
            createdAt: now,
            updatedAt: now,
          },
        ],
        varieties: [],
        growthStages: [],
        sprays: [],
        works: [],
        harvests: [legacyHarvest],
        infectionEvents: [],
        settings: [],
      },
    }

    await importData(payload)

    const restored = await db.harvests.where('vineyardId').equals(VINEYARD_ID).first()
    expect(restored?.sugar).toBe(88)
    expect(restored?.sugarUnit).toBe('Oe')
    expect((restored as unknown as Record<string, unknown>)?.sugarOe).toBeUndefined()
  })

  it('excludes derived rule-engine state from the export (whitelist, not blacklist)', async () => {
    const now = new Date().toISOString()
    await db.vineyards.put({
      id: VINEYARD_ID,
      name: 'Export test',
      lat: 49.1,
      lon: 17.2,
      regionProfile: 'cz-morava',
      varietyId: 1,
      plantedYear: 2021,
      createdAt: now,
      updatedAt: now,
    })
    await db.settings.bulkPut([
      { key: 'sprayWarningDays', value: 14 },
      { key: 'sugarUnit', value: 'Oe' },
      { key: `goidanichState:${VINEYARD_ID}:2026`, value: { state: {}, lastProcessedDate: '2026-05-01' } },
      { key: `gublerThomasState:${VINEYARD_ID}:2026`, value: { state: {}, lastProcessedDate: '2026-05-01' } },
      { key: `degreeSum:${VINEYARD_ID}:2026:cz-morava`, value: { state: 42, lastProcessedDate: '2026-05-01' } },
      { key: `daySource:${VINEYARD_ID}:2026`, value: {} },
      { key: `lastSeasonSync:${VINEYARD_ID}`, value: { ok: true } },
    ])

    const payload = await buildExportPayload()
    const exportedKeys = payload.tables.settings.map((s) => s.key)

    expect(exportedKeys).toEqual(expect.arrayContaining(['sprayWarningDays', 'sugarUnit']))
    expect(exportedKeys.some((k) => k.startsWith('goidanichState:'))).toBe(false)
    expect(exportedKeys.some((k) => k.startsWith('gublerThomasState:'))).toBe(false)
    expect(exportedKeys.some((k) => k.startsWith('degreeSum:'))).toBe(false)
    expect(exportedKeys.some((k) => k.startsWith('daySource:'))).toBe(false)
    expect(exportedKeys.some((k) => k.startsWith('lastSeasonSync:'))).toBe(false)

    await db.settings
      .where('key')
      .anyOf([
        'sprayWarningDays',
        'sugarUnit',
        `goidanichState:${VINEYARD_ID}:2026`,
        `gublerThomasState:${VINEYARD_ID}:2026`,
        `degreeSum:${VINEYARD_ID}:2026:cz-morava`,
        `daySource:${VINEYARD_ID}:2026`,
        `lastSeasonSync:${VINEYARD_ID}`,
      ])
      .delete()
  })

  it('round-trips user settings through export then import unchanged', async () => {
    await db.settings.put({ key: 'sprayWarningDays', value: 7 })
    const payload = await buildExportPayload()

    await db.settings.where('key').equals('sprayWarningDays').delete()
    expect(await db.settings.where('key').equals('sprayWarningDays').first()).toBeUndefined()

    await importData(payload)

    const restored = await db.settings.where('key').equals('sprayWarningDays').first()
    expect(restored?.value).toBe(7)
  })

  it('drops derived risk state and snapshots on import so the next sync rebuilds them', async () => {
    const now = new Date().toISOString()
    await db.dailyRisk.add({ vineyardId: VINEYARD_ID, date: '2026-05-01', source: 'forecast', meanTempC: 15 })
    await db.settings.put({ key: `goidanichState:${VINEYARD_ID}:2026`, value: { state: {}, lastProcessedDate: '2026-05-01' } })

    const payload: ExportPayload = {
      format: EXPORT_FORMAT,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: now,
      tables: {
        vineyards: [],
        varieties: [],
        growthStages: [],
        sprays: [],
        works: [],
        harvests: [],
        infectionEvents: [],
        settings: [{ key: 'sprayWarningDays', value: 10 }],
      },
    }
    await importData(payload)

    expect(await db.dailyRisk.count()).toBe(0)
    expect(await db.settings.where('key').equals(`goidanichState:${VINEYARD_ID}:2026`).first()).toBeUndefined()
    expect(await db.settings.where('key').equals('sprayWarningDays').first()).toBeDefined()
  })

  it('discards a derived or unrecognized settings key present in the payload itself, same whitelist as export', async () => {
    const now = new Date().toISOString()
    const payload: ExportPayload = {
      format: EXPORT_FORMAT,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: now,
      tables: {
        vineyards: [],
        varieties: [],
        growthStages: [],
        sprays: [],
        works: [],
        harvests: [],
        infectionEvents: [],
        settings: [
          { key: 'sprayWarningDays', value: 10 },
          // An old export made before the export whitelist existed, or a
          // hand-edited file — either way, not something to import.
          { key: `goidanichState:${VINEYARD_ID}:2026`, value: { state: {}, lastProcessedDate: '2026-05-01' } },
          { key: 'someUnrecognizedKey', value: 'anything' },
        ],
      },
    }
    await importData(payload)

    expect(await db.settings.where('key').equals('sprayWarningDays').first()).toBeDefined()
    expect(await db.settings.where('key').equals(`goidanichState:${VINEYARD_ID}:2026`).first()).toBeUndefined()
    expect(await db.settings.where('key').equals('someUnrecognizedKey').first()).toBeUndefined()
  })
})
