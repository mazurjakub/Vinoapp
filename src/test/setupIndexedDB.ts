/**
 * File: setupIndexedDB.ts
 * Created: 2026-10-02
 * Description: Test setup that provides IndexedDB under Node.
 */

// Polyfills `indexedDB` for Vitest's Node environment so Dexie (and its
// version-upgrade migrations) can be exercised in tests without a browser.
import 'fake-indexeddb/auto'
