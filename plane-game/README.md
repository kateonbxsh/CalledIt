# ✈️ Sky Landing — cash-out flight game

A self-contained gambling mini-game in a single `index.html`. Place a bet, **pick a launch
angle** (Angry-Birds style) and fire — then it's out of your hands. The plane flies a
ballistic arc through a busy sky; the **multiplier rises slowly & logarithmically** with
distance. Land on a boat and brake to a stop to cash out at the current multiplier.

## Play
Open `index.html` in any modern browser (double-click works — no build/server needed).

- Choose a **bet**, set the **angle** (drag the sky to aim, or use the slider), then **Launch**.
- No mid-air control — the trajectory plays out on its own.
- **⭐ Powerup**: bumps the plane **up** and adds a little multiplier (so a powerup-rich path flies
  farther = bigger payout, but stays high and skips the near boats).
- **🚀 Missile**: shoves the plane **down** (too many and you'll be forced into the sea).
- **Landing**: come down onto a **boat deck** and the plane slides + brakes. Stop on the deck = win.
  Carry too much speed and slide **off the far edge** → you fall in the sea = loss.
- Ditching in the water (missing all boats) = loss. Credits persist in `localStorage`;
  bust out and "Play again" resets to 1000.

Flatter angles = faster/harder to stop (overshoot risk); steeper = slower landing but more
airtime in the hazard field. The gamble is how far the sky carries you vs. landing cleanly.

## Assets & licenses
All third-party art is **CC0 (public domain)** by [Kenney](https://kenney.nl) — free for
any use, no attribution required (credited here as courtesy):

| File | Source |
|---|---|
| `plane1-3.png`, `sky.png`, `puff.png`, `star.png` | [Tappy Plane](https://www.kenney.nl/assets/tappy-plane) (Kenney, CC0) |
| `missile.svg`, `boat-small.svg`, `boat-large.svg` | Custom, drawn to match the flat style |

Full license text: `assets/TappyPlane-License.txt`.
Water surface, clouds parallax, and particles are generated procedurally on the canvas.
