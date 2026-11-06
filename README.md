# How FlashAttention Works

A coloured-pencil interactive that shows how FlashAttention makes LLM inference
fast: small tiles, online softmax on the fast on-chip memory, and no giant
N×N score matrix in slow memory.

Live: https://rajeshceg3.github.io/learn-flash-attention/

- Drag the machine to turn it. Pause, hold and step through one tile step at a time.
- Compare the standard kernel (writes the full score matrix to slow memory).
- Prefill vs decode phases, causal mask, sequence length, head dim and tile size
  all feed a simple honest traffic model (`model.js`).

Design system and UX replicate the reference interactive
(electric-motor.wasmer.app) down to panels, chips, switches, meters and
hand-drawn wobble.

## Verification

`node verification/verify.mjs` - 45 checks: feature map (panels, controls,
ARIA), design tokens, and the traffic model's journeys (prefill vs decode,
causal, tile-size tradeoff). Browser evidence (screenshots, console-clean
interaction pass) is captured per release.
