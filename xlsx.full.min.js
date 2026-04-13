/* ================================================================
   QualPack — Synchronisation Supabase
   Version sécurisée pour appel depuis index.html
   ================================================================ */

const SUPABASE_URL = 'https://ktnfqhsuajrsvviszooa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0bmZxaHN1YWpyc3Z2aXN6b29hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MDQzMzMsImV4cCI6MjA5MDk4MDMzM30.8Hid-R35NXLb8DTpYvOj34a9yvNoi4NlGLd2njfw0eY';

const HEADERS = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_KEY,
  'Prefer': 'resolution=merge-duplicates,return=representation'
};

async function setLocalSyncStatus(store, id, status) {
  try {
    const db = await openDB();
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    const getReq = os.get(id);

    return await new Promise((resolve) => {
      getReq.onsuccess = () => {
        const record = getReq.result;
        if (!record) {
          resolve(false);
          return;
        }
        record.synced = status === 'synced';
        record.syncStatus = status;
        record.syncedAt = status === 'synced' ? new Date().toISOString() : null;
        os.put(record);
      };
      getReq.onerror = () => resolve(false);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    console.warn('setLocalSyncStatus error:', e);
    return false;
  }
}

async function postToSupabase(table, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Supabase ${table} ${res.status} ${errText}`);
  }

  return true;
}

async function syncPesee(record) {
  if (!navigator.onLine) return false;

  try {
    const payload = {
      id: record.id,
      cli: record.cli || null,
      prod: record.prod || null,
      of: record.of || null,
      op: record.op || null,
      date: record.date || null,
      moy: (record.moy !== '' && record.moy != null) ? Number(record.moy) : null,
      et: (record.et !== '' && record.et != null) ? Number(record.et) : null,
      tu1: record.tu1 != null ? Number(record.tu1) : null,
      tu2: record.tu2 != null ? Number(record.tu2) : null,
      vf: record.vF || record.vf || null,
      pesees: Array.isArray(record.pesees) ? record.pesees : [],
      synced: true
    };

    await postToSupabase('pesees', payload);
    await setLocalSyncStatus('pesees', record.id, 'synced');
    return true;
  } catch (e) {
    console.warn('syncPesee failed:', e);
    await setLocalSyncStatus('pesees', record.id, 'error');
    return false;
  }
}

async function syncDetecteur(record) {
  if (!navigator.onLine) return false;

  const payload = {
    id: record.id,
    eq: record.eq || null,
    op: record.op || null,
    of: record.of || null,
    ligne_prod: record.ligne_prod || record.ligne || null,
    type: record.testType || record.type || null,
    now: record.date || record.now || null,
    vf: record.vF || record.vf || null,
    fer: !!record.fer,
    nfer: !!record.nfer,
    inox: !!record.inox,
    synced: true
  };

  try {
    await postToSupabase('detecteurs', payload);
    await setLocalSyncStatus('detecteurs', record.id, 'synced');
    return true;
  } catch (e) {
    const msg = String(e && e.message || e || '');
    if (/ligne_prod/i.test(msg)) {
      try {
        const fallback = { ...payload };
        delete fallback.ligne_prod;
        await postToSupabase('detecteurs', fallback);
        await setLocalSyncStatus('detecteurs', record.id, 'synced');
        return true;
      } catch (e2) {
        console.warn('syncDetecteur fallback failed:', e2);
      }
    }
    console.warn('syncDetecteur failed:', e);
    await setLocalSyncStatus('detecteurs', record.id, 'error');
    return false;
  }
}

async function syncPending(silent = false) {
  if (!navigator.onLine) return 0;

  try {
    const allPesees = await getAllPesees();
    const allDets = await getAllDetecteurs();

    const pesees = Array.isArray(allPesees)
      ? allPesees.filter(r => r && (r.synced === false || r.synced === undefined))
      : [];

    const dets = Array.isArray(allDets)
      ? allDets.filter(r => r && (r.synced === false || r.synced === undefined))
      : [];

    let count = 0;

    for (const r of pesees) {
      if (await syncPesee(r)) count++;
    }

    for (const r of dets) {
      if (await syncDetecteur(r)) count++;
    }

    if (!silent) {
      console.log(`Sync terminée : ${count} élément(s) synchronisé(s)`);
    }

    return count;
  } catch (e) {
    console.warn('syncPending error:', e);
    throw e;
  }
}

/* Exposition explicite pour les onclick HTML */
window.syncPending = syncPending;
window.syncPesee = syncPesee;
window.syncDetecteur = syncDetecteur;
globalThis.syncPending = syncPending;
globalThis.syncPesee = syncPesee;
globalThis.syncDetecteur = syncDetecteur;

window.addEventListener('online', () => {
  console.log('Réseau disponible — sync en cours...');
  window.syncPending(true).catch(err => console.warn('Auto sync online failed:', err));
});

if (navigator.onLine) {
  setTimeout(() => {
    window.syncPending(true).catch(err => console.warn('Auto sync startup failed:', err));
  }, 2000);
}
