from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Run:
    start: int
    end: int  # exclusive

    @property
    def length(self) -> int:
        return self.end - self.start


def read_bytes(p: str) -> bytes:
    return Path(p).read_bytes()


def common_runs(a: bytes, b: bytes, min_len: int = 32) -> list[Run]:
    m = min(len(a), len(b))
    runs: list[Run] = []
    i = 0
    while i < m:
        if a[i] != b[i]:
            i += 1
            continue
        j = i + 1
        while j < m and a[j] == b[j]:
            j += 1
        if j - i >= min_len:
            runs.append(Run(i, j))
        i = j
    return runs


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("a_bin")
    ap.add_argument("b_bin")
    ap.add_argument("--min", type=int, default=64, help="minimum run length")
    ap.add_argument("--top", type=int, default=30, help="show top N longest runs")
    args = ap.parse_args()

    a = read_bytes(args.a_bin)
    b = read_bytes(args.b_bin)
    runs = common_runs(a, b, max(1, args.min))
    runs.sort(key=lambda r: r.length, reverse=True)
    print(f"lenA={len(a)} lenB={len(b)} commonRuns>={args.min}={len(runs)}")
    for r in runs[: max(0, args.top)]:
        print(f"0x{r.start:04X}..0x{r.end-1:04X} len={r.length}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

