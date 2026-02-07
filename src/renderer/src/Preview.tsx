import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

type Transform = { scale: number; x: number; y: number };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parseViewBoxAttr(vb: string | null): { x: number; y: number; w: number; h: number } | null {
  if (!vb) return null;
  const parts = vb
    .trim()
    .split(/[\s,]+/)
    .map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
}

function parseNumberish(s: string | null): number | null {
  if (!s) return null;
  const m = String(s).trim().match(/^([+-]?\d+(\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseSvgBoxFromText(svgText: string): { x: number; y: number; w: number; h: number } | null {
  try {
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const svg = doc.querySelector("svg");
    if (!svg) return null;

    const vb = parseViewBoxAttr(svg.getAttribute("viewBox"));
    if (vb && vb.w > 0 && vb.h > 0) return vb;

    const w = parseNumberish(svg.getAttribute("width"));
    const h = parseNumberish(svg.getAttribute("height"));
    if (w && h && w > 0 && h > 0) return { x: 0, y: 0, w, h };

    return null;
  } catch {
    return null;
  }
}

export default function Preview(props: { svgText: string }) {
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const [t, setT] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  const box = useMemo(() => parseSvgBoxFromText(props.svgText), [props.svgText]);
  const svgDataUrl = useMemo(() => {
    // Use <img src="data:..."> instead of injecting raw <svg> markup.
    // This is more robust for tricky SVGs and avoids relying on getBBox().
    const encoded = encodeURIComponent(props.svgText)
      .replace(/'/g, "%27")
      .replace(/"/g, "%22");
    return `data:image/svg+xml;charset=utf-8,${encoded}`;
  }, [props.svgText]);

  function fitToView() {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const rect = viewport.getBoundingClientRect();
    const viewW = rect.width;
    const viewH = rect.height;

    const b = box;
    if (!b || b.w <= 0 || b.h <= 0) {
      // As a last resort, just reset.
      setT({ scale: 1, x: 0, y: 0 });
      return;
    }

    const pad = 0.92;
    const scale = clamp(Math.min((viewW / b.w) * pad, (viewH / b.h) * pad), 0.02, 200);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;

    // Map SVG coords -> screen: p = t + s * w
    const x = viewW / 2 - cx * scale;
    const y = viewH / 2 - cy * scale;
    setT({ scale, x, y });
  }

  useLayoutEffect(() => {
    // Wait a frame so the injected SVG exists and viewport has a size.
    const id = requestAnimationFrame(() => fitToView());
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svgDataUrl, box]);

  // Re-fit when the viewport size changes.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const ro = new ResizeObserver(() => fitToView());
    ro.observe(viewport);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React attaches wheel listeners as passive; use a native listener so we can preventDefault for zoom.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = viewport.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;

      setT((cur) => {
        const factor = Math.exp(-e.deltaY * 0.0012);
        const nextScale = clamp(cur.scale * factor, 0.02, 200);
        if (nextScale === cur.scale) return cur;

        const wx = (px - cur.x) / cur.scale;
        const wy = (py - cur.y) / cur.scale;
        const nx = px - wx * nextScale;
        const ny = py - wy * nextScale;
        return { scale: nextScale, x: nx, y: ny };
      });
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel as any);
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.setPointerCapture(e.pointerId);
    setDragging(true);
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: t.x, oy: t.y };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || !dragRef.current) return;
    const d = dragRef.current;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    setT((cur) => ({ ...cur, x: d.ox + dx, y: d.oy + dy }));
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (viewport) {
      try {
        viewport.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    setDragging(false);
    dragRef.current = null;
  }

  return (
    <div className="previewWrap">
      <div
        className={`previewViewport ${dragging ? "isDragging" : ""}`}
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={fitToView}
        role="application"
        aria-label="SVG preview"
      >
        <div
          className="previewContent"
          style={{
            transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`
          }}
        >
          <img
            className="previewImg"
            src={svgDataUrl}
            alt=""
            draggable={false}
            width={box?.w ? Math.max(1, Math.round(box.w)) : 300}
            height={box?.h ? Math.max(1, Math.round(box.h)) : 150}
          />
        </div>
      </div>
      <div className="previewHelp">Wheel: zoom / Drag: pan / Double-click: fit</div>
    </div>
  );
}
