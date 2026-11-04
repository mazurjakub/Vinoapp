/**
 * File: carePlanSchema.test.ts
 * Created: 2026-10-03
 * Description: Tests the care plan data file and the validation of malformed plans.
 */

import { describe, expect, it } from 'vitest'
import carePlanRaw from '../../data/carePlan.cz-bio.json'
import cs from '../../i18n/locales/cs.json'
import en from '../../i18n/locales/en.json'
import { CarePlanValidationError, parseCarePlan } from './carePlanSchema'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

describe('carePlan.cz-bio.json', () => {
  const plan = parseCarePlan(carePlanRaw)

  it('has 10 stage rows covering 8 unique codes (❷ is on three rows)', () => {
    expect(plan.stages).toHaveLength(10)
    const codes = new Set(plan.stages.map((s) => s.code))
    expect(codes.size).toBe(8)
    expect([...codes].sort()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8'])
    expect(plan.stages.filter((s) => s.code === '2')).toHaveLength(3)
  })

  it('carries the 2008 metadata', () => {
    expect(plan.dataYear).toBe(2008)
  })

  it.each([
    ['cs', cs],
    ['en', en],
  ])('has %s texts for every target, stage and inspection', (_language, locale) => {
    const texts = locale.carePlanData
    for (const target of plan.targets) {
      expect(texts.targets).toHaveProperty(target.id)
    }
    for (const stage of plan.stages) {
      expect(texts.stages).toHaveProperty(stage.labelKey)
    }
    for (const inspection of plan.inspections ?? []) {
      const entry = (texts.inspections as Record<string, { description: string }>)[inspection.id]
      expect(entry.description.trim()).not.toBe('')
    }
  })

  it('leaves protectionWindows out for now', () => {
    expect(plan.protectionWindows).toBeUndefined()
  })

  it('has inspections with unique ids, known targets, BBCH and source pages', () => {
    const inspections = plan.inspections ?? []
    expect(inspections.length).toBe(14)
    expect(new Set(inspections.map((c) => c.id)).size).toBe(inspections.length)
    const targetIds = new Set(plan.targets.map((t) => t.id))
    for (const c of inspections) {
      expect(targetIds.has(c.target)).toBe(true)
      expect(c.bbchFrom).toBeTruthy()
      expect(c.bbchTo).toBeTruthy()
      expect(c.sourcePages).toMatch(/\d/)
    }
  })

  it('only uses alternative groups A/B, never on the sulphate/Bacillus items', () => {
    const grouped = plan.stages.flatMap((s) => s.treatments.filter((t) => t.group !== undefined))
    expect(grouped.length).toBeGreaterThan(0)
    for (const t of grouped) {
      expect(t.product).not.toMatch(/síran hořečnatý|Bacillus/)
    }
  })

  it('never fills doseKgHa for units other than kg/ha', () => {
    for (const stage of plan.stages) {
      for (const t of stage.treatments) {
        if (t.doseKgHa !== null) expect(t.doseUnit).toBe('kg/ha')
      }
    }
  })
})

describe('parseCarePlan validation', () => {
  it('rejects a stage without a code', () => {
    const bad = clone(carePlanRaw)
    bad.stages[0].code = ''
    expect(() => parseCarePlan(bad)).toThrow(CarePlanValidationError)
  })

  it('rejects a stage without a BBCH start', () => {
    const bad = clone(carePlanRaw) as Record<string, unknown> & { stages: Array<Record<string, unknown>> }
    delete bad.stages[0].bbchFrom
    expect(() => parseCarePlan(bad)).toThrow(/bbchFrom/)
  })

  it('rejects a stage without targets', () => {
    const bad = clone(carePlanRaw)
    bad.stages[0].targets = []
    expect(() => parseCarePlan(bad)).toThrow(/targets/)
  })

  it('rejects a treatment target that is not a stage target', () => {
    const bad = clone(carePlanRaw)
    bad.stages[0].treatments[0].targets = ['moths']
    expect(() => parseCarePlan(bad)).toThrow(/not a target of the stage/)
  })

  it('rejects an unknown target id', () => {
    const bad = clone(carePlanRaw)
    bad.targets = bad.targets.filter((t: { id: string }) => t.id !== 'moths')
    expect(() => parseCarePlan(bad)).toThrow(/unknown target/)
  })

  it('rejects an unknown dose unit', () => {
    const bad = clone(carePlanRaw)
    bad.stages[0].treatments[0].doseUnit = 'g/ha'
    expect(() => parseCarePlan(bad)).toThrow(/doseUnit/)
  })

  it('rejects a non-array protectionWindows when present', () => {
    const bad = clone(carePlanRaw) as Record<string, unknown>
    bad.protectionWindows = 'not-an-array'
    expect(() => parseCarePlan(bad)).toThrow(/protectionWindows/)
  })

  describe('inspections', () => {
    it('rejects an inspection with an empty target', () => {
      const bad = clone(carePlanRaw)
      bad.inspections[0].target = ''
      expect(() => parseCarePlan(bad)).toThrow(/target/)
    })

    it('rejects an inspection pointing at an unknown target', () => {
      const bad = clone(carePlanRaw)
      bad.inspections[0].target = 'nonexistent'
      expect(() => parseCarePlan(bad)).toThrow(/unknown target/)
    })

    it('rejects an inspection without BBCH', () => {
      const bad = clone(carePlanRaw) as Record<string, unknown> & { inspections: Array<Record<string, unknown>> }
      delete bad.inspections[0].bbchFrom
      expect(() => parseCarePlan(bad)).toThrow(/bbchFrom/)
    })

    it('rejects an inspection with empty source pages', () => {
      const bad = clone(carePlanRaw)
      bad.inspections[0].sourcePages = '   '
      expect(() => parseCarePlan(bad)).toThrow(/sourcePages/)
    })

    it('rejects duplicate inspection ids', () => {
      const bad = clone(carePlanRaw)
      bad.inspections[1].id = bad.inspections[0].id
      expect(() => parseCarePlan(bad)).toThrow(/duplicate id/)
    })

    it('rejects a non-array inspections value', () => {
      const bad = clone(carePlanRaw) as Record<string, unknown>
      bad.inspections = {}
      expect(() => parseCarePlan(bad)).toThrow(/inspections/)
    })
  })
})
