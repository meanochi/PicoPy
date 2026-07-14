// The local workspace: files persisted in IndexedDB so student work survives
// page reloads and offline sessions on every platform (including iPad Safari).
// If IndexedDB is unavailable (some private-browsing modes), we degrade to an
// in-memory store — the app keeps working, persistence resumes next session.

export interface WorkspaceFile {
  id: string;
  name: string;
  kind: 'ipynb' | 'py';
  content: string;
  updatedAt: number;
}

export function fileId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

const DB_NAME = 'picopy';
const STORE = 'files';

let dbPromise: Promise<IDBDatabase | undefined> | undefined;
const memory = new Map<string, WorkspaceFile>();

function openDb(): Promise<IDBDatabase | undefined> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
  return dbPromise;
}

function tx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const filesStore = {
  async list(): Promise<WorkspaceFile[]> {
    const db = await openDb();
    const all = db ? await tx<WorkspaceFile[]>(db, 'readonly', (s) => s.getAll()) : [...memory.values()];
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async get(id: string): Promise<WorkspaceFile | undefined> {
    const db = await openDb();
    if (!db) return memory.get(id);
    return tx<WorkspaceFile | undefined>(db, 'readonly', (s) => s.get(id));
  },

  async put(file: WorkspaceFile): Promise<void> {
    const db = await openDb();
    if (!db) {
      memory.set(file.id, file);
      return;
    }
    await tx(db, 'readwrite', (s) => s.put(file));
  },

  async remove(id: string): Promise<void> {
    const db = await openDb();
    if (!db) {
      memory.delete(id);
      return;
    }
    await tx(db, 'readwrite', (s) => s.delete(id));
  },
};
