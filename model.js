// Attention traffic model (fp16, 2 bytes per element) and shared constants.
// Standard attention keeps the N x N score matrix in slow memory: write it,
// read it for softmax, write the probabilities, read them for the V-matmul.
// FlashAttention re-reads K and V once per extra row-tile, and stores no scores.
export const SEQS = [1024, 2048, 4096, 8192, 16384, 32768];
export const DIMS = [32, 64, 128];
export const TILES = [32, 64, 128];

export function model(st) {
  const N = SEQS[st.seqIdx], d = DIMS[st.dimIdx], B = TILES[st.tileIdx];
  const causal = st.causal ? 0.5 : 1;
  const Nq = st.phase === 'decode' ? 1 : N;
  const qkv = 3 * N * d * 2;
  const out = Nq * d * 2;
  const stdExtra = 4 * (Nq * N * causal) * 2;
  const kvPerTile = 2 * N * d * 2;
  const flashExtra = Math.max(0, Math.ceil(Nq / B) - 1) * kvPerTile * causal;
  const std = qkv + out + stdExtra;
  const flash = qkv + out + flashExtra;
  const storedStd = Nq * N * causal * 2;
  const sramTile = B * d * 2 * 2;
  return { N, d, B, Nq, std, flash, storedStd, sramTile,
    steps: Math.max(1, Math.ceil(Nq / B)), speedup: std / flash };
}

export function fmtBytes(b) {
  if (b >= 1 << 30) return `${(b / (1 << 30)).toFixed(1)} GB`;
  if (b >= 1 << 20) return `${Math.round(b / (1 << 20))} MB`;
  if (b >= 1 << 10) return `${Math.round(b / (1 << 10))} KB`;
  return `${Math.round(b)} B`;
}
export function fmtSeq(n) { return n >= 1024 ? `${n / 1024}k` : `${n}`; }
