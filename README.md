# IRIS

Two 9:16 black-and-white film loops, built as pure vector animation on a canvas.
No Remotion, no animation libraries, no dependencies — one geometry generator,
one camera rig, one exporter, hand-written.

Both are 1080 × 1920, 15.00 s, 60 fps, and loop **pixel-exactly**.

| | |
|---|---|
| **`iris.html`**<br>*it blinks back* | An eye opens; you fall through the pupil into a corridor of screens, each arriving as a circle and becoming a screen as it reaches you. Every threshold turns the world inside out, and it accelerates. The last screen morphs into the pupil and the lids close around it. |
| **`iris-swipe.html`** | The same eye, the same fall. Beyond it, a deck of tiles and a thumb throwing them upward, faster and faster — 26 throws from 0.45 s apart down to 0.18 s. Each tile carries a small picture of an eye. The last one is not thrown: it morphs into the pupil instead. |
| **`iris3d.html`**<br>*it blinks back — 3D* | The same film, one dimension up. Nothing is a mesh: the whole scene is an implicit surface raymarched in WGSL on WebGPU. Glass, dispersion and a procedural gradient environment; every threshold swaps the palette cool-to-warm instead of black-to-white. |
| **`index.html`** | The original test the system grew out of — a circle morphing to a rounded square. |

*We keep building brighter screens, and every one of them is shaped like the eye
that made it. You swipe past every image of the thing, and the thing is
watching. The loop is the scroll.*

## Posting

Short, because the video is the pitch. The caption's job is to reframe what the
viewer just did, not to describe what they just saw.

**`iris.html`**

> **it blinks back**
>
> you stopped. it noticed.
>
> `#motiondesign` `#creativecoding`

Swap `#creativecoding` for `#loopanimation` to lean on the loop rather than the
craft.

## Run

```bash
node server.mjs
```

Then open `http://localhost:5173/iris.html` or `/iris-swipe.html`.

Space toggles playback and the scrubber seeks. **Save video** renders the loop
offline through WebCodecs and writes the MP4 by hand — every frame is drawn and
encoded with an exact timestamp, so the file is constant-frame-rate by
construction. About 12 s for a 15 s film.

The **speed** control applies to the saved file as well as to playback. Because
`render(t)` is a pure function of continuous time, a slower speed does not
repeat frames — it samples the animation at a finer step and computes genuinely
new in-between frames. Real slow motion, not a post-process. Every option
divides evenly into whole frames, so the loop stays seamless:

| | 0.25× | 0.5× | 0.75× | 1× | 1.5× | 2× | 3× |
|---|---|---|---|---|---|---|---|
| frames | 3600 | 1800 | 1200 | 900 | 600 | 450 | 300 |
| length | 60 s | 30 s | 20 s | 15 s | 10 s | 7.5 s | 5 s |

## Why the 3D version is not path traced

The obvious choice for "3D, ray traced, in the browser" is a Monte Carlo path
tracer — [gnikoloff/webgpu-raytracer](https://github.com/gnikoloff/webgpu-raytracer),
[JamesRandall/webgpu-doom-pathtracer](https://github.com/JamesRandall/webgpu-doom-pathtracer),
[gkjohnson/three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer).
All of them are disqualified by this project's own contract rather than by
quality: they converge stochastically over many samples and lean on temporal
reprojection, so frame N depends on frame N−1. This film requires `render(t)`
to be a pure function of `t` and frame 0 to equal frame 900 to the pixel.
Denoisers would also smear exactly the hard edges the piece is made of.

Raymarched signed distance fields are analytic and noise-free, so a frame is
reproducible from its time alone — and the morph the film is built on is
already a distance-field operation:

```
2D   lerpP(circle, roundedRect, t)
3D   mix(sdCircle2(p), sdRoundRect2(p), t)
```

The parallax that had to be hand-built in 2D is now just perspective, and falls
out of the projection for free. Verified: the 3D loop is pixel-exact (0 pixels
differ), the act swap measures luminance 0, and a 900-frame export takes ~12 s.

## Documentation

**[ANIMATION-SYSTEM.md](ANIMATION-SYSTEM.md)** documents the whole system: the
geometry engine, the morph, the motion language and where each easing curve is
legitimate, the camera rig, self-similar travel, the loop contract, the
verification harness, the direction rules — and a catalogue of every failure
that shaped them.

**[CLAUDE.md](CLAUDE.md)** is the working contract for anyone (or any agent)
picking this up: the invariants that break silently, the motion and direction
rules in short form, and a copy-pasteable verification protocol. It requires
reading `ANIMATION-SYSTEM.md` before changing animation code, because most
"obvious" improvements here have already been tried and reverted for reasons
recorded there.

## Note

`server.mjs` is a zero-dependency static server for local development only. It
has no authentication and sets no security headers. Don't expose it.
