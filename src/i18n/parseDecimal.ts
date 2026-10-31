/**
 * File: parseDecimal.ts
 * Created: 2026-10-31
 * Description: Reads a number typed with a decimal comma or point, and prepares a stored one for an input field.
 */

/** Returns `null` when the text isn't one number. A comma or point is always decimal, so "1,234" is 1.234. */
export function parseDecimal(text: string): number | null {
  const compact = text.replace(/\s/g, '').replace('\u2212', '-')
  if (!/^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/.test(compact)) return null
  return Number(compact.replace(',', '.'))
}

export function toDecimalInput(value: number, locale: string): string {
  return locale.startsWith('cs') ? String(value).replace('.', ',') : String(value)
}
