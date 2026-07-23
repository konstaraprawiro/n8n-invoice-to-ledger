/**
 * Node: "Check invoice no."
 * Mode: Run Once for All Items
 *
 * Input: every row of the flat master ledger.
 * Output: the parsed invoice, plus a `duplikat` flag.
 *
 * The same invoice photographed twice produces a duplicate set of rows and a
 * silently wrong balance. This is why invoice-number OCR accuracy matters more
 * than it first appears.
 */

const data = $('Parse, classify & validate').first().json;
const noSurat = String(data.no_surat || '').trim().toUpperCase();

const seen = new Set();
for (const item of $input.all()) {
  const n = String(item.json['NO SURAT'] || '').trim().toUpperCase();
  if (n) seen.add(n);
}

return [{
  json: {
    ...data,
    duplikat: noSurat ? seen.has(noSurat) : false,
  },
}];
