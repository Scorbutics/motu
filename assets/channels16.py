import math

# Generator for the favicon's channel paths (assets/motu-icon-16.svg). The main mark's channels are
# tapered ribbons from blob.py; at 16px those turn to mush, so the favicon's follow the coastlines
# instead: a crescent band at a constant offset from an island, thickness tapering to a point at both
# ends. Emitted as straight-segment polylines so the edges stay crisp on the pixel grid.

def arcband(cx, cy, rad, a0, a1, hw, n=28, p=0.55):
    """Crescent at radius `rad` around (cx,cy), spanning a0..a1 degrees, pinched to a point at both ends."""
    a0, a1 = math.radians(a0), math.radians(a1)
    out, back = [], []
    for i in range(n + 1):
        s = i / n
        a = a0 + (a1 - a0) * s
        t = hw * (math.sin(math.pi * s) ** p)
        ca, sa = math.cos(a), math.sin(a)
        out.append((cx + (rad + t) * ca, cy + (rad + t) * sa))
        back.append((cx + (rad - t) * ca, cy + (rad - t) * sa))
    pts = out + back[::-1]
    return "M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in pts) + " Z"

# island centre + radius, channel offset outside the shore, angle span, half-thickness
CHANNELS = [
    (5.7,  9.3,  3.05 + 0.78, -92,  78, 0.56),   # big island, N shore round to S
    (11.0, 5.0,  2.30 + 0.72,  34, 196, 0.50),   # north island, whole lagoon-facing side
    (11.7, 11.9, 1.65 + 0.68, 164, 304, 0.46),   # small SE island
]

if __name__ == "__main__":
    for c in CHANNELS:
        print(arcband(*c), "\n")
