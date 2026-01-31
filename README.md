# Biomarker Cards + Graph

## Setup
1. Serve the project directory with a local web server (required for `fetch` to load the CSV).
   - XAMPP: put the project under `htdocs` and visit `http://localhost/projects/biomarker/`
2. Ensure the CSV file is present at the project root:
   - `CSV _ FE Take-Home Exercise Data - METRICS Reference ranges.csv`
3. Open `index.html` in the browser via the server URL (not `file://`).

## Notes
- The UI uses Bootstrap 5 and Chart.js via CDN.
- The CSV is the source of truth for reference ranges and graph values.
- Two cards are rendered: Metabolic Health Score and Creatinine.
- If a biomarker is missing range fields, the component renders whatever is available.

## Tradeoffs / Assumptions
- CSV parsing is lightweight (no external CSV library) and assumes well‑formed rows.
- Range selection uses the first available `*_Optimal`, `*_InRange`, `*_OutOfRange` fields found in the row; it does not currently choose a specific age/sex cohort.
- The “Latest result” date is static in the UI because the CSV does not provide a date field.
- The chart is a simplified horizontal range bar; interactivity is focused on the marker tooltip only.
- Styling is tuned to the Figma screenshots, not built as reusable design tokens.
