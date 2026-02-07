from __future__ import annotations

import itertools
from pathlib import Path


def read(path: str) -> bytes:
    return Path(path).read_bytes()


def ranges_from_positions(pos: list[int]) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    for _, g in itertools.groupby(enumerate(pos), lambda t: t[1] - t[0]):
        g = list(g)
        out.append((g[0][1], g[-1][1]))
    return out


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("a", help="bin file A")
    ap.add_argument("b", help="bin file B")
    ap.add_argument("--context", type=int, default=16, help="hex dump context around ranges")
    args = ap.parse_args()

    a = read(args.a)
    b = read(args.b)
    m = min(len(a), len(b))
    pos = [i for i in range(m) if a[i] != b[i]]
    print(f"lenA={len(a)} lenB={len(b)} diffBytes={len(pos) + abs(len(a)-len(b))}")
    rs = ranges_from_positions(pos)
    print(f"ranges={len(rs)} first20={rs[:20]}")

    ctx = max(0, args.context)
    for (s, e) in rs[:50]:
        ss = max(0, s - ctx)
        ee = min(m, e + 1 + ctx)
        ah = a[ss:ee].hex()
        bh = b[ss:ee].hex()
        print()
        print(f"0x{s:04X}..0x{e:04X} (show 0x{ss:04X}..0x{ee-1:04X})")
        print(f"A:{ah}")
        print(f"B:{bh}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

