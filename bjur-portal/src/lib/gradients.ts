// Placeholder cover art. In production these are replaced by ffmpeg-generated
// poster frames / thumbnails (see ENCODING.md); this gives visual variety in the
// meantime without needing real media on disk.
const GRADIENTS = [
  "linear-gradient(135deg,#3a0f0a,#1a0605)",
  "linear-gradient(135deg,#2a1a05,#150d02)",
  "linear-gradient(135deg,#1a0a2a,#0a0515)",
  "linear-gradient(135deg,#0a2a1a,#051505)",
  "linear-gradient(135deg,#2a0a1a,#150510)",
  "linear-gradient(135deg,#1a2a0a,#0d1505)",
  "linear-gradient(135deg,#0a1a2a,#051015)",
  "linear-gradient(135deg,#2a1505,#150a02)",
];

function hash(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function gradientFor(seed: string) {
  return GRADIENTS[hash(seed) % GRADIENTS.length];
}
