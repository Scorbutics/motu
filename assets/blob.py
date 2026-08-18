import math

def blob(cx, cy, base, mults, rot=0.0):
    """Closed Catmull-Rom through radially-varied points -> cubic path. Deterministic, no randomness."""
    n = len(mults)
    pts = []
    for i, m in enumerate(mults):
        a = rot + 2 * math.pi * i / n
        r = base * m
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    d = f"M{pts[0][0]:.2f} {pts[0][1]:.2f}"
    for i in range(n):
        p0 = pts[(i - 1) % n]; p1 = pts[i]; p2 = pts[(i + 1) % n]; p3 = pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f"C{c1[0]:.2f} {c1[1]:.2f} {c2[0]:.2f} {c2[1]:.2f} {p2[0]:.2f} {p2[1]:.2f}"
    return d + "Z"

# big island, lower-left — the anchor of the composition
big  = blob(23.5, 38.5, 13.2, [1.06, 0.92, 1.10, 0.95, 1.02, 0.88, 1.07, 0.94], rot=0.35)
# medium, upper-right
med  = blob(42.0, 19.5, 8.6,  [0.95, 1.08, 0.90, 1.06, 0.94, 1.10], rot=0.9)
# small, right-lower
sml  = blob(48.5, 43.0, 6.2,  [1.08, 0.92, 1.06, 0.90, 1.04, 0.96], rot=0.2)
# the lagoon these three enclose — irregular, not a rosette
lag  = blob(36.5, 32.0, 8.4,  [0.95, 1.12, 0.82, 1.05, 0.88, 1.15, 0.86, 1.02], rot=1.2)

for name, d in [("big", big), ("med", med), ("sml", sml), ("lag", lag)]:
    print(f'{name}: {d}\n')


def ribbon(p0, p1, p2, p3, w0, w1, leaf=False, n=48):
    """Tapered band along a cubic centreline. Width shrinks to a POINT at the ends, so a channel
    reads as a cut through the reef rather than a stroke of constant thickness."""
    def bez(t):
        mt = 1 - t
        x = mt**3*p0[0] + 3*mt*mt*t*p1[0] + 3*mt*t*t*p2[0] + t**3*p3[0]
        y = mt**3*p0[1] + 3*mt*mt*t*p1[1] + 3*mt*t*t*p2[1] + t**3*p3[1]
        return x, y
    def tangent(t):
        mt = 1 - t
        x = 3*mt*mt*(p1[0]-p0[0]) + 6*mt*t*(p2[0]-p1[0]) + 3*t*t*(p3[0]-p2[0])
        y = 3*mt*mt*(p1[1]-p0[1]) + 6*mt*t*(p2[1]-p1[1]) + 3*t*t*(p3[1]-p2[1])
        m = math.hypot(x, y) or 1e-6
        return x/m, y/m
    def width(t):
        # leaf: pointed at BOTH ends. otherwise: taper from w0 down to w1.
        return w0 * math.sin(math.pi*t)**0.7 if leaf else w0 + (w1-w0)*(t**1.25)
    left, right = [], []
    for i in range(n+1):
        t = i/n
        (x, y), (tx, ty) = bez(t), tangent(t)
        nx, ny = -ty, tx
        h = width(t)/2
        left.append((x+nx*h, y+ny*h)); right.append((x-nx*h, y-ny*h))
    pts = left + right[::-1]
    d = f"M{pts[0][0]:.2f} {pts[0][1]:.2f}" + "".join(f"L{x:.2f} {y:.2f}" for x, y in pts[1:])
    return d + "Z"
