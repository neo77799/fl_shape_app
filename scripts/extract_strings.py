from __future__ import annotations

from pathlib import Path


def extract_ascii(b: bytes, min_len: int = 6) -> list[tuple[int, str]]:
    out: list[tuple[int, str]] = []
    i = 0
    while i < len(b):
        if 32 <= b[i] < 127:
            j = i + 1
            while j < len(b) and 32 <= b[j] < 127:
                j += 1
            if j - i >= min_len:
                out.append((i, b[i:j].decode("ascii", errors="replace")))
            i = j
        else:
            i += 1
    return out


def extract_utf16le(b: bytes, min_len: int = 6) -> list[tuple[int, str]]:
    # Look for sequences of printable ASCII-ish chars with 0x00 high bytes.
    out: list[tuple[int, str]] = []
    i = 0
    while i + 1 < len(b):
        if 32 <= b[i] < 127 and b[i + 1] == 0:
            j = i + 2
            while j + 1 < len(b) and 32 <= b[j] < 127 and b[j + 1] == 0:
                j += 2
            if (j - i) // 2 >= min_len:
                s = b[i:j].decode("utf-16le", errors="replace")
                out.append((i, s))
            i = j
        else:
            i += 1
    return out


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("bin_path")
    ap.add_argument("--start", type=lambda x: int(x, 0), default=0)
    ap.add_argument("--end", type=lambda x: int(x, 0), default=None)
    args = ap.parse_args()

    b = Path(args.bin_path).read_bytes()
    start = max(0, args.start)
    end = len(b) if args.end is None else min(len(b), max(0, args.end))
    chunk = b[start:end]
    print(f"len={len(b)} chunk=0x{start:X}..0x{end-1:X} ({len(chunk)} bytes)")

    a = extract_ascii(chunk, 6)
    u = extract_utf16le(chunk, 6)
    for off, s in a[:50]:
        print(f"ascii  0x{start+off:04X}: {s}")
    for off, s in u[:50]:
        print(f"utf16  0x{start+off:04X}: {s}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

