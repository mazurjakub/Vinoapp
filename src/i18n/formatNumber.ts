/**
 * File: formatNumber.ts
 * Created: 2026-10-31
 * Description: Formats numbers shown in the UI for the selected language.
 */

export function formatNumber(value: number, locale: string, decimals?: number): string {
  // Adding 0 turns a rounded -0 into 0, so a value like -0.04 doesn't read "-0,0".
  const rounded = decimals === undefined ? value : Number(value.toFixed(decimals)) + 0
  return new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(rounded)
}

/** Number and unit joined by a non-breaking space, so a line never breaks between them. */
export function formatWithUnit(value: number, unit: string, locale: string, decimals?: number): string {
  return `${formatNumber(value, locale, decimals)}\u00a0${unit}`
}
