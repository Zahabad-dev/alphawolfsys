"use client";

const DB_NAME = "wd-offline";
const DB_VERSION = 1;
const STORE_CATALOGO = "catalogo";
const STORE_COLA = "colaVentas";

export interface CatalogoItem {
  qrToken: string;
  precio: number;
  nombre: string;
  stock: number;
}

export interface VentaPendiente {
  id?: number;
  qrToken: string;
  cantidad: number;
  precio: number;
  idempotencyKey: string;
  creadoEn: string;
}

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CATALOGO)) {
        db.createObjectStore(STORE_CATALOGO, { keyPath: "qrToken" });
      }
      if (!db.objectStoreNames.contains(STORE_COLA)) {
        db.createObjectStore(STORE_COLA, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function guardarCatalogo(items: CatalogoItem[]) {
  const db = await abrirDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_CATALOGO, "readwrite");
    const store = tx.objectStore(STORE_CATALOGO);
    store.clear();
    for (const item of items) store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function buscarEnCatalogo(qrToken: string): Promise<CatalogoItem | null> {
  const db = await abrirDb();
  const item = await new Promise<CatalogoItem | null>((resolve, reject) => {
    const tx = db.transaction(STORE_CATALOGO, "readonly");
    const req = tx.objectStore(STORE_CATALOGO).get(qrToken);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return item;
}

export async function encolarVenta(venta: Omit<VentaPendiente, "id">) {
  const db = await abrirDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_COLA, "readwrite");
    tx.objectStore(STORE_COLA).add(venta);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listarCola(): Promise<VentaPendiente[]> {
  const db = await abrirDb();
  const items = await new Promise<VentaPendiente[]>((resolve, reject) => {
    const tx = db.transaction(STORE_COLA, "readonly");
    const req = tx.objectStore(STORE_COLA).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return items;
}

export async function eliminarDeCola(id: number) {
  const db = await abrirDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_COLA, "readwrite");
    tx.objectStore(STORE_COLA).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
