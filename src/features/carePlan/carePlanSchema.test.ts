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

})

describe('parseCarePlan validation', () => {
  it('rejects a stage without a code', () => {
    const bad = clone(carePlanRaw)
    bad.stages[0].code = ''
    expect(() => parseCarePlan(bad)).toThrow(CarePlanValidationError)
  })

  it('rejects an unknown target id', () => {
    const bad = clone(carePlanRaw)
    bad.targets = bad.targets.filter((t: { id: string }) => t.id !== 'moths')
    expect(() => parseCarePlan(bad)).toThrow(/unknown target/)
  })

  describe('inspections', () => {
    it('rejects duplicate inspection ids', () => {
      const bad = clone(carePlanRaw)
      bad.inspections[1].id = bad.inspections[0].id
      expect(() => parseCarePlan(bad)).toThrow(/duplicate id/)
    })
  })
})
