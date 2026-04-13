const DB_NAME = 'qualpack_db';
const DB_VERSION = 3;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('pesees')) {
        const storePesees = db.createObjectStore('pesees', { keyPath: 'id' });
        storePesees.createIndex('date', 'date', { unique: false });
        storePesees.createIndex('of', 'of', { unique: false });
        storePesees.createIndex('prod', 'prod', { unique: false });
        storePesees.createIndex('cli', 'cli', { unique: false });
        storePesees.createIndex('synced', 'synced', { unique: false });
      }

      if (!db.objectStoreNames.contains('detecteurs')) {
        const storeDet = db.createObjectStore('detecteurs', { keyPath: 'id' });
        storeDet.createIndex('date', 'date', { unique: false });
        storeDet.createIndex('eq', 'eq', { unique: false });
        storeDet.createIndex('of', 'of', { unique: false });
        storeDet.createIndex('synced', 'synced', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Base IndexedDB bloquée par un ancien onglet ouvert'));
  });
}

async function savePesee(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pesees', 'readwrite');
    const store = tx.objectStore('pesees');
    store.put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

async function saveDetecteur(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('detecteurs', 'readwrite');
    const store = tx.objectStore('detecteurs');
    store.put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllPesees() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pesees', 'readonly');
    const store = tx.objectStore('pesees');
    const req = store.getAll();
    req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
    req.onerror = () => reject(req.error);
  });
}

async function getAllDetecteurs() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('detecteurs', 'readonly');
    const store = tx.objectStore('detecteurs');
    const req = store.getAll();
    req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
    req.onerror = () => reject(req.error);
  });
}

async function getPeseeById(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pesees', 'readonly');
    const store = tx.objectStore('pesees');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function getDetecteurById(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('detecteurs', 'readonly');
    const store = tx.objectStore('detecteurs');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function deletePesee(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pesees', 'readwrite');
    tx.objectStore('pesees').delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteDetecteur(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('detecteurs', 'readwrite');
    tx.objectStore('detecteurs').delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
