/**
 * jspdf.umd.js — QualPack compatible build
 * Wrapper UMD autoportant autour de la logique de génération PDF.
 * Compatible avec db.js (IndexedDB : pesees / detecteurs).
 * Pas de dépendance externe requise.
 */
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined'
    ? module.exports = factory()
    : typeof define === 'function' && define.amd
      ? define(factory)
      : (global = typeof globalThis !== 'undefined' ? globalThis : global || self,
         global.jspdf = global.jspdf || {},
         global.jspdf.jsPDF = factory());
}(this, function () {
  'use strict';

  // ─── Constantes PDF ────────────────────────────────────────────────────────
  const PT_PER_MM = 2.8346456692913385;
  const PAGE_W_MM = 210;
  const PAGE_H_MM = 297;
  const PAGE_W_PT = PAGE_W_MM * PT_PER_MM;
  const PAGE_H_PT = PAGE_H_MM * PT_PER_MM;

  // ─── Encodeur texte base85 / latin1 ────────────────────────────────────────
  function toHex(n, pad) {
    return n.toString(16).toUpperCase().padStart(pad, '0');
  }

  function latin1Encode(str) {
    let out = '';
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      out += c < 256 ? String.fromCharCode(c) : '?';
    }
    return out;
  }

  // ─── Polices intégrées (Helvetica, Courier) ────────────────────────────────
  const FONT_HELVETICA = 'Helvetica';
  const FONT_COURIER   = 'Courier';
  const FONT_BOLD      = 'Helvetica-Bold';

  // ─── Classe principale jsPDF ────────────────────────────────────────────────
  class jsPDF {
    constructor(options) {
      options = options || {};
      const orientation = (options.orientation || 'p').toLowerCase();
      const unit        = options.unit || 'mm';
      const format      = options.format || 'a4';

      // Facteur de conversion vers points
      this._k = unit === 'mm' ? PT_PER_MM
              : unit === 'cm' ? PT_PER_MM * 10
              : unit === 'in' ? 72
              : 1; // pt

      if (Array.isArray(format)) {
        this._pageW = format[0] * this._k;
        this._pageH = format[1] * this._k;
      } else {
        this._pageW = PAGE_W_PT;
        this._pageH = PAGE_H_PT;
      }
      if (orientation === 'l' || orientation === 'landscape') {
        [this._pageW, this._pageH] = [this._pageH, this._pageW];
      }

      this._pages        = [];       // tableaux de commandes par page
      this._currentPage  = 0;
      this._font         = FONT_HELVETICA;
      this._fontSize     = 10;
      this._textColor    = '0 0 0';  // RGB 0..1
      this._fillColor    = '1 1 1';
      this._drawColor    = '0 0 0';
      this._lineWidth    = 0.2;
      this._images       = {};
      this._objCount     = 0;
      this._objects      = [];       // objets PDF bruts
      this._margins      = { top: 10, right: 10, bottom: 10, left: 10 };

      this._addPage();
    }

    // ── Gestion pages ──────────────────────────────────────────────────────
    _addPage() {
      this._pages.push([]);
      this._currentPage = this._pages.length - 1;
    }

    addPage(format, orientation) {
      this._addPage();
      return this;
    }

    setPage(n) {
      if (n >= 1 && n <= this._pages.length) {
        this._currentPage = n - 1;
      }
      return this;
    }

    getNumberOfPages() { return this._pages.length; }

    _cmd(s) { this._pages[this._currentPage].push(s); }

    // ── Polices & tailles ─────────────────────────────────────────────────
    setFont(name, style) {
      style = (style || '').toLowerCase();
      if (style === 'bold' || style === 'b') {
        this._font = name.includes('Courier') ? 'Courier-Bold' : 'Helvetica-Bold';
      } else if (style === 'italic' || style === 'i') {
        this._font = name.includes('Courier') ? 'Courier-Oblique' : 'Helvetica-Oblique';
      } else if (style === 'bolditalic' || style === 'bi') {
        this._font = name.includes('Courier') ? 'Courier-BoldOblique' : 'Helvetica-BoldOblique';
      } else {
        this._font = name || FONT_HELVETICA;
      }
      return this;
    }

    setFontSize(size) {
      this._fontSize = size;
      return this;
    }

    getFontSize() { return this._fontSize; }

    // ── Couleurs ──────────────────────────────────────────────────────────
    _hexToRgb01(hex) {
      hex = hex.replace('#', '');
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      const r = parseInt(hex.substr(0, 2), 16) / 255;
      const g = parseInt(hex.substr(2, 2), 16) / 255;
      const b = parseInt(hex.substr(4, 2), 16) / 255;
      return `${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}`;
    }

    _parseColor(ch) {
      if (typeof ch === 'string' && ch.startsWith('#')) return this._hexToRgb01(ch);
      if (typeof ch === 'string') {
        const named = { black:'0 0 0', white:'1 1 1', red:'1 0 0', green:'0 0.502 0',
                        blue:'0 0 1', gray:'0.502 0.502 0.502', grey:'0.502 0.502 0.502',
                        orange:'1 0.647 0', yellow:'1 1 0' };
        return named[ch.toLowerCase()] || '0 0 0';
      }
      return '0 0 0';
    }

    setTextColor(r, g, b) {
      if (typeof r === 'string') { this._textColor = this._parseColor(r); return this; }
      if (g === undefined) {
        const v = r / 255;
        this._textColor = `${v.toFixed(4)} ${v.toFixed(4)} ${v.toFixed(4)}`;
      } else {
        this._textColor = `${(r/255).toFixed(4)} ${(g/255).toFixed(4)} ${(b/255).toFixed(4)}`;
      }
      return this;
    }

    setFillColor(r, g, b) {
      if (typeof r === 'string') { this._fillColor = this._parseColor(r); return this; }
      if (g === undefined) {
        const v = r / 255;
        this._fillColor = `${v.toFixed(4)} ${v.toFixed(4)} ${v.toFixed(4)}`;
      } else {
        this._fillColor = `${(r/255).toFixed(4)} ${(g/255).toFixed(4)} ${(b/255).toFixed(4)}`;
      }
      return this;
    }

    setDrawColor(r, g, b) {
      if (typeof r === 'string') { this._drawColor = this._parseColor(r); return this; }
      if (g === undefined) {
        const v = r / 255;
        this._drawColor = `${v.toFixed(4)} ${v.toFixed(4)} ${v.toFixed(4)}`;
      } else {
        this._drawColor = `${(r/255).toFixed(4)} ${(g/255).toFixed(4)} ${(b/255).toFixed(4)}`;
      }
      return this;
    }

    setLineWidth(w) {
      this._lineWidth = w;
      return this;
    }

    // ── Dimensions texte ──────────────────────────────────────────────────
    getStringUnitWidth(str) {
      // Approximation Helvetica : 0.5 * fontSize par caractère en pt
      return str.length * 0.5;
    }

    getTextWidth(str) {
      return this.getStringUnitWidth(str) * this._fontSize / this._k;
    }

    // ── Conversion coord (mm → pt internes) ───────────────────────────────
    _x(x) { return x * this._k; }
    _y(y) { return this._pageH - y * this._k; }

    // ── Texte ─────────────────────────────────────────────────────────────
    text(text, x, y, options) {
      options = options || {};
      const lines = Array.isArray(text) ? text : String(text).split('\n');
      const lineH = this._fontSize * 1.2 / this._k;

      this._cmd(`BT`);
      this._cmd(`/${this._pdfFontName(this._font)} ${this._fontSize} Tf`);
      this._cmd(`${this._textColor} rg`);

      let align = options.align || 'left';
      for (let i = 0; i < lines.length; i++) {
        const line = String(lines[i]);
        let px = x;
        if (align === 'center') {
          px = x - this.getTextWidth(line) / 2;
        } else if (align === 'right') {
          px = x - this.getTextWidth(line);
        }
        const pdfX = this._x(px);
        const pdfY = this._y(y + i * lineH);
        this._cmd(`${pdfX.toFixed(3)} ${pdfY.toFixed(3)} Td`);
        this._cmd(`(${this._escapePDF(line)}) Tj`);
        if (i < lines.length - 1) {
          this._cmd(`${(-pdfX).toFixed(3)} 0 Td`);
        }
      }
      this._cmd(`ET`);
      return this;
    }

    _escapePDF(s) {
      // Convertit les caractères Unicode en WinAnsiEncoding (cp1252)
      // pour être correctement affichés avec les polices Type1 standard PDF
      const WIN_ANSI = {
        '\u20AC': '\x80', '\u201A': '\x82', '\u0192': '\x83', '\u201E': '\x84',
        '\u2026': '\x85', '\u2020': '\x86', '\u2021': '\x87', '\u02C6': '\x88',
        '\u2030': '\x89', '\u0160': '\x8A', '\u2039': '\x8B', '\u0152': '\x8C',
        '\u017D': '\x8E', '\u2018': '\x91', '\u2019': '\x92', '\u201C': '\x93',
        '\u201D': '\x94', '\u2022': '\x95', '\u2013': '\x96', '\u2014': '\x97',
        '\u02DC': '\x98', '\u2122': '\x99', '\u0161': '\x9A', '\u203A': '\x9B',
        '\u0153': '\x9C', '\u017E': '\x9E', '\u0178': '\x9F',
        // Caractères spéciaux courants
        '\u00A0': '\xA0', '\u00A1': '\xA1', '\u00A2': '\xA2', '\u00A3': '\xA3',
        '\u00A4': '\xA4', '\u00A5': '\xA5', '\u00A6': '\xA6', '\u00A7': '\xA7',
        '\u00A8': '\xA8', '\u00A9': '\xA9', '\u00AA': '\xAA', '\u00AB': '\xAB',
        '\u00AC': '\xAC', '\u00AD': '\xAD', '\u00AE': '\xAE', '\u00AF': '\xAF',
        '\u00B0': '\xB0', '\u00B1': '\xB1', '\u00B2': '\xB2', '\u00B3': '\xB3',
        '\u00B4': '\xB4', '\u00B5': '\xB5', '\u00B6': '\xB6', '\u00B7': '\xB7',
        '\u00B8': '\xB8', '\u00B9': '\xB9', '\u00BA': '\xBA', '\u00BB': '\xBB',
        '\u00BC': '\xBC', '\u00BD': '\xBD', '\u00BE': '\xBE', '\u00BF': '\xBF',
        '\u00C0': '\xC0', '\u00C1': '\xC1', '\u00C2': '\xC2', '\u00C3': '\xC3',
        '\u00C4': '\xC4', '\u00C5': '\xC5', '\u00C6': '\xC6', '\u00C7': '\xC7',
        '\u00C8': '\xC8', '\u00C9': '\xC9', '\u00CA': '\xCA', '\u00CB': '\xCB',
        '\u00CC': '\xCC', '\u00CD': '\xCD', '\u00CE': '\xCE', '\u00CF': '\xCF',
        '\u00D0': '\xD0', '\u00D1': '\xD1', '\u00D2': '\xD2', '\u00D3': '\xD3',
        '\u00D4': '\xD4', '\u00D5': '\xD5', '\u00D6': '\xD6', '\u00D7': '\xD7',
        '\u00D8': '\xD8', '\u00D9': '\xD9', '\u00DA': '\xDA', '\u00DB': '\xDB',
        '\u00DC': '\xDC', '\u00DD': '\xDD', '\u00DE': '\xDE', '\u00DF': '\xDF',
        '\u00E0': '\xE0', '\u00E1': '\xE1', '\u00E2': '\xE2', '\u00E3': '\xE3',
        '\u00E4': '\xE4', '\u00E5': '\xE5', '\u00E6': '\xE6', '\u00E7': '\xE7',
        '\u00E8': '\xE8', '\u00E9': '\xE9', '\u00EA': '\xEA', '\u00EB': '\xEB',
        '\u00EC': '\xEC', '\u00ED': '\xED', '\u00EE': '\xEE', '\u00EF': '\xEF',
        '\u00F0': '\xF0', '\u00F1': '\xF1', '\u00F2': '\xF2', '\u00F3': '\xF3',
        '\u00F4': '\xF4', '\u00F5': '\xF5', '\u00F6': '\xF6', '\u00F7': '\xF7',
        '\u00F8': '\xF8', '\u00F9': '\xF9', '\u00FA': '\xFA', '\u00FB': '\xFB',
        '\u00FC': '\xFC', '\u00FD': '\xFD', '\u00FE': '\xFE', '\u00FF': '\xFF',
        // Caractères spéciaux typographiques fréquents
        '\u2019': '\x92', // apostrophe courbe '
        '\u2018': '\x91', // guillemet courbe '
        '\u201C': '\x93', // guillemet double "
        '\u201D': '\x94', // guillemet double "
        '\u2013': '\x96', // tiret demi-cadratin –
        '\u2014': '\x97', // tiret cadratin —
        '\u2026': '\x85', // points de suspension …
        '\u2022': '\x95', // puce •
        '\u00B7': '\xB7', // point médian ·
        '\u2713': '\x9F', // coche ✓ → approx
        '\u2022': '\x95', // bullet
      };

      let result = '';
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        const code = s.charCodeAt(i);
        if (ch === '\\') { result += '\\\\'; }
        else if (ch === '(')  { result += '\\('; }
        else if (ch === ')')  { result += '\\)'; }
        else if (code < 128)  { result += ch; }
        else if (WIN_ANSI[ch]) { result += WIN_ANSI[ch]; }
        else if (code >= 0x100 && code <= 0x17E) {
          // Latin Extended — approximations courantes
          const LATIN_EXT = {
            0x100:'A',0x101:'a',0x102:'A',0x103:'a',0x104:'A',0x105:'a',
            0x106:'C',0x107:'c',0x108:'C',0x109:'c',0x10A:'C',0x10B:'c',
            0x10C:'C',0x10D:'c',0x10E:'D',0x10F:'d',0x110:'D',0x111:'d',
            0x112:'E',0x113:'e',0x118:'E',0x119:'e',0x11A:'E',0x11B:'e',
            0x11C:'G',0x11D:'g',0x11E:'G',0x11F:'g',0x120:'G',0x121:'g',
            0x122:'G',0x123:'g',0x124:'H',0x125:'h',0x128:'I',0x129:'i',
            0x12A:'I',0x12B:'i',0x12E:'I',0x12F:'i',0x130:'I',0x131:'i',
            0x134:'J',0x135:'j',0x136:'K',0x137:'k',0x139:'L',0x13A:'l',
            0x13B:'L',0x13C:'l',0x13D:'L',0x13E:'l',0x141:'L',0x142:'l',
            0x143:'N',0x144:'n',0x145:'N',0x146:'n',0x147:'N',0x148:'n',
            0x14C:'O',0x14D:'o',0x150:'O',0x151:'o',0x154:'R',0x155:'r',
            0x156:'R',0x157:'r',0x158:'R',0x159:'r',0x15A:'S',0x15B:'s',
            0x15C:'S',0x15D:'s',0x15E:'S',0x15F:'s',0x162:'T',0x163:'t',
            0x164:'T',0x165:'t',0x168:'U',0x169:'u',0x16A:'U',0x16B:'u',
            0x16C:'U',0x16D:'u',0x16E:'U',0x16F:'u',0x170:'U',0x171:'u',
            0x172:'U',0x173:'u',0x174:'W',0x175:'w',0x176:'Y',0x177:'y',
            0x179:'Z',0x17A:'z',0x17B:'Z',0x17C:'z',0x17D:'Z',0x17E:'z',
          };
          result += LATIN_EXT[code] || '?';
        } else {
          result += '?';
        }
      }
      return result;
    }

    _pdfFontName(f) {
      const map = {
        'Helvetica':             'F1',
        'Helvetica-Bold':        'F2',
        'Helvetica-Oblique':     'F3',
        'Helvetica-BoldOblique': 'F4',
        'Courier':               'F5',
        'Courier-Bold':          'F6',
        'Courier-Oblique':       'F7',
        'Courier-BoldOblique':   'F8',
        'Times-Roman':           'F9',
        'Times-Bold':            'F10',
      };
      return map[f] || 'F1';
    }

    // ── Formes géométriques ───────────────────────────────────────────────
    rect(x, y, w, h, style) {
      const px = this._x(x);
      const py = this._y(y) - h * this._k;
      const pw = w * this._k;
      const ph = h * this._k;

      this._cmd(`${this._lineWidth * this._k} w`);
      if (style === 'F' || style === 'FD') {
        this._cmd(`${this._fillColor} rg`);
        this._cmd(`${px.toFixed(3)} ${py.toFixed(3)} ${pw.toFixed(3)} ${ph.toFixed(3)} re`);
        this._cmd(style === 'FD' ? 'B' : 'f');
      } else {
        this._cmd(`${this._drawColor} RG`);
        this._cmd(`${px.toFixed(3)} ${py.toFixed(3)} ${pw.toFixed(3)} ${ph.toFixed(3)} re`);
        this._cmd('S');
      }
      return this;
    }

    roundedRect(x, y, w, h, rx, ry, style) {
      // Approximation : rect classique si rx/ry petits
      return this.rect(x, y, w, h, style);
    }

    line(x1, y1, x2, y2) {
      this._cmd(`${this._drawColor} RG`);
      this._cmd(`${this._lineWidth * this._k} w`);
      this._cmd(`${this._x(x1).toFixed(3)} ${this._y(y1).toFixed(3)} m`);
      this._cmd(`${this._x(x2).toFixed(3)} ${this._y(y2).toFixed(3)} l S`);
      return this;
    }

    // ── splitTextToSize ────────────────────────────────────────────────────
    splitTextToSize(text, maxWidth) {
      const words = String(text).split(' ');
      const lines = [];
      let current = '';
      for (const word of words) {
        const test = current ? current + ' ' + word : word;
        if (this.getTextWidth(test) <= maxWidth) {
          current = test;
        } else {
          if (current) lines.push(current);
          current = word;
        }
      }
      if (current) lines.push(current);
      return lines.length ? lines : [text];
    }

    // ── Dimensions page ───────────────────────────────────────────────────
    internal = {
      pageSize: {
        getWidth:  () => this._pageW / this._k,
        getHeight: () => this._pageH / this._k,
      },
      getEncryptor: () => (str) => str,
    };

    // ── addImage ──────────────────────────────────────────────────────────
    /**
     * Insère une image dans le PDF.
     * @param {string} imageData  base64 string ou data URL (data:image/jpeg;base64,...)
     * @param {string} format     'JPEG' | 'PNG' (ignoré ici, on détecte depuis data URL)
     * @param {number} x          position X en mm
     * @param {number} y          position Y en mm
     * @param {number} w          largeur en mm
     * @param {number} h          hauteur en mm
     */
    addImage(imageData, format, x, y, w, h) {
      try {
        // Extraire base64 pur depuis data URL si nécessaire
        let b64, mimeType;
        if (typeof imageData === 'string' && imageData.startsWith('data:')) {
          const parts = imageData.split(',');
          b64 = parts[1];
          mimeType = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
        } else if (typeof imageData === 'string') {
          b64 = imageData;
          mimeType = (format || 'JPEG').toLowerCase() === 'png' ? 'image/png' : 'image/jpeg';
        } else {
          console.warn('addImage: format imageData non supporté');
          return this;
        }

        const imgId = 'IMG' + (Object.keys(this._images).length + 1);
        this._images[imgId] = { b64, mimeType, x, y, w, h, page: this._currentPage };

        // Commande XObject dans le flux de la page
        const px = this._x(x);
        const py = this._y(y) - h * this._k;
        const pw = w * this._k;
        const ph = h * this._k;
        this._cmd(`q ${pw.toFixed(3)} 0 0 ${ph.toFixed(3)} ${px.toFixed(3)} ${py.toFixed(3)} cm /${imgId} Do Q`);
      } catch(e) {
        console.warn('addImage error:', e);
      }
      return this;
    }

    // ── autoTable (plugin léger intégré) ──────────────────────────────────
    autoTable(opts) {
      opts = opts || {};
      const head    = opts.head || [];
      const body    = opts.body || [];
      const startY  = opts.startY || 20;
      const margin  = opts.margin || { left: 10, right: 10 };
      const ml      = (typeof margin === 'number') ? margin : (margin.left || 10);
      const mr      = (typeof margin === 'number') ? margin : (margin.right || 10);
      const styles  = opts.styles || {};
      const headStyles = opts.headStyles || {};
      const bodyStyles = opts.bodyStyles || {};
      const altBodyStyles = opts.alternateRowStyles || {};
      const colStyles  = opts.columnStyles || {};
      const theme   = opts.theme || 'striped';

      const pageW   = this._pageW / this._k;
      const tableW  = pageW - ml - mr;
      const didDrawPage = opts.didDrawPage || null;
      const didParseCell = opts.didParseCell || null;

      // Colonnes
      const columns = opts.columns || (head[0] ? head[0].map((_, i) => ({ dataKey: i })) : []);
      const numCols = head[0] ? head[0].length : (body[0] ? body[0].length : 0);
      if (numCols === 0) { this.lastAutoTable = { finalY: startY }; return this; }

      // Largeurs
      let colWidths = [];
      if (opts.columnStyles) {
        let totalFixed = 0, fixedCount = 0;
        for (let c = 0; c < numCols; c++) {
          const cs = opts.columnStyles[c] || {};
          if (cs.cellWidth) { colWidths[c] = cs.cellWidth; totalFixed += cs.cellWidth; fixedCount++; }
        }
        const remaining = (tableW - totalFixed) / (numCols - fixedCount || 1);
        for (let c = 0; c < numCols; c++) {
          if (!colWidths[c]) colWidths[c] = remaining;
        }
      } else {
        const w = tableW / numCols;
        colWidths = Array(numCols).fill(w);
      }

      const rowH        = styles.rowHeight || headStyles.rowHeight || bodyStyles.rowHeight || 7;
      const headRowH    = headStyles.rowHeight || rowH;
      const headFS      = headStyles.fontSize  || styles.fontSize || this._fontSize;
      const bodyFS      = bodyStyles.fontSize  || styles.fontSize || this._fontSize;
      const cellPad     = styles.cellPadding !== undefined ? styles.cellPadding : 2;
      const pageH       = this._pageH / this._k;
      const bottomMargin = (opts.margin && opts.margin.bottom) || 15;

      let curY = startY;

      // ── Draw header ──
      const drawHeader = (y) => {
        if (!head.length) return y;
        const hRow = head[0];
        let cx = ml;
        // Fond header
        const hBg = headStyles.fillColor || (theme === 'grid' ? [66,66,66] : [41, 128, 185]);
        this.setFillColor(hBg[0], hBg[1], hBg[2]);
        this.rect(ml, y, tableW, headRowH, 'F');
        // Texte header
        this.setFontSize(headFS);
        this.setFont(this._font, 'bold');
        const hTc = headStyles.textColor || [255, 255, 255];
        this.setTextColor(hTc[0], hTc[1], hTc[2]);
        for (let c = 0; c < hRow.length; c++) {
          const cell = hRow[c];
          const txt  = typeof cell === 'object' ? (cell.content || cell.title || '') : String(cell || '');
          const ha   = (headStyles.halign || 'left');
          const tx   = ha === 'center' ? cx + colWidths[c] / 2
                     : ha === 'right'  ? cx + colWidths[c] - cellPad
                     : cx + cellPad;
          this.text(txt, tx, y + headRowH - cellPad - 0.5, { align: ha });
          cx += colWidths[c];
        }
        return y + headRowH;
      };

      curY = drawHeader(curY);

      // ── Draw body ──
      this.setFontSize(bodyFS);
      this.setFont(this._font, 'normal');

      for (let r = 0; r < body.length; r++) {
        const row = body[r];

        // Calcul hauteur dynamique (wrap)
        let rowHeight = rowH;
        for (let c = 0; c < row.length; c++) {
          const cs  = colStyles[c] || {};
          const ov  = cs.overflow || styles.overflow || 'ellipsize';
          if (ov === 'linebreak') {
            const cell = row[c];
            const txt  = typeof cell === 'object' ? String(cell.content || '') : String(cell || '');
            const maxW = colWidths[c] - cellPad * 2;
            const lines = this.splitTextToSize(txt, maxW);
            const needed = lines.length * (bodyFS * 1.2 / this._k) + cellPad * 2;
            if (needed > rowHeight) rowHeight = needed;
          }
        }

        // Nouvelle page si nécessaire
        if (curY + rowHeight > pageH - bottomMargin) {
          this.addPage();
          curY = (opts.margin && opts.margin.top) || 10;
          if (opts.showHead !== 'firstPage') {
            curY = drawHeader(curY);
          }
          if (didDrawPage) didDrawPage({ pageNumber: this._currentPage + 1, doc: this });
        }

        // Fond alterné
        let bg = null;
        if (theme === 'striped' && r % 2 === 1) {
          bg = altBodyStyles.fillColor || [240, 240, 240];
        }
        if (bodyStyles.fillColor) bg = bodyStyles.fillColor;
        if (bg) {
          this.setFillColor(bg[0], bg[1], bg[2]);
          this.rect(ml, curY, tableW, rowHeight, 'F');
        }
        if (theme === 'grid') {
          this.setDrawColor(200, 200, 200);
          this.rect(ml, curY, tableW, rowHeight);
        }

        // Cellules
        let cx = ml;
        const tc = bodyStyles.textColor || (styles.textColor) || [0,0,0];
        this.setTextColor(tc[0], tc[1], tc[2]);

        for (let c = 0; c < numCols; c++) {
          const cell = row[c];
          const cs   = colStyles[c] || {};
          const ha   = cs.halign || bodyStyles.halign || styles.halign || 'left';
          const ov   = cs.overflow || styles.overflow || 'ellipsize';
          let txt    = typeof cell === 'object' ? String(cell.content || '') : String(cell !== undefined && cell !== null ? cell : '');

          if (ov === 'linebreak') {
            const maxW = colWidths[c] - cellPad * 2;
            const lines = this.splitTextToSize(txt, maxW);
            for (let li = 0; li < lines.length; li++) {
              const ty = curY + cellPad + li * (bodyFS * 1.2 / this._k) + bodyFS / this._k * 0.7;
              this.text(lines[li], cx + cellPad, ty);
            }
          } else {
            // Ellipsis si trop long
            const maxW = colWidths[c] - cellPad * 2;
            while (txt.length > 1 && this.getTextWidth(txt) > maxW) {
              txt = txt.slice(0, -1);
            }
            const tx = ha === 'center' ? cx + colWidths[c] / 2
                     : ha === 'right'  ? cx + colWidths[c] - cellPad
                     : cx + cellPad;
            const ty = curY + cellPad + bodyFS / this._k * 0.7;
            this.text(txt, tx, ty, { align: ha });
          }

          if (theme === 'grid') {
            this.setDrawColor(200, 200, 200);
            this.line(cx, curY, cx, curY + rowHeight);
          }
          cx += colWidths[c];
        }

        curY += rowHeight;
      }

      // Bordure finale tableau (grid)
      if (theme === 'grid') {
        this.setDrawColor(200, 200, 200);
        this.rect(ml, startY, tableW, curY - startY);
      }

      this.lastAutoTable = { finalY: curY };
      // Restaurer couleur texte
      this.setTextColor(0, 0, 0);
      return this;
    }

    // ── Génération PDF binaire ─────────────────────────────────────────────
    _buildPDF() {
      const out = [];
      const offsets = [];

      const emit = (s) => out.push(s);
      let pos = 0;
      const positions = [];

      const write = (s) => {
        const b = s + '\n';
        positions.push(pos);
        pos += new TextEncoder().encode(b).length;
        return b;
      };

      let pdf = '%PDF-1.4\n';
      pdf += '%\xFF\xFF\xFF\xFF\n'; // binary marker

      // Objets accumulés
      const objs = [];
      let oid = 1;

      const FONTS = [
        ['F1',  'Helvetica'],
        ['F2',  'Helvetica-Bold'],
        ['F3',  'Helvetica-Oblique'],
        ['F4',  'Helvetica-BoldOblique'],
        ['F5',  'Courier'],
        ['F6',  'Courier-Bold'],
        ['F7',  'Courier-Oblique'],
        ['F8',  'Courier-BoldOblique'],
        ['F9',  'Times-Roman'],
        ['F10', 'Times-Bold'],
      ];

      // Font objects
      const fontOids = {};
      for (const [fname, basefont] of FONTS) {
        const foid = oid++;
        fontOids[fname] = foid;
        objs.push({ id: foid, data:
          `${foid} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /${basefont} /Encoding /WinAnsiEncoding >>\nendobj` });
      }

      // Resources dict
      let fontDict = '';
      for (const [fname] of FONTS) {
        fontDict += `/${fname} ${fontOids[fname]} 0 R `;
      }

      // Image XObject objects
      const imageOids = {};
      for (const [imgId, img] of Object.entries(this._images)) {
        const ioid = oid++;
        imageOids[imgId] = ioid;
        const rawB64 = img.b64.replace(/\s/g, '');
        const binStr = atob(rawB64);
        const imgBytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) imgBytes[i] = binStr.charCodeAt(i);
        const isJpeg = imgBytes[0] === 0xFF && imgBytes[1] === 0xD8;
        let iw = 100, ih = 100;
        if (isJpeg) {
          for (let i = 2; i < imgBytes.length - 8; i++) {
            if (imgBytes[i] === 0xFF && (imgBytes[i+1] & 0xF0) === 0xC0 && imgBytes[i+1] !== 0xFF) {
              ih = (imgBytes[i+5] << 8) | imgBytes[i+6];
              iw = (imgBytes[i+7] << 8) | imgBytes[i+8];
              break;
            }
          }
        } else {
          iw = (imgBytes[16]<<24)|(imgBytes[17]<<16)|(imgBytes[18]<<8)|imgBytes[19];
          ih = (imgBytes[20]<<24)|(imgBytes[21]<<16)|(imgBytes[22]<<8)|imgBytes[23];
        }
        objs.push({ id: ioid, isImage: true, imgBytes, filter: isJpeg ? '/DCTDecode' : '/FlateDecode', iw, ih, imgId });
      }

      // XObject dict par page
      const pageXObjDict = {};
      for (const [imgId, img] of Object.entries(this._images)) {
        const p = img.page;
        if (!pageXObjDict[p]) pageXObjDict[p] = '';
        pageXObjDict[p] += `/${imgId} ${imageOids[imgId]} 0 R `;
      }

      // Page contents + page objects
      const pageOids = [];
      const contentOids = [];

      for (let p = 0; p < this._pages.length; p++) {
        const cmds = this._pages[p].join('\n');
        const contentOid = oid++;
        const stream = cmds;
        // Longueur en bytes latin1 (1 byte par caractère, pas UTF-8)
        const streamLen = stream.length;
        objs.push({ id: contentOid, data:
          `${contentOid} 0 obj\n<< /Length ${streamLen} >>\nstream\n${stream}\nendstream\nendobj` });
        contentOids.push(contentOid);

        const pageOid = oid++;
        pageOids.push(pageOid);
        objs.push({ id: pageOid, data: null, isPage: true, contentOid, pageIdx: p });
      }

      // Pages node
      const pagesOid = oid++;
      const pageRefs = pageOids.map(i => `${i} 0 R`).join(' ');
      objs.push({ id: pagesOid, data:
        `${pagesOid} 0 obj\n<< /Type /Pages /Kids [${pageRefs}] /Count ${pageOids.length} >>\nendobj` });

      // Fill page objects now that pagesOid is known
      for (let p = 0; p < pageOids.length; p++) {
        const pid = pageOids[p];
        const cid = contentOids[p];
        const obj = objs.find(o => o.id === pid);
        const xobjDict = pageXObjDict[p] ? `/XObject << ${pageXObjDict[p]}>>` : '';
        obj.data = `${pid} 0 obj\n<< /Type /Page /Parent ${pagesOid} 0 R`
          + ` /MediaBox [0 0 ${this._pageW.toFixed(3)} ${this._pageH.toFixed(3)}]`
          + ` /Resources << /Font << ${fontDict}>> ${xobjDict}>>`
          + ` /Contents ${cid} 0 R >>\nendobj`;
      }

      // Catalog
      const catalogOid = oid++;
      objs.push({ id: catalogOid, data:
        `${catalogOid} 0 obj\n<< /Type /Catalog /Pages ${pagesOid} 0 R >>\nendobj` });

      // Assemble — encodage latin1 pour les flux PDF (WinAnsiEncoding)
      // TextEncoder encode en UTF-8 ce qui corrompt les accents dans les flux PDF
      const latin1Bytes = (s) => {
        const out = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xFF;
        return out;
      };
      const utf8Bytes = (s) => new TextEncoder().encode(s);

      const parts = [];
      const pushLatin1 = (s) => parts.push(latin1Bytes(s));
      const pushUTF8  = (s) => parts.push(utf8Bytes(s));

      // L'en-tête et les dictionnaires PDF sont ASCII pur → latin1 OK
      pushLatin1(`%PDF-1.4\n%\xFF\xFF\n`);
      let byteOffset = 10; // "%PDF-1.4\n%\xFF\xFF\n" = 10 bytes

      const xref = {};
      for (const obj of objs) {
        xref[obj.id] = byteOffset;
        if (obj.isImage) {
          // Objet image binaire — header ASCII, données binaires
          const header = `${obj.id} 0 obj\n<< /Type /XObject /Subtype /Image`
            + ` /Width ${obj.iw} /Height ${obj.ih}`
            + ` /ColorSpace /DeviceRGB /BitsPerComponent 8`
            + ` /Filter ${obj.filter}`
            + ` /Length ${obj.imgBytes.length} >>\nstream\n`;
          const footer = `\nendstream\nendobj\n`;
          const hBytes = latin1Bytes(header);
          const fBytes = latin1Bytes(footer);
          parts.push(hBytes, obj.imgBytes, fBytes);
          byteOffset += hBytes.length + obj.imgBytes.length + fBytes.length;
        } else {
          // Tous les autres objets (dictionnaires, flux de page) → latin1
          // Les flux de page contiennent des bytes WinAnsi (accents encodés par _escapePDF)
          const s = obj.data + '\n';
          const b = latin1Bytes(s);
          parts.push(b);
          byteOffset += b.length;
        }
      }

      const xrefOffset = byteOffset;
      const maxId = Math.max(...objs.map(o => o.id));
      let xrefTable = `xref\n0 ${maxId + 1}\n`;
      xrefTable += '0000000000 65535 f \n';
      for (let i = 1; i <= maxId; i++) {
        const off = xref[i];
        if (off !== undefined) {
          xrefTable += String(off).padStart(10, '0') + ' 00000 n \n';
        } else {
          xrefTable += '0000000000 65535 f \n';
        }
      }
      xrefTable += `trailer\n<< /Size ${maxId + 1} /Root ${catalogOid} 0 R >>\n`;
      xrefTable += `startxref\n${xrefOffset}\n%%EOF`;
      parts.push(latin1Bytes(xrefTable));

      // Concaténer tous les Uint8Array
      const totalLen = parts.reduce((s, p) => s + p.length, 0);
      const finalBytes = new Uint8Array(totalLen);
      let pos2 = 0;
      for (const p of parts) { finalBytes.set(p, pos2); pos2 += p.length; }

      return finalBytes;
    }

    // ── Sorties ────────────────────────────────────────────────────────────
    output(type, options) {
      const bytes = this._buildPDF(); // toujours Uint8Array maintenant
      const blob  = new Blob([bytes], { type: 'application/pdf' });

      if (type === 'blob' || !type) return blob;
      if (type === 'arraybuffer') return bytes.buffer;
      if (type === 'datauristring' || type === 'dataurlstring') {
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return 'data:application/pdf;base64,' + btoa(bin);
      }
      if (type === 'datauri' || type === 'dataurl') {
        const url = URL.createObjectURL(blob);
        window.open(url, options && options.filename ? options.filename : '_blank');
        return;
      }
      return blob;
    }

    save(filename, options) {
      filename = filename || 'document.pdf';
      const blob = this.output('blob');
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 300);
      if (options && typeof options.returnPromise === 'boolean' && options.returnPromise) {
        return Promise.resolve();
      }
    }

    // ── Compatibilité plugin autoTable externe ─────────────────────────────
    // Permet d'utiliser jspdf-autotable s'il est chargé séparément
    static API = {};
  }

  // ── Plugin autoTable global (si chargé séparément) ──────────────────────
  if (typeof window !== 'undefined') {
    window.jspdf = window.jspdf || {};
    window.jspdf.jsPDF = jsPDF;
    // Alias commun
    window.jsPDF = jsPDF;
  }

  return jsPDF;
}));
