# UI simplification candidate

Scope: presentation and navigation only. No changes to calculation, saved values, source-selection semantics, annual/detail CSV schemas, or backup formats.

- Replace the independent annual amount summary with all-age-period integrity checks. Retain unresolved detail/source and over-budget warnings. Annual table remains the amount view.
- Move the existing annual CSV button to the detailed CSV panel, retaining its handler and schema.
- Move the historical period editor (including budget changes) to the budget panel. Pre-65 salary-transition budget remains in its existing dedicated workflow; no automatic conversion.
- Collapse historical source selectors, reference calculators and setting-only export. Keep complete backup prominent.
- Group home notices without suppressing error categories. Collapse provenance/calculation details.
- Preserve existing DOM IDs and event handlers. Repeated layout initialization is a no-op. Shared tax reference remains collapsed when moved between salary and pension.

Candidate only; not published. Local automated tests are separate from browser validation. The browser layout case checks unique IDs, repeated mounting, warning visibility and relocated controls; execution requires an installed Chromium browser. Before publication, run the isolated lifecycle suite and layout checks at desktop/mobile widths, compare saved state and CSV exports, and confirm offline asset completeness.

Rollback: revert presentation changes with a new cache version. Do not erase user data or restore an old personal backup.
