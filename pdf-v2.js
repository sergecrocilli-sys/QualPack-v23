/**
 * xlsx.full.min.js — QualPack compatible build
 * Librairie XLSX autoportante (UMD) pour générer des fichiers .xlsx
 * depuis les données IndexedDB de db.js (pesees / detecteurs).
 * Format OOXML (.xlsx) natif, compatible Excel, LibreOffice, Google Sheets.
 */
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined'
    ? module.exports = factory()
    : typeof define === 'function' && define.amd
      ? define(factory)
      : (global = typeof globalThis !== 'undefined' ? globalThis : global || self,
         global.XLSX = factory());
}(this, function () {
  'use strict';

  // ─── Utilitaires ────────────────────────────────────────────────────────────

  /** Encode une chaîne en UTF-8 Uint8Array */
  function strToUint8(str) {
    return new TextEncoder().encode(str);
  }

  /** Encode base64 depuis Uint8Array */
  function uint8ToBase64(u8) {
    let bin = '';
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    return btoa(bin);
  }

  /** Échappe les caractères spéciaux XML */
  function escXML(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /** Convertit un index de colonne 0-based en lettres (0→A, 25→Z, 26→AA) */
  function colLetter(n) {
    let s = '';
    n++;
    while (n > 0) {
      n--;
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26);
    }
    return s;
  }

  /** Référence de cellule ex: (0,0) → "A1" */
  function cellRef(col, row) {
    return colLetter(col) + (row + 1);
  }

  // ─── Date Excel ─────────────────────────────────────────────────────────────
  const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30));

  function dateToSerial(d) {
    if (!(d instanceof Date)) d = new Date(d);
    const ms = d.getTime() - EXCEL_EPOCH.getTime();
    const days = ms / 86400000;
    return days > 59 ? days + 1 : days; // Bug Lotus 1-2-3 (1900 faux bissextile)
  }

  // ─── Construction ZIP minimal (OOXML) ───────────────────────────────────────

  /**
   * ZIP store (pas de compression) — suffisant pour xlsx qui utilise
   * de l'XML déjà petit. Pour des fichiers plus grands, la compression
   * deflate n'est pas nécessaire pour la compatibilité.
   */
  class ZipBuilder {
    constructor() {
      this._entries = [];
    }

    addFile(name, data) {
      // data peut être string ou Uint8Array
      const bytes = typeof data === 'string' ? strToUint8(data) : data;
      this._entries.push({ name, bytes });
    }

    build() {
      const parts = [];
      const centralDir = [];
      let offset = 0;

      for (const entry of this._entries) {
        const nameBytes = strToUint8(entry.name);
        const crc = crc32(entry.bytes);
        const localHeader = this._localHeader(nameBytes, entry.bytes, crc);

        centralDir.push({
          nameBytes,
          bytes: entry.bytes,
          crc,
          localOffset: offset,
        });

        parts.push(localHeader, entry.bytes);
        offset += localHeader.length + entry.bytes.length;
      }

      // Central directory
      const cdStart = offset;
      const cdParts = [];
      for (const e of centralDir) {
        const cd = this._centralDirEntry(e.nameBytes, e.bytes, e.crc, e.localOffset);
        cdParts.push(cd);
        offset += cd.length;
      }

      const eocd = this._eocd(centralDir.length, offset - cdStart, cdStart);

      // Assemble tout
      const totalLen = parts.reduce((s, p) => s + p.length, 0)
        + cdParts.reduce((s, p) => s + p.length, 0)
        + eocd.length;

      const out = new Uint8Array(totalLen);
      let pos = 0;
      for (const p of [...parts, ...cdParts, eocd]) {
        out.set(p, pos);
        pos += p.length;
      }
      return out;
    }

    _localHeader(nameBytes, dataBytes, crc) {
      const buf = new ArrayBuffer(30 + nameBytes.length);
      const v   = new DataView(buf);
      v.setUint32(0,  0x04034b50, true);  // signature
      v.setUint16(4,  20, true);           // version needed
      v.setUint16(6,  0, true);            // flags
      v.setUint16(8,  0, true);            // compression: STORE
      v.setUint16(10, 0, true);            // mod time
      v.setUint16(12, 0, true);            // mod date
      v.setUint32(14, crc >>> 0, true);    // CRC-32
      v.setUint32(18, dataBytes.length, true);
      v.setUint32(22, dataBytes.length, true);
      v.setUint16(26, nameBytes.length, true);
      v.setUint16(28, 0, true);            // extra length
      const arr = new Uint8Array(buf);
      arr.set(nameBytes, 30);
      return arr;
    }

    _centralDirEntry(nameBytes, dataBytes, crc, localOffset) {
      const buf = new ArrayBuffer(46 + nameBytes.length);
      const v   = new DataView(buf);
      v.setUint32(0,  0x02014b50, true);
      v.setUint16(4,  20, true);
      v.setUint16(6,  20, true);
      v.setUint16(8,  0, true);
      v.setUint16(10, 0, true);
      v.setUint16(12, 0, true);
      v.setUint16(14, 0, true);
      v.setUint32(16, crc >>> 0, true);
      v.setUint32(20, dataBytes.length, true);
      v.setUint32(24, dataBytes.length, true);
      v.setUint16(28, nameBytes.length, true);
      v.setUint16(30, 0, true);
      v.setUint16(32, 0, true);
      v.setUint16(34, 0, true);
      v.setUint16(36, 0, true);
      v.setUint32(38, 0, true);
      v.setUint32(42, localOffset, true);
      new Uint8Array(buf).set(nameBytes, 46);
      return new Uint8Array(buf);
    }

    _eocd(count, cdSize, cdOffset) {
      const buf = new ArrayBuffer(22);
      const v   = new DataView(buf);
      v.setUint32(0,  0x06054b50, true);
      v.setUint16(4,  0, true);
      v.setUint16(6,  0, true);
      v.setUint16(8,  count, true);
      v.setUint16(10, count, true);
      v.setUint32(12, cdSize, true);
      v.setUint32(16, cdOffset, true);
      v.setUint16(20, 0, true);
      return new Uint8Array(buf);
    }
  }

  // CRC-32 table
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();

  function crc32(data) {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
      crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  // ─── Workbook interne ────────────────────────────────────────────────────────

  class Workbook {
    constructor() {
      this.SheetNames = [];
      this.Sheets = {};
    }
  }

  // ─── Construction OOXML ──────────────────────────────────────────────────────

  function buildXlsx(workbook) {
    const zip = new ZipBuilder();

    // [Content_Types].xml
    let contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`
      + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
      + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
      + `<Default Extension="xml" ContentType="application/xml"/>`
      + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`;
    for (let i = 0; i < workbook.SheetNames.length; i++) {
      contentTypes += `<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
    }
    contentTypes += `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`;
    contentTypes += `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>`;
    contentTypes += `</Types>`;
    zip.addFile('[Content_Types].xml', contentTypes);

    // _rels/.rels
    zip.addFile('_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
      + `</Relationships>`);

    // xl/_rels/workbook.xml.rels
    let wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`;
    for (let i = 0; i < workbook.SheetNames.length; i++) {
      wbRels += `<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`;
    }
    const stylesId = workbook.SheetNames.length + 1;
    const ssId     = workbook.SheetNames.length + 2;
    wbRels += `<Relationship Id="rId${stylesId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
    wbRels += `<Relationship Id="rId${ssId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>`;
    wbRels += `</Relationships>`;
    zip.addFile('xl/_rels/workbook.xml.rels', wbRels);

    // xl/workbook.xml
    let wbXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" `
      + `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
      + `<sheets>`;
    for (let i = 0; i < workbook.SheetNames.length; i++) {
      wbXml += `<sheet name="${escXML(workbook.SheetNames[i])}" sheetId="${i+1}" r:id="rId${i+1}"/>`;
    }
    wbXml += `</sheets></workbook>`;
    zip.addFile('xl/workbook.xml', wbXml);

    // Shared strings (toutes les chaînes)
    const sharedStrings = [];
    const ssMap = {};

    function getSSIdx(s) {
      if (ssMap[s] === undefined) {
        ssMap[s] = sharedStrings.length;
        sharedStrings.push(s);
      }
      return ssMap[s];
    }

    // xl/worksheets/sheetN.xml
    for (let si = 0; si < workbook.SheetNames.length; si++) {
      const sheetName = workbook.SheetNames[si];
      const sheet     = workbook.Sheets[sheetName];
      const aoa       = sheet.__aoa || []; // array of arrays

      // Calcul dimension
      let maxRow = aoa.length;
      let maxCol = 0;
      for (const row of aoa) {
        if (row.length > maxCol) maxCol = row.length;
      }
      const dimRef = maxRow > 0 && maxCol > 0
        ? `A1:${cellRef(maxCol - 1, maxRow - 1)}`
        : 'A1:A1';

      let wsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
        + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
        + `<dimension ref="${dimRef}"/>`
        + `<sheetData>`;

      for (let r = 0; r < aoa.length; r++) {
        const row = aoa[r];
        wsXml += `<row r="${r + 1}">`;
        for (let c = 0; c < row.length; c++) {
          const val = row[c];
          const ref = cellRef(c, r);

          if (val === null || val === undefined || val === '') {
            // cellule vide — on peut l'omettre
            continue;
          }

          if (typeof val === 'number') {
            wsXml += `<c r="${ref}"><v>${val}</v></c>`;
          } else if (typeof val === 'boolean') {
            wsXml += `<c r="${ref}" t="b"><v>${val ? 1 : 0}</v></c>`;
          } else if (val instanceof Date) {
            const serial = dateToSerial(val);
            wsXml += `<c r="${ref}" s="1"><v>${serial}</v></c>`; // s="1" → style date
          } else {
            // String → shared string
            const idx = getSSIdx(String(val));
            wsXml += `<c r="${ref}" t="s"><v>${idx}</v></c>`;
          }
        }
        wsXml += `</row>`;
      }

      wsXml += `</sheetData></worksheet>`;
      zip.addFile(`xl/worksheets/sheet${si + 1}.xml`, wsXml);
    }

    // xl/sharedStrings.xml
    let ssXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" `
      + `count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">`;
    for (const s of sharedStrings) {
      ssXml += `<si><t xml:space="preserve">${escXML(s)}</t></si>`;
    }
    ssXml += `</sst>`;
    zip.addFile('xl/sharedStrings.xml', ssXml);

    // xl/styles.xml — style minimal + format date
    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
      + `<numFmts count="1"><numFmt numFmtId="164" formatCode="DD/MM/YYYY HH:MM:SS"/></numFmts>`
      + `<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>`
      + `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>`
      + `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>`
      + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
      + `<cellXfs count="2">`
      + `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`
      + `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`
      + `</cellXfs>`
      + `</styleSheet>`;
    zip.addFile('xl/styles.xml', stylesXml);

    return zip.build();
  }

  // ─── API publique XLSX ───────────────────────────────────────────────────────

  const XLSX = {

    // ── utils ──────────────────────────────────────────────────────────────
    utils: {

      /** Crée un workbook vide */
      book_new() {
        return new Workbook();
      },

      /** Ajoute une feuille au workbook */
      book_append_sheet(wb, ws, name) {
        name = name || `Sheet${wb.SheetNames.length + 1}`;
        wb.SheetNames.push(name);
        wb.Sheets[name] = ws;
      },

      /** Convertit un array of arrays → worksheet */
      aoa_to_sheet(aoa, opts) {
        opts = opts || {};
        const ws = { __aoa: aoa };
        // Calcul de la ref !ref
        let maxR = aoa.length - 1;
        let maxC = 0;
        for (const row of aoa) if (row.length > maxC) maxC = row.length;
        ws['!ref'] = maxR >= 0 && maxC > 0
          ? `A1:${cellRef(maxC - 1, maxR)}`
          : 'A1';
        return ws;
      },

      /** Convertit un array of objects → worksheet */
      json_to_sheet(data, opts) {
        opts = opts || {};
        if (!data || data.length === 0) return XLSX.utils.aoa_to_sheet([]);
        const header = opts.header || Object.keys(data[0]);
        const skipHeader = opts.skipHeader || false;
        const aoa = [];
        if (!skipHeader) aoa.push(header);
        for (const row of data) {
          aoa.push(header.map(k => {
            const v = row[k];
            return (v === undefined || v === null) ? '' : v;
          }));
        }
        return XLSX.utils.aoa_to_sheet(aoa, opts);
      },

      /** Convertit une feuille en array of arrays */
      sheet_to_json(ws, opts) {
        opts = opts || {};
        const source = ws.__aoa || [];
        if (source.length === 0) return [];

        let startRow = 0;
        if (typeof opts.range === 'number' && isFinite(opts.range)) {
          startRow = Math.max(0, Math.floor(opts.range));
        }
        const aoa = source.slice(startRow);
        if (aoa.length === 0) return [];

        const header = opts.header;
        const defval = Object.prototype.hasOwnProperty.call(opts, 'defval') ? opts.defval : undefined;
        const normalizeRow = (row, len) => {
          const out = Array.isArray(row) ? row.slice() : [];
          while (out.length < len) out.push(defval);
          return out.map(v => (v === undefined ? defval : v));
        };

        if (header === 1 || header === true) {
          const maxLen = aoa.reduce((m, row) => Math.max(m, Array.isArray(row) ? row.length : 0), 0);
          return aoa.map(row => normalizeRow(row, maxLen));
        }
        if (Array.isArray(header)) {
          return aoa.map(row => {
            const arr = normalizeRow(row, header.length);
            const obj = {};
            header.forEach((k, i) => { obj[k] = arr[i]; });
            return obj;
          });
        }
        // Par défaut : première ligne = clés
        const keys = normalizeRow(aoa[0], aoa[0]?.length || 0);
        return aoa.slice(1).map(row => {
          const arr = normalizeRow(row, keys.length);
          const obj = {};
          keys.forEach((k, i) => { obj[k] = arr[i]; });
          return obj;
        });
      },

      /** Convertit une feuille en CSV */
      sheet_to_csv(ws, opts) {
        opts = opts || {};
        const sep = opts.FS || ',';
        const rs  = opts.RS || '\n';
        const aoa = ws.__aoa || [];
        return aoa.map(row =>
          row.map(cell => {
            const s = cell === null || cell === undefined ? '' : String(cell);
            return s.includes(sep) || s.includes('"') || s.includes('\n')
              ? '"' + s.replace(/"/g, '""') + '"'
              : s;
          }).join(sep)
        ).join(rs);
      },

      /** Encode le workbook en base64 (pour usage direct) */
      encode_col: colLetter,
      encode_row: (r) => r + 1,
      encode_cell: (addr) => cellRef(addr.c, addr.r),
      decode_col(s) {
        let n = 0;
        for (let i = 0; i < s.length; i++) n = n * 26 + s.charCodeAt(i) - 64;
        return n - 1;
      },
      decode_row: (s) => parseInt(s) - 1,
      decode_cell(ref) {
        const m = ref.match(/([A-Z]+)(\d+)/);
        return m ? { c: XLSX.utils.decode_col(m[1]), r: XLSX.utils.decode_row(m[2]) } : { c: 0, r: 0 };
      },
      decode_range(ref) {
        const parts = ref.split(':');
        const s = XLSX.utils.decode_cell(parts[0]);
        const e = parts[1] ? XLSX.utils.decode_cell(parts[1]) : { ...s };
        return { s, e };
      },
      encode_range(range) {
        return `${cellRef(range.s.c, range.s.r)}:${cellRef(range.e.c, range.e.r)}`;
      },
    },

    // ── write ──────────────────────────────────────────────────────────────
    /**
     * Génère le fichier xlsx.
     * @param {Workbook} wb
     * @param {Object} opts  { bookType, type }
     *   type: 'array' | 'buffer' | 'base64' | 'binary' | 'blob'
     */
    write(wb, opts) {
      opts = opts || {};
      const bytes = buildXlsx(wb);
      const type  = opts.type || 'array';

      if (type === 'array')  return bytes;
      if (type === 'buffer') return bytes.buffer;
      if (type === 'base64') return uint8ToBase64(bytes);
      if (type === 'binary') {
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return bin;
      }
      if (type === 'blob') return new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      return bytes;
    },

    // ── writeFile ──────────────────────────────────────────────────────────
    writeFile(wb, filename, opts) {
      opts = opts || {};
      const bytes = buildXlsx(wb);
      const blob  = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = filename || 'export.xlsx';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 300);
    },

    // ── read / readFile (lecture minimale) ────────────────────────────────
    /**
     * Lecture basique d'un fichier XLSX (array ou ArrayBuffer).
     * Retourne un Workbook avec les données en aoa.
     * Note : décompression ZIP simplifiée — fichiers STORE uniquement.
     */
    read(data, opts) {
      opts = opts || {};
      let bytes;
      if (data instanceof Uint8Array) bytes = data;
      else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
      else if (typeof data === 'string') {
        // base64
        const bin = atob(data);
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      } else {
        bytes = new Uint8Array(data);
      }

      const wb = new Workbook();
      try {
        const files = unzip(bytes);

        // Shared strings
        const ssRaw = files['xl/sharedStrings.xml'] || '';
        const sharedStrings = parseSharedStrings(ssRaw);

        // Workbook pour noms de feuilles
        const wbRaw = files['xl/workbook.xml'] || '';
        const sheetInfos = parseWorkbookSheets(wbRaw);

        // Lire chaque feuille
        for (let i = 0; i < sheetInfos.length; i++) {
          const wsRaw = files[`xl/worksheets/sheet${i + 1}.xml`] || '';
          const aoa   = parseWorksheet(wsRaw, sharedStrings);
          const ws    = XLSX.utils.aoa_to_sheet(aoa);
          XLSX.utils.book_append_sheet(wb, ws, sheetInfos[i]);
        }
      } catch (e) {
        console.warn('XLSX.read: erreur parsing', e);
      }
      return wb;
    },

    async readFile(file, opts) {
      // File/Blob -> Promise<Workbook>
      if (!file) throw new Error('Fichier XLSX manquant');
      const buf = typeof file.arrayBuffer === 'function'
        ? await file.arrayBuffer()
        : await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
          });
      return await XLSX.readAsync(buf, opts);
    },

    async readAsync(data, opts) {
      opts = opts || {};
      let bytes;
      if (data instanceof Uint8Array) bytes = data;
      else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
      else if (typeof data === 'string') {
        const bin = atob(data);
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      } else {
        bytes = new Uint8Array(data);
      }

      const wb = new Workbook();
      const files = await unzipAsync(bytes);

      const ssRaw = files['xl/sharedStrings.xml'] || '';
      const sharedStrings = parseSharedStrings(ssRaw);

      const wbRaw = files['xl/workbook.xml'] || '';
      const sheetInfos = parseWorkbookSheets(wbRaw);

      for (let i = 0; i < sheetInfos.length; i++) {
        const wsRaw = files[`xl/worksheets/sheet${i + 1}.xml`] || '';
        const aoa   = parseWorksheet(wsRaw, sharedStrings);
        const ws    = XLSX.utils.aoa_to_sheet(aoa);
        XLSX.utils.book_append_sheet(wb, ws, sheetInfos[i]);
      }

      return wb;
    },

    // Version
    version: '1.0.0-qualpack',
  };

  // ─── Parsers XML minimaux ────────────────────────────────────────────────────


  async function inflateRawBytes(raw, compression) {
    if (compression !== 8) return raw;
    const attemptFormats = ['deflate-raw', 'deflate'];
    let lastErr = null;

    for (const format of attemptFormats) {
      try {
        const ds = new DecompressionStream(format);
        const stream = new Blob([raw]).stream().pipeThrough(ds);
        const ab = await new Response(stream).arrayBuffer();
        return new Uint8Array(ab);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Décompression ZIP non supportée');
  }

  async function unzipAsync(bytes) {
    const files = {};
    const view  = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let pos = 0;

    while (pos < bytes.length - 4) {
      const sig = view.getUint32(pos, true);
      if (sig !== 0x04034b50) break;

      const flags       = view.getUint16(pos + 6, true);
      const compression = view.getUint16(pos + 8, true);
      const compSize    = view.getUint32(pos + 18, true);
      const nameLen     = view.getUint16(pos + 26, true);
      const extraLen    = view.getUint16(pos + 28, true);
      const nameBytes   = bytes.slice(pos + 30, pos + 30 + nameLen);
      const name        = new TextDecoder().decode(nameBytes);
      const dataStart   = pos + 30 + nameLen + extraLen;

      if (flags & 0x0008) {
        throw new Error('ZIP avec data descriptor non supporté en lecture');
      }

      const dataEnd = dataStart + compSize;
      const raw = bytes.slice(dataStart, dataEnd);
      const out = await inflateRawBytes(raw, compression);

      files[name] = new TextDecoder('utf-8', { fatal: false }).decode(out);
      pos = dataEnd;

      if (pos + 4 <= bytes.length && view.getUint32(pos, true) === 0x08074b50) pos += 16;
    }
    return files;
  }

  function unzip(bytes) {
    const files = {};
    const view  = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let pos = 0;

    while (pos < bytes.length - 4) {
      const sig = view.getUint32(pos, true);
      if (sig !== 0x04034b50) break;

      const compression = view.getUint16(pos + 8, true);
      const compSize    = view.getUint32(pos + 18, true);
      const nameLen     = view.getUint16(pos + 26, true);
      const extraLen    = view.getUint16(pos + 28, true);
      const nameBytes   = bytes.slice(pos + 30, pos + 30 + nameLen);
      const name        = new TextDecoder().decode(nameBytes);
      const dataStart   = pos + 30 + nameLen + extraLen;
      const dataEnd     = dataStart + compSize;

      if (compression === 0) {
        // STORE — pas de décompression
        const raw = bytes.slice(dataStart, dataEnd);
        files[name] = new TextDecoder('utf-8', { fatal: false }).decode(raw);
      }
      // compression !== 0 (deflate) non supporté en lecture — xlsx.full.min.js
      // est principalement utilisé en écriture dans QualPack

      pos = dataEnd;
      // Sauter data descriptor si présent
      if (view.getUint32(pos, true) === 0x08074b50) pos += 16;
    }
    return files;
  }

  function parseSharedStrings(xml) {
    const strings = [];
    const re = /<si>[\s\S]*?<\/si>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const inner = m[0];
      // Extraire texte (gère <t>, <r><t>...)
      const texts = [];
      const tr = /<t(?:[^>]*)>([\s\S]*?)<\/t>/g;
      let tm;
      while ((tm = tr.exec(inner)) !== null) {
        texts.push(tm[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
        );
      }
      strings.push(texts.join(''));
    }
    return strings;
  }

  function parseWorkbookSheets(xml) {
    const names = [];
    const re = /<sheet\s[^>]*name="([^"]*)"[^>]*\/>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      names.push(m[1]
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>').replace(/&quot;/g, '"'));
    }
    return names;
  }

  function parseWorksheet(xml, sharedStrings) {
    const aoa = [];
    const reRow = /<row([^>]*)>([\s\S]*?)<\/row>/g;
    let rowM;
    let fallbackRowIndex = 0;
    while ((rowM = reRow.exec(xml)) !== null) {
      const rowAttrs = rowM[1] || '';
      const rowXml = rowM[2] || '';
      const explicitRow = rowAttrs.match(/\sr="(\d+)"/);
      const rowIndex = explicitRow ? Math.max(0, parseInt(explicitRow[1], 10) - 1) : fallbackRowIndex;
      fallbackRowIndex = rowIndex + 1;
      while (aoa.length < rowIndex) aoa.push([]);
      const row = [];
      const reCell = /<c\s([^>]*)>([\s\S]*?)<\/c>/g;
      let cellM;
      while ((cellM = reCell.exec(rowXml)) !== null) {
        const attrs = cellM[1];
        const inner = cellM[2];
        const rMatch = attrs.match(/r="([A-Z]+\d+)"/);
        const tMatch = attrs.match(/t="([^"]*)"/);
        const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
        const val    = vMatch ? vMatch[1] : '';

        if (!rMatch) continue;
        const decoded = XLSX.utils.decode_cell(rMatch[1]);
        const col = decoded.c;

        while (row.length < col) row.push('');

        if (tMatch && tMatch[1] === 's') {
          row[col] = sharedStrings[parseInt(val)] || '';
        } else if (tMatch && tMatch[1] === 'b') {
          row[col] = val === '1';
        } else if (val !== '') {
          const n = parseFloat(val);
          row[col] = isNaN(n) ? val : n;
        } else {
          row[col] = '';
        }
      }
      aoa[rowIndex] = row;
    }
    return aoa;
  }

  // ─── Export global ────────────────────────────────────────────────────────────
  if (typeof window !== 'undefined') {
    window.XLSX = XLSX;
  }

  return XLSX;
}));
