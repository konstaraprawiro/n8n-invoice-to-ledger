# workflow/

Place the exported n8n workflow here as `workflow.json`.

Export: open the workflow in n8n → menu (⋯, top right) → **Download**.

Before committing, replace:

| Find | Replace with |
|---|---|
| the spreadsheet ID | `YOUR_SPREADSHEET_ID` |
| the n8n host domain | *(remove)* |
| the Telegram bot name | `YourInvoiceBot` |
| the Telegram chat ID | `YOUR_CHAT_ID` |
| the real company name | `NORTHGATE PRINT WORKS` |
| the real invoice prefixes | `NPW` / `PPS` |

Credential *values* are not included in an n8n export — only credential IDs and names —
but the items above are stored inline as plain parameters.
