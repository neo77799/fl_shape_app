from __future__ import annotations

import hashlib
import itertools
from pathlib import Path


def read_bin(folder: str) -> bytes:
    p = Path(folder)
    if p.is_file():
        return p.read_bytes()
    stable = p / "stable.bin"
    if stable.exists():
        return stable.read_bytes()
    return (p / "Flash 8 Picture.bin").read_bytes()


def hash_no_style(b: bytes, style_start: int = 0x50, style_end: int = 0x80) -> str:
    # Rough: assume styles live early; lets us detect "same geometry" candidates.
    h = hashlib.sha256()
    h.update(b[:style_start])
    h.update(b[style_end:])
    return h.hexdigest()


def diff_bytes(a: bytes, b: bytes) -> int:
    m = min(len(a), len(b))
    d = sum(1 for i in range(m) if a[i] != b[i]) + abs(len(a) - len(b))
    return d


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("folders", nargs="+", help="sample dir, dump dir, or bin path")
    args = ap.parse_args()

    items: list[tuple[str, bytes]] = [(Path(f).name, read_bin(f)) for f in args.folders]

    for name, b in items:
        print(f"{name} len={len(b)} sha256={hashlib.sha256(b).hexdigest()[:16]} hashNoStyle={hash_no_style(b)[:16]}")

    print()
    for (n1, b1), (n2, b2) in itertools.combinations(items, 2):
        print(f"{n1} vs {n2}: diffBytes={diff_bytes(b1, b2)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
