from __future__ import annotations

import itertools
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class StyleInfo:
    style_offset: int
    fill_count: int
    fills_rgba: list[tuple[int, int, int, int] | None]  # None if unsupported type
    fill_types: list[int]
    line_count: int
    lines: list[tuple[int, tuple[int, int, int, int]]]  # (width, rgba)
    bytes_consumed: int


def rgba_hex(rgba: tuple[int, int, int, int]) -> str:
    r, g, b, a = rgba
    return f"#{r:02X}{g:02X}{b:02X}{a:02X}"


def parse_style_arrays(b: bytes, off: int = 0x50) -> StyleInfo:
    p = off

    def need(n: int) -> None:
        if p + n > len(b):
            raise ValueError("EOF")

    def u8() -> int:
        nonlocal p
        need(1)
        v = b[p]
        p += 1
        return v

    def u16le() -> int:
        nonlocal p
        need(2)
        v = int.from_bytes(b[p : p + 2], "little", signed=False)
        p += 2
        return v

    def count() -> int:
        c = u8()
        return c if c != 0xFF else u16le()

    fill_count = count()
    fill_types: list[int] = []
    fills: list[tuple[int, int, int, int] | None] = []
    for _ in range(fill_count):
        t = u8()
        fill_types.append(t)
        if t != 0x00:
            fills.append(None)
            # We don't know how to skip other fill types yet; stop early.
            break
        need(4)
        r, g, bb, a = b[p : p + 4]
        p += 4
        fills.append((r, g, bb, a))

    line_count = count()
    lines: list[tuple[int, tuple[int, int, int, int]]] = []
    for _ in range(line_count):
        w = u16le()
        need(4)
        r, g, bb, a = b[p : p + 4]
        p += 4
        lines.append((w, (r, g, bb, a)))

    return StyleInfo(
        style_offset=off,
        fill_count=fill_count,
        fills_rgba=fills,
        fill_types=fill_types,
        line_count=line_count,
        lines=lines,
        bytes_consumed=p - off,
    )


def detect_style_like_headers(b: bytes) -> list[int]:
    # Very rough heuristic: small fillCount, first fillType==0, rgba alpha 0xFF/0x00, small lineCount.
    hits: list[int] = []
    for i in range(len(b) - 8):
        c = b[i]
        if c == 0 or c > 10:
            continue
        if b[i + 1] != 0x00:
            continue
        a = b[i + 5]
        if a not in (0xFF, 0x00):
            continue
        if b[i + 6] > 10:
            continue
        hits.append(i)

    uniq: list[int] = []
    last = -999
    for h in hits:
        if h - last > 16:
            uniq.append(h)
        last = h
    return uniq


def diff_ranges(all_bytes: list[bytes]) -> list[tuple[int, int]]:
    minlen = min(len(b) for b in all_bytes)
    diff_pos: list[int] = []
    for i in range(minlen):
        if len({b[i] for b in all_bytes}) > 1:
            diff_pos.append(i)

    ranges: list[tuple[int, int]] = []
    for _, g in itertools.groupby(enumerate(diff_pos), lambda t: t[1] - t[0]):
        g = list(g)
        ranges.append((g[0][1], g[-1][1]))
    return ranges


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("folders", nargs="+", help="Dump folder(s) containing 'Flash 8 Picture.bin' (or sample dirs with numbered bins / stable.bin)")
    args = ap.parse_args()

    entries: list[tuple[str, bytes]] = []
    for f in args.folders:
        folder = Path(f)
        p = folder / "Flash 8 Picture.bin"
        if not p.exists():
            # sample-*/ dirs created by Sample Flash 8 Picture x10
            p2 = folder / "stable.bin"
            if p2.exists():
                p = p2
            else:
                cand = sorted(folder.glob("Flash 8 Picture.*.bin"))
                if cand:
                    p = cand[0]
        b = p.read_bytes()
        entries.append((folder.name, b))

    for name, b in entries:
        idx = b.find(b"CPicShape")
        info = parse_style_arrays(b, 0x50)
        fill_hex = [rgba_hex(x) for x in info.fills_rgba if x is not None]
        line_hex = [(w, rgba_hex(rgba)) for (w, rgba) in info.lines]
        print()
        print(f"{name}: len={len(b)} CPicShape={idx} style_bytes={info.bytes_consumed}")
        print(f"  fills: count={info.fill_count} types={[hex(t) for t in info.fill_types]} rgba={fill_hex}")
        print(f"  lines: count={info.line_count} {line_hex}")
        hits = detect_style_like_headers(b)
        print(f"  style-like hits: {len(hits)} first10={hits[:10]}")
        print(f"  head64: {b[:64].hex()}")

    if len(entries) >= 2:
        ranges = diff_ranges([b for _, b in entries])
        print()
        print(f"diff_ranges: {len(ranges)}")
        print(f"  first20: {ranges[:20]}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
