# IRIS

Two 9:16 black-and-white film loops, built as pure vector animation on a canvas.
No Remotion, no animation libraries, no dependencies — one geometry generator,
one camera rig, one exporter, hand-written.

Both are 1080 × 1920, 15.00 s, 60 fps, and loop **pixel-exactly**.

| | |
|---|---|
| **`iris.html`** | An eye opens; the camera falls through the pupil into a corridor of screens. Each arrives from the far distance as a circle and morphs into a 9:16 rounded rectangle as it reaches you — carrying the film's own aspect ratio, so screen and frame coincide at the moment you pass through. Every pass turns the image over. It accelerates. The last screen morphs into the pupil, and the lids close around it. |
| **`iris-swipe.html`** | The same eye, the same fall. Beyond it, a deck of tiles and a thumb throwing them upward, faster and faster — 26 throws from 0.45 s apart down to 0.18 s. Each tile carries a small picture of an eye. The last one is not thrown: it morphs into the pupil instead. |
| **`index.html`** | The original test the system grew out of — a circle morphing to a rounded square. |

*You swipe past every image of the thing, and the thing is watching. The loop is
the scroll.*

## Run

```bash
node server.mjs
```

Then open `http://localhost:5173/iris.html` or `/iris-swipe.html`.

Space toggles playback, the scrubber seeks, and **Save video** records one full
loop as MP4 (H.264 where supported, WebM otherwise). Recording is a real-time
canvas capture, so a 15 s film takes 15 s — and the tab must stay visible, or
the browser stops painting and the capture receives nothing.

## Documentation

**[ANIMATION-SYSTEM.md](ANIMATION-SYSTEM.md)** documents the whole system: the
geometry engine, the morph, the motion language and where each easing curve is
legitimate, the camera rig, self-similar travel, the loop contract, the
verification harness, the direction rules — and a catalogue of every failure
that shaped them.

## Note

`server.mjs` is a zero-dependency static server for local development only. It
has no authentication and sets no security headers. Don't expose it.
