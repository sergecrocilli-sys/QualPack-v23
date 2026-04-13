// V19.8 — Injection dynamique des lignes de production depuis le catalogue local
const LINE_CATALOGUE_STORAGE_KEY = 'qp_lines_catalogue';

function getDynamicLinesFromStorage() {
  try {
    const raw = localStorage.getItem(LINE_CATALOGUE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? Array.from(new Set(parsed.map(v => String(v || '').trim()).filter(Boolean)))
          .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
      : [];
  } catch (e) {
    console.warn('getDynamicLinesFromStorage error:', e);
    return [];
  }
}

function remplirTousLesDropdownsLigne() {
  const lignes = getDynamicLinesFromStorage();
  if (!lignes.length) return;

  const selects = document.querySelectorAll('select');
  selects.forEach((select) => {
    const id = String(select.id || '').toLowerCase();
    const name = String(select.name || '').toLowerCase();
    const aria = String(select.getAttribute('aria-label') || '').toLowerCase();
    const dataField = String(select.getAttribute('data-field') || '').toLowerCase();

    const ressembleAUnChampLigne =
      id.includes('ligne') ||
      name.includes('ligne') ||
      aria.includes('ligne') ||
      dataField.includes('ligne');

    if (!ressembleAUnChampLigne) return;

    const valeurActuelle = String(select.value || '').trim();
    const existing = Array.from(select.options || []).map(o => String(o.value || '').trim());
    const merged = Array.from(new Set([...existing.filter(Boolean), ...lignes]));

    select.innerHTML = '<option value="">— Sélectionner une ligne —</option>';
    merged.forEach((ligne) => {
      const option = document.createElement('option');
      option.value = ligne;
      option.textContent = ligne;
      select.appendChild(option);
    });

    if (valeurActuelle && merged.includes(valeurActuelle)) {
      select.value = valeurActuelle;
    }
  });
}

function relancerInjectionLignes() {
  remplirTousLesDropdownsLigne();
  setTimeout(remplirTousLesDropdownsLigne, 150);
  setTimeout(remplirTousLesDropdownsLigne, 500);
}

document.addEventListener('DOMContentLoaded', relancerInjectionLignes);
document.addEventListener('click', () => setTimeout(remplirTousLesDropdownsLigne, 200));
document.addEventListener('change', () => setTimeout(remplirTousLesDropdownsLigne, 200));

let essais = 0;
const interval = setInterval(() => {
  remplirTousLesDropdownsLigne();
  essais += 1;
  if (essais >= 30) clearInterval(interval);
}, 400);
