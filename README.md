Vector Motion Using Pure Code:

Pure vector animation on a canvas.

https://github.com/user-attachments/assets/fd113db8-edb8-4b9d-9692-57eb57f56a31



https://github.com/user-attachments/assets/be1f0940-fc2c-4452-bef7-b6b4bb9732d5


No animation libraries, no dependencies — one geometry generator,
one camera rig, one exporter, hand-written.

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
