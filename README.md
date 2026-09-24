# 🦃 Turkey Crossing

A Crossy Road–style 3D browser game about the wild turkeys of **Harvard Square, Cambridge**.
Hop across Mass Ave, JFK St and Brattle St without getting flattened by cars, MBTA buses, Harvard
shuttles or cyclists. Ride rowing shells across the Charles, grab corn, and don't dawdle, or a
red-tailed hawk will come for you.

**Play:** https://luke-mcevoy.github.io/turkey-crossing/

## Controls

| Action | Keyboard | Phone |
| --- | --- | --- |
| Hop forward | ↑ / W | Tap or swipe up |
| Hop back | ↓ / S | Swipe down |
| Hop sideways | ← → / A D | Swipe left / right |
| Retry | Space / Enter | Tap **Try again** |
| Mute | M | 🔊 button |

## Run locally

It's a static site with no build step. Three.js loads from a CDN.

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## How it's built

- `index.html`: the page, HUD and Game Boy–style text boxes (font: Press Start 2P)
- `src/main.js`: everything else. The models are built from boxes in code (no art assets), the
  streets are generated procedurally as you go, and the sound effects (including the gobble) are
  synthesized with the Web Audio API

Your high score and total corn are saved in the browser's localStorage.
