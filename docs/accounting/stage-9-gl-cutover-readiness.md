# Stage 9 — GL cutover readiness

Date: 2026-11-17

## Scope

The general ledger, reporting engine and Stage 8 accounting UX are complete. The
remaining decision is whether each tenant should read financial statements from
the GL engine instead of the legacy transaction-derived engine.

Cutover is controlled by `accounting_settings.report_engine`:

- `legacy` — existing transaction-derived statements (current default)
- `gl` — statements built from journal lines

The flag is per tenant. The backend does not auto-route legacy endpoints; the
frontend reads the flag and calls `/accounting/gl/*` when it is `gl`.

## Readiness checks

`scripts.cutover_readiness.py` is read-only. A tenant is ready when all of the
following hold:

- every postable transaction has a posted GL entry (`transactions_missing = 0`)
- no postable transaction is rejected by posting validation (`transactions_unpostable = 0`)
- no source has more than one active journal entry (`duplicate_active_entries = 0`)
- every posted entry is balanced (`unbalanced_entries = 0`)
- every core reconciliation check is `matched` (receivables, cash, revenue, operating expenses)

Informational checks (COGS, inventory, VAT, opening-equity plug, TDS) are
reported but do not block cutover because the legacy engine derives them
differently.

## Current live result

Run against the local database on 2026-11-17:

```text
TOTAL tenants=29 ready=29 not_ready=0 missing=0 unpostable=0 duplicates=0 unbalanced=0 mismatches=0 errors=0
```

A dry run of the switch confirmed all 29 tenants would move from `legacy` to
`gl` without being blocked:

```text
TOTAL tenants=29 switched=0 would_switch=29 unchanged=0 blocked=0 failed=0 apply=no
```

No settings were changed by either command.

## Commands

```bash
# Read-only readiness report for every tenant
./.venv/bin/python -m scripts.cutover_readiness

# Single tenant or period
./.venv/bin/python -m scripts.cutover_readiness --tenant acme
./.venv/bin/python -m scripts.cutover_readiness --date-from 2025-07-01 --date-to 2026-06-30

# Dry run the switch (default; does not write)
./.venv/bin/python -m scripts.set_report_engine --engine gl

# Apply the switch
./.venv/bin/python -m scripts.set_report_engine --engine gl --apply

# Roll back
./.venv/bin/python -m scripts.set_report_engine --engine legacy --apply
```

`set_report_engine.py` re-runs readiness before switching to `gl` and refuses
any tenant that is not ready. Use `--force` only after investigating a known,
accepted difference.

## Cutover procedure

1. Take a database backup.
2. Run `scripts.cutover_readiness.py`; require exit code `0`.
3. Run `scripts.set_report_engine.py --engine gl` and review the dry-run output.
4. Apply per tenant first (`--tenant ... --apply`) or to all tenants.
5. Verify `/accounting/trial-balance`, `/accounting/profit-loss`,
   `/accounting/balance-sheet` and `/accounting/cash-flow` show the `GL` badge.
6. Run reconciliation again and compare the statement totals.
7. Keep `scripts.set_report_engine.py --engine legacy --apply` ready for rollback.

## Caveats

- Manual vouchers post to the GL only; they do not create stock movements.
- Voiding a transaction reverses stock, but transaction reversal does not.
- Legacy sales without `order_id`/`cost_amount` metadata have no COGS posting.
- Bank reconciliation is available but the live database currently has no bank
  accounts configured.
- The legacy endpoints remain available during and after cutover; the flag only
  changes what the UI reads.
