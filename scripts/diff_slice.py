from __future__ import annotations

from pathlib import Path


def read(p: str) -> bytes:
    return Path(p).read_bytes()


def diff_count(a: bytes, b: bytes, start: int, end: int) -> int:
    end = min(end, len(a), len(b))
    start = max(0, min(start, end))
    return sum(1 for i in range(start, end) if a[i] != b[i])


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("a_bin")
    ap.add_argument("b_bin")
    ap.add_argument("--start", type=lambda x: int(x, 0), required=True)
    ap.add_argument("--end", type=lambda x: int(x, 0), required=True)
    args = ap.parse_args()

    a = read(args.a_bin)
    b = read(args.b_bin)
    d = diff_count(a, b, args.start, args.end)
    print(f"diffCount 0x{args.start:X}..0x{args.end-1:X}: {d}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

