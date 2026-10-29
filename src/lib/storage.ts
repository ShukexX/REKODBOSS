import type { Env } from './db'

/** Storan fail persendirian.
 *  Utama: R2 (binding DOCS). Sandaran: jadual document_blobs jika binding tiada.
 *  Tiada fail boleh diakses tanpa sesi yang sah — tiada URL awam. */
export async function putBytes(env: Env, key: string, bytes: ArrayBuffer, mime: string) {
  if (env.DOCS) {
    await env.DOCS.put(key, bytes, { httpMetadata: { contentType: mime } })
    return
  }
  await env.DB.prepare('INSERT OR REPLACE INTO document_blobs (id, bytes) VALUES (?, ?)').bind(key, bytes).run()
}

export async function getBytes(env: Env, key: string): Promise<{ bytes: ArrayBuffer; mime?: string } | null> {
  if (env.DOCS) {
    const obj = await env.DOCS.get(key)
    if (!obj) return null
    return { bytes: await obj.arrayBuffer(), mime: obj.httpMetadata?.contentType }
  }
  const row = await env.DB.prepare('SELECT bytes FROM document_blobs WHERE id = ?').bind(key).first<any>()
  if (!row) return null
  return { bytes: row.bytes instanceof ArrayBuffer ? row.bytes : new Uint8Array(row.bytes).buffer }
}

export async function hasBytes(env: Env, key: string): Promise<boolean> {
  if (env.DOCS) return (await env.DOCS.head(key)) !== null
  const row = await env.DB.prepare('SELECT 1 AS ok FROM document_blobs WHERE id = ?').bind(key).first<any>()
  return !!row
}
