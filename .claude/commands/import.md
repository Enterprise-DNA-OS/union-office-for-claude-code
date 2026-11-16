---
description: "Import members from a UnionWare (or any) member CSV, or an employer's remittance file"
---

# import

Run `npm run union -- import unionware <members.csv> [--mapping=map.json] [--country=NZ|AU] [--dry-run]`. Fill in the operator's values. Add `--json` when you need every field.

Run with --dry-run first and show the counts. Check the employer and workplace names it would create. Then run it for real. A UnionWare export with other column names takes a mapping file: see docs/replace-unionware.md. An identical file is skipped; a bad row rolls back the whole file.

Nothing here sends a message or contacts anyone.
