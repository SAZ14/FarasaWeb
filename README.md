# Farasa Website

Static marketing site for **Farasa**, which captures head-mounted, first-person
video of real human labour on live construction sites, annotates every frame,
and sells the result to teams training embodied AI.

## Stack

Plain HTML, CSS, and vanilla JavaScript. No build step, no dependencies, no
image or video assets. The footage on the page is generated at runtime.

```
index.html      Page markup (all sections)
css/style.css   Design system, layout, reveal choreography
js/main.js      POV renderer + page behaviour
```

## Design

The page alternates between two surfaces: **ink** (black, the capture feed) and
**paper** (warm bone, the specification sheets). Every component reads its
colours from custom properties set by `[data-theme]` on the section, so nothing
is duplicated per surface. The header swaps between the two as you scroll.

Type is [Archivo](https://fonts.google.com/specimen/Archivo) (variable width and
weight, with display sizes running compressed) with JetBrains Mono for anything that is
meant to read as instrument output.

### Section cuts

Surfaces never butt against each other. Every change is an edit point: a
`.cut` band where the incoming surface arrives through a macroblock dissolve:
twelve scanline bars that start hairline-thin and thicken to solid, intersected
with a checkerboard that resolves as it descends. The ramp is identical at
every boundary and in both directions; only the two colours swap, so the page
reads as one strip cut together rather than eight blocks stacked up.

An orange scan bar sweeps each cut as you scroll past it, driven by
`animation-timeline: view()`. The dissolve is plain `mask-image` and works
everywhere; the checkerboard needs `mask-composite: intersect` and the sweep
needs scroll-driven timelines. Both are `@supports`-gated and degrade to the
plain scanline dissolve. The sweep is disabled under reduced motion.

Adding a cut is one element:

```html
<div class="cut" data-cut="paper" aria-hidden="true"></div>
```

`data-cut` names the *incoming* surface; the outgoing one is inferred. Cuts
deliberately carry no `data-theme`, so the sticky header keeps the outgoing
theme until the next real section reaches it, which is correct, because the
top of a cut is still the outgoing surface.

## The POV renderer

`js/main.js` draws the hero and the annotation-stack viewer. There is no video
file: it is a small software renderer.

- **Camera.** Pinhole projection plus barrel distortion, matching a 122° action
  cam. Straight world lines are subdivided so they bow correctly under the lens.
  The undistorted radius is capped before distortion so geometry near the near
  plane lands off-frame instead of folding back through the centre.
- **Head motion.** Keyframed position, yaw, and pitch through a ten-second
  lift → carry → place cycle, plus gait bob, breathing, roll, and involuntary
  micro-motion. All of it is a pure function of `t`, so scrubbing is exact.
- **Hands.** 21 keypoints per hand in MediaPipe ordering, posed in body space
  so they parallax against the head when you move the cursor.
- **Overlays.** Object boxes, hand pose, gaze, contact events, and action
  segments are drawn onto the same geometry. These are the layers the business
  sells, so the page demonstrates them rather than describing them.

Everything is deterministic in `t`. There is no `Math.random()` in the render
path, which is what makes the scrub bar work.

### Swapping in real footage

The hero is built so the procedural scene can be replaced by real capture: drop
a `<video>` in place of `canvas[data-pov="hero"]`, keep the HUD and scrub
markup, and drive the overlay canvas from the video's `currentTime` instead of
the internal clock.

## Contact form

The form validates in the browser, then opens the visitor's mail client with a
pre-filled message. It deliberately does **not** use `action="mailto:"`, because that
pattern is handed to the OS inconsistently and silently does nothing on a
machine with no desktop mail client configured.

To collect submissions server-side instead, put a form endpoint in
`data-endpoint` on the `<form data-form>` element in `index.html`:

```html
<form data-form data-endpoint="https://formspree.io/f/YOUR_ID" ...>
```

With that set, the form POSTs JSON and reports success or failure inline.
Formspree, Basin, and Web3Forms all work as-is; so does any handler that
accepts a JSON body. Leave it empty to keep the mail-client fallback.

## Accessibility

Full `prefers-reduced-motion` path: the feed renders a single static frame,
reveals and marquees are disabled, and the play/scrub controls still work if the
visitor chooses to use them. All controls are real buttons and inputs with
labels; the canvas is decorative and the copy stands alone without it.

## Run locally

Any static file server works:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.
