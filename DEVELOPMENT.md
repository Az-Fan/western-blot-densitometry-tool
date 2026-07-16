# Development workstreams

## Active: web application

The current development target is the web application. Work on layout, interactions, TIFF handling, quantification, tables and Panel Studio belongs in:

- `index.html`
- `app.js`, `matrix.js`, `studio.js`
- the root CSS files
- `server.py` for the local raw-pixel API

Run the accurate local web version with `Start-WB-Tool.cmd`. Direct `file://` mode is only a limited preview and cannot reliably decode every TIFF encoding.

## Paused: Windows desktop application

The files under `desktop/` package the current web application into a Windows window. They do not contain a separate UI or quantification implementation.

Desktop builds should be produced only at release checkpoints, after the web version has been tested. Build output under `build/` and `dist/` is generated and ignored by Git.

## Rule

Implement and verify each feature in the web version first. The desktop version should remain a thin wrapper built from the same web files.

