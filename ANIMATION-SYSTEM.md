# The IRIS Animation System

A hand-written vector motion system for 9:16 black-and-white film loops. No
Remotion, no GSAP, no Lottie, no dependencies of any kind — one geometry
generator, one camera rig, one canvas, and an exporter.

This document is the system *and* the reasoning. Nearly every rule here exists
because something looked wrong first. Where that's true, the failure is written
down next to the rule, because the failure is the part that transfers.

---

## Table of contents

1. [Principles](#1-principles)
2. [The geometry engine](#2-the-geometry-engine)
3. [Morphing](#3-morphing)
4. [The motion language](#4-the-motion-language)
5. [The camera rig](#5-the-camera-rig)
6. [Self-similar travel systems](#6-self-similar-travel-systems)
7. [Compositing and polarity](#7-compositing-and-polarity)
8. [The loop contract](#8-the-loop-contract)
9. [Export](#9-export)
10. [The verification harness](#10-the-verification-harness)
11. [Direction — the aesthetic rules](#11-direction--the-aesthetic-rules)
12. [Failure catalogue](#12-failure-catalogue)
13. [Parameter reference](#13-parameter-reference)

---

## 1. Principles

Five commitments that everything else follows from.

**One generator.** Every shape in every film — circles, screens, tiles, eyelids,
a thumb — comes out of a single function. This is not tidiness for its own
sake: shapes from one generator share a control-point layout, and shapes that
share a control-point layout can morph into each other for free. The moment you
add a second shape representation you lose the morph.

**Everything is a pure function of time.** `render(t)` depends on nothing but
`t`. No accumulated state, no physics integration, no `Math.random()`. This is
what makes scrubbing, frame-exact verification, and bit-exact looping possible.
If you cannot render frame 900 without having rendered frame 899, you have
given up most of your ability to check your own work.

**Motion never stops.** Not the camera, not the travel. A held frame is a
decision to be made deliberately and rarely, not something you back into
because an easing curve ran out.

**Every event is caused.** An inversion, a flash, a beat — if you cannot point
at the thing in the world that caused it, cut it. See
[§11](#11-direction--the-aesthetic-rules); this is the rule the films failed
hardest and gained most from fixing.

**The loop is a hard constraint, not a nicety.** Frame 0 and frame N must be
*pixel-identical*. It disciplines everything upstream.

---

## 2. The geometry engine

### 2.1 The outline

```js
outline(w, h, corners) -> [ {x,y} × 25 ]
```

A closed path of **8 cubic Bézier segments**: 4 corners and 4 edges,
alternating. Flat point list, laid out as:

```
[ A0,  c,c,A1,  c,c,A2,  c,c,A3,  c,c,A4,  c,c,A5,  c,c,A6,  c,c,A7,  c,c,A0' ]
   1  +        8 segments × 3 points                                     = 25
```

`corners` is `[TR, BR, BL, TL]`, each an **`[rx, ry]` pair**. Per-axis radii,
not a scalar — this is what lets one function produce a circle, a capsule, a
rounded rectangle, and a 20 000-unit-tall eyelid arc.

Corner arcs use the standard circular-arc constant:

```js
KAPPA = 0.5522847498307936      // k = KAPPA * r, applied per axis
```

**Why 8 segments and not 4.** A circle only needs 4 arcs. But a rounded
rectangle needs 4 arcs *and* 4 straight edges, and for the two to interpolate
they must have the same segment count. So the circle carries four zero-length
edges. A circle, in this system, is a rounded rectangle whose corner radius has
grown until the straight edges vanish. That framing is the whole engine.

Straight edges are emitted as cubics with control points at the 1/3 and 2/3
marks, so every segment has identical arity.

### 2.2 Derived shapes

```js
disc(d)              // all four corners [d/2, d/2]
rrect(w, h, r)       // all four corners [r, r]
dome(w, h, arch)     // top corners [w/2, arch], bottom corners [0,0]
```

`dome` is the quiet workhorse. Because its top corner radii are exactly half
the width, the two top arcs meet at the centre and the top edge has zero
length — giving a single wide arch across the full width, with the arch depth
controlled independently by `arch`. Hills, ridges, eyelids and the thumb are
all `dome`.

### 2.3 Transforms

Points are transformed, not the canvas, wherever the result needs to interpolate:

```js
tp(P, x, y)      // translate
sp(P, sx, sy)    // scale (sp(P, 1, -1) mirrors vertically)
rp(P, angle)     // rotate about the origin
```

Use `ctx.translate/rotate` for the camera; use these for anything that has to
be lerped, clipped against, or compared for loop-exactness.

### 2.4 Drawing

```js
trace(P)   // moveTo + 8 × bezierCurveTo + closePath
fillS(P, style)
strokeS(P, style, lineWidth)
flood(style)   // setTransform(identity) + fillRect — respects the live clip
```

---

## 3. Morphing

### 3.1 The mechanism

```js
lerpP(A, B, t)   // element-wise on 25 control points
```

That's it. Because every shape is the same 25 points in the same order, the
morph is a straight lerp with no point-matching heuristic to get wrong. A
circle becomes a rounded square by its control points sliding; the intermediate
frames are real squircles, not a crossfade.

> **Guidance.** If you ever find yourself writing point-correspondence logic,
> stop — you have introduced a second shape representation. Go back and express
> the new shape through the existing generator.

### 3.2 Endpoint exactness — required

```js
const mix   = (a, b, t) => t >= 1 ? b : t <= 0 ? a : a + (b - a) * t;
function lerpP(A, B, t) { if (t >= 1) return B; if (t <= 0) return A; /* … */ }
```

**Why.** `a + (b - a) * 1.0` is *not* reliably `b` in floating point. A few ULPs
of drift is enough to move an antialiased edge by a fraction of a pixel.

**How it showed up.** The loop was off by 1046–1541 pixels (~0.07 %) with no
visible cause. Every shape looked correct; the diff was pure edge noise from
lerps that were nominally complete. Guarding both endpoints took it to 0.

Apply this to *every* interpolator, including scalars — the camera's zoom,
sizes, positions. Not just paths.

### 3.3 Cross-family morphs and the index sweep

Index-based correspondence means index 0 of shape A travels to index 0 of shape
B. For a circle (`A0` at top-centre) morphing to a sharp-cornered square (`A0`
at a corner), that produces a slight rotational sweep. It reads as a graceful
twist and is usually desirable. Know that it's there; if you need it gone,
rotate the *point order*, not the shape.

### 3.4 Walking a path by arc length

If you need to place things *on* a morphing outline (dots riding an orbit),
do not use parameter-space spacing.

**Why.** A circle spends four of its eight segments on zero-length edges.
Distributing by parameter piles every dot assigned to those segments onto the
arc joins. You get four clumps instead of ten evenly spaced dots.

**Fix.** Sample the path (≈18–24 points per segment), build a cumulative
arc-length table, binary-search it. Costs ~160 evaluations per path and stays
even through an entire circle→square morph, including the moment the straight
edges appear.

```js
pathSamples(P, per) -> { pts, cum, total }
atLength(S, frac)   -> {x, y}
```

*(This machinery is documented because it is part of the system and was
load-bearing for one iteration; the final films do not use it — see
[§12.9](#129-decoration-mistaken-for-content).)*

---

## 4. The motion language

### 4.1 The catalogue

```js
expo(t)   = (1 - 2^(-10t)) / (1 - 2^-10)   // instant attack, asymptotic settle
glide(t)  = 1 - (1-t)^4                    // same character, rideable
smooth(t) = t²(3-2t)                       // symmetric, gentle both ends
throwEase(p) = p^1.8                       // eases IN, exits at speed
```

`expo` is normalised so `e(1) === 1` exactly. **Do not skip this.** Un-normalised
expo lands at `1 - 2^-10`, and every segment ends on a visible 1/1024 snap.

### 4.2 Where each one is legitimate

This is the part that matters, and the part I got wrong first.

| Curve | Use for | Never use for |
|---|---|---|
| `expo` | Things that genuinely snap: a blink, a dive | Long moves you have to watch; anything continuous |
| `glide` | Long transformations that must be ridden and settle | Anything that should exit at speed |
| `smooth` | Reaching gestures, symmetrical sways | Anything meant to feel violent |
| `throwEase` | A throw, a flick, a release | Anything decelerating into place |
| *velocity profile* | Travel, spin, any ongoing rate | One-shot transitions |

> **Guidance — the central lesson.** "Use expo" is a description of a *feel*,
> not an instruction to apply one function everywhere. An easing curve is a
> statement about how a specific thing behaves. Applying one globally makes
> unrelated events share a physics they don't have.

**How it showed up, twice.**

*The corridor.* An expo pull-back across a 20× zoom reached 93 % of its range in
the first 10 % of its duration. The entire reveal was over in 0.4 s and the
remaining 2.4 s was an imperceptible creep. Fixed by `glide` — same fast-start
character, but with a tail you can actually ride.

*The swipe.* An expo flick made the tile **teleport**: gone within ~0.08 s of
contact, leaving nearly a second of dead air before the next gesture. A throw
does not start at maximum velocity. It starts at rest under the finger, builds,
and *leaves* at speed. It eases **in**. Replacing expo with `p^1.8` fixed both
the physics and the rhythm.

### 4.3 Prefer velocity profiles to easing for travel

For anything ongoing — travelling down a corridor, throwing a deck — do not
express it as an eased transition between two states. Integrate a velocity:

```js
// accelerate: v goes v0 → v1 across U, as a quadratic ramp
q(u) = v0·u + (v1 - v0)·u³ / (3U²)

// decelerate: v decays v1 → 0 on a cosine across τ
q(s) = q(U) + v1·τ·( s/2 + sin(πs)/(2π) )
```

Velocity is continuous, never zero mid-shot, and the *rate* is the thing you
author — which is what you actually care about. It also gives you the
accelerando for free: in `iris.html` the interval between pass-throughs runs
**1.01 → 0.77 → 0.62 → 0.52 → 0.45 → 0.40 → 0.36 → 0.32 → 0.30 → 0.27 → 0.26 →
0.25 → 0.24 s** without a single hand-placed keyframe.

### 4.4 Continuous rates stay linear

Ring spin, wave phase, orbital rotation: linear in `t`. No easing. They must
never accelerate or arrive.

---

## 5. The camera rig

### 5.1 Closed Hermite spline — not eased keyframes

```js
CAM = [ { t, x, y, z, r }, … ]           // z is zoom, r is roll
CAM_K: v = [x, y, log(z), r]
CAM_D[i] = duration of segment i (wrapping)
CAM_M[i] = (v[i+1] - v[i-1]) / (CAM_D[i-1] + CAM_D[i])     // per unit time
```

Evaluate with the cubic Hermite basis over each segment.

**Why finite differences in *real time*.** Uniform Catmull-Rom with unequal
segment durations produces a velocity discontinuity — a visible kink — at every
key. Dividing by the summed neighbouring durations makes the tangent a true
per-second derivative, so velocity is continuous across every key regardless of
spacing.

**Why a spline instead of eased keys.** Every easing function decelerates into
its destination. A camera built from eased keys therefore comes to rest at
*every keyframe*. A spline passes **through** its keys at speed. This is the
difference between a camera that stops fifteen times and one that never stops.

The track is **closed**: it wraps from the last key to key 0. Position and
velocity are therefore continuous across the loop seam too — the camera is
still travelling as it crosses frame zero.

### 5.2 Interpolate zoom in log space

Store `log(z)`, lerp that, `exp()` on the way out. A 1× → 46× dive interpolated
linearly spends almost all its time at high magnification and arrives all at
once. In log space the *perceived* rate is constant, which is what the eye
measures.

### 5.3 Roll: a per-channel wrap mechanism

```js
ADV = [0, 0, 0, 0]   // per-channel advance over one loop; roll can use TAU
```

The tangent and evaluation code unwraps channels by `ADV` at the seam, so roll
can wind a full 360° per loop and still close exactly. **The final films set it
to zero** — see [§12.5](#125-a-roll-that-fought-the-idea). The mechanism is kept
because it is correct and occasionally right; it was simply wrong here.

### 5.4 Rules for authoring a camera track

1. **Zoom monotonic, with turnarounds placed deliberately.** A turnaround is a
   moment of zero zoom velocity. You get a minimum of two (in and back out).
   Put them where they cannot be seen:
   - one inside a **blackout**,
   - one inside a moment of **maximum shape motion** (a lid sweep, a collapse).

   In both films: turnarounds at **2.30 s** (fully black) and **≈11.6 s**
   (mid lid-sweep).

2. **Bearing monotonic.** If the camera orbits, let the bearing only increase.
   Reversing an axis means passing through zero lateral velocity.

   *How it showed up:* keys at 6.60 and 8.10 reversed **both** x and y at once,
   dropping camera speed to **9** on a scale where the film otherwise runs
   150–1500. Re-authored as a continuous orbit — bearing climbing
   −37° → 15° → 67° → 126° → 193° → 250° → 311° → 387° — and the floor rose to
   **168**.

3. **Frame zero is a place you pass through.** The keys either side of the seam
   must continue the same gesture. Do not park on your hero frame; arrive at it
   at speed and keep going.

4. **Calm the camera when the content is already moving.** In `iris-swipe.html`
   the camera deliberately holds a narrow zoom band and small drift, because
   tiles are already crossing the frame. A busy camera over a busy gesture
   reads as neither.

### 5.5 Parallax — the one that makes travel legible

```js
perspective = (cam, near) => [ cam.x * (1 - near), cam.y * (1 - near) ]
```

Placing an object at this **world** position puts it at axis offset
`-cam × near`, and lands it exactly at the world origin when `near === 1`
(which is what keeps the final pupil bit-exact against the eye's).

**Why it is non-optional.** Uniform scaling is not forward motion. If every
element in a receding structure is centred on the same point, they all inflate
together, and the nearest one simply grows until its colour owns the frame. The
cue your eye actually uses is **differential displacement**: near things swing
wide, far things hold the vanishing point.

**How it showed up.** The corridor read as a flat thing inflating rather than a
tunnel rushing past — "the white tile fully becomes the background without
actually moving closer." Measured after the fix, at a moment with the camera 45
units off-axis: nearest screen displaces **−45**, farthest **−2**. A 22×
differential, and the shot reads as travel.

---

## 6. Self-similar travel systems

Both films' middles are built the same way, and the pattern generalises.

### 6.1 The shape of it

Place elements at **geometric** depths — each one `k` times nearer than the one
behind. Measure travel in **elements passed**, a continuous `q(t)`. Then:

- element `n`'s on-screen scale is `base · k^(f - n)`, where `f = q - ⌊q⌋`
- advancing `q` by exactly 1 scales the whole world by `k` and drops the nearest
  element

The structure is therefore **self-similar**: the pattern repeats exactly every
unit of `q`, with no keyframes and no end. Seven drawn elements give an endless
corridor.

```js
CORR = { k: 2.2, base: 980, shown: 7, morphIn: -3.4, morphOut: -1.0 }
```

### 6.2 Distance-driven morphing

Make the morph a function of **distance**, not time:

```js
m = clamp01((rel - morphIn) / (morphOut - morphIn))     // rel = f - n
```

Now every element performs the same transformation as it approaches, and — this
is the payoff — **the morph is visible spatially in a single frame**. Look into
the corridor and you watch a far circle become a near screen, all at once.

### 6.3 Parity gives you motivated inversion

Colour elements by `(⌊q⌋ + n) mod 2`. When `⌊q⌋` increments — when you pass
through one — every band flips. The whole frame turns over, and the cause is
visible: you went through a threshold.

This replaced hand-placed strobes ([§12.6](#126-unmotivated-strobes)) and is
strictly better, because the rhythm inherits the accelerando automatically.

### 6.4 Tune the terminal index for parity

The end state's polarity is decided by `⌊q_end⌋ mod 2`. You do not fight this
with special-casing — you **solve for it**:

```
q_end = 4.5·v0 + 2.925·v1      (for U = 6.75, τ = 1.35)
```

Pick `v1` so `⌊q_end⌋` has the parity your ending needs, and a fractional part
that puts the final element where you want it.

- `iris.html`: `v0 0.75, v1 4.20` → `q_end = 15.66`, floor **15** (odd → white
  field for the eye).
- `iris-swipe.html`: `v0 2.20, v1 5.60` → `s_end = 26.28`, floor **26** (even →
  last tile **black** on a **white** one beneath, so it can *become* the pupil),
  and fraction `0.28 <` contact `0.52`, so the last tile is still **at rest**
  under the thumb rather than half-thrown.

That second constraint is the ending's whole mechanism, obtained by choosing one
number.

---

## 7. Compositing and polarity

### 7.1 Nested openings

Draw outermost → innermost. For each element: `flood` its wall colour (the live
clip limits it), then clip to its opening. The band between consecutive
openings takes the inner one's colour.

**Clips are required when parallax is on.** Without parallax the openings nest
strictly and could be painted as plain fills; with it, a deeper opening can
poke outside its parent, and only a clip prevents it painting over a nearer
wall.

### 7.2 But the innermost one must be a fill

**Clip boundaries are hard-edged. Fills are antialiased.**

The innermost shape is drawn with `fillS`, never left as a clip edge. It is the
one whose edge is small, central, and stared at — and in both films it is the
shape that becomes the pupil, which must be pixel-identical to the eye's.

*How it showed up:* the corridor build regressed the loop from 0 to a nonzero
diff purely because the final pupil was a clip edge.

### 7.3 Flood for coverage, shapes for objects

Anything that must cover the frame at any zoom should be a `flood`, not a
rectangle — you cannot be caught with a gap when the camera pulls wider than
you planned. Draw as a real shape only what should read as an *object*.

### 7.4 Letterboxing gives an object its edges

In `iris-swipe.html` tiles are **wider** than the frame and **shorter**
(1560 × 1680). They bleed off the sides and letterbox top and bottom. Those two
bands show the tile underneath — which is the opposite polarity — and that
contrast is what makes a tile read as an object sitting on something rather
than as a flat field.

A full-bleed card has no edges and reads as an empty coloured frame.

### 7.5 Spin needs headroom

A tile rotating while it travels swings its corners inward. At 1318 wide with a
0.17 rad spin, the side edges cut into frame as **thin diagonal slivers**.
Widened to 1560 and spin cut to 0.05.

Check: half-height × sin(spin) must stay under the horizontal margin.

---

## 8. The loop contract

**Frame 0 and frame N must be pixel-identical.** Verify it; do not assume it.

```js
let diff = 0;
for (let i = 0; i < A.length; i += 4) if (A[i] !== B[i]) diff++;   // want 0
```

What it requires:

1. **Endpoint-exact interpolation everywhere** ([§3.2](#32-endpoint-exactness--required)).
2. **A closed camera track** — `sampleCam(0)` and `sampleCam(N)` equal on all
   four channels.
3. **Identical draw order and draw path.** The end state must be produced by
   the *same calls* as the opening. In both films the closing sequence emits
   pupil → ring → catchlight → lids, exactly as the eye does. A shape reached by
   a different route — a clip instead of a fill, a different transform
   composition — will differ in its edge pixels even when the geometry is
   mathematically identical.
4. **Nothing transient at the seam.** No flash, strobe or event window may
   straddle `t = 0`.

> **Guidance.** A nonzero diff with no visible cause is almost always (a) a
> lerp that didn't land on its endpoint, or (b) the same shape drawn two
> different ways. Both are edge-pixel-only, both are invisible, both are real.

**One caution on measurement.** Read back frames *synchronously in the same
call*. An early nonzero result turned out to be a stale canvas read taken while
the browser pane was resizing — a measurement artifact, not a bug. Verify a
suspicious result before acting on it.

---

## 9. Export

`canvas.captureStream(fps)` → `MediaRecorder`, no libraries.

```js
MIMES = ["video/mp4;codecs=avc1.640028", "video/mp4;codecs=avc1.42E01E",
         "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8",
         "video/webm"]
videoBitsPerSecond: 24_000_000
```

Prefer MP4/H.264 where supported (Chrome does), fall back through VP9/VP8 WebM.

**It is a real-time capture.** Recording a 15 s film takes 15 s. Measured
accuracy: 15066 ms against a 15.00 s target — frame-accurate.

**A hidden tab stops painting.** `requestAnimationFrame` halts, the capture
stream receives nothing, and the recording sits at 0 % forever. There is no way
around this for canvas capture; the fix is to detect and say so:

```js
if (document.hidden) { setStatus("keep this tab visible to record"); return; }
// plus a visibilitychange handler that abandons an in-flight take
```

*Learned by hitting it.* A recording silently stalled at 0 % with
`document.hidden === true`. Failing loudly beats failing silently.

**A frame-exact offline render would need its own encoder.** MediaRecorder is
real-time only. Accept it or write an encoder.

---

## 10. The verification harness

You cannot direct what you cannot measure. All of this runs in the page console
against the live film.

### 10.1 Loop diff
Section [§8](#8-the-loop-contract). Target: **0**.

### 10.2 Coverage percentage
Fraction of pixels above mid-grey. Cheap, and it proves things stills can't:

- blackout is genuinely black at the act swap → **0.0 %**
- the flash lands → **100 %**
- the ending resolves to the opening → both **29.2 %**

### 10.3 Camera speed profile
Sample `sampleCam(t)` and `sampleCam(t + 1/120)`; combine screen drift, log-zoom
rate and roll rate into one number. Absolute units are arbitrary; **the floor
and the shape are what matter**.

Current `iris.html`, perceived speed including corridor travel:

```
 0.0s   132     seam — already moving
 1.8s  2037     the dive
 2.4s  5521     peak
 3.0s   644     corridor, deliberate
 6.6s  1130
 8.4s  1272
 9.0s  1582     peak of the accelerando
10.2s   574     arriving
12.6s    69     the still point, just after the lids close
15.0s   132     back to the seam
```

Minimum **65**, at 12.64 s. Scan for dips and ask what caused each one.

### 10.4 Zoom turnaround detector
Track the sign of `dz` and report every flip. Confirms turnarounds sit where you
put them. Current: `2.30` (black), `3.28` / `3.90` (sub-percent spline wobbles,
harmless), `11.58` (lid sweep).

### 10.5 Contact sheets
Render N times into one strip and look at it. Non-negotiable — the metrics above
would all have passed on a corridor that was compositionally dead.

### 10.6 Frame cost
Both films: **0.05–0.06 ms/frame** against a 16.7 ms budget. Vector work at this
scale is nearly free; if you're near budget, something is wrong.

---

## 11. Direction — the aesthetic rules

The engineering above is worth nothing without these.

### 11.1 Big elements. Do not crowd.

The strongest image in either film is an eye: **four shapes** — two lids, a
pupil, a ring — plus a catchlight. It fills the frame and it is unmistakable.

A mandala of 120 dots was measurably richer and was worse. Detail is not
richness. When in doubt, take something out and make the rest larger.

### 11.2 Every event must be motivated

If you cannot name the thing in the world that caused a beat, cut the beat.

Hand-placed inversions read as "random jump scares." The identical visual
event, caused by *passing through a screen*, reads as a threshold. Same pixels,
different meaning. See [§6.3](#63-parity-gives-you-motivated-inversion).

### 11.3 Concept beats decoration

A field of counter-rotating orbits was technically the most sophisticated thing
built here, and it was **generic** — the visual equivalent of a screensaver.
Replacing it with an idea (a corridor of screens, each arriving as a circle and
becoming a screen; a thumb throwing images of an eye away, faster and faster)
made a simpler, sparser image far stronger.

Ask what the piece is *about* before asking what it looks like. A middle that
is only pattern will read as filler no matter how well it is animated.

### 11.4 Hide your discontinuities

You will have joins: an act change, a zoom reversal, a coordinate-space swap.
You do not have to eliminate them — you have to put them where nobody is
looking:

- **Behind black.** Both films change worlds at `t = 2.30` at **0.0 % white**.
  The transition is invisible; verified numerically, not by eye.
- **Behind maximum motion.** The camera's slowest moment sits exactly on the
  blink; the wide-point zoom turnaround sits inside the lid sweep.

### 11.5 Let the ending be a transformation, not a disappearance

The last screen does not fade. It **morphs**: tall rounded rectangle → rounded
rect → rounded square → circle → pupil, and the lids close around it. The same
circle↔rounded-rect morph the whole film is built from, run backwards, as the
final statement.

Something that fades out was never anything. Something that transforms was.

### 11.6 Start the morph *after* the travel stops

Both films initially overlapped the ending morph with the last few
pass-throughs, so elements were shrinking *while* being thrown — which reads as
receding, not transforming. Gate the transformation to begin once travel has
ended. The last one should be the only one that changes.

### 11.7 The still point is allowed — if the camera is still moving

The eye at the end holds its shape for ~3 s. That is fine, because the camera is
continuously pushing in through it and out the other side into the dive. Hold
*form*, never hold *everything*.

---

## 12. Failure catalogue

Every one of these shipped in an intermediate version and was caught.

### 12.1 Un-normalised expo
Every segment ended on a 1/1024 snap. Normalise so `e(1) === 1`.

### 12.2 Lerps that didn't land
`a + (b-a)*1.0 ≠ b`. Loop off by ~1500 px with no visible cause.
→ [§3.2](#32-endpoint-exactness--required)

### 12.3 Parameter-space spacing on a morphing path
Four of eight segments are zero-length on a circle; dots clumped onto arc joins.
→ [§3.4](#34-walking-a-path-by-arc-length)

### 12.4 A camera that stopped fifteen times
Eased keyframes decelerate into every key. → [§5.1](#51-closed-hermite-spline--not-eased-keyframes)

### 12.5 A roll that fought the idea
A full 360° barrel roll looked impressive in isolation. But the screens carry
the frame's own 9:16 aspect ratio, and the entire point is that they **line up
with its edges** as they swallow you. Spinning the camera meant they never did.
Cut from ~360° to ±7.2°.

> **Guidance.** A device that is impressive on its own terms but works against
> your central idea is not a trade-off to balance. It is a mistake to remove.

### 12.6 Unmotivated strobes
Three hand-placed inversions read as jump scares. Deleted; replaced by
pass-through parity. → [§6.3](#63-parity-gives-you-motivated-inversion)

### 12.7 No parallax
Uniform scaling is not travel. → [§5.5](#55-parallax--the-one-that-makes-travel-legible)

### 12.8 Expo on a throw
The tile teleported and left a second of dead air. A throw eases **in**.
→ [§4.2](#42-where-each-one-is-legitimate)

### 12.9 Decoration mistaken for content
The mandala. Technically the most advanced thing built; generic on screen.
→ [§11.3](#113-concept-beats-decoration)

### 12.10 A clip edge where a fill belonged
Hard-edged vs antialiased; broke the loop. → [§7.2](#72-but-the-innermost-one-must-be-a-fill)

### 12.11 A gesture that became a journey
The thumb travelled the full height of the frame, dominating it. A swipe is a
short flick — about one tile's worth — not a traversal.

### 12.12 A slow start with no reason to be slow
The deck opened at 1.4 s per throw. Fast from the first beat, then faster, is
better than a ramp from nothing when the subject *is* acceleration.

### 12.13 Trusting a screenshot over the pixels
A frame that looked wrong was a stale read taken during a pane resize. Measure
before you "fix."

---

## 13. Parameter reference

### 13.1 Shared

```js
CONFIG = { W: 1080, H: 1920, fps: 60, expo: 10 }
DURATION = 15.00 s          (both films)
```

**The eye** — identical in both, and the piece's anchor:

```js
EYE = { half: 450, gap: 430,
        lidW: 4000, lidH: 20000,
        pupilD: 290, ringD: 370, ringW: 13,
        catchD: 48, catchX: -95, catchY: -72 }
```

**Eyelid geometry.** Aperture corners are pinned at `±half`. The lid arc depth
required to pass both edges through them:

```js
K_RY = 1 / (1 - √(1 - (half / (lidW/2))²)) / 2     // = 19.5
arcDepth = K_RY · gap                              // = 8385 at gap 430
```

`arcDepth` must stay under `lidH/2` (10 000) — it clamps otherwise. As the gap
closes the arcs **flatten**, so a blink slides shut with its corners fixed,
instead of shrinking to a point. This is why the lid is 20 000 units tall.

**Timeline** (shared spine):

```
0.72 / 0.92   blink shut / open
1.24          pupil dilates
1.90          the dive
2.30          act swap — verified 0.0 % white
2.55          middle begins
9.30          peak travel rate
10.65         travel stops
12.00         eye complete
15.00         loop
```

### 13.2 `iris.html` — the corridor

```js
CORR = { k: 2.2, base: 980, shown: 7, morphIn: -3.4, morphOut: -1.0 }
Q    = { v0: 0.75, v1: 4.20 }        // → q_end 15.66, 15 pass-throughs
```

Screen opening is 9:16 — `h = s · 1.14`, `w = h · 0.5625`, `r = w · 0.14` — so
at the instant a screen swallows the camera, its edges and the frame's coincide.

### 13.3 `iris-swipe.html` — the deck

```js
TILE  = { w: 1560, h: 1680, r: 130, throwDist: 2900, drag: 430, spin: 0.05 }
SW    = { contact: 0.52, release: 0.76 }     // fractions of one throw cycle
MOTIF = 0.70                                  // picture-of-an-eye vs life size
FING  = { w: 172, len: 3200, stroke: 12, restX: 60, restY: 560, enterY: 1500 }
SP    = { v0: 2.20, v1: 5.60 }               // → s_end 26.28, 26 throws
```

The thumb is `dome(w, len, w/2)` — the eyelid generator with a semicircular cap.
It is filled in the tile's ink and **stroked in the tile's ground**, so it reads
on either polarity as it crosses from one tile onto the next.

The tile is dragged `drag` under the thumb during contact, then flung the
remaining distance — leaving at roughly **3× the hand's speed**. That separation
is what makes the release read as a throw.

---

## Running it

```bash
node server.mjs
```

`http://localhost:5173/iris.html` · `/iris-swipe.html` · `/index.html`
(the original circle→rounded-square morph test).

Space toggles playback; the scrubber seeks; **Save video** records one full loop
in real time — keep the tab visible.

`server.mjs` is a zero-dependency static server for local development only: no
authentication, no security headers. Do not expose it.
