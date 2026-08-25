# CLAUDE.md

Project guidance, loaded automatically. Applies to every session in this folder.

## What this is

Two 9:16 black-and-white vector film loops (1080×1920, 15.00 s, 60 fps) built
with **no dependencies** — no Remotion, no GSAP, no Lottie. One geometry
generator, one camera rig, one canvas, one exporter, all hand-written.

| File | |
|---|---|
| `iris.html` | Eye → dive → corridor of screens → eye |
| `iris-swipe.html` | Eye → dive → deck of tiles thrown upward by a thumb → eye |
| `index.html` | The original circle → rounded-square morph test |
| `server.mjs` | Zero-dependency static server, local dev only |

## Read this first

**Before changing any animation code, read [ANIMATION-SYSTEM.md](ANIMATION-SYSTEM.md).**
It documents the geometry engine, the morph, the motion language, the camera
rig, self-similar travel, the loop contract, the verification harness, the
direction rules, and a catalogue of thirteen failures that shaped them. Most
"obvious" improvements to this code have already been tried and reverted for
reasons written down there.

Do not skip it for a change that looks small. The failures in §12 were all
small changes.

---

## Hard invariants

These break **silently** — the render still looks fine and the defect is
invisible until measured. Do not violate them without measuring the result.

1. **The loop is pixel-exact.** Frame 0 and frame `DURATION` must differ by
   **0 pixels**. Verify before claiming any animation work is done.

2. **Interpolation must be endpoint-exact.** `mix` and `lerpP` guard `t >= 1`
   and `t <= 0`. Never remove those guards — `a + (b-a)*1.0` is not reliably
   `b` in floating point, and a few ULPs moves an antialiased edge.

3. **One geometry generator.** Every shape comes from `outline(w, h, corners)`.
   If you are writing point-correspondence logic, you have introduced a second
   shape representation — stop and express the shape through `outline` instead.

4. **The final/innermost shape is a fill, never a clip edge.** Clip boundaries
   are hard-edged; fills are antialiased. The shape that becomes the pupil must
   be pixel-identical to the eye's, so it must be drawn by the *same calls*.

5. **The end state must be produced by the same draw path as the opening.**
   Both films close with pupil → ring → catchlight → lids, exactly as `drawEye`
   emits them. A different route to identical geometry still differs in edge
   pixels.

6. **No easing curves in the camera.** It is a closed Hermite spline with
   finite-difference tangents in real time. Easing decelerates into every key;
   a spline passes through them at speed. The camera must never come to rest.

7. **Zoom turnarounds only where they cannot be seen** — inside a blackout, or
   inside a moment of maximum shape motion. Currently `2.30 s` (0.0 % white)
   and `≈11.6 s` (mid lid-sweep).

8. **Nothing transient may straddle `t = 0`** — no flash, strobe or event
   window.

9. **`server.mjs` is local-dev only.** No authentication, no security headers.
   Do not expose it, and do not add write endpoints to it.

---

## Motion rules

- **Match the easing to the event, not to a house style.** "Use expo" describes
  a *feel*. `expo` for things that snap (blink, dive). `glide` for long moves
  you have to ride. `smooth` for reaching gestures. `p^1.8` for a throw — a
  throw eases **in** and exits at speed. See ANIMATION-SYSTEM.md §4.2.
- **Travel is a velocity profile, not an eased transition.** Integrate a
  velocity so the rate is what you author and the accelerando comes free.
- **Continuous rates stay linear in `t`** — spin, wave phase. Never easing.
- **Parallax is what makes travel legible.** Displacement from the camera axis
  must scale with nearness (`perspective()`). Uniform scaling is not forward
  motion; it reads as a flat thing inflating.

## Direction rules

- **Big elements. Do not crowd.** The strongest image here is four shapes.
  Detail is not richness.
- **Every event must be motivated.** If you cannot name the thing in the world
  that caused a beat, cut it. Hand-placed inversions read as jump scares; the
  same event caused by passing through a screen reads as a threshold.
- **Concept beats decoration.** A generic pattern will read as filler no matter
  how well it is animated.
- **Endings transform, they don't fade.** The last screen morphs into the pupil.
- **Hold form, never hold everything** — the eye can rest only because the
  camera is still travelling through it.

---

## Verification protocol

Run these in the page console against the live film. **Visual review is not
optional** — the numeric checks would all pass on a composition that is dead.

Serve first:

```bash
node server.mjs
```

### Loop exactness — must be 0

```js
playing = false;
const snap = t => { render(t); return new Uint8Array(ctx.getImageData(0,0,1080,1920).data); };
const A = snap(0), B = snap(DURATION);
let d = 0; for (let i = 0; i < A.length; i += 4) if (A[i] !== B[i]) d++;
playing = true; clock = 0; d
```

### Coverage — proves blackouts, flashes and the ending resolve

```js
const pct = t => { render(t); const d = ctx.getImageData(0,0,1080,1920).data; let w = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 127) w++;
  return Math.round(w / (1080*1920) * 1000) / 10; };
[2.30, 12.0, 15, 0].map(pct)     // expect 0.0 at the act swap; 15 and 0 equal
```

### Camera speed — scan for dips, ask what caused each

```js
const h = 1/120;
let min = 1e9, at = -1;
for (let t = 0; t < DURATION; t += 0.02) {
  const a = sampleCam(t), b = sampleCam(t+h);
  const v = Math.hypot((b.x-a.x)*a.z, (b.y-a.y)*a.z)/h
          + Math.abs(Math.log(b.z/a.z))/h*400 + Math.abs(b.r-a.r)/h*900;
  if ((t < 1.95 || t > 2.70) && v < min) { min = v; at = t; }
}
[Math.round(min), Math.round(at*100)/100]
```

Absolute units are arbitrary; the **floor and the shape** are what matter. A dip
toward zero means the camera settles somewhere — find it and fix it, unless it
is deliberately hidden behind a blackout or heavy shape motion.

### Visual review

Screenshot the live page. If screenshots time out or `document.hidden === true`,
the browser pane is not compositing — `requestAnimationFrame` is halted, so both
screenshots *and* recording will fail. Front the tab first.

For a multi-frame contact sheet, render N times into an offscreen canvas and
return a small `toDataURL()`.

### Measurement caution

Read frames back **synchronously in one call**. A nonzero loop diff that has no
visible cause is usually (a) a lerp that didn't land on its endpoint, or (b) the
same shape drawn two different ways — but it can also be a stale canvas read
taken during a pane resize. Verify a suspicious result before "fixing" it.

---

## Export — render, do not capture

Saving runs **offline through WebCodecs** and writes the MP4 by hand
(`ftyp`/`moov`/`mdat`, one H.264 track). Every frame is rendered, handed to a
`VideoEncoder` with an exact timestamp, and muxed. **Do not replace this with
`MediaRecorder`.**

`canvas.captureStream` + `MediaRecorder` is a real-time pipeline with a
deadline. At 1080×1920×60 the encoder cannot reliably keep pace, dropped and
late frames get timestamped by arrival, and the timing is baked into the file.
That path was fixed twice — fixed-timestep clock, manual `requestFrame`, primed
encoder, throttled UI — and **it still stuttered**, because the deadline was
never the author's to meet. It is kept only as a fallback for browsers without
WebCodecs.

What the offline path guarantees, and what to preserve if you touch it:

- Constant frame rate **by construction** — identical sample durations in a
  fixed timescale, so jitter is unrepresentable rather than merely unlikely.
- 900 frames in, 900 samples out — asserted before a file is written.
- No `requestAnimationFrame`, so it works in a background tab.
- It **refuses to write** and falls back if the encoder errored, no `avcC`
  arrived, timestamps came back out of order (B-frames would need a `ctts`
  table), or the sample count is wrong. A wrong file that plays is worse than a
  clear failure — keep those checks.

Verify a change here by loading the blob into a `<video>` and confirming
`duration` and `videoWidth`/`videoHeight`; that proves the container parses.
Both films currently produce 900 frames, ~14.2 MB, `duration 15.000`,
1080 × 1920, in about 12 s.

---

## Conventions

- Pure functions of time: `render(t)` depends on nothing but `t`. No
  accumulated state, no `Math.random()`. This is what makes scrubbing and
  frame-exact verification possible.
- Comments explain **why**, especially where a value was tuned to satisfy a
  constraint (parity of the terminal index, arc depth vs. the lid clamp).
- Keep both films' shared spine identical — the eye, its constants, and the
  timeline landmarks are the anchor between the two versions.
