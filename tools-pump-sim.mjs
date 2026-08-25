const FPS = 60, FRAME_MS = 1000 / FPS, TOTAL = 900;

// A realistic tick sequence: encoder warm-up stalls the first frames, then 60Hz.
function ticks(stallFrames, stallMs, normalMs, n) {
  const out = []; let t = 1000;
  for (let i = 0; i < n; i++) { t += i < stallFrames ? stallMs : normalMs; out.push(t); }
  return out;
}

// OLD: animation clock advanced by measured wall-clock dt (clamped at 50ms)
function oldPump(ts) {
  let clock = 0, last = ts[0], out = [];
  for (const now of ts) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;
    out.push({ wall: now - ts[0], anim: clock });
  }
  return out;
}

// NEW: fixed timestep; wall clock only decides WHEN to emit, max one per tick
function newPump(ts) {
  let frame = 0, t0 = 0, out = [];
  for (const now of ts) {
    if (!t0) t0 = now;
    if (Math.floor((now - t0) / FRAME_MS) < frame) continue;
    out.push({ wall: now - t0, anim: frame / FPS });
    frame++;
    if (frame >= TOTAL) break;
  }
  return out;
}

const step = f => f.slice(1).map((v, i) => (v.anim - f[i].anim) * 1000);
const show = (label, s) => {
  const first = s.slice(0, 8).map(v => v.toFixed(1)).join(", ");
  const max = Math.max(...s), min = Math.min(...s);
  console.log(`${label}\n  first 8 anim steps (ms): ${first}`);
  console.log(`  spread: min ${min.toFixed(2)}  max ${max.toFixed(2)}  jitter ${(max-min).toFixed(2)}ms\n`);
};

console.log("=== 8 stalled frames at 45ms (encoder warm-up), then 60Hz ===\n");
const stalled = ticks(8, 45, 16.667, 60);
show("OLD (wall-clock dt):", step(oldPump(stalled)));
show("NEW (fixed timestep):", step(newPump(stalled)));

console.log("=== 120Hz display, clean ===\n");
const fast = ticks(0, 0, 8.333, 240);
const nf = newPump(fast);
show("NEW:", step(nf));
console.log(`  emitted ${nf.length} frames from 240 ticks -> ${(nf.length/240*100).toFixed(0)}% (want ~50%)\n`);

console.log("=== duration check, clean 60Hz, full film ===\n");
const clean = ticks(0, 0, 16.667, 1000);
const nc = newPump(clean);
console.log(`  frames emitted: ${nc.length} (want ${TOTAL})`);
console.log(`  final anim time: ${nc[nc.length-1].anim.toFixed(4)}s (want ${((TOTAL-1)/FPS).toFixed(4)})`);
console.log(`  wall elapsed:    ${(nc[nc.length-1].wall/1000).toFixed(3)}s`);
