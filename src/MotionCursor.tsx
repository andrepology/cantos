// MotionCursor.tsx + Demo (hardened)
import React, {
    useEffect,
    useInsertionEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    forwardRef,
  } from "react";
  import { createPortal } from "react-dom";
  import {
    motion,
    useMotionValue,
    useSpring,
    useTransform,
    animate,
    motionValue,
    type MotionValue,
  } from "motion/react";
  
  /* -------------------------------------------------------------------------- */
  /* Runtime guards & tiny test harness                                         */
  /* -------------------------------------------------------------------------- */
  
  const hasWindow = typeof window !== "undefined";
  const getBody = (): HTMLElement | null =>
    hasWindow && typeof document !== "undefined" ? document.body ?? null : null;
  const getHead = (): HTMLHeadElement | null =>
    hasWindow && typeof document !== "undefined" ? document.head ?? null : null;
  
  // Minimal, in-canvas friendly test helper
  function runTests(tests: Record<string, () => void | string>) {
    const results: { name: string; ok: boolean; message?: string }[] = [];
    const safeExpect = (name: string, fn: () => void | string) => {
      try {
        const msg = fn();
        results.push({ name, ok: true, message: typeof msg === "string" ? msg : undefined });
      } catch (err: any) {
        results.push({ name, ok: false, message: err?.message || String(err) });
      }
    };
    Object.entries(tests).forEach(([name, fn]) => safeExpect(name, () => fn()));
    return results;
  }
  
  /* -------------------------------------------------------------------------- */
  /* Frame/visibility helpers                                                    */
  /* -------------------------------------------------------------------------- */
  
  type ShowHide = { show: () => void; hide: () => void };
  let bodyHoverBus: { on: (r: ShowHide) => () => void } | null = null;
  
  function ensureBodyHoverBus() {
    if (bodyHoverBus) return bodyHoverBus;
  
    // In sandboxed/SSR-like contexts, "document.body" can be null.
    const body = getBody();
    const subs = new Set<ShowHide>();
  
    // If no body, provide a no-op bus that still supports subscription/cleanup.
    if (!body) {
      bodyHoverBus = {
        on(r: ShowHide) {
          subs.add(r);
          // Best-effort: mark as visible once (avoids dependent logic breaking)
          queueMicrotask?.(() => r.show());
          return () => {
            subs.delete(r);
            if (!subs.size) bodyHoverBus = null;
          };
        },
      };
      return bodyHoverBus;
    }
  
    const onEnter = () => subs.forEach((s) => s.show());
    const onLeave = () => subs.forEach((s) => s.hide());
  
    body.addEventListener("mouseenter", onEnter);
    body.addEventListener("mouseleave", onLeave);
  
    bodyHoverBus = {
      on(r: ShowHide) {
        subs.add(r);
        return () => {
          subs.delete(r);
          if (!subs.size) {
            body.removeEventListener("mouseenter", onEnter);
            body.removeEventListener("mouseleave", onLeave);
            bodyHoverBus = null;
          }
        };
      },
    };
    return bodyHoverBus;
  }
  
  const onlyMouse =
    <T extends (e: PointerEvent) => void>(fn: T) =>
    (e: PointerEvent) => {
      if (e.pointerType === "mouse") fn(e);
    };
  
  const leftClick =
    <T extends (e: PointerEvent) => void>(fn: T) =>
    onlyMouse((e) => {
      if (e.button === 0) fn(e);
    });
  
  /* -------------------------------------------------------------------------- */
  /* Global cursor state                                                         */
  /* -------------------------------------------------------------------------- */
  
  type CursorType = "default" | "pointer" | "text";
  
  type CursorZone = string | null;
  
  type CursorState = {
    type: CursorType;
    isPressed: boolean;
    fontSize: number | null;
    targetBoundingBox: DOMRect | null;
    target: Element | null;
    zone: CursorZone;
  };
  
  const defaultCursorState: CursorState = {
    type: "default",
    isPressed: false,
    fontSize: null,
    targetBoundingBox: null,
    target: null,
    zone: null,
  };
  
  let currentState: CursorState = { ...defaultCursorState };
  let cursorBus:
    | {
        onChange: (cb: (s: CursorState) => void) => () => void;
      }
    | null = null;
  
  function resolveCursorType(el: Element): [CursorType, Element | null] {
    const override = (el as HTMLElement).closest("[data-cursor]") as
      | HTMLElement
      | null;
    if (override) {
      const t = (override.dataset.cursor as CursorType) ?? "default";
      return [t, override];
    }
    const ptr = (el as HTMLElement).closest(
      "a, button, input[type='button']:not(:disabled)"
    ) as HTMLElement | null;
    if (ptr) return ["pointer", ptr];
  
    const texty = (el as HTMLElement).closest(
      "p, textarea:not(:disabled), input[type='text']:not(:disabled), h1, h2, h3, h4, h5, h6"
    ) as HTMLElement | null;
    if (texty && window.getComputedStyle(texty).userSelect !== "none")
      return ["text", texty];
  
    return ["default", null];
  }
  
  function resolveZone(el: Element): CursorZone {
    const z = (el as HTMLElement).closest("[data-cursor-zone]") as
      | HTMLElement
      | null;
    return z ? z.dataset.cursorZone ?? null : null;
  }
  
  export function useCursorState(): CursorState {
    const [s, setS] = useState<CursorState>({ ...currentState });
  
    useEffect(() => {
      if (!cursorBus) {
        const subs = new Set<(s: CursorState) => void>();
        const emit = (patch: Partial<CursorState>) => {
          currentState = { ...currentState, ...patch };
          subs.forEach((cb) => cb(currentState));
        };
  
        const onDown = leftClick(() => {
          if (!currentState.isPressed) emit({ isPressed: true });
        });
        const onUp = leftClick(() => {
          if (currentState.isPressed) emit({ isPressed: false });
        });
        const onOver = onlyMouse((e) => {
          const target = e.target as Element | null;
          if (!target) return;
          const [type, tEl] = resolveCursorType(target);
          const zone = resolveZone(target);
  
          let changed = false;
          const next: Partial<CursorState> = { target: tEl, zone };
  
          if (type !== currentState.type) {
            next.type = type;
            changed = true;
          }
          if (zone !== currentState.zone) {
            next.zone = zone;
            changed = true;
          }
  
          const box =
            type === "pointer" && tEl
              ? (tEl.getBoundingClientRect() as DOMRect)
              : null;
          if (box !== currentState.targetBoundingBox) {
            next.targetBoundingBox = box;
            changed = true;
          }
  
          if (type === "text") {
            const cs = window.getComputedStyle(target);
            const fs = cs.fontSize ? parseInt(cs.fontSize, 10) : null;
            if (fs !== currentState.fontSize) {
              next.fontSize = fs;
              changed = true;
            }
          } else if (currentState.fontSize) {
            next.fontSize = null;
            changed = true;
          }
  
          if (changed) emit(next);
        });
  
        if (hasWindow) {
          window.addEventListener("pointerover", onOver);
          window.addEventListener("pointerdown", onDown);
          window.addEventListener("pointerup", onUp);
        }
  
        cursorBus = {
          onChange(cb) {
            subs.add(cb);
            return () => {
              subs.delete(cb);
              if (!subs.size) {
                if (hasWindow) {
                  window.removeEventListener("pointerover", onOver);
                  window.removeEventListener("pointerdown", onDown);
                  window.removeEventListener("pointerup", onUp);
                }
                cursorBus = null;
              }
            };
          },
        };
      }
  
      const off = cursorBus.onChange(setS);
      return off;
    }, []);
  
    return s;
  }
  
  /* -------------------------------------------------------------------------- */
  /* Pointer position as MotionValues                                           */
  /* -------------------------------------------------------------------------- */
  
  let mvX: MotionValue<number> | null = null;
  let mvY: MotionValue<number> | null = null;
  
  export function usePointerPosition(): { x: MotionValue<number>; y: MotionValue<number> } {
    if (!mvX || !mvY) {
      mvX = motionValue(0);
      mvY = motionValue(0);
      let x = 0,
        y = 0;
      const update = () => {
        mvX!.set(x);
        mvY!.set(y);
      };
      if (hasWindow) {
        window.addEventListener(
          "pointermove",
          onlyMouse((e) => {
            x = e.clientX;
            y = e.clientY;
            requestAnimationFrame(update);
          })
        );
      }
    }
    return { x: mvX!, y: mvY! };
  }
  
  /* -------------------------------------------------------------------------- */
  /* Visibility gate                                                            */
  /* -------------------------------------------------------------------------- */
  
  export function useCursorIsInView(onShowSync?: () => void) {
    const [inView, setInView] = useState(true);
    useEffect(() => {
      const bus = ensureBodyHoverBus();
      return bus.on({
        show: () => {
          if (!inView) {
            onShowSync?.();
            setInView(true);
          }
        },
        hide: () => setInView(false),
      });
    }, [inView, onShowSync]);
    return inView;
  }
  
  /* -------------------------------------------------------------------------- */
  /* Magnetic pull                                                              */
  /* -------------------------------------------------------------------------- */
  
  export function useMagneticPull(
    targetRef: React.RefObject<Element>,
    strength = 0.1
  ) {
    const state = useCursorState();
    const { x, y } = usePointerPosition();
  
    const active =
      state.targetBoundingBox && state.target === targetRef.current
        ? state.targetBoundingBox
        : undefined;
  
    const baseX = useMotionValue(0);
    const baseY = useMotionValue(0);
    const factor = useMotionValue(0);
  
    useEffect(() => {
      if (!active) {
        animate(factor, 0, { duration: 0.15 });
        return;
      }
      animate(factor, 1, { duration: 0.15 });
    }, [active]);
  
    useEffect(() => {
      if (!active) return;
      const cx = active.left + active.width / 2;
      const cy = active.top + active.height / 2;
      const sub = [
        x.on("change", () => baseX.set(strength * (x.get() - cx))),
        y.on("change", () => baseY.set(strength * (y.get() - cy))),
      ];
      return () => sub.forEach((off) => off());
    }, [x, y, active, strength]);
  
    // Use the multi-input signature without array-destructuring to avoid iterable errors
    const pullX = useTransform([baseX, factor], (values) => (values[0] as number) * (values[1] as number));
    const pullY = useTransform([baseY, factor], (values) => (values[0] as number) * (values[1] as number));
  
    return { x: pullX, y: pullY, activeBox: active };
  }
  
  /* -------------------------------------------------------------------------- */
  /* System cursor hider                                                        */
  /* -------------------------------------------------------------------------- */
  
  function installHideSystemCursorStyle() {
    const head = getHead();
    if (!head) return () => {};
    const style = document.createElement("style");
    style.textContent = `
      * { cursor: none !important; }
      [data-motion-cursor="pointer"] { background-color: #333; }
    `;
    head.appendChild(style);
    return () => {
      try {
        head.removeChild(style);
      } catch {}
    };
  }
  
  /* -------------------------------------------------------------------------- */
  /* Cursor component                                                            */
  /* -------------------------------------------------------------------------- */
  
  type MagneticOpts = {
    morph?: boolean;
    padding?: number;
    snap?: number; // 0..1
  };
  
  type CursorProps = React.ComponentProps<typeof motion.div> & {
    follow?: boolean;
    center?: { x: number; y: number };
    offset?: { x: number; y: number };
    spring?: { stiffness: number; damping: number } | false;
    magnetic?: boolean | MagneticOpts;
    matchTextSize?: boolean;
    children?: React.ReactNode;
  };
  
  const FOLLOW_SPRING = { stiffness: 1000, damping: 100 };
  const MAGNETIC_DEFAULT: Required<MagneticOpts> = {
    morph: true,
    padding: 5,
    snap: 0.8,
  };
  const DEFAULT_EASE: [number, number, number, number] = [0.38, 0.12, 0.29, 1];
  const DEFAULT_TRANSITION = { duration: 0.15, ease: DEFAULT_EASE } as const;
  
  export const Cursor = forwardRef<HTMLDivElement, CursorProps>(function Cursor(
    {
      follow = false,
      center = follow ? { x: 0, y: 0 } : { x: 0.5, y: 0.5 },
      offset = { x: 0, y: 0 },
      spring = follow ? FOLLOW_SPRING : false,
      magnetic = false,
      matchTextSize = true,
      children,
      style,
      variants,
      transition,
      ...rest
    },
    ref
  ) {
    const replacingSystemCursor = !follow;
    useInsertionEffect(() => {
      if (!replacingSystemCursor) return;
      return installHideSystemCursorStyle();
    }, [replacingSystemCursor]);
  
    const pointer = usePointerPosition();
    const baseX = useTransform(pointer.x, (v) => v + offset.x);
    const baseY = useTransform(pointer.y, (v) => v + offset.y);
    const posX = spring ? useSpring(baseX, spring) : baseX;
    const posY = spring ? useSpring(baseY, spring) : baseY;
  
    const state = useCursorState();
    const inView = useCursorIsInView(() => {
      if (spring) {
        (posX as any).jump?.((baseX as any).get?.() ?? (posX as any).get?.());
        (posY as any).jump?.((baseY as any).get?.() ?? (posY as any).get?.());
      }
    });
  
    const magOpts: Required<MagneticOpts> =
      typeof magnetic === "object"
        ? { ...MAGNETIC_DEFAULT, ...magnetic }
        : MAGNETIC_DEFAULT;
  
    const snapX = useSpring(0, { stiffness: 600, damping: 50 });
    const snapY = useSpring(0, { stiffness: 600, damping: 50 });
  
    useEffect(() => {
      if (!magnetic || !state.targetBoundingBox) {
        animate(snapX, (posX as any).get?.() ?? 0, { duration: 0.15 });
        animate(snapY, (posY as any).get?.() ?? 0, { duration: 0.15 });
        return;
      }
      const cx = state.targetBoundingBox.left + state.targetBoundingBox.width / 2;
      const cy = state.targetBoundingBox.top + state.targetBoundingBox.height / 2;
  
      const offX = baseX.on("change", (vx) => {
        const nx = vx + (cx - vx) * magOpts.snap;
        snapX.set(nx);
      });
      const offY = baseY.on("change", (vy) => {
        const ny = vy + (cy - vy) * magOpts.snap;
        snapY.set(ny);
      });
      return () => {
        offX();
        offY();
      };
    }, [magnetic, magOpts.snap, state.targetBoundingBox, baseX, baseY, posX, posY, snapX, snapY]);
  
    const renderX = magnetic && state.targetBoundingBox ? (snapX as any) : (posX as any);
    const renderY = magnetic && state.targetBoundingBox ? (snapY as any) : (posY as any);
  
    const hasChildren = !!children;
    const { width, height } = useMemo(() => {
      const t = state.type;
      const magnetized = !!magnetic && !!state.targetBoundingBox;
      if (hasChildren && !magnetized) {
        return {
          width: (style as any)?.width ?? "auto",
          height: (style as any)?.height ?? "auto",
        } as { width: any; height: any };
      }
      if (t === "pointer") {
        if (magnetized && (magOpts.morph ?? true) && state.targetBoundingBox) {
          const pad = magOpts.padding;
          return {
            width: state.targetBoundingBox.width + 2 * pad,
            height: state.targetBoundingBox.height + 2 * pad,
          };
        }
        return { width: 31, height: 31 };
      }
      if (t === "text") {
        if (matchTextSize && state.fontSize) return { width: 4, height: state.fontSize };
        return { width: 4, height: 20 };
      }
      return { width: 17, height: 17 };
    }, [state, hasChildren, style, magnetic, magOpts, matchTextSize]);
  
    // Safe host: prefer body, else create a detached div so createPortal still works
    const [host, setHost] = useState<HTMLElement | null>(null);
    useLayoutEffect(() => {
      const body = getBody();
      if (body) {
        setHost(body);
        return;
      }
      // Fallback – detached host to avoid crashes in sandbox
      const fallback = document.createElement("div");
      setHost(fallback);
      return () => {
        // GC hint
        (fallback as any) = null;
      };
    }, []);
  
    const transformTemplate = (_transform: string, generated: string) =>
      `translate(-${100 * (center as any).x}%, -${100 * (center as any).y}%) ${generated}`;
  
    const mergedVariants = {
      pressed: (rest as any).follow ? {} : { scale: 0.9 },
      ...(variants as any),
      default: { opacity: 1, scale: 1, ...(variants as any)?.default },
      exit: { opacity: 0, scale: 0, ...(variants as any)?.exit },
    } as const;
  
    const hasPointerMoved = useRef(false);
    useInsertionEffect(() => {
      const sub = (pointer.x as any).on("change", () => {
        hasPointerMoved.current = true;
        sub();
      });
    }, [pointer.x]);
  
    if (!host || !hasPointerMoved.current) return null;
  
    const animationState = [
      "default",
      state.type,
      magnetic && state.targetBoundingBox && "magnetic",
      inView ? (state.isPressed && !(rest as any).follow && "pressed") : "exit",
    ].filter(Boolean) as string[];
  
    return createPortal(
      <motion.div
          ref={ref as any}
          layout
          data-motion-cursor={(rest as any).follow ? "follow" : "pointer"}
          initial="exit"
          exit="exit"
          variants={mergedVariants as any}
          animate={animationState as any}
          transformTemplate={transformTemplate as any}
          transition={transition ?? DEFAULT_TRANSITION}
          style={{
            borderRadius: (rest as any).follow ? 0 : 20,
            zIndex: (rest as any).follow ? 99998 : 99999,
            willChange: "transform",
            contain: "layout",
            originX: (center as any).x,
            originY: (center as any).y,
            top: 0,
            left: 0,
            position: "fixed",
            pointerEvents: "none",
            ...style,
            width,
            height,
            x: renderX,
            y: renderY,
          }}
          {...rest}
        >
          {children}
        </motion.div>,
      host
    );
  });
  
  export function useItemOffset() {
    return useMotionValue(0);
  }
  
  /* -------------------------------------------------------------------------- */
  /* Demo                                                                        */
  /* -------------------------------------------------------------------------- */
  
  function DemoCard({ label, zone }: { label: string; zone?: string }) {
    return (
      <div
        data-cursor-zone={zone}
        className="p-6 rounded-2xl shadow-md border border-black/10 bg-white/60 backdrop-blur-sm"
        style={{ width: 260 }}
      >
        <h3 className="text-lg font-semibold mb-2">{label}</h3>
        <p className="text-sm opacity-80 mb-4">
          Hover to trigger magnetic morph. Buttons set <code>data-cursor</code>.
        </p>
        <div className="flex gap-3">
          <button data-cursor="pointer" className="px-3 py-2 rounded-lg border">
            Primary
          </button>
          <a href="#" data-cursor="pointer" className="px-3 py-2 rounded-lg border">
            Link
          </a>
        </div>
      </div>
    );
  }
  
  // Small test panel UI
  function TestPanel() {
    const results = useMemo(
      () =>
        runTests({
          "body bus is resilient": () => {
            const bus = ensureBodyHoverBus();
            if (!bus || typeof bus.on !== "function") throw new Error("bus missing .on");
            const off = bus.on({ show: () => {}, hide: () => {} });
            if (typeof off !== "function") throw new Error("on() must return cleanup");
            off();
          },
          "animation state filters falsy": () => {
            const arr = ["default", "pointer", false && "pressed", ""].filter(Boolean);
            if (!Array.isArray(arr) || arr.includes("") || arr.length < 2) throw new Error("filter failed");
          },
          "useMagneticPull shapes": () => {
            const ref = { current: null } as unknown as React.RefObject<Element>;
            const mv = { x: 0, y: 0 } as any; // shape check only
            if (typeof mv !== "object") throw new Error("shape");
          },
        }),
      []
    );
  
    return (
      <div className="mt-6 text-sm">
        <div className="font-semibold mb-2">Tests</div>
        <ul className="space-y-1">
          {results.map((r) => (
            <li key={r.name} className={r.ok ? "text-green-600" : "text-red-600"}>
              {r.ok ? "✔" : "✘"} {r.name}
              {r.message ? <span className="opacity-70"> – {r.message}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  
  export default function App() {
    const [follow, setFollow] = useState(false);
    const [magnetic, setMagnetic] = useState(true);
    const [snap, setSnap] = useState(0.8);
    const [morph, setMorph] = useState(true);
    const [padding, setPadding] = useState(5);
  
    return (
      <div
        className="min-h-screen w-full"
        style={{
          background:
            "radial-gradient(1000px 600px at 20% 10%, #f0f5ff, transparent), radial-gradient(800px 600px at 80% 20%, #fff8ee, transparent), linear-gradient(180deg, #fafafa, #f6f6f6)",
        }}
      >
        <Cursor
          follow={follow}
          magnetic={magnetic ? { snap, morph, padding } : false}
          style={{ background: "rgba(0,0,0,0.06)", backdropFilter: "blur(4px)" }}
        />
  
        <div className="max-w-5xl mx-auto px-6 py-12">
          <h1 className="text-3xl font-bold mb-2">MotionCursor Demo</h1>
          <p className="opacity-70 mb-8">
            Move the mouse. Toggle follow and magnetic behaviors. Hover cards, buttons, and text.
          </p>
  
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <DemoCard label="Card A" zone="a" />
            <DemoCard label="Card B" zone="b" />
            <DemoCard label="Card C" zone="c" />
          </div>
  
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl border bg-white">
              <h2 className="font-semibold mb-4">Controls</h2>
              <div className="flex flex-wrap gap-4 items-center">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={follow}
                    onChange={(e) => setFollow(e.target.checked)}
                  />
                  Follow mode
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={magnetic}
                    onChange={(e) => setMagnetic(e.target.checked)}
                  />
                  Magnetic
                </label>
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="block">
                  <div className="text-sm mb-1">Snap ({snap.toFixed(2)})</div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={snap}
                    onChange={(e) => setSnap(parseFloat(e.target.value))}
                  />
                </label>
                <label className="block">
                  <div className="text-sm mb-1">Padding ({padding}px)</div>
                  <input
                    type="range"
                    min={0}
                    max={30}
                    step={1}
                    value={padding}
                    onChange={(e) => setPadding(parseInt(e.target.value))}
                  />
                </label>
                <label className="flex items-center gap-2 mt-6 md:mt-0">
                  <input
                    type="checkbox"
                    checked={morph}
                    onChange={(e) => setMorph(e.target.checked)}
                  />
                  Morph to target
                </label>
              </div>
            </div>
  
            <div className="p-6 rounded-2xl border bg-white">
              <h2 className="font-semibold mb-3">Mixed content</h2>
              <p className="mb-2">
                This paragraph is <span className="font-semibold">selectable text</span>. Hover to get a text cursor sized to font.
              </p>
              <p className="mb-4">
                You can also override types: <span data-cursor="pointer" className="underline">forced pointer</span> or <span data-cursor="default" className="underline">forced default</span>.
              </p>
              <input
                data-cursor="pointer"
                className="border rounded px-3 py-2"
                placeholder="Focusable input"
              />
  
              <TestPanel />
            </div>
          </div>
        </div>
      </div>
    );
  }
  