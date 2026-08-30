// Zero-asset sound via the WebAudio API. Tiny synthesized blips — muteable.
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  return ctx;
}

function blip(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.06) {
  const a = ac();
  if (!a) return;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, a.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, a.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  osc.connect(g).connect(a.destination);
  osc.start();
  osc.stop(a.currentTime + dur + 0.02);
}

export const sfx = {
  move: () => blip(320, 0.08, "triangle", 0.05),
  capture: () => blip(150, 0.12, "sawtooth", 0.06),
  check: () => {
    blip(880, 0.1, "square", 0.04);
    setTimeout(() => blip(1180, 0.1, "square", 0.04), 90);
  },
  win: () => {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.18, "triangle", 0.05), i * 110));
  },
  lose: () => {
    [392, 330, 262].forEach((f, i) => setTimeout(() => blip(f, 0.22, "sine", 0.05), i * 130));
  },
  select: () => blip(520, 0.04, "sine", 0.03),
};
