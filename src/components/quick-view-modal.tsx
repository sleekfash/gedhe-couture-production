/**
 * Quick-view modal — editorial gallery with wheel/pinch zoom, drag pan and
 * cursor-anchored magnification for inspecting Ankara print detail.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, X, ZoomIn } from "lucide-react";
import { resolveImage, type Product } from "@/data/catalog";
import { useStore } from "@/lib/store";

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function QuickViewModal({
  product,
  open,
  onClose,
  onAdd,
}: {
  product: Product;
  open: boolean;
  onClose: () => void;
  onAdd: () => void;
}) {
  const { money, currency } = useStore();
  const frames = product.gallery;
  const [index, setIndex] = useState(0);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const { zoom } = view;
  const offset = { x: view.x, y: view.y };
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const reset = useCallback(() => {
    setView({ zoom: 1, x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (open) {
      setIndex(0);
      reset();
    }
  }, [open, reset]);

  const go = useCallback(
    (dir: number) => {
      setIndex((i) => (i + dir + frames.length) % frames.length);
      reset();
    },
    [frames.length, reset],
  );

  /** Zoom around a point in stage coordinates (px, py) — keeps it stationary. */
  const zoomAt = useCallback((nextRaw: number, px: number, py: number) => {
    setView((v) => {
      const next = clamp(nextRaw, MIN_ZOOM, MAX_ZOOM);
      if (next === MIN_ZOOM) return { zoom: MIN_ZOOM, x: 0, y: 0 };
      const k = next / v.zoom;
      return { zoom: next, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  }, []);

  // Native non-passive wheel listener: React's onWheel is passive.
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setView((v) => {
      const next = clamp(v.zoom * Math.exp(-dy * 0.0018), MIN_ZOOM, MAX_ZOOM);
      if (next === MIN_ZOOM) return { zoom: MIN_ZOOM, x: 0, y: 0 };
      const k = next / v.zoom;
      return { zoom: next, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  };

  useEffect(() => {
    const el = stageRef.current;
    if (!el || !open) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      wheelRef.current(e);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open]);

  // Keyboard: escape to close, arrows to page the gallery.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, go]);

  function centerZoom(factor: number) {
    const rect = stageRef.current?.getBoundingClientRect();
    zoomAt(zoom * factor, (rect?.width ?? 0) / 2, (rect?.height ?? 0) / 2);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (zoom === MIN_ZOOM) return;
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    setView((v) => ({ ...v, x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) }));
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  const frame = frames[index]!;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${product.name} quick view`}
      aria-hidden={!open}
      className={`fixed inset-0 z-[60] flex items-center justify-center p-3 transition-opacity duration-300 sm:p-6 ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div
        onClick={onClose}
        aria-hidden="true"
        className="absolute inset-0 bg-charcoal-deep/80 backdrop-blur-sm"
      />

      <div
        className={`relative grid max-h-full w-full max-w-5xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-background shadow-[var(--shadow-panel)] transition-transform duration-300 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:grid-rows-1 ${
          open ? "scale-100" : "scale-95"
        }`}
      >
        <button
          type="button"
          aria-label="Close quick view"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-background/90 text-foreground transition-colors hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>

        {/* ── Interactive zoom stage ── */}
        <div className="flex min-h-0 flex-col bg-secondary">
          <div
            ref={stageRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={(e) => {
              const rect = stageRef.current!.getBoundingClientRect();
              if (zoom > MIN_ZOOM) reset();
              else zoomAt(2.5, e.clientX - rect.left, e.clientY - rect.top);
            }}
            className={`relative aspect-[4/5] w-full flex-1 overflow-hidden touch-none select-none md:aspect-auto ${
              zoom > MIN_ZOOM ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
            }`}
          >
            <img
              src={resolveImage(frame.src)}
              alt={`${product.name} — ${frame.caption}`}
              width={1024}
              height={1280}
              loading="lazy"
              draggable={false}
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
              }}
              className="h-full w-full object-cover will-change-transform"
            />

            {frames.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous image"
                  onClick={() => go(-1)}
                  className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-background/85 transition-colors hover:bg-background"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next image"
                  onClick={() => go(1)}
                  className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-background/85 transition-colors hover:bg-background"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}

            <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
              <p className="max-w-[60%] bg-charcoal/85 px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-linen">
                {frame.caption}
              </p>
              <div className="flex items-center gap-1 bg-background/90 p-1">
                <button
                  type="button"
                  aria-label="Zoom out"
                  onClick={() => centerZoom(1 / 1.4)}
                  className="grid h-8 w-8 place-items-center transition-colors hover:bg-secondary"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-10 text-center text-[11px] font-semibold tabular-nums">
                  {zoom.toFixed(1)}×
                </span>
                <button
                  type="button"
                  aria-label="Zoom in"
                  onClick={() => centerZoom(1.4)}
                  className="grid h-8 w-8 place-items-center transition-colors hover:bg-secondary"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Reset zoom"
                  onClick={reset}
                  className="grid h-8 w-8 place-items-center transition-colors hover:bg-secondary"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-2 border-t border-border bg-background p-3">
            {frames.map((f, i) => (
              <button
                key={f.src}
                type="button"
                aria-label={`View ${f.caption}`}
                aria-pressed={i === index}
                onClick={() => {
                  setIndex(i);
                  reset();
                }}
                className={`h-16 w-14 shrink-0 overflow-hidden border transition-colors ${
                  i === index ? "border-gold" : "border-border hover:border-foreground/40"
                }`}
              >
                <img
                  src={resolveImage(f.src)}
                  alt=""
                  width={1024}
                  height={1280}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>

        {/* ── Editorial detail column ── */}
        <div className="min-h-0 overflow-y-auto p-6">
          <p className="text-eyebrow text-muted-foreground">{product.category}</p>
          <h2 className="mt-2 font-display text-3xl leading-tight tracking-tight">
            {product.name}
          </h2>
          <p className="mt-1.5 text-eyebrow text-muted-foreground">
            {product.pattern} · {product.variant}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            {product.description}
          </p>

          <dl className="mt-5 space-y-2 border-t border-border pt-5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Pattern</dt>
              <dd className="text-right">{product.pattern}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{product.optionLabel}</dt>
              <dd className="text-right">{product.options.join(", ")}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Availability</dt>
              <dd className="text-right">{product.stock_status}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">From</dt>
              <dd className="text-right font-display text-lg">
                {money(currency === "NGN" ? product.base_price : product.price_gbp)}
              </dd>
            </div>
          </dl>

          <p className="mt-5 flex items-start gap-2 bg-secondary p-3 text-[11px] leading-relaxed text-muted-foreground">
            <ZoomIn className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
            Scroll or pinch over the image to magnify up to 5×, double-click to snap in, then drag
            to trace the wax-print detail.
          </p>

          <button
            type="button"
            onClick={() => {
              onAdd();
              onClose();
            }}
            className="magnetic mt-5 w-full rounded-full bg-charcoal px-6 py-3.5 text-[11px] font-bold uppercase tracking-[0.22em] text-linen hover:bg-charcoal-deep"
          >
            Add to bag
          </button>
        </div>
      </div>
    </div>
  );
}
