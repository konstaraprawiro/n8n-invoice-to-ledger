/**
 * Node: "Restore invoice data"
 * Mode: Run Once for All Items
 *
 * The tab-creation node replaces the item payload with its own API response.
 * This restores the parsed invoice so the split can proceed.
 *
 * Kept as a distinct node rather than folded upstream because it sits after
 * a branch that may arrive from either the success or the error output.
 */

return $('Parse, classify & validate').all();
