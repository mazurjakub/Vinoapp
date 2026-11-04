/**
 * File: carePlanSchema.ts
 * Created: 2026-10-03
 * Description: Validates raw care plan JSON and converts it to typed data.
 */

import {
  DOSE_UNITS,
  type CareInspection,
  type CarePlan,
  type CareStage,
  type CareTreatment,
} from './carePlanTypes'

export class CarePlanValidationError extends Error {}

function fail(message: string): never {
  throw new CarePlanValidationError(message)
}

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''

function requireString(value: unknown, where: string): string {
  if (!isNonEmptyString(value)) fail(`${where}: missing text`)
  return value
}

function requireStringArray(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || value.length === 0) fail(`${where}: must be a non-empty array`)
  return value.map((item, i) => requireString(item, `${where}[${i}]`))
}

function validateTreatment(raw: unknown, where: string, stageTargets: string[], knownTargets: Set<string>): CareTreatment {
  if (typeof raw !== 'object' || raw === null) fail(`${where}: expected an object`)
  const t = raw as Record<string, unknown>

  const targets = requireStringArray(t.targets, `${where}.targets`)
  for (const id of targets) {
    if (!knownTargets.has(id)) fail(`${where}.targets: unknown target "${id}"`)
    if (!stageTargets.includes(id)) fail(`${where}.targets: "${id}" is not a target of the stage`)
  }

  if (t.doseUnit !== null && !(DOSE_UNITS as readonly unknown[]).includes(t.doseUnit)) {
    fail(`${where}.doseUnit: unknown unit ${JSON.stringify(t.doseUnit)}`)
  }

  let doseKgHa: CareTreatment['doseKgHa'] = null
  if (t.doseKgHa !== null) {
    const d = t.doseKgHa as Record<string, unknown> | undefined
    if (typeof d !== 'object' || d === null || typeof d.min !== 'number' || typeof d.max !== 'number') {
      fail(`${where}.doseKgHa: must be null or {min, max}`)
    }
    doseKgHa = { min: d.min as number, max: d.max as number }
  }

  if (t.group !== undefined && t.group !== 'A' && t.group !== 'B') fail(`${where}.group: must be A or B`)
  if (t.optional !== undefined && typeof t.optional !== 'boolean') fail(`${where}.optional: must be a boolean`)

  return {
    product: requireString(t.product, `${where}.product`),
    productGroup: requireString(t.productGroup, `${where}.productGroup`),
    doseText: requireString(t.doseText, `${where}.doseText`),
    doseUnit: t.doseUnit as CareTreatment['doseUnit'],
    doseKgHa,
    targets,
    group: t.group as CareTreatment['group'],
    optional: t.optional as boolean | undefined,
    note: (t.note as string | null | undefined) ?? undefined,
  }
}

function validateStage(raw: unknown, index: number, knownTargets: Set<string>): CareStage {
  const where = `stages[${index}]`
  if (typeof raw !== 'object' || raw === null) fail(`${where}: expected an object`)
  const s = raw as Record<string, unknown>

  const targets = requireStringArray(s.targets, `${where}.targets`)
  for (const id of targets) {
    if (!knownTargets.has(id)) fail(`${where}.targets: unknown target "${id}"`)
  }
  if (!Array.isArray(s.treatments) || s.treatments.length === 0) fail(`${where}.treatments: must be a non-empty array`)

  return {
    code: requireString(s.code, `${where}.code`),
    labelKey: requireString(s.labelKey, `${where}.labelKey`),
    bbchFrom: requireString(s.bbchFrom, `${where}.bbchFrom`),
    bbchTo: requireString(s.bbchTo, `${where}.bbchTo`),
    targets,
    treatments: s.treatments.map((t, i) =>
      validateTreatment(t, `${where}.treatments[${i}]`, targets, knownTargets),
    ),
  }
}

/** Throws on the first problem, so a broken data file is caught early. */
export function parseCarePlan(value: unknown): CarePlan {
  if (typeof value !== 'object' || value === null) fail('plan: expected an object')
  const p = value as Record<string, unknown>

  if (p.format !== 'vinar-careplan-v2') fail(`format: unknown ${JSON.stringify(p.format)}`)
  if (typeof p.dataYear !== 'number') fail('dataYear: must be a number')

  if (!Array.isArray(p.targets) || p.targets.length === 0) fail('targets: must be a non-empty array')
  const knownTargets = new Set<string>()
  const targets = p.targets.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) fail(`targets[${i}]: expected an object`)
    const t = raw as Record<string, unknown>
    const id = requireString(t.id, `targets[${i}].id`)
    if (knownTargets.has(id)) fail(`targets: duplicate id "${id}"`)
    knownTargets.add(id)
    return { id }
  })

  if (!Array.isArray(p.stages) || p.stages.length === 0) fail('stages: must be a non-empty array')
  const stages = p.stages.map((raw, i) => validateStage(raw, i, knownTargets))

  if (p.protectionWindows !== undefined && !Array.isArray(p.protectionWindows)) {
    fail('protectionWindows: must be an array when present')
  }

  let inspections: CareInspection[] | undefined
  if (p.inspections !== undefined) {
    if (!Array.isArray(p.inspections)) fail('inspections: must be an array when present')
    const ids = new Set<string>()
    inspections = p.inspections.map((raw, i) => {
      const where = `inspections[${i}]`
      if (typeof raw !== 'object' || raw === null) fail(`${where}: expected an object`)
      const c = raw as Record<string, unknown>
      const id = requireString(c.id, `${where}.id`)
      if (ids.has(id)) fail(`inspections: duplicate id "${id}"`)
      ids.add(id)
      const target = requireString(c.target, `${where}.target`)
      if (!knownTargets.has(target)) fail(`${where}.target: unknown target "${target}"`)
      return {
        id,
        target,
        bbchFrom: requireString(c.bbchFrom, `${where}.bbchFrom`),
        bbchTo: requireString(c.bbchTo, `${where}.bbchTo`),
        sourcePages: requireString(c.sourcePages, `${where}.sourcePages`),
      }
    })
  }

  return {
    format: 'vinar-careplan-v2',
    dataYear: p.dataYear,
    targets,
    stages,
    protectionWindows: p.protectionWindows as unknown[] | undefined,
    inspections,
  }
}
