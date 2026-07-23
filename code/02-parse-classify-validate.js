/**
 * Node: "Parse, classify & validate"
 * Mode: Run Once for Each Item
 *
 * The core of the workflow. Takes the raw Claude response and:
 *   1. parses the JSON payload
 *   2. derives transaction direction from the invoice-number prefix
 *   3. resolves the counterparty name, guarding against our own name
 *   4. runs arithmetic and structural cross-checks
 *   5. attaches invoice metadata to every line item before the split
 *
 * Company identifiers below are placeholders.
 */

// ---------- configuration ----------

// Aliases of our own company. Never valid as a counterparty name.
const SELF = ['NORTHGATE PRINT WORKS', 'NORTHGATE', 'NPW'];

// Invoice-number prefix we issue ourselves => receivable.
const PREFIX_RECEIVABLE = 'NPW';

// Prefix -> full counterparty name. Mirrors the _KODE sheet tab.
// Used when the supplier name is not visible on the document, which is
// common on purchase invoices.
const KODE_PIHAK = {
  // 'PPS': 'PACIFIC PAPER SUPPLY',
};

/** Normalise a party name into a valid, collision-free sheet tab name. */
function norm(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/[:\\\/\?\*\[\]]/g, ' ')     // characters Sheets rejects in tab names
    .replace(/\b(PT|CV|UD|TB)\b\.?/g, '') // legal-form prefixes
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);                        // Sheets limit is 100
}

// ---------- parse ----------

let raw = $input.item.json.content[0].text;
raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();
const d = JSON.parse(raw);

// ---------- direction and counterparty ----------

const noSurat = String(d.no_surat || '').toUpperCase();
const seg = noSurat.split('/');
const kode = (seg[1] || '').trim();

// Direction comes from the invoice number, never from document layout.
// On a purchase invoice our own name sits in the recipient box, so layout
// is correct exactly half the time.
const jenis = kode.includes(PREFIX_RECEIVABLE) ? 'PIUTANG' : 'HUTANG';

let pihak = norm(d.nama_pihak);
let pakaiKode = false;

if (!pihak || SELF.includes(pihak)) {
  pihak = KODE_PIHAK[kode] || kode;
  pakaiKode = !KODE_PIHAK[kode] && !!kode;
}

// ---------- cross-checks ----------

const peringatan = [];

// 1. qty x unit price should equal the stated line total.
//    Catches inverted thousands separators and misread columns.
(d.items || []).forEach((it, i) => {
  if (it.harga_satuan === null || it.harga_satuan === undefined) return; // "minimum" pricing
  const q = Number(it.jumlah);
  const p = Number(it.harga_satuan);
  const s = Number(it.subtotal);
  if (!isFinite(q) || !isFinite(p) || !isFinite(s)) return;

  const expected = q * p;
  const tolerance = Math.max(5, s * 0.01);
  if (Math.abs(expected - s) > tolerance) {
    peringatan.push(
      `Item ${i + 1}: ${q} x ${p} = ${expected}, document states ${s} ` +
      `(quantity or unit price likely misread)`
    );
  }
});

// 2. First two digits of the invoice number encode the month and must match
//    the Roman numeral in the third segment. Catches character substitution
//    in the deduplication key.
const ROMAN = { I:1, II:2, III:3, IV:4, V:5, VI:6, VII:7, VIII:8, IX:9, X:10, XI:11, XII:12 };
const monthRoman = ROMAN[(seg[2] || '').trim()];
const monthDigits = parseInt(String(seg[0] || '').slice(0, 2), 10);
if (monthRoman && !isNaN(monthDigits) && monthRoman !== monthDigits) {
  peringatan.push(
    `Invoice no: leading digits (${String(seg[0]).slice(0, 2)}) do not match ` +
    `month ${seg[2]} (${monthRoman})`
  );
}

// 3. Sum of line totals should equal the stated invoice total.
//    Catches dropped or duplicated rows.
const sumLines = (d.items || []).reduce((a, it) => a + Number(it.subtotal || 0), 0);
if (d.total_nota != null && sumLines !== Number(d.total_nota)) {
  peringatan.push(`Line totals sum to ${sumLines}, document states ${d.total_nota}`);
}

// ---------- retake conditions ----------

let perluUlang = d.perlu_foto_ulang === true;
let alasan = d.alasan_kurang_jelas || 'Image not legible';

// A missing counterparty name is NOT a retake condition — the prefix lookup
// covers it, and on purchase invoices the name is often not in frame at all.
if (!perluUlang && !pihak) {
  perluUlang = true;
  alasan = 'Neither counterparty name nor invoice code could be read';
}
if (!perluUlang && (!Array.isArray(d.items) || d.items.length === 0)) {
  perluUlang = true;
  alasan = 'No line items could be read';
}

// ---------- attach metadata before the split ----------
// Each row carries its own identity so downstream nodes never need to reach
// back across the graph.

const items = (d.items || []).map((it) => ({
  nama_barang: it.nama_barang || '',
  jumlah: it.jumlah ?? null,
  satuan: it.satuan || '',
  harga_satuan: it.harga_satuan ?? null,
  subtotal: it.subtotal ?? null,
  tanggal: d.tanggal || '',
  no_surat: d.no_surat || '',
  nama_pihak: pihak,
  jenis,
}));

return {
  json: {
    nama_pihak: pihak,
    jenis,
    kode,
    pakai_kode: pakaiKode,   // true => tab named by code, full name not yet mapped
    no_surat: d.no_surat || '',
    tanggal: d.tanggal || '',
    total_nota: d.total_nota ?? null,
    perlu_foto_ulang: perluUlang,
    alasan,
    peringatan,
    items,
  },
};
