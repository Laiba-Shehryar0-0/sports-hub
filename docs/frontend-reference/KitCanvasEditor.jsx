import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas, PencilBrush, Textbox, FabricImage, Ellipse, Polygon, Path } from 'fabric';
import KitPreview from './KitPreview';
import { COLOR_PALETTE, FONTS, loadStoredDesign, DRAWN_LOGO_KEY, saveEditedKitImage, KIT_CANVAS_STATE_KEY } from './kitShapes';
import {
  IconSelect, IconDraw, IconText, IconUndo, IconRedo, IconExport, IconLayers,
  IconEye, IconEyeOff, IconTrash, IconChevronLeft, IconBucket, IconEraser, IconShapes,
} from './icons';
import ColorPicker from './ColorPicker';
import {
  customizerCls, topbarCls, topbarLeftCls, topbarRightCls, iconBtnCls, exportBtnCls,
  bodyCls, railCls, canvasCls, canvasCardCls, sidebarCls, tabsCls, tabCls, panelCls, panelBoxCls, sectionCls,
  labelCls, paletteCls, swatchCls, sliderRowCls, sliderCls, sliderValueCls,
  fontGridCls, fontBtnCls, fontBtnSpanCls, hintCls,
  drawHiddenPreviewCls, drawBackLinkCls, drawTitleCls, drawToastCls,
  drawLoadingCls, drawLayerListCls, drawLayerRowCls, drawLayerRowSpanCls,
  drawLayerRowActionsCls, drawLayerRowBtnCls, drawShapeGridCls, drawShapeBtnCls,
  drawShapeIconCls, drawShapeBtnSpanCls,
} from './customizerClasses';

// Matches the on-screen size of the kit preview on the main Customize page (its
// .customizer__preview-kit box: max 300x360, 5:6 aspect) — Fabric renders its canvas at this
// resolution 1:1 via inline pixel styles it controls itself, so the kit doesn't jump to a
// different, blown-up scale when opening this editor.
const CANVAS_W = 300;
const CANVAS_H = 360;
// Fabric's toDataURL multiplier applied at export time — scaled up from the on-screen 300x360
// canvas so exported PNGs keep roughly the same pixel resolution the editor produced before.
const EXPORT_MULTIPLIER = 1040 / CANVAS_W;

const TABS = [
  { id: 'colors', label: 'Colors', icon: <IconDraw /> },
  { id: 'text',   label: 'Text',   icon: <IconText /> },
  { id: 'shapes', label: 'Shapes', icon: <IconShapes /> },
  { id: 'layers', label: 'Layers', icon: <IconLayers /> },
];

/** Evenly-spaced points around a circle — used for pentagon/hexagon/heptagon/octagon. */
function regularPolygonPoints(sides, radius, cx = radius, cy = radius) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
    pts.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  }
  return pts;
}

/** Alternating outer/inner radius points — used for the star shapes. */
function starPolygonPoints(spikes, outerR, innerR, cx = outerR, cy = outerR) {
  const pts = [];
  const step = Math.PI / spikes;
  let rot = -Math.PI / 2;
  for (let i = 0; i < spikes; i++) {
    pts.push({ x: cx + Math.cos(rot) * outerR, y: cy + Math.sin(rot) * outerR });
    rot += step;
    pts.push({ x: cx + Math.cos(rot) * innerR, y: cy + Math.sin(rot) * innerR });
    rot += step;
  }
  return pts;
}

/** 24 shapes for the Shapes tab — straight-edged ones as polygons, round ones as ellipses,
 *  organic ones as SVG paths (all normalized to a roughly 0–100 box for consistent previews). */
const SHAPES = [
  { id: 'square',         label: 'Square',         kind: 'polygon', points: [{x:0,y:0},{x:80,y:0},{x:80,y:80},{x:0,y:80}] },
  { id: 'rectangle',      label: 'Rectangle',      kind: 'polygon', points: [{x:0,y:0},{x:110,y:0},{x:110,y:65},{x:0,y:65}] },
  { id: 'circle',         label: 'Circle',         kind: 'ellipse', rx: 45, ry: 45 },
  { id: 'ellipse',        label: 'Ellipse',        kind: 'ellipse', rx: 55, ry: 35 },
  { id: 'triangle',       label: 'Triangle',       kind: 'polygon', points: [{x:40,y:0},{x:80,y:80},{x:0,y:80}] },
  { id: 'right-triangle', label: 'Right Triangle', kind: 'polygon', points: [{x:0,y:0},{x:0,y:80},{x:80,y:80}] },
  { id: 'diamond',        label: 'Diamond',        kind: 'polygon', points: [{x:40,y:0},{x:80,y:40},{x:40,y:80},{x:0,y:40}] },
  { id: 'pentagon',       label: 'Pentagon',       kind: 'polygon', points: regularPolygonPoints(5, 42) },
  { id: 'hexagon',        label: 'Hexagon',        kind: 'polygon', points: regularPolygonPoints(6, 42) },
  { id: 'heptagon',       label: 'Heptagon',       kind: 'polygon', points: regularPolygonPoints(7, 42) },
  { id: 'octagon',        label: 'Octagon',        kind: 'polygon', points: regularPolygonPoints(8, 42) },
  { id: 'star5',          label: '5-Point Star',   kind: 'polygon', points: starPolygonPoints(5, 42, 17) },
  { id: 'star6',          label: '6-Point Star',   kind: 'polygon', points: starPolygonPoints(6, 42, 19) },
  { id: 'cross',          label: 'Cross',          kind: 'polygon', points: [{x:30,y:0},{x:60,y:0},{x:60,y:30},{x:90,y:30},{x:90,y:60},{x:60,y:60},{x:60,y:90},{x:30,y:90},{x:30,y:60},{x:0,y:60},{x:0,y:30},{x:30,y:30}] },
  { id: 'chevron',        label: 'Chevron',        kind: 'polygon', points: [{x:0,y:0},{x:50,y:0},{x:90,y:40},{x:50,y:80},{x:0,y:80},{x:40,y:40}] },
  { id: 'parallelogram',  label: 'Parallelogram',  kind: 'polygon', points: [{x:20,y:0},{x:100,y:0},{x:80,y:60},{x:0,y:60}] },
  { id: 'trapezoid',      label: 'Trapezoid',      kind: 'polygon', points: [{x:20,y:0},{x:80,y:0},{x:100,y:60},{x:0,y:60}] },
  { id: 'arrow-right',    label: 'Arrow Right',    kind: 'polygon', points: [{x:0,y:20},{x:50,y:20},{x:50,y:0},{x:90,y:35},{x:50,y:70},{x:50,y:50},{x:0,y:50}] },
  { id: 'arrow-up',       label: 'Arrow Up',       kind: 'polygon', points: [{x:20,y:90},{x:20,y:40},{x:0,y:40},{x:35,y:0},{x:70,y:40},{x:50,y:40},{x:50,y:90}] },
  { id: 'heart',          label: 'Heart',          kind: 'path', d: 'M 50 88 C 20 65 0 45 0 27 C 0 10 15 0 30 0 C 40 0 48 6 50 15 C 52 6 60 0 70 0 C 85 0 100 10 100 27 C 100 45 80 65 50 88 Z' },
  { id: 'lightning',      label: 'Lightning',      kind: 'path', d: 'M 55 0 L 15 55 L 40 55 L 30 100 L 85 40 L 55 40 Z' },
  { id: 'shield',         label: 'Shield',         kind: 'path', d: 'M 50 0 L 95 15 L 95 45 C 95 75 75 95 50 100 C 25 95 5 75 5 45 L 5 15 Z' },
  { id: 'speech-bubble',  label: 'Speech Bubble',  kind: 'path', d: 'M 5 5 L 95 5 L 95 65 L 35 65 L 15 90 L 20 65 L 5 65 Z' },
  { id: 'crescent',       label: 'Crescent',       kind: 'path', d: 'M 60 5 A 45 45 0 1 0 60 95 A 35 35 0 1 1 60 5 Z' },
];

function createShapeObject(def, color) {
  if (def.kind === 'ellipse') return new Ellipse({ rx: def.rx, ry: def.ry, fill: color });
  if (def.kind === 'path') return new Path(def.d, { fill: color });
  return new Polygon(def.points, { fill: color });
}

/** Small inline SVG preview for a shape button — reuses the same point/path data as the real object. */
function ShapeIcon({ def }) {
  if (def.kind === 'ellipse') {
    return (
      <svg viewBox={`0 0 ${def.rx * 2} ${def.ry * 2}`} className={drawShapeIconCls}>
        <ellipse cx={def.rx} cy={def.ry} rx={def.rx} ry={def.ry} fill="currentColor" />
      </svg>
    );
  }
  if (def.kind === 'path') {
    return (
      <svg viewBox="0 0 100 100" className={drawShapeIconCls}>
        <path d={def.d} fill="currentColor" />
      </svg>
    );
  }
  const maxX = Math.max(...def.points.map(p => p.x));
  const maxY = Math.max(...def.points.map(p => p.y));
  return (
    <svg viewBox={`0 0 ${maxX} ${maxY}`} className={drawShapeIconCls}>
      <polygon points={def.points.map(p => `${p.x},${p.y}`).join(' ')} fill="currentColor" />
    </svg>
  );
}

/** Preloads every <image> in a cloned SVG and inlines its href as a data URL. The clone is
 *  about to be serialized and rasterized as one flat image via an <img>'s load event — an
 *  external (non-data) href like an uploaded logo or badge preset isn't guaranteed to have
 *  finished loading by the time that outer load event fires, which silently drops it from the
 *  drawing surface. Inlining first means there's nothing left to fetch at rasterize time. */
function inlineSvgImages(svgEl) {
  const images = Array.from(svgEl.querySelectorAll('image'));
  return Promise.all(images.map(imgEl => {
    const href = imgEl.getAttribute('href') || imgEl.getAttribute('xlink:href');
    if (!href || href.startsWith('data:')) return Promise.resolve();
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || 1;
        c.height = img.naturalHeight || 1;
        c.getContext('2d').drawImage(img, 0, 0);
        imgEl.setAttribute('href', c.toDataURL('image/png'));
        resolve();
      };
      img.onerror = resolve;
      img.src = href;
    });
  }));
}

/** Reads back the saved Fabric canvas state (strokes, shapes, text) for one side of the Kit
 *  Editor, if any was saved on a previous visit. */
function loadKitCanvasState(side) {
  try {
    const raw = localStorage.getItem(KIT_CANVAS_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw)?.[side] || null;
  } catch {
    return null;
  }
}

/** Persists the Fabric canvas state (via canvas.toJSON()) for one side of the Kit Editor, so
 *  reopening it later continues the same in-progress edit instead of starting over. */
function saveKitCanvasState(side, json) {
  try {
    const raw = localStorage.getItem(KIT_CANVAS_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[side] = json;
    localStorage.setItem(KIT_CANVAS_STATE_KEY, JSON.stringify(parsed));
  } catch {
    /* storage unavailable */
  }
}

function themeColor(name, fallback) {
  if (typeof window === 'undefined') return fallback;
  const val = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  return val || fallback;
}

function hexToRgba(hex, alpha = 255) {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255, alpha];
}

/** Stack-based flood fill over an ImageData buffer, in place. Returns true if anything changed. */
function floodFill(imageData, startX, startY, fillRgba, tolerance = 32) {
  const { data, width, height } = imageData;
  const start = (startY * width + startX) * 4;
  const target = [data[start], data[start + 1], data[start + 2], data[start + 3]];
  if (target[0] === fillRgba[0] && target[1] === fillRgba[1] && target[2] === fillRgba[2] && target[3] === fillRgba[3]) return false;

  const matches = (i) =>
    Math.abs(data[i] - target[0]) <= tolerance &&
    Math.abs(data[i + 1] - target[1]) <= tolerance &&
    Math.abs(data[i + 2] - target[2]) <= tolerance &&
    Math.abs(data[i + 3] - target[3]) <= tolerance;

  const stack = [[startX, startY]];
  const visited = new Uint8Array(width * height);
  let touched = false;

  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const pixelIdx = y * width + x;
    if (visited[pixelIdx]) continue;
    const i = pixelIdx * 4;
    if (!matches(i)) continue;
    visited[pixelIdx] = 1;
    data[i] = fillRgba[0]; data[i + 1] = fillRgba[1]; data[i + 2] = fillRgba[2]; data[i + 3] = fillRgba[3];
    touched = true;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return touched;
}

/**
 * Shared canvas-editing engine behind both Draw Studio (mode="logo" — draws on the kit,
 * exports the result as a logo image) and Kit Editor (mode="kit" — draws on the kit,
 * exports it as the finished kit artwork). Same tools, different purpose/output.
 */
export default function KitCanvasEditor({ mode, initialSide = 'front' }) {
  const navigate = useNavigate();
  const canvasElRef = useRef(null);
  const fabricRef = useRef(null);
  const loadingRef = useRef(false);
  const hiddenPreviewRef = useRef(null);
  const canvasCardRef = useRef(null);
  const bgCanvasElRef = useRef(null);
  if (!bgCanvasElRef.current) bgCanvasElRef.current = document.createElement('canvas');

  const [design] = useState(() => loadStoredDesign());
  const [activeTab, setActiveTab] = useState('colors');
  const [activeTool, setActiveTool] = useState('draw');
  const [brushColor, setBrushColor] = useState(() => themeColor('red', '#8B0000'));
  const [brushSize, setBrushSize] = useState(6);
  const [selectedObj, setSelectedObj] = useState(null);
  const [objectsTick, setObjectsTick] = useState(0);
  const [toast, setToast] = useState('');
  const [ready, setReady] = useState(false);
  const [backLinkLeft, setBackLinkLeft] = useState(null);

  const activeToolRef = useRef(activeTool);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);

  const historyRef = useRef({ past: [], future: [] });
  const [historyTick, setHistoryTick] = useState(0);

  const restoreFromJSON = useCallback((json) => {
    const canvas = fabricRef.current;
    loadingRef.current = true;
    canvas.loadFromJSON(json).then(() => {
      canvas.requestRenderAll();
      loadingRef.current = false;
      setObjectsTick(t => t + 1);
      const bg = canvas.backgroundImage;
      if (bg && bg._element) {
        const bctx = bgCanvasElRef.current.getContext('2d');
        bctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        bctx.drawImage(bg._element, 0, 0, CANVAS_W, CANVAS_H);
      }
    });
  }, []);

  const pushHistorySnapshot = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || loadingRef.current) return;
    const h = historyRef.current;
    h.past.push(JSON.stringify(canvas.toJSON()));
    h.future = [];
    setHistoryTick(t => t + 1);
  }, []);

  const handleUndo = useCallback(() => {
    const h = historyRef.current;
    const canvas = fabricRef.current;
    if (!canvas || h.past.length === 0) return;
    const current = JSON.stringify(canvas.toJSON());
    const previous = h.past.pop();
    h.future.push(current);
    restoreFromJSON(JSON.parse(previous));
    setHistoryTick(t => t + 1);
  }, [restoreFromJSON]);

  const handleRedo = useCallback(() => {
    const h = historyRef.current;
    const canvas = fabricRef.current;
    if (!canvas || h.future.length === 0) return;
    const current = JSON.stringify(canvas.toJSON());
    const next = h.future.pop();
    h.past.push(current);
    restoreFromJSON(JSON.parse(next));
    setHistoryTick(t => t + 1);
  }, [restoreFromJSON]);

  /* ── Create the fabric canvas once ─────────────────────────── */
  useEffect(() => {
    // React 18 StrictMode double-invokes this effect on mount (setup → cleanup → setup),
    // and the SVG-rasterize chain below is async (Image.onload → toDataURL → FabricImage
    // .fromURL().then). Without this guard, the first (soon-to-be-disposed) invocation's
    // callbacks can still fire after the second invocation is live, both writing into the
    // same shared bgCanvasElRef and racing to set backgroundImage on whichever canvas
    // instance ends up wrapping the physical <canvas> node — producing a corrupted,
    // undersized, top-left-anchored composite instead of the real kit artwork.
    let cancelled = false;

    const canvas = new Canvas(canvasElRef.current, {
      width: CANVAS_W,
      height: CANVAS_H,
      backgroundColor: themeColor('canvas-light', '#f7f7f5'),
      preserveObjectStacking: true,
      enableRetinaScaling: false,
    });
    fabricRef.current = canvas;
    bgCanvasElRef.current.width = CANVAS_W;
    bgCanvasElRef.current.height = CANVAS_H;

    const pushHistory = () => {
      pushHistorySnapshot();
      setObjectsTick(t => t + 1);
    };

    canvas.on('object:added', pushHistory);
    canvas.on('object:removed', pushHistory);
    canvas.on('object:modified', pushHistory);
    canvas.on('path:created', (e) => {
      if (activeToolRef.current === 'erase') {
        e.path.set({ globalCompositeOperation: 'destination-out' });
        canvas.requestRenderAll();
      }
      pushHistory();
    });
    canvas.on('selection:created', (e) => setSelectedObj(e.selected?.[0] || null));
    canvas.on('selection:updated', (e) => setSelectedObj(e.selected?.[0] || null));
    canvas.on('selection:cleared', () => setSelectedObj(null));

    // If this side was already edited on a previous visit, pick up exactly where that edit left
    // off (strokes, shapes, text and all) instead of re-rendering a fresh canvas from the live
    // design — "Back" then re-opening the editor should continue the same edited kit.
    const savedState = mode === 'kit' ? loadKitCanvasState(initialSide) : null;
    if (savedState) {
      canvas.loadFromJSON(savedState).then(() => {
        if (cancelled) return;
        canvas.requestRenderAll();
        const bg = canvas.backgroundImage;
        if (bg && bg._element) {
          const bctx = bgCanvasElRef.current.getContext('2d');
          bctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
          bctx.drawImage(bg._element, 0, 0, CANVAS_W, CANVAS_H);
        }
        pushHistorySnapshot();
        setReady(true);
      }).catch(() => {
        // StrictMode's double-invoke can dispose this exact canvas instance while
        // loadFromJSON's own internal steps are still mid-flight on it — that rejects here
        // rather than reaching the .then() above, so `cancelled` alone can't guard it.
      });
      return () => {
        cancelled = true;
        canvas.dispose();
      };
    }

    // Load the user's actual current kit as the drawing surface — done here, in the same
    // effect that creates the canvas, so fabricRef.current is guaranteed to exist already.
    // (Previously this lived in a separate useLayoutEffect, which — since layout effects run
    // before regular effects on mount — fired before the canvas existed and silently no-op'd,
    // leaving the canvas permanently blank.)
    const svgEl = hiddenPreviewRef.current?.querySelector('svg');
    if (svgEl) {
      // The live preview's <svg> only has width/height:100% in CSS (meant to fill a sized
      // parent container) — once serialized standalone with no parent, that's meaningless and
      // the browser falls back to a wrong default intrinsic size when rasterizing it. Stamp
      // explicit width/height (from the SVG's own viewBox) onto a clone before serializing.
      const clone = svgEl.cloneNode(true);
      const viewBox = clone.getAttribute('viewBox');
      const [, , vbWidth, vbHeight] = (viewBox || '0 0 300 360').split(' ').map(Number);
      clone.setAttribute('width', vbWidth);
      clone.setAttribute('height', vbHeight);
      // The cloned inline style="width:100%;height:100%" (copied verbatim by cloneNode) takes
      // CSS-vs-presentation-attribute precedence over the width/height attributes above, so it
      // must be cleared — otherwise the browser still can't resolve the percentage with no
      // parent and falls back to its ~300x150 default replaced-element size.
      clone.style.removeProperty('width');
      clone.style.removeProperty('height');

      inlineSvgImages(clone).then(() => {
        if (cancelled) return;
        const data = new XMLSerializer().serializeToString(clone);
        const blob = new Blob([data], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);

        // Rasterize the SVG ourselves onto a plain canvas at an exact, known destination size
        // via drawImage's explicit-size form — this always stretches correctly regardless of
        // whatever the source SVG's "natural" size quirkily comes back as. Trusting Fabric's own
        // image-object width/height/scale for this was unreliable (kept rendering a cropped
        // corner instead of the full kit).
        const rawImg = new Image();
        rawImg.onload = () => {
          URL.revokeObjectURL(url);
          if (cancelled) return;
          const scale = Math.min((CANVAS_W * 0.85) / vbWidth, (CANVAS_H * 0.85) / vbHeight);
          const drawW = vbWidth * scale;
          const drawH = vbHeight * scale;
          const left = (CANVAS_W - drawW) / 2;
          const top = (CANVAS_H - drawH) / 2;

          const bctx = bgCanvasElRef.current.getContext('2d');
          bctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
          bctx.fillStyle = themeColor('canvas-light', '#f7f7f5');
          bctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
          bctx.drawImage(rawImg, left, top, drawW, drawH);

          const flatUrl = bgCanvasElRef.current.toDataURL('image/png');
          FabricImage.fromURL(flatUrl).then(img => {
            if (cancelled) return;
            // Force this to stretch to exactly the canvas size, no matter what img.width/height
            // report — that reported size has been unreliable, so stop depending on it entirely.
            // originX/originY must be pinned to 'left'/'top' explicitly: Fabric images default to
            // center-origin, so left:0/top:0 would otherwise place the image's *center* — not its
            // corner — at the canvas origin, leaving only its bottom-right quadrant visible.
            img.set({
              left: 0,
              top: 0,
              originX: 'left',
              originY: 'top',
              scaleX: CANVAS_W / img.width,
              scaleY: CANVAS_H / img.height,
              selectable: false,
              evented: false,
            });
            canvas.backgroundImage = img;
            canvas.requestRenderAll();
            pushHistorySnapshot();
            setReady(true);
          });
        };
        rawImg.src = url;
      });
    }

    return () => {
      cancelled = true;
      canvas.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Keep drawing mode + brush in sync with tool/color/size ───── */
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.isDrawingMode = activeTool === 'draw' || activeTool === 'erase';
    if (canvas.isDrawingMode) {
      const brush = new PencilBrush(canvas);
      brush.color = activeTool === 'erase' ? '#000000' : brushColor;
      brush.width = activeTool === 'erase' ? Math.max(brushSize, 14) : brushSize;
      canvas.freeDrawingBrush = brush;
    }
  }, [activeTool, brushColor, brushSize]);

  /* ── Bucket fill: click the canvas while the Fill tool is active ── */
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const handleClick = (opt) => {
      if (activeToolRef.current !== 'fill') return;
      const pointer = canvas.getPointer(opt.e);
      const x = Math.round(pointer.x), y = Math.round(pointer.y);
      if (x < 0 || y < 0 || x >= CANVAS_W || y >= CANVAS_H) return;

      const bctx = bgCanvasElRef.current.getContext('2d');
      const imageData = bctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
      const changed = floodFill(imageData, x, y, hexToRgba(brushColor, 255), 40);
      if (!changed) return;
      bctx.putImageData(imageData, 0, 0);

      const url = bgCanvasElRef.current.toDataURL('image/png');
      FabricImage.fromURL(url).then(img => {
        img.set({ left: 0, top: 0, originX: 'left', originY: 'top', selectable: false, evented: false });
        canvas.backgroundImage = img;
        canvas.requestRenderAll();
        pushHistorySnapshot();
      });
    };

    canvas.on('mouse:down', handleClick);
    return () => canvas.off('mouse:down', handleClick);
  }, [brushColor, pushHistorySnapshot]);

  const applyToSelection = (fill) => {
    const canvas = fabricRef.current;
    if (!canvas || !selectedObj) return;
    selectedObj.set({ fill });
    canvas.requestRenderAll();
    pushHistorySnapshot();
  };

  const addText = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const text = new Textbox('Your Text', {
      left: canvas.width / 2 - 60,
      top: canvas.height / 2 - 15,
      fontFamily: FONTS[0].id,
      fontSize: 28,
      fill: brushColor,
      width: 160,
    });
    canvas.add(text);
    canvas.setActiveObject(text);
    setActiveTool('select');
    canvas.requestRenderAll();
  };

  const addShape = (shapeId) => {
    const canvas = fabricRef.current;
    const def = SHAPES.find(s => s.id === shapeId);
    if (!canvas || !def) return;
    const obj = createShapeObject(def, brushColor);
    obj.set({
      left: canvas.width / 2 - obj.width / 2,
      top: canvas.height / 2 - obj.height / 2,
    });
    canvas.add(obj);
    canvas.setActiveObject(obj);
    setActiveTool('select');
    canvas.requestRenderAll();
  };

  const deleteObject = (obj) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.remove(obj);
    if (selectedObj === obj) setSelectedObj(null);
    canvas.requestRenderAll();
  };

  /** Rail trash button — wipes everything (strokes, text, and the kit surface itself) back to blank. */
  const clearCanvas = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    loadingRef.current = true;
    canvas.getObjects().slice().forEach(obj => canvas.remove(obj));
    canvas.backgroundImage = null;
    canvas.backgroundColor = themeColor('canvas-light', '#f7f7f5');
    canvas.requestRenderAll();
    loadingRef.current = false;

    const bctx = bgCanvasElRef.current.getContext('2d');
    bctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    bctx.fillStyle = themeColor('canvas-light', '#f7f7f5');
    bctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    setSelectedObj(null);
    setObjectsTick(t => t + 1);
    pushHistorySnapshot();
    setToast('Canvas cleared');
  };

  const layers = fabricRef.current ? fabricRef.current.getObjects() : [];
  // objectsTick forces this component to re-render when the canvas's object list changes
  // eslint-disable-next-line no-unused-expressions
  objectsTick;

  const selectLayer = (obj) => {
    fabricRef.current.setActiveObject(obj);
    fabricRef.current.requestRenderAll();
  };

  const toggleVisible = (obj) => {
    obj.visible = !obj.visible;
    fabricRef.current.requestRenderAll();
    setObjectsTick(t => t + 1);
  };

  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;
  // eslint-disable-next-line no-unused-expressions
  historyTick;

  const exportPNG = () => {
    const canvas = fabricRef.current;
    const url = canvas.toDataURL({ format: 'png', multiplier: EXPORT_MULTIPLIER });
    const a = document.createElement('a');
    a.href = url;
    a.download = `kit-${mode === 'logo' ? 'drawing' : 'design'}-${Date.now()}.png`;
    a.click();
    setToast('Exported PNG');
  };

  const useAsLogo = () => {
    const canvas = fabricRef.current;
    const url = canvas.toDataURL({ format: 'png', multiplier: EXPORT_MULTIPLIER });
    try { localStorage.setItem(DRAWN_LOGO_KEY, url); } catch { /* storage unavailable */ }
    navigate('/customize');
  };

  /** In kit-editing mode, save the current canvas as the final edited kit before leaving —
   *  a flattened PNG so it's what gets used at checkout/order, and the full Fabric canvas state
   *  so reopening the editor for this side later continues the same edit instead of resetting. */
  const goBackToStudio = () => {
    if (mode === 'kit' && fabricRef.current) {
      const url = fabricRef.current.toDataURL({ format: 'png', multiplier: EXPORT_MULTIPLIER });
      saveEditedKitImage(initialSide, url);
      saveKitCanvasState(initialSide, fabricRef.current.toJSON());
      // Carry the side back so Customize reopens on the same side just edited — otherwise its
      // own side state always defaults to 'front' on remount, showing the wrong side's result.
      navigate(`/customize?side=${initialSide}`);
      return;
    }
    navigate('/customize');
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── Keep "Back to Studio" aligned with the canvas card's actual left edge ── */
  useEffect(() => {
    const updatePosition = () => {
      if (canvasCardRef.current) {
        setBackLinkLeft(canvasCardRef.current.getBoundingClientRect().left);
      }
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [ready]);

  const brushSizeShown = activeTool === 'draw' || activeTool === 'erase';
  const selectedObjShown = !!selectedObj;
  const fontStyleShown = !!(selectedObj && selectedObj.type === 'textbox');

  return (
    <div className={customizerCls}>
      {/* Off-screen: renders the user's real, current kit so we can snapshot it as the drawing surface */}
      <div ref={hiddenPreviewRef} className={drawHiddenPreviewCls} aria-hidden="true">
        <KitPreview {...design} side={initialSide} />
      </div>

      <div className={topbarCls}>
        <div className={topbarLeftCls}>
          <button
            onClick={goBackToStudio}
            className={drawBackLinkCls}
            style={backLinkLeft !== null ? { position: 'fixed', left: backLinkLeft, top: 72, height: 60 } : undefined}
          >
            <IconChevronLeft /> Back
          </button>
          {mode === 'kit' && (
            <span className={drawTitleCls}>Editing {initialSide === 'back' ? 'Back' : 'Front'}</span>
          )}
        </div>
        <div className={topbarRightCls}>
          <button className={iconBtnCls(false)} onClick={handleUndo} disabled={!canUndo} title="Undo"><IconUndo /></button>
          <button className={iconBtnCls(false)} onClick={handleRedo} disabled={!canRedo} title="Redo"><IconRedo /></button>
          <button onClick={exportPNG} className={`btn btn-grey ${exportBtnCls}`}>
            <IconExport /> Export PNG
          </button>
          {mode === 'logo' && (
            <button onClick={useAsLogo} className={`btn btn-darkred ${exportBtnCls}`}>
              Use as Logo
            </button>
          )}
        </div>
      </div>

      <div className={bodyCls(false)}>
        <div className={railCls}>
          <button
            className={iconBtnCls(activeTool === 'select')}
            onClick={() => setActiveTool('select')}
            title="Select"
          ><IconSelect /></button>
          <button
            className={iconBtnCls(activeTool === 'draw')}
            onClick={() => setActiveTool('draw')}
            title="Draw"
          ><IconDraw /></button>
          <button
            className={iconBtnCls(activeTool === 'fill')}
            onClick={() => setActiveTool('fill')}
            title="Fill"
          ><IconBucket /></button>
          <button
            className={iconBtnCls(activeTool === 'erase')}
            onClick={() => setActiveTool('erase')}
            title="Erase"
          ><IconEraser /></button>
          <button className={iconBtnCls(false)} onClick={addText} title="Text"><IconText /></button>
          <button className={iconBtnCls(false)} onClick={clearCanvas} title="Clear"><IconTrash /></button>
        </div>

        <main className={canvasCls}>
          <div ref={canvasCardRef} className={canvasCardCls}>
            {!ready && <div className={drawLoadingCls}>Loading your kit…</div>}
            <canvas ref={canvasElRef} />
            {toast && <div className={drawToastCls}>{toast}</div>}
          </div>
        </main>

        <aside className={sidebarCls}>
          <div className={tabsCls}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={tabCls(activeTab === tab.id)}
              >
                <span className="flex">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className={panelCls}>
            {activeTab === 'colors' && (
              <div className={panelBoxCls}>
                <div className={sectionCls({ first: true, last: !brushSizeShown && !selectedObjShown })}>
                  <h3 className={labelCls}>{activeTool === 'fill' ? 'Fill Color' : 'Brush Color'}</h3>
                  <div className={paletteCls}>
                    {COLOR_PALETTE.map(c => (
                      <button
                        key={c.hex}
                        onClick={() => setBrushColor(c.hex)}
                        className={swatchCls(brushColor === c.hex)}
                        style={{ background: c.hex, border: c.hex === '#FFFFFF' ? '1px solid var(--color-swatch-outline)' : 'none' }}
                        title={c.name}
                        aria-label={c.name}
                      />
                    ))}
                  </div>
                  <ColorPicker value={brushColor} onChange={setBrushColor} />
                </div>

                {brushSizeShown && (
                  <div className={sectionCls({ last: !selectedObjShown })}>
                    <h3 className={labelCls}>{activeTool === 'erase' ? 'Eraser Size' : 'Brush Size'}</h3>
                    <div className={sliderRowCls}>
                      <input
                        type="range" min="1" max="40" value={brushSize}
                        onChange={e => setBrushSize(Number(e.target.value))}
                        className={sliderCls}
                      />
                      <span className={sliderValueCls}>{brushSize}px</span>
                    </div>
                  </div>
                )}

                {selectedObjShown && (
                  <div className={sectionCls({ last: true })}>
                    <h3 className={labelCls}>Selected Object Color</h3>
                    <div className={paletteCls}>
                      {COLOR_PALETTE.map(c => (
                        <button
                          key={c.hex}
                          onClick={() => applyToSelection(c.hex)}
                          className={swatchCls(false)}
                          style={{ background: c.hex, border: c.hex === '#FFFFFF' ? '1px solid var(--color-swatch-outline)' : 'none' }}
                          title={c.name}
                          aria-label={c.name}
                        />
                      ))}
                    </div>
                    <ColorPicker value={selectedObj.fill || '#000000'} onChange={applyToSelection} />
                  </div>
                )}
              </div>
            )}

            {activeTab === 'text' && (
              <div className={panelBoxCls}>
                <div className={sectionCls({ first: true, last: !fontStyleShown })}>
                  <button className="btn btn-grey" onClick={addText}>+ Add Text</button>
                </div>
                {fontStyleShown && (
                  <div className={sectionCls({ last: true })}>
                    <h3 className={labelCls}>Font Style</h3>
                    <div className={fontGridCls}>
                      {FONTS.slice(0, 4).map(f => (
                        <button
                          key={f.id}
                          onClick={() => { selectedObj.set({ fontFamily: f.id }); fabricRef.current.requestRenderAll(); pushHistorySnapshot(); }}
                          className={fontBtnCls(selectedObj.fontFamily === f.id)}
                          style={{ fontFamily: f.id }}
                        >
                          Aa <span className={fontBtnSpanCls}>{f.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'shapes' && (
              <div className={panelBoxCls}>
                <div className={sectionCls({ first: true, last: true })}>
                  <h3 className={labelCls}>Shapes</h3>
                  <div className={drawShapeGridCls}>
                    {SHAPES.map(def => (
                      <button key={def.id} className={drawShapeBtnCls} onClick={() => addShape(def.id)} title={def.label}>
                        <ShapeIcon def={def} />
                        <span className={drawShapeBtnSpanCls}>{def.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'layers' && (
              <div className={panelBoxCls}>
                <div className={sectionCls({ first: true, last: true })}>
                  <h3 className={labelCls}>Layers</h3>
                  <p className={hintCls}>Text and pen strokes appear here. Fills paint directly onto the kit surface, so they don't show as separate layers.</p>
                  {layers.length === 0 && <p className={hintCls}>Nothing added yet.</p>}
                  <div className={drawLayerListCls}>
                    {layers.slice().reverse().map((obj, i) => (
                      <div
                        key={i}
                        className={drawLayerRowCls(selectedObj === obj)}
                        onClick={() => selectLayer(obj)}
                      >
                        <span className={drawLayerRowSpanCls}>{obj.type === 'textbox' ? `“${obj.text}”` : obj.type === 'path' ? 'Pen stroke' : obj.type}</span>
                        <span className={drawLayerRowActionsCls}>
                          <button className={drawLayerRowBtnCls} onClick={(e) => { e.stopPropagation(); toggleVisible(obj); }} title="Toggle visibility">
                            {obj.visible === false ? <IconEyeOff /> : <IconEye />}
                          </button>
                          <button className={drawLayerRowBtnCls} onClick={(e) => { e.stopPropagation(); deleteObject(obj); }} title="Delete this layer">
                            <IconTrash />
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
