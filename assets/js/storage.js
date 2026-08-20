/*
 * storage.js — Motor de almacenamiento del Cuadro de Mando.
 *
 * Estrategia:
 *  - Si el navegador soporta File System Access API (Edge/Chrome en Windows),
 *    la app guarda TODO en una carpeta elegida por el usuario (ideal: dentro
 *    de OneDrive), y OneDrive la sincroniza sola entre tablet y laptop.
 *  - Si no hay soporte o el usuario no elige carpeta, se usa IndexedDB local
 *    (solo en ese aparato) como respaldo.
 *
 * Los datos de cada módulo se guardan como archivos JSON dentro de la carpeta:
 *    partes.json, documentacion.json, biblioteca.json, instructores.json ...
 * Los adjuntos (fotos, PDF) se guardan como archivos dentro de subcarpetas.
 */

const DB_NAME = "cmc-db";
const DB_STORE_HANDLES = "handles";
const DB_STORE_DATA = "data";
const DB_STORE_FILES = "files";
const HANDLE_KEY = "carpetaDatos";

export const soportaCarpeta = "showDirectoryPicker" in window;

let dirHandle = null;   // FileSystemDirectoryHandle de la carpeta de datos
let modo = "ninguno";   // 'carpeta' | 'local' | 'ninguno'

/* ---------- IndexedDB (para el handle y para el modo local) ---------- */
function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE_HANDLES)) db.createObjectStore(DB_STORE_HANDLES);
      if (!db.objectStoreNames.contains(DB_STORE_DATA)) db.createObjectStore(DB_STORE_DATA);
      if (!db.objectStoreNames.contains(DB_STORE_FILES)) db.createObjectStore(DB_STORE_FILES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(store, key) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const r = tx.objectStore(store).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbSet(store, key, val) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbDel(store, key) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbKeys(store) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction(store, "readonly").objectStore(store).getAllKeys();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/* ---------- Permisos del handle ---------- */
async function verificarPermiso(handle, escribir = true) {
  const opts = { mode: escribir ? "readwrite" : "read" };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  if ((await handle.requestPermission(opts)) === "granted") return true;
  return false;
}

/* ---------- API pública de inicialización ---------- */

// Intenta restaurar la carpeta guardada de sesiones anteriores.
export async function inicializar() {
  if (soportaCarpeta) {
    try {
      const guardado = await idbGet(DB_STORE_HANDLES, HANDLE_KEY);
      if (guardado) {
        if (await verificarPermiso(guardado, true)) {
          dirHandle = guardado;
          modo = "carpeta";
          return { modo, nombre: dirHandle.name };
        }
        // El handle existe pero requiere reautorización (no se puede pedir sin gesto de usuario).
        dirHandle = guardado;
        modo = "pendiente";
        return { modo, nombre: dirHandle.name };
      }
    } catch (e) {
      console.warn("No se pudo restaurar la carpeta:", e);
    }
  }
  // ¿Había datos locales previos?
  try {
    const keys = await idbKeys(DB_STORE_DATA);
    if (keys && keys.length) { modo = "local"; return { modo }; }
  } catch {}
  modo = "ninguno";
  return { modo };
}

// Reautoriza una carpeta pendiente (requiere gesto del usuario: clic).
export async function reautorizar() {
  if (dirHandle && (await verificarPermiso(dirHandle, true))) {
    modo = "carpeta";
    return { modo, nombre: dirHandle.name };
  }
  return { modo };
}

// Pide al usuario elegir/crear la carpeta de datos.
export async function elegirCarpeta() {
  if (!soportaCarpeta) throw new Error("no-soportado");
  const handle = await window.showDirectoryPicker({ id: "cmc-datos", mode: "readwrite", startIn: "documents" });
  if (!(await verificarPermiso(handle, true))) throw new Error("sin-permiso");
  dirHandle = handle;
  modo = "carpeta";
  await idbSet(DB_STORE_HANDLES, HANDLE_KEY, handle);
  return { modo, nombre: handle.name };
}

// Cambia a modo local (solo este dispositivo).
export function usarLocal() { modo = "local"; return { modo }; }

export function estado() {
  return { modo, nombre: dirHandle ? dirHandle.name : null, soportaCarpeta };
}

/* ---------- Utilidades de rutas dentro de la carpeta ---------- */
async function subcarpeta(ruta, crear = true) {
  let actual = dirHandle;
  const partes = ruta.split("/").filter(Boolean);
  for (const p of partes) {
    actual = await actual.getDirectoryHandle(p, { create: crear });
  }
  return actual;
}

/* ---------- Lectura/escritura de JSON ---------- */

// Lee un objeto JSON del módulo dado (p.ej. "partes"). Devuelve `porDefecto` si no existe.
export async function leerJSON(nombre, porDefecto = null) {
  const archivo = `${nombre}.json`;
  if (modo === "carpeta") {
    try {
      const fh = await dirHandle.getFileHandle(archivo, { create: false });
      const file = await fh.getFile();
      const txt = await file.text();
      return txt ? JSON.parse(txt) : porDefecto;
    } catch (e) {
      if (e.name === "NotFoundError") return porDefecto;
      throw e;
    }
  } else {
    const val = await idbGet(DB_STORE_DATA, archivo);
    return val === undefined ? porDefecto : val;
  }
}

// Guarda un objeto JSON del módulo dado.
export async function guardarJSON(nombre, obj) {
  const archivo = `${nombre}.json`;
  if (modo === "carpeta") {
    const fh = await dirHandle.getFileHandle(archivo, { create: true });
    const w = await fh.createWritable();
    await w.write(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
    await w.close();
  } else {
    await idbSet(DB_STORE_DATA, archivo, obj);
  }
}

/* ---------- Archivos adjuntos (fotos, PDF, docx exportados) ---------- */

// Guarda un Blob en `ruta/nombre` (ruta = subcarpeta, p.ej. "instructores/123").
export async function guardarArchivo(ruta, nombre, blob) {
  if (modo === "carpeta") {
    const dir = ruta ? await subcarpeta(ruta, true) : dirHandle;
    const fh = await dir.getFileHandle(nombre, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    return `${ruta ? ruta + "/" : ""}${nombre}`;
  } else {
    const key = `${ruta ? ruta + "/" : ""}${nombre}`;
    await idbSet(DB_STORE_FILES, key, blob);
    return key;
  }
}

// Lee un archivo como Blob. Devuelve null si no existe.
export async function leerArchivo(rutaCompleta) {
  if (modo === "carpeta") {
    try {
      const partes = rutaCompleta.split("/").filter(Boolean);
      const nombre = partes.pop();
      let dir = dirHandle;
      for (const p of partes) dir = await dir.getDirectoryHandle(p, { create: false });
      const fh = await dir.getFileHandle(nombre, { create: false });
      return await fh.getFile();
    } catch (e) {
      if (e.name === "NotFoundError") return null;
      throw e;
    }
  } else {
    const b = await idbGet(DB_STORE_FILES, rutaCompleta);
    return b || null;
  }
}

// Devuelve una URL utilizable en <img>/<a> para un archivo guardado.
export async function urlArchivo(rutaCompleta) {
  const blob = await leerArchivo(rutaCompleta);
  return blob ? URL.createObjectURL(blob) : null;
}

export async function borrarArchivo(rutaCompleta) {
  if (modo === "carpeta") {
    try {
      const partes = rutaCompleta.split("/").filter(Boolean);
      const nombre = partes.pop();
      let dir = dirHandle;
      for (const p of partes) dir = await dir.getDirectoryHandle(p, { create: false });
      await dir.removeEntry(nombre);
    } catch (e) { if (e.name !== "NotFoundError") throw e; }
  } else {
    await idbDel(DB_STORE_FILES, rutaCompleta);
  }
}

/* ---------- Respaldo / restauración (traspaso manual entre dispositivos) ---------- */
const MODULOS_RESPALDO = ["partes", "documentacion", "biblioteca", "instructores", "corrector", "radiograma", "calendario", "notas", "contactos", "marca"];

// Exporta los datos del módulo actual (funciona igual en modo carpeta o local).
export async function exportarRespaldo() {
  const data = {};
  for (const nombre of MODULOS_RESPALDO) {
    const val = await leerJSON(nombre, null);
    if (val !== null) data[`${nombre}.json`] = val;
  }
  return { _tipo: "cmc-respaldo", _fecha: new Date().toISOString(), data };
}

export async function importarRespaldo(obj) {
  if (!obj || obj._tipo !== "cmc-respaldo") throw new Error("Archivo de respaldo no válido");
  for (const [k, v] of Object.entries(obj.data || {})) {
    await guardarJSON(k.replace(/\.json$/, ""), v);
  }
}
