/**
 * File: blobCodec.ts
 * Created: 2026-10-03
 * Description: Converts photo blobs to and from base64 data URLs for export files.
 */

// btoa/atob instead of FileReader, so it works in tests under Node too.

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes: Uint8Array<ArrayBuffer> = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const base64 = arrayBufferToBase64(buffer)
  const mime = blob.type || 'application/octet-stream'
  return `data:${mime};base64,${base64}`
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl)
  if (!match) {
    throw new Error('Invalid photo format in the export file.')
  }
  const [, mime, base64] = match
  return new Blob([base64ToUint8Array(base64)], { type: mime })
}
