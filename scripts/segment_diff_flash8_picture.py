from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Seg:
    name: str
    start: int
    end: int  # exclusive


def read_bin(folder: str) -> bytes:
    p = Path(folder)
    if p.is_file():
        return p.read_bytes()
    # Newer sample dirs produced by the app store "stable.bin"
    stable = p / "stable.bin"
    if stable.exists():
        return stable.read_bytes()
    # Older dump bundle format
    return (p / "Flash 8 Picture.bin").read_bytes()


def find_sig(b: bytes, sig: bytes) -> int | None:
    i = b.find(sig)
    return None if i < 0 else i


def diff_count(a: bytes, b: bytes, s: int, e: int) -> int:
    e = min(e, len(a), len(b))
    s = min(s, e)
    return sum(1 for i in range(s, e) if a[i] != b[i])


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("a_folder")
    ap.add_argument("b_folder")
    args = ap.parse_args()

    a = read_bin(args.a_folder)
    b = read_bin(args.b_folder)

    cp_a = find_sig(a, b"CPicShape")
    cp_b = find_sig(b, b"CPicShape")
    ole_a = find_sig(a, bytes([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]))
    ole_b = find_sig(b, bytes([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]))

    print(f"A len={len(a)} CPicShape={cp_a} OLE(D0CF)={ole_a}")
    print(f"B len={len(b)} CPicShape={cp_b} OLE(D0CF)={ole_b}")

    # Segment based on observed fixed offsets.
    # style block we currently parse starts at 0x50 and usually ends before 0x80
    segs: list[Seg] = [
        Seg("head", 0, 0x50),
        Seg("style_0x50_0x80", 0x50, 0x80),
        Seg("mid_0x80_ole", 0x80, ole_a if ole_a is not None else len(a)),
    ]
    if ole_a is not None:
        segs.append(Seg("ole_to_end", ole_a, len(a)))
    else:
        segs.append(Seg("tail", 0x80, len(a)))

    total = sum(1 for i in range(min(len(a), len(b))) if a[i] != b[i]) + abs(len(a) - len(b))
    print(f"total diffBytes={total}")
    for s in segs:
        print(f"{s.name}: {diff_count(a, b, s.start, s.end)} diffs (0x{s.start:04X}..0x{s.end-1:04X})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
