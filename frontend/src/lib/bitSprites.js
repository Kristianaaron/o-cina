/**
 * 1-bit Digimon / V-pet style creature sprites (16×16).
 *
 * Catalog is farthest-point sampled from a large candidate pool so each of
 * the 128 variants is visually distinct (not near-duplicates of the same blob).
 */

export const SPRITE_VARIANT_COUNT = 128
const CANDIDATE_POOL = 720

function grid16() {
  return Array.from({ length: 16 }, () => Array(16).fill(false))
}

function set(g, x, y, on = true) {
  if (x < 0 || y < 0 || x > 15 || y > 15) return
  g[y][x] = on
}

function punch(g, x, y) {
  set(g, x, y, false)
}

function fillRect(g, x0, y0, x1, y1) {
  const xa = Math.min(x0, x1)
  const xb = Math.max(x0, x1)
  const ya = Math.min(y0, y1)
  const yb = Math.max(y0, y1)
  for (let y = ya; y <= yb; y += 1) {
    for (let x = xa; x <= xb; x += 1) set(g, x, y)
  }
}

function fillEllipse(g, cx, cy, rx, ry) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      const dx = (x + 0.5 - cx) / Math.max(rx, 0.01)
      const dy = (y + 0.5 - cy) / Math.max(ry, 0.01)
      if (dx * dx + dy * dy <= 1) set(g, x, y)
    }
  }
}

function cloneGrid(g) {
  return g.map((row) => row.slice())
}

function mirrorX(g) {
  const out = grid16()
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) out[y][x] = g[y][15 - x]
  }
  return out
}

function inkCount(g) {
  let n = 0
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) if (g[y][x]) n += 1
  }
  return n
}

function pixelDistance(a, b) {
  let d = 0
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      if (a[y][x] !== b[y][x]) d += 1
    }
  }
  return d
}

function pixelsFromGrid(g) {
  const pts = []
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      if (g[y][x]) pts.push(`${x},${y}`)
    }
  }
  return pts.join(';')
}

/** Scramble index so nearby agents don't get adjacent lookalikes. */
function scramble(i, mod) {
  return (Math.imul(i + 1, 0x9e3779b1) >>> 0) % mod
}

/**
 * Decode a seed into independent traits via mixed radix.
 * Body is the strongest silhouette signal — maximize its spread.
 */
function traitsFromSeed(seed) {
  let n = scramble(seed, 1_000_000_007)
  const take = (m) => {
    const v = n % m
    n = Math.floor(n / m)
    return v
  }
  return {
    body: take(18),
    ears: take(14),
    eyes: take(10),
    brows: take(8),
    mouth: take(12),
    texture: take(10),
    claw: take(10),
    clawSide: take(2) === 0 ? -1 : 1,
    dualClaw: take(2) === 1,
    legs: take(9),
    tail: take(8),
    accent: take(8),
    mirror: take(2) === 1,
  }
}

// —— Bodies: deliberately different silhouettes (species, not blob tweaks) ——

function paintBody(g, style) {
  switch (style) {
    case 0: // round face
      fillEllipse(g, 8, 8, 5.2, 4.6)
      break
    case 1: // wide toad
      fillEllipse(g, 8, 9, 6.2, 3.8)
      fillEllipse(g, 8, 6, 4.8, 3.0)
      break
    case 2: // tall egg
      fillEllipse(g, 8, 8, 4.2, 5.8)
      break
    case 3: // soft square
      fillRect(g, 4, 4, 11, 12)
      fillRect(g, 5, 3, 10, 13)
      break
    case 4: // pear
      fillEllipse(g, 8, 6, 4.4, 3.4)
      fillEllipse(g, 8, 10.5, 5.6, 3.6)
      break
    case 5: // long snout right
      fillEllipse(g, 6.5, 8, 4.2, 4.2)
      fillRect(g, 9, 7, 14, 9)
      set(g, 14, 6); set(g, 14, 10)
      break
    case 6: // diamond
      for (let y = 3; y <= 12; y += 1) {
        const t = 1 - Math.abs(y - 7.5) / 5
        const w = Math.max(1, Math.round(t * 6))
        fillRect(g, 8 - w, y, 8 + w, y)
      }
      break
    case 7: // ghost sheet
      fillRect(g, 4, 3, 11, 11)
      set(g, 4, 12); set(g, 6, 13); set(g, 8, 12); set(g, 10, 13); set(g, 11, 12)
      break
    case 8: // mushroom cap
      fillEllipse(g, 8, 5.5, 6.2, 3.4)
      fillRect(g, 6, 8, 9, 13)
      break
    case 9: // bat / wings folded into body
      fillEllipse(g, 8, 8, 3.6, 4.0)
      set(g, 2, 6); set(g, 3, 5); set(g, 3, 7); set(g, 4, 6); set(g, 4, 8)
      set(g, 13, 6); set(g, 12, 5); set(g, 12, 7); set(g, 11, 6); set(g, 11, 8)
      set(g, 1, 7); set(g, 14, 7)
      break
    case 10: // worm segments
      fillEllipse(g, 4, 8, 2.6, 2.6)
      fillEllipse(g, 8, 8.5, 3.0, 3.0)
      fillEllipse(g, 12, 8, 2.6, 2.4)
      break
    case 11: // robot brick
      fillRect(g, 4, 4, 11, 11)
      fillRect(g, 5, 3, 10, 3)
      fillRect(g, 3, 6, 3, 9)
      fillRect(g, 12, 6, 12, 9)
      break
    case 12: // crab
      fillEllipse(g, 8, 8, 5.5, 3.2)
      set(g, 1, 6); set(g, 2, 5); set(g, 2, 7); set(g, 3, 6)
      set(g, 14, 6); set(g, 13, 5); set(g, 13, 7); set(g, 12, 6)
      break
    case 13: // star-ish
      fillEllipse(g, 8, 8, 3.5, 3.5)
      set(g, 8, 2); set(g, 8, 3); set(g, 8, 12); set(g, 8, 13)
      set(g, 2, 8); set(g, 3, 8); set(g, 12, 8); set(g, 13, 8)
      set(g, 4, 4); set(g, 11, 4); set(g, 4, 11); set(g, 11, 11)
      break
    case 14: // biped torso
      fillEllipse(g, 8, 5.5, 4.6, 3.6)
      fillRect(g, 5, 8, 10, 12)
      break
    case 15: // helmet dome
      fillEllipse(g, 8, 7, 5.4, 5.0)
      fillRect(g, 4, 10, 11, 11)
      break
    case 16: // slim profile left-heavy
      fillEllipse(g, 6, 8, 4.0, 5.0)
      fillEllipse(g, 10, 9, 3.2, 3.2)
      break
    default: // ring / donut face (hollow later)
      fillEllipse(g, 8, 8, 5.6, 5.0)
      break
  }
}

function paintEars(g, style) {
  switch (style) {
    case 0: // twin stubs
      set(g, 4, 2); set(g, 5, 2); set(g, 5, 3)
      set(g, 10, 2); set(g, 11, 2); set(g, 10, 3)
      break
    case 1: // horns
      set(g, 4, 1); set(g, 4, 2); set(g, 5, 2)
      set(g, 11, 1); set(g, 11, 2); set(g, 10, 2)
      break
    case 2: // bunny
      fillRect(g, 4, 0, 5, 3); fillRect(g, 10, 0, 11, 3)
      punch(g, 4, 1); punch(g, 11, 1)
      break
    case 3: // crest
      set(g, 7, 1); set(g, 8, 0); set(g, 8, 1); set(g, 9, 1); set(g, 6, 2); set(g, 9, 2)
      break
    case 4: // antenna
      set(g, 5, 0); set(g, 5, 1); set(g, 6, 1); set(g, 10, 0); set(g, 10, 1); set(g, 9, 1)
      break
    case 5: // wide fins
      set(g, 2, 3); set(g, 3, 2); set(g, 3, 3); set(g, 12, 2); set(g, 13, 3); set(g, 12, 3)
      break
    case 6: // mohawk
      set(g, 7, 0); set(g, 8, 0); set(g, 6, 1); set(g, 7, 1); set(g, 8, 1); set(g, 9, 1)
      set(g, 7, 2); set(g, 8, 2)
      break
    case 7: // single unicorn
      set(g, 8, 0); set(g, 7, 1); set(g, 8, 1); set(g, 9, 1); set(g, 8, 2)
      break
    case 8: // devil long
      set(g, 3, 0); set(g, 3, 1); set(g, 4, 1); set(g, 4, 2)
      set(g, 12, 0); set(g, 12, 1); set(g, 11, 1); set(g, 11, 2)
      break
    case 9: // leaf
      set(g, 8, 0); set(g, 7, 1); set(g, 8, 1); set(g, 9, 1); set(g, 6, 2); set(g, 9, 2)
      break
    case 10: // headphones
      fillRect(g, 2, 5, 3, 8); fillRect(g, 12, 5, 13, 8)
      set(g, 3, 4); set(g, 12, 4)
      break
    case 11: // crown 3 points
      set(g, 5, 1); set(g, 7, 0); set(g, 8, 0); set(g, 9, 0); set(g, 11, 1)
      set(g, 5, 2); set(g, 6, 2); set(g, 7, 2); set(g, 8, 2); set(g, 9, 2); set(g, 10, 2)
      break
    case 12: // asymmetric stub
      set(g, 3, 1); set(g, 3, 2); set(g, 4, 2); set(g, 11, 2)
      break
    default: // none
      break
  }
}

function paintClaw(g, style, side) {
  const X = (x) => (side < 0 ? x : 15 - x)
  switch (style) {
    case 0: // three-prong
      set(g, X(1), 6)
      set(g, X(0), 7); set(g, X(1), 7); set(g, X(2), 7)
      set(g, X(0), 8); set(g, X(2), 8)
      break
    case 1: // two-finger
      set(g, X(1), 7)
      set(g, X(0), 8); set(g, X(1), 8); set(g, X(2), 8)
      set(g, X(0), 9); set(g, X(2), 9)
      break
    case 2: // stub
      set(g, X(1), 8); set(g, X(2), 8); set(g, X(1), 9); set(g, X(2), 9)
      break
    case 3: // wing
      set(g, X(1), 5)
      set(g, X(0), 6); set(g, X(1), 6); set(g, X(2), 6)
      set(g, X(0), 7); set(g, X(1), 7)
      break
    case 4: // spike
      set(g, X(1), 6); set(g, X(0), 7); set(g, X(1), 7); set(g, X(1), 8)
      break
    case 5: // paw down
      set(g, X(2), 10); set(g, X(1), 11); set(g, X(2), 11); set(g, X(3), 11)
      break
    case 6: // scythe
      set(g, X(0), 5); set(g, X(0), 6); set(g, X(1), 6); set(g, X(1), 7); set(g, X(2), 8)
      break
    case 7: // block fist
      fillRect(g, X(0), 7, X(2), 9)
      break
    case 8: // tentacle
      set(g, X(1), 7); set(g, X(0), 8); set(g, X(0), 9); set(g, X(1), 10); set(g, X(0), 11)
      break
    default: // none
      break
  }
}

function paintLegs(g, style) {
  switch (style) {
    case 0:
      set(g, 5, 13); set(g, 5, 14); set(g, 6, 14)
      set(g, 10, 13); set(g, 10, 14); set(g, 9, 14)
      break
    case 1:
      fillRect(g, 4, 12, 6, 14); fillRect(g, 9, 12, 11, 14)
      punch(g, 5, 13); punch(g, 10, 13)
      break
    case 2:
      set(g, 3, 12); set(g, 4, 12); set(g, 4, 13)
      set(g, 7, 13); set(g, 8, 13)
      set(g, 11, 12); set(g, 12, 12); set(g, 11, 13)
      break
    case 3:
      fillRect(g, 7, 13, 8, 14); set(g, 6, 14); set(g, 9, 14)
      break
    case 4: // none
      break
    case 5:
      set(g, 5, 14); set(g, 6, 13); set(g, 9, 13); set(g, 10, 14)
      break
    case 6: // wheels
      set(g, 4, 13); set(g, 5, 12); set(g, 5, 14); set(g, 6, 13)
      set(g, 9, 13); set(g, 10, 12); set(g, 10, 14); set(g, 11, 13)
      break
    case 7: // long stilts
      set(g, 5, 12); set(g, 5, 13); set(g, 5, 14); set(g, 4, 14)
      set(g, 10, 12); set(g, 10, 13); set(g, 10, 14); set(g, 11, 14)
      break
    default: // tripod
      set(g, 4, 14); set(g, 8, 13); set(g, 8, 14); set(g, 12, 14)
      break
  }
}

function paintTail(g, style) {
  switch (style) {
    case 0: break
    case 1:
      set(g, 13, 9); set(g, 14, 8); set(g, 14, 9); set(g, 15, 9)
      break
    case 2:
      set(g, 13, 10); set(g, 14, 10); set(g, 15, 9); set(g, 15, 10); set(g, 15, 11)
      break
    case 3:
      set(g, 12, 4); set(g, 13, 3); set(g, 14, 3); set(g, 13, 4)
      break
    case 4:
      set(g, 1, 9); set(g, 0, 8); set(g, 0, 9); set(g, 0, 10)
      break
    case 5: // curly
      set(g, 13, 8); set(g, 14, 7); set(g, 15, 8); set(g, 14, 9)
      break
    case 6: // flame
      set(g, 13, 7); set(g, 14, 6); set(g, 14, 7); set(g, 15, 5); set(g, 15, 7)
      break
    default: // stub both
      set(g, 1, 10); set(g, 14, 10)
      break
  }
}

function paintAccent(g, style) {
  switch (style) {
    case 0: break
    case 1: // belly stripe
      for (let y = 10; y <= 12; y += 1) { punch(g, 7, y); punch(g, 8, y) }
      break
    case 2: // back spikes
      set(g, 6, 3); set(g, 8, 2); set(g, 10, 3)
      break
    case 3: // scarf
      fillRect(g, 4, 10, 11, 10); set(g, 3, 11); set(g, 12, 11)
      break
    case 4: // belt buckle
      punch(g, 7, 11); punch(g, 8, 11); set(g, 6, 11); set(g, 9, 11)
      break
    case 5: // shoulder pads
      fillRect(g, 3, 5, 4, 6); fillRect(g, 11, 5, 12, 6)
      break
    case 6: // goggles bridge
      punch(g, 6, 6); punch(g, 7, 6); punch(g, 8, 6); punch(g, 9, 6)
      break
    default: // freckles
      punch(g, 4, 8); punch(g, 11, 8); punch(g, 5, 9); punch(g, 10, 9)
      break
  }
}

function punchFace(g, eyeStyle, browStyle, mouthStyle) {
  const eyeY = 6
  switch (eyeStyle) {
    case 0: punch(g, 5, eyeY); punch(g, 10, eyeY); break
    case 1: punch(g, 4, eyeY); punch(g, 11, eyeY); break
    case 2: punch(g, 6, eyeY); punch(g, 9, eyeY); break
    case 3:
      punch(g, 5, eyeY); punch(g, 5, eyeY + 1)
      punch(g, 10, eyeY); punch(g, 10, eyeY + 1)
      break
    case 4: punch(g, 7, eyeY); punch(g, 8, eyeY); break
    case 5:
      punch(g, 5, eyeY); punch(g, 4, eyeY + 1); punch(g, 6, eyeY + 1)
      punch(g, 10, eyeY); punch(g, 9, eyeY + 1); punch(g, 11, eyeY + 1)
      break
    case 6: punch(g, 5, eyeY); punch(g, 10, eyeY); punch(g, 10, eyeY + 1); break
    case 7:
      punch(g, 4, eyeY); punch(g, 5, eyeY); punch(g, 10, eyeY); punch(g, 11, eyeY)
      break
    case 8: // X eyes
      punch(g, 4, eyeY); punch(g, 6, eyeY); punch(g, 5, eyeY + 1)
      punch(g, 9, eyeY); punch(g, 11, eyeY); punch(g, 10, eyeY + 1)
      break
    default: // triple
      punch(g, 4, eyeY); punch(g, 8, eyeY); punch(g, 12, eyeY)
      break
  }

  switch (browStyle) {
    case 0:
      punch(g, 6, eyeY - 1); punch(g, 7, eyeY - 2); punch(g, 8, eyeY - 2); punch(g, 9, eyeY - 1)
      break
    case 1:
      punch(g, 4, eyeY - 1); punch(g, 5, eyeY - 1)
      punch(g, 10, eyeY - 1); punch(g, 11, eyeY - 1)
      break
    case 2:
      punch(g, 4, eyeY - 1); punch(g, 5, eyeY - 2)
      punch(g, 10, eyeY - 2); punch(g, 11, eyeY - 1)
      break
    case 3:
      for (let x = 5; x <= 10; x += 1) punch(g, x, eyeY - 1)
      break
    case 4: punch(g, 5, eyeY - 2); punch(g, 10, eyeY - 2); break
    case 5: // happy arcs
      punch(g, 4, eyeY); punch(g, 5, eyeY - 1); punch(g, 6, eyeY)
      punch(g, 9, eyeY); punch(g, 10, eyeY - 1); punch(g, 11, eyeY)
      break
    case 6: // monocle brow
      punch(g, 9, eyeY - 1); punch(g, 10, eyeY - 1); punch(g, 11, eyeY - 1)
      break
    default: break
  }

  const my = 9
  switch (mouthStyle) {
    case 0: // zig-zag
      punch(g, 4, my); punch(g, 5, my + 1); punch(g, 6, my)
      punch(g, 7, my + 1); punch(g, 8, my); punch(g, 9, my + 1)
      punch(g, 10, my); punch(g, 11, my + 1)
      break
    case 1:
      punch(g, 6, my); punch(g, 7, my + 1); punch(g, 8, my + 1); punch(g, 9, my)
      break
    case 2:
      punch(g, 6, my); punch(g, 7, my); punch(g, 8, my); punch(g, 9, my)
      punch(g, 6, my + 1); punch(g, 9, my + 1)
      punch(g, 7, my + 2); punch(g, 8, my + 2)
      break
    case 3:
      punch(g, 8, my); punch(g, 9, my); punch(g, 10, my + 1); punch(g, 11, my + 1)
      break
    case 4:
      punch(g, 6, my); punch(g, 7, my + 1); punch(g, 8, my); punch(g, 9, my + 1)
      break
    case 5:
      punch(g, 7, my); punch(g, 8, my); punch(g, 6, my + 1); punch(g, 9, my + 1)
      break
    case 6:
      punch(g, 3, 8); punch(g, 4, 8); punch(g, 11, 8); punch(g, 12, 8)
      punch(g, 7, my); punch(g, 8, my)
      break
    case 7: punch(g, 7, my); punch(g, 8, my); break
    case 8: // teeth row
      for (let x = 5; x <= 10; x += 1) punch(g, x, my)
      punch(g, 5, my + 1); punch(g, 7, my + 1); punch(g, 9, my + 1)
      break
    case 9: // beak
      punch(g, 7, my); punch(g, 8, my); punch(g, 9, my)
      set(g, 10, my); set(g, 11, my); set(g, 11, my + 1)
      break
    case 10: // frown
      punch(g, 6, my + 1); punch(g, 7, my); punch(g, 8, my); punch(g, 9, my + 1)
      break
    default: // tongue
      punch(g, 7, my); punch(g, 8, my); punch(g, 7, my + 1); punch(g, 8, my + 1); punch(g, 8, my + 2)
      break
  }
}

function punchTexture(g, style) {
  switch (style) {
    case 0:
      for (let x = 3; x <= 12; x += 1) if ((x + 7) % 2 === 0) punch(g, x, 8)
      break
    case 1:
      for (let y = 4; y <= 5; y += 1) {
        for (let x = 5; x <= 10; x += 1) if ((x + y) % 2 === 0) punch(g, x, y)
      }
      break
    case 2: punch(g, 6, 11); punch(g, 9, 11); punch(g, 7, 12); break
    case 3: punch(g, 3, 7); punch(g, 3, 9); punch(g, 12, 7); punch(g, 12, 9); break
    case 4: for (let x = 5; x <= 10; x += 1) punch(g, x, 10); break
    case 5: punch(g, 4, 5); punch(g, 11, 5); punch(g, 5, 11); punch(g, 10, 11); break
    case 6: // vertical bars
      for (let y = 5; y <= 10; y += 1) { punch(g, 6, y); punch(g, 9, y) }
      break
    case 7: // diagonal
      punch(g, 4, 5); punch(g, 5, 6); punch(g, 6, 7); punch(g, 9, 7); punch(g, 10, 6); punch(g, 11, 5)
      break
    case 8: // heart belly
      punch(g, 7, 10); punch(g, 8, 10); punch(g, 6, 11); punch(g, 9, 11); punch(g, 7, 12); punch(g, 8, 12)
      break
    default: break
  }
}

function ensureDetail(g, t) {
  if (inkCount(g) < 26) {
    fillEllipse(g, 8, 8, 5, 4.5)
    punchFace(g, t.eyes, t.brows, t.mouth)
  }
  // Ensure face reads: at least eye punches exist
  let holes = 0
  for (let y = 4; y <= 11; y += 1) {
    for (let x = 4; x <= 11; x += 1) if (!g[y][x]) holes += 1
  }
  if (holes < 5) {
    punch(g, 5, 6); punch(g, 10, 6)
    punch(g, 6, 9); punch(g, 7, 10); punch(g, 8, 9); punch(g, 9, 10)
  }
}

function renderTraits(t) {
  let g = grid16()
  paintBody(g, t.body)
  paintEars(g, t.ears)
  paintClaw(g, t.claw, t.clawSide)
  if (t.dualClaw) paintClaw(g, (t.claw + 3) % 10, -t.clawSide)
  paintLegs(g, t.legs)
  paintTail(g, t.tail)
  punchTexture(g, t.texture)
  paintAccent(g, t.accent)
  punchFace(g, t.eyes, t.brows, t.mouth)
  if (t.mirror) g = mirrorX(g)
  ensureDetail(g, t)
  return g
}

/** Build raw candidate from seed (not yet diversity-filtered). */
export function buildCreatureGridFromSeed(seed) {
  return renderTraits(traitsFromSeed(seed))
}

/**
 * Farthest-point sample a diverse catalog of SPRITE_VARIANT_COUNT grids.
 */
function buildDiverseCatalogGrids() {
  const candidates = []
  for (let i = 0; i < CANDIDATE_POOL; i += 1) {
    candidates.push(buildCreatureGridFromSeed(i * 17 + 3))
  }

  // Start with the most "featured" candidate (highest hole+appendage ink spread)
  let bestStart = 0
  let bestScore = -1
  for (let i = 0; i < candidates.length; i += 1) {
    const g = candidates[i]
    let holes = 0
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) if (!g[y][x]) holes += 1
    }
    const score = inkCount(g) + holes * 0.15
    if (score > bestScore) {
      bestScore = score
      bestStart = i
    }
  }

  const chosen = [cloneGrid(candidates[bestStart])]
  const used = new Set([bestStart])

  while (chosen.length < SPRITE_VARIANT_COUNT) {
    let pick = -1
    let pickMin = -1
    for (let i = 0; i < candidates.length; i += 1) {
      if (used.has(i)) continue
      let minD = Infinity
      for (let c = 0; c < chosen.length; c += 1) {
        const d = pixelDistance(candidates[i], chosen[c])
        if (d < minD) minD = d
        if (minD <= pickMin) break
      }
      if (minD > pickMin) {
        pickMin = minD
        pick = i
      }
    }
    if (pick < 0) break
    used.add(pick)
    chosen.push(cloneGrid(candidates[pick]))
  }

  return chosen
}

let catalogGrids = null
let catalogPixels = null

function ensureCatalog() {
  if (catalogGrids) return
  catalogGrids = buildDiverseCatalogGrids()
  catalogPixels = catalogGrids.map(pixelsFromGrid)
}

/** Catalog grid by public variant index. */
export function buildCreatureGrid(variantIndex) {
  ensureCatalog()
  const idx = ((variantIndex % SPRITE_VARIANT_COUNT) + SPRITE_VARIANT_COUNT) % SPRITE_VARIANT_COUNT
  return cloneGrid(catalogGrids[idx])
}

export function creaturePixels(variantIndex) {
  ensureCatalog()
  const idx = ((variantIndex % SPRITE_VARIANT_COUNT) + SPRITE_VARIANT_COUNT) % SPRITE_VARIANT_COUNT
  return catalogPixels[idx]
}

export function getSpriteCatalog() {
  ensureCatalog()
  return catalogPixels.slice()
}

/** Min pairwise pixel distance in the live catalog (for tests). */
export function catalogMinPairDistance() {
  ensureCatalog()
  let minD = Infinity
  for (let i = 0; i < catalogGrids.length; i += 1) {
    for (let j = i + 1; j < catalogGrids.length; j += 1) {
      minD = Math.min(minD, pixelDistance(catalogGrids[i], catalogGrids[j]))
    }
  }
  return minD
}

export function bitSpriteToDataUrl(pixels, { ink = '#e4e4e7' } = {}) {
  const pts = String(pixels || '')
    .split(';')
    .filter(Boolean)
    .map((p) => {
      const [x, y] = p.split(',').map(Number)
      return { x, y }
    })
  if (pts.length === 0) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"/>',
    )}`
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const { x, y } of pts) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  const w = maxX - minX + 1
  const h = maxY - minY + 1
  // Extra padding so the creature sits small & centered in the disc
  const pad = 3
  const size = Math.max(w, h) + pad * 2
  const ox = (size - w) / 2 - minX
  const oy = (size - h) / 2 - minY
  const rects = pts
    .map(({ x, y }) => `<rect x="${x + ox}" y="${y + oy}" width="1" height="1"/>`)
    .join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><g fill="${ink}">${rects}</g></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export function hashSeed(value) {
  const s = String(value || 'agent')
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export function spriteVariantForAgent(agent) {
  return hashSeed(agent?.id || agent?.name) % SPRITE_VARIANT_COUNT
}

export function agentBitAvatarUrl(agent, { dim = false } = {}) {
  const sprites = getSpriteCatalog()
  const idx = spriteVariantForAgent(agent)
  return bitSpriteToDataUrl(sprites[idx], {
    ink: dim ? '#71717a' : '#e4e4e7',
  })
}
