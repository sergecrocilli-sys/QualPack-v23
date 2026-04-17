/* ================================
   CONFIG SUPABASE (robuste)
================================ */

function getSupabaseConfig() {
  const url =
    (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL) ||
    (typeof SB_URL !== 'undefined' && SB_URL) ||
    null;

  const key =
    (typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY) ||
    (typeof SB_KEY !== 'undefined' && SB_KEY) ||
    null;

  if (!url) throw new Error('Supabase URL indisponible');
  if (!key) throw new Error('Supabase key indisponible');

  return { url, key };
}

function getSupabaseHeaders() {
  const { key } = getSupabaseConfig();
  return {
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Prefer': 'resolution=merge-duplicates'
  };
}

/* ================================
   LECTURE DONNÉES EN ATTENTE
================================ */

async function getPendingPesees() {
  try {
    const rows = await getAllPesees();
    return Array.isArray(rows) ? rows.filter(r => !r.synced) : [];
  } catch (err) {
    console.warn('getPendingPesees IndexedDB failed, fallback localStorage:', err);
    try {
      const rows = JSON.parse(localStorage.getItem('qp_sessions') || '[]');
      return Array.isArray(rows) ? rows.filter(r => !r.synced) : [];
    } catch (e2) {
      console.warn('getPendingPesees localStorage failed:', e2);
      return [];
    }
  }
}

async function getPendingDetecteurs() {
  try {
    const rows = await getAllDetecteurs();
    return Array.isArray(rows) ? rows.filter(r => !r.synced) : [];
  } catch (err) {
    console.warn('getPendingDetecteurs IndexedDB failed, fallback localStorage:', err);
    try {
      const rows = JSON.parse(localStorage.getItem('qp_dets') || '[]');
      return Array.isArray(rows) ? rows.filter(r => !r.synced) : [];
    } catch (e2) {
      console.warn('getPendingDetecteurs localStorage failed:', e2);
      return [];
    }
  }
}

/* ================================
   MARQUAGE SYNCHRONISÉ
================================ */

async function markPeseesSynced(ids) {
  if (!Array.isArray(ids) || !ids.length) return;

  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('pesees', 'readwrite');
      const store = tx.objectStore('pesees');

      ids.forEach(id => {
        const req = store.get(id);
        req.onsuccess = () => {
          const rec = req.result;
          if (rec) {
            rec.synced = true;
            store.put(rec);
          }
        };
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('markPeseesSynced fallback localStorage:', err);
    try {
      const rows = JSON.parse(localStorage.getItem('qp_sessions') || '[]');
      const updated = rows.map(r => ids.includes(r.id) ? { ...r, synced: true } : r);
      localStorage.setItem('qp_sessions', JSON.stringify(updated));
    } catch (e2) {
      console.warn('localStorage markPeseesSynced failed:', e2);
    }
  }
}

async function markDetecteursSynced(ids) {
  if (!Array.isArray(ids) || !ids.length) return;

  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('detecteurs', 'readwrite');
      const store = tx.objectStore('detecteurs');

      ids.forEach(id => {
        const req = store.get(id);
        req.onsuccess = () => {
          const rec = req.result;
          if (rec) {
            rec.synced = true;
            store.put(rec);
          }
        };
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('markDetecteursSynced fallback localStorage:', err);
    try {
      const rows = JSON.parse(localStorage.getItem('qp_dets') || '[]');
      const updated = rows.map(r => ids.includes(r.id) ? { ...r, synced: true } : r);
      localStorage.setItem('qp_dets', JSON.stringify(updated));
    } catch (e2) {
      console.warn('localStorage markDetecteursSynced failed:', e2);
    }
  }
}

/* ================================
   MAPPING SUPABASE
================================ */

function mapPeseeForSupabase(r) {
  return {
    id: r.id,
    type: r.type || 'pesee',
    cli: r.cli || null,
    prod: r.prod || null,
    of: r.of || null,
    op: r.op || null,
    date: r.date || null,
    ligne: r.ligne || r.ligne_prod || null,
    ligne_prod: r.ligne_prod || r.ligne || null,
    qte: r.qte ?? null,
    qn: r.qn ?? null,
    tne: r.tne ?? null,
    tu1_limite: r.tu1_limite ?? null,
    tare_fixe_g: r.tare_fixe_g ?? null,
    moy: r.moy ?? null,
    et: r.et ?? null,
    tu1: r.tu1 ?? 0,
    tu2: r.tu2 ?? 0,
    vMoy: r.vMoy || null,
    vDef: r.vDef || null,
    vF: r.vF || null,
    pesees: Array.isArray(r.pesees) ? r.pesees : [],
    synced: true
  };
}

function mapDetecteurForSupabase(r) {
  return {
    id: r.id,
    type: r.type || 'det',
    eq: r.eq || null,
    ligne: r.ligne || r.ligne_prod || null,
    ligne_prod: r.ligne_prod || r.ligne || null,
    op: r.op || null,
    of: r.of || null,
    date: r.date || r.now || null,
    now: r.now || null,
    fer: r.fer ?? null,
    nfer: r.nfer ?? null,
    inox: r.inox ?? null,
    vF: r.vF || null,
    synced: true
  };
}

/* ================================
   ENVOI SUPABASE
================================ */

async function postBatch(url, payload) {
  if (!Array.isArray(payload) || !payload.length) return 0;

  const res = await fetch(url, {
    method: 'POST',
    headers: getSupabaseHeaders(),
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`${res.status} ${txt || res.statusText}`);
  }

  return payload.length;
}

/* ================================
   SYNCHRONISATION PRINCIPALE
================================ */

async function syncPending(force = false) {
  if (!navigator.onLine && !force) return 0;
  if (!navigator.onLine) throw new Error('Connexion indisponible');

  const pendingPesees = await getPendingPesees();
  const pendingDetecteurs = await getPendingDetecteurs();

  let syncedCount = 0;
  const { url } = getSupabaseConfig();

  if (pendingPesees.length) {
    const payloadPesees = pendingPesees.map(mapPeseeForSupabase);
    const countP = await postBatch(`${url}/rest/v1/pesees`, payloadPesees);
    await markPeseesSynced(pendingPesees.map(r => r.id));
    syncedCount += countP;
  }

  if (pendingDetecteurs.length) {
    const payloadDetecteurs = pendingDetecteurs.map(mapDetecteurForSupabase);
    const countD = await postBatch(`${url}/rest/v1/detecteurs`, payloadDetecteurs);
    await markDetecteursSynced(pendingDetecteurs.map(r => r.id));
    syncedCount += countD;
  }

  return syncedCount;
}

/* ================================
   SYNCHRO UNITAIRE
================================ */

async function syncPesee(record) {
  if (!navigator.onLine) return false;
  if (!record || !record.id) return false;

  const { url } = getSupabaseConfig();
  const payload = [mapPeseeForSupabase(record)];

  await postBatch(`${url}/rest/v1/pesees`, payload);
  await markPeseesSynced([record.id]);
  return true;
}

async function syncDetecteur(record) {
  if (!navigator.onLine) return false;
  if (!record || !record.id) return false;

  const { url } = getSupabaseConfig();
  const payload = [mapDetecteurForSupabase(record)];

  await postBatch(`${url}/rest/v1/detecteurs`, payload);
  await markDetecteursSynced([record.id]);
  return true;
}

/* ================================
   EXPORT GLOBAL
================================ */

window.syncPending = syncPending;
window.syncPesee = syncPesee;
window.syncDetecteur = syncDetecteur;
