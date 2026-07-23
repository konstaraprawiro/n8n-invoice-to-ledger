# Failure modes

Every entry here is a bug that reached a real ledger or silently stopped the workflow.
They are recorded because the fixes are the design.

---

## Extraction

### Thousands separator inverted

**Symptom** — an invoice line read `30.200 pcs` was stored as `30.2`. The money column was
correct; the quantity was off by 1000×.

**Cause** — Indonesian number formatting uses `.` for thousands and `,` for decimals. The
model applied the English convention. The characters were read perfectly.

**Detection** — `30.2 × 155 = 4,681` against a stated line total of `4,681,000`. The
arithmetic check caught what the image could not.

**Fix** — state the convention explicitly in the prompt, *and* verify
`qty × unit price ≈ line total` in code. The prompt alone was not reliable; the code
check is what actually holds.

---

### Own company treated as the counterparty

**Symptom** — a purchase invoice created a ledger tab named after the business itself.

**Cause** — on a *sales* invoice the box in the top-right holds the customer. On a
*purchase* invoice that same box holds the shop, as recipient. Extracting "the company
name in the top-right box" is correct exactly half the time.

**Fix** — two rules. Direction is decided from the invoice-number prefix, not from layout.
And a guard list of the shop's own aliases is checked after normalisation; a match falls
back to the counterparty code from the invoice number rather than writing the name.

**Consequence** — on purchase invoices the supplier name is frequently not in frame at
all. `null` had to become a valid extraction result, and the prefix-to-name lookup table
(`_KODE`) became the primary source rather than a fallback.

---

### Character substitution in the invoice number

**Symptom** — `060043` extracted as `0S0043`, later as `050043`.

**Why it matters** — the invoice number is the deduplication key. One wrong character and
the same invoice can be entered twice.

**First fix, which made it worse** — "when unsure between `S` and `5`, choose `5`." This
produced `050043`, closing off the correct reading.

**Actual fix** — a structural rule. The first two digits of the invoice number are the
month, and must match the Roman numeral in the third segment. `VI` ⇒ `06`. This is
checkable rather than guessable, and is enforced in code as well as prompted.

---

### Date taken from the invoice number

**Symptom** — an invoice dated 18/04 filed under May.

**Cause** — the invoice number contained `/V/`. Both values were legible; the wrong source
was chosen.

**Fix** — explicit instruction that the Roman numeral is not a date source. The two are
not always in sync.

---

### Dimension marker absorbed into a number

**Symptom** — `31*19,5 cm` became `3119,5 cm`.

**Fix** — instruct the model to preserve `*` and `x` in product descriptions. Harmless
financially, but the product name is what a human matches against when reconciling.

---

### Bleed-through from the sheet underneath

Invoices are photographed in a bound book; the page below shows faintly through. Those
faint rows must not become line items. Instructed explicitly — and it held across all
test images.

---

### Blank unit price is not an error

Some lines carry `minimum` in the price column instead of a number. The line total is
still valid. Coercing this to `0` corrupts the arithmetic check; the correct value is
`null`, and the check skips lines it cannot verify.

---

## Workflow

### Silent stop on zero items

**Symptom** — the workflow completed successfully. Nothing was written. No error.

**Cause** — when a node emits zero items, downstream nodes do not execute at all. The
"create tab" node returns nothing when the tab already exists.

**Fix** — `Always Output Data` on that node.

**Follow-on** — with that setting on, *both* the success and error outputs fire, so the
header-writing node ran on every invoice and appended a duplicate header mid-table.
Turning the setting off restored the silent stop. The two constraints were incompatible.

**Resolution** — stop trying to control *whether* the header node runs, and make running
it harmless. See below.

---

### Duplicate header rows

**Symptom** — a second header row appearing partway down a party tab.

**Cause** — headers were written with an append. Append is not idempotent.

**Fix** — `PUT` to the fixed range `A1:I1`. Writing the header ten times produces the same
sheet as writing it once. The branching problem above disappeared entirely.

---

### Fields dropped between nodes

**Symptom** — the append node could not resolve which tab to write to.

**Cause** — the field-mapping node emits only the fields declared in it. The counterparty
name was used for tab routing but not written as a column, so it was discarded.

**Fix** — `Include Other Input Fields`, limited to the specific fields needed downstream.

---

### Data overwritten by a node's own output

**Symptom** — invoice data replaced by the API response of the tab-creation node.

**Fix** — a Code node immediately after that re-reads the parsed invoice from the earlier
node by name.

**Better fix, adopted later** — attach invoice metadata to every line item *before* the
split, so each row carries its own date, invoice number, and counterparty. Downstream
nodes stop reaching backwards across the graph.

---

### Telegram entity parse error

**Symptom** — `Bad Request: can't parse entities` on an otherwise valid message.

**Cause** — the literal text `_MASTER` in a sentence. Underscore opens italic markup in
Telegram's Markdown parser.

**Fix** — sanitise the *entire* message string, not just the interpolated values. The
first version only sanitised field values and the failure came from static text.

---

### Extracted fields silently empty after a rename

**Symptom** — a reason string that was populated upstream arrived blank at Telegram.

**Cause** — a field renamed in one Code node, still referenced by the old name in the
message template.

**Note** — n8n does not update node references inside Code nodes when a node is renamed.
Renaming is best done by find-and-replace on the exported workflow JSON, longest names
first, so that `HTTP Request` does not partially match `HTTP Request1`.

---

## Ledger

### Column meaning diverged from the existing books

The shop's own spreadsheets use the last column as a **running balance**. The first
implementation wrote a per-line subtotal there — the same number as the credit column,
carrying no information. Discovered only by reading the client's historical files.

Corrected to a row-independent running-balance formula so n8n can write the identical
string on every row.

### Case-sensitive tab collision

`Makmur Kemenangan Abadi` and `MAKMUR KEMENANGAN ABADI` are two tabs. Normalisation —
uppercase, strip legal-form prefixes, collapse whitespace, strip characters Google Sheets
rejects in tab names — runs before any tab is created or looked up.

### Duplicate entry

The same invoice photographed twice produces a duplicate set of rows and a silently wrong
balance. Every invoice number is checked against the flat master ledger before writing.
This is also why the invoice-number OCR fixes above matter more than they first appear.
