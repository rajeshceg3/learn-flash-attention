# Verification

Checks that must pass before any completion claim on this app.

- `node verification/verify.mjs` - static and behavioral checks over the app source: controls, chips, tab presets, label gating, silhouette-aware label placement, leader-line crossing rules. 58 checks.
- `verification/leader-audit.js` - live in-page audit. Paste or evaluate in a desktop/mobile browser console on the deployed page (or drive via a browser automation `execute-js`): recomputes every leader segment and every label text box from the live DOM and reports any leader-crosses-text or label-overlaps-label pairs. Both lists must be empty on desktop and 390px mobile, default and rotated.

Ground rule (user): text, labels, callouts and connectors must never overlap the 3D model at any angle, and no leader line may cross any label's text.
