/**
 * File: carePlanTypes.ts
 * Created: 2026-10-03
 * Description: TypeScript types for the care plan data.
 */

export const DOSE_UNITS = ['kg/ha', 'l/ha', 'kg Cu/ha', 'odparníků/ha'] as const
export type DoseUnit = (typeof DOSE_UNITS)[number]

export interface CareTarget {
  id: string
}

export interface CareTreatment {
  product: string
  productGroup: string
  doseText: string
  /** null when the book doesn't state a unit (VitiSan, Oicomb) or the entry mixes units. */
  doseUnit: DoseUnit | null
  doseKgHa: { min: number; max: number } | null
  /** Subset of the parent stage's targets this item is aimed at. */
  targets: string[]
  /** Only for real alternatives against the same disease ("or" in the source book). */
  group?: 'A' | 'B'
  optional?: boolean
  note?: string | null
}

export interface CareStage {
  code: string
  /** Key under `carePlanData.stages` in the translations. */
  labelKey: string
  bbchFrom: string
  bbchTo: string
  targets: string[]
  treatments: CareTreatment[]
}

/** Texts are in the translations under `carePlanData.inspections.<id>`. */
export interface CareInspection {
  id: string
  target: string
  bbchFrom: string
  bbchTo: string
  sourcePages: string
}

export interface CarePlan {
  format: 'vinar-careplan-v2'
  dataYear: number
  targets: CareTarget[]
  stages: CareStage[]
  /** Reserved for a later step; optional until that data is filled in. */
  protectionWindows?: unknown[]
  inspections?: CareInspection[]
}
