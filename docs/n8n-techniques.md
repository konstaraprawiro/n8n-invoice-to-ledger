# n8n techniques used

Notes on the less obvious mechanics in this workflow.

## Expected-failure branching

Creating a Google Sheets tab fails when the tab already exists. That is the normal case
for any counterparty seen before, so it is not treated as a fault:

- **On Error** → `Continue (using error output)`
- The error output is wired into the main path

The workflow proceeds identically whether the tab was just created or already existed.

## Always Output Data, and its trap

A node that emits zero items does not merely pass nothing along — **every downstream node
is skipped entirely**, and the execution still reports success. This is the quietest
failure mode in n8n.

`Always Output Data` forces a single empty item so the chain continues. The trap: with it
enabled, a node with both success and error outputs fires **both**. Any logic that assumed
the branches were mutually exclusive breaks.

The durable answer was to make the branch idempotent rather than to control which branch
runs.

## Idempotent writes over append

Headers are written with `PUT` to the fixed range `A1:I1` via the Sheets REST API, not
with the append operation:

```
PUT https://sheets.googleapis.com/v4/spreadsheets/{ID}/values/{TAB}!A1:I1?valueInputOption=RAW
```

Append is position-dependent and stacks. `PUT` to a fixed range converges. Running it any
number of times produces the same sheet.

## HTTP Request with Predefined Credential Type

Calling the Sheets REST API directly, while reusing n8n's existing Google OAuth
credential:

- **Authentication** → `Predefined Credential Type`
- **Credential Type** → `Google Sheets OAuth2 API`

This reaches operations the built-in node does not expose — `PUT` to an arbitrary range,
here — without provisioning a second credential or handling tokens manually.

## Row-independent formulas

n8n appends rows without knowing their final row number, so a formula referencing its own
row cannot be templated. `INDIRECT` with `ROW()` resolves at evaluation time:

```
=SUM($G$2:INDIRECT("G"&ROW()))-SUM($H$2:INDIRECT("H"&ROW()))
```

The identical string is written on every row and evaluates correctly in each.

Requires the append node's **Cell Format** to be `USER_ENTERED`. Under `RAW` the formula
is stored as literal text.

## Fan-out / fan-in

One invoice contains N line items, each of which becomes a spreadsheet row:

```
Split Out  →  per-item mapping  →  Append  →  Aggregate  →  single Telegram reply
```

Invoice-level metadata (date, invoice number, counterparty, direction) is attached to
**every item before the split**. Each row then carries its own identity and no downstream
node needs to reach back across the graph — which is what makes multi-invoice handling
safe.

## Include Other Input Fields

A field-mapping node emits only the fields declared in it; everything else is discarded.
Fields needed for routing but not written as columns — the counterparty name, used to
select the destination tab — must be listed explicitly under
`Include Other Input Fields → Selected`.

Mapping columns manually rather than automatically keeps routing fields from leaking into
the sheet as stray columns.

## Code node execution modes

Two different APIs, and the wrong one raises at runtime:

| Mode | Access |
|---|---|
| Run Once for All Items | `$input.all()` — returns an array |
| Run Once for Each Item | `$input.item` — a single item |

Aggregation logic (deduplication, cross-row checks) needs all-items mode. Per-invoice
parsing works in either.

## Cross-node references

```js
$('Node Name').first().json      // all-items mode
$('Node Name').item.json         // each-item mode
```

Referenced by **name**, which is why renaming a node breaks these — n8n does not rewrite
references inside Code nodes. Rename by find-and-replace on the exported workflow JSON,
longest names first so `HTTP Request` does not partially match `HTTP Request1`.

## Binary data in Code nodes

```js
const buf = await this.helpers.getBinaryDataBuffer($itemIndex, 'data');
```

`this.helpers`, not `$helpers`.

## Telegram entity escaping

Telegram's Markdown parser rejects unbalanced `_`, `*`, `` ` ``, `[`, `]` with
`can't parse entities`. Sanitise the **whole outgoing string**, not just interpolated
values — static text containing something like `_MASTER` will fail on its own.

Where a character carries meaning, substitute rather than strip: `*` in a dimension
(`31*19,5 cm`) becomes `x`, not nothing.

Disable **Append n8n Attribution** on every Telegram node.
