# Ledger structure

Two workbooks — payables and receivables are kept separate, matching the shop's existing
books.

```
Hutang_Usaha_2026     (payables)      Piutang_Usaha_2026    (receivables)
├── README            usage notes
├── _KODE             invoice-number prefix -> full counterparty name
├── _MASTER           every line from every tab, flat
├── _SALDO            outstanding balance per counterparty
├── TEMPLATE          per-party tab structure, with legend
└── <PARTY>           one tab per counterparty, created on demand by the workflow
```

## Per-party tab

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| TANGGAL | NO SURAT | NAMA BARANG | JUMLAH | SATUAN | HARGA / SATUAN | KREDIT | DEBET | TOTAL |

- `KREDIT` — new invoice, increases the balance
- `DEBET` — payment, decreases the balance
- `TOTAL` — running balance

Tab names are the full counterparty name, uppercased, with legal-form prefixes stripped
and characters Sheets rejects (`: \ / ? * [ ]`) removed.

## Running balance

Written into column I on every row. `INDIRECT` with `ROW()` makes the formula
row-independent, so the workflow can write the identical string without knowing where the
row will land:

```
=SUM($G$2:INDIRECT("G"&ROW()))-SUM($H$2:INDIRECT("H"&ROW()))
```

Requires the append node's **Cell Format** set to `USER_ENTERED`. Under `RAW` the formula
is stored as literal text.

## Recording a payment

A row in the same tab. Payments are not matched to specific invoices — partial payments
and combined settlements are routine, so the ledger tracks a running balance rather than
invoice-level settlement. This mirrors how the shop's own books already work.

| Field | Value |
|---|---|
| TANGGAL | payment date |
| NO SURAT | *(blank)* |
| NAMA BARANG | `PEMBAYARAN PIUTANG USAHA (BCA)` — method in parentheses |
| DEBET | amount |
| TOTAL | running-balance formula |

Where a payment falls short by a rounding remainder, a `DISKON` row clears the residue.

## _MASTER

| A | B | C | D | E | F | G | H | I | J | K | L |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TANGGAL | JENIS | NAMA PIHAK | NO SURAT | NAMA BARANG | JUMLAH | SATUAN | HARGA / SATUAN | KREDIT | DEBET | TOTAL | WAKTU INPUT |

Written in the same pass as the per-party tab. Two jobs:

1. Source for `_SALDO`
2. The duplicate check reads column D — one lookup instead of scanning every tab

`WAKTU INPUT` is the audit trail. When a balance disagrees months later, it is the only
way to trace back to when a row entered.

## _SALDO

Google Sheets formulas, in A2 / B2 / C2 / D2:

```
=UNIQUE(FILTER(_MASTER!C2:C, _MASTER!C2:C<>""))
=ARRAYFORMULA(IF(A2:A="",,SUMIF(_MASTER!C:C, A2:A, _MASTER!I:I)))
=ARRAYFORMULA(IF(A2:A="",,SUMIF(_MASTER!C:C, A2:A, _MASTER!J:J)))
=ARRAYFORMULA(IF(A2:A="",,B2:B-C2:C))
```

`SUMIF` rather than `QUERY`: `QUERY` infers a column's type from its contents and returns
`#VALUE!` when asked to sum a column that is entirely empty — which the payment column is,
on a fresh ledger.

## Constraints worth knowing

- **No blank rows inside a tab.** The append operation locates the first empty row; a gap
  mid-table sends writes to the wrong place. Filter on `TANGGAL` instead of inserting
  month separator rows.
- **Tab names are case-sensitive.** `Makmur Jaya` and `MAKMUR JAYA` are two different
  tabs. Normalisation runs before any tab is created or looked up.
- **Do not pre-fill formulas down empty rows.** Formula cells count as occupied for
  append's range detection, and new rows land below them.
