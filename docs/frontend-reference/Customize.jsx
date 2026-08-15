// Snapshot of ../kit-frontend as of 2026-08-15 — reference only, do not edit here.
// Source: src/pages/Customize.jsx

import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import KitPreview from '../customize/KitPreview';
import useHistoryState from '../hooks/useHistoryState';
import {
  KIT_TYPES, SPORTS, SIZES, SIZE_UNITS, COLOR_PALETTE, APPLY_TARGETS,
  FONTS, DESIGN_TEMPLATES, BADGE_PRESETS, POSITIONS, DEFAULT_DESIGN,
  DESIGN_STORAGE_KEY, loadStoredDesign,
  loadEditedKitImage, clearEditedKitImage, resolveShapeKey, maxNumberSizeFor, maxLogoScaleFor,
  NUMBER_SIZE_MIN,
} from '../customize/kitShapes';
import {
  STORAGE_MESSAGE, writeStorage, readSavedDesigns, capSavedDesigns, savedDesignsKey,
} from '../customize/designStorage';
import {
  uploadLogoSequenced, createUploadSequencer, readFileAsDataUrl, ACCEPTED_LOGO_TYPES,
} from '../customize/logoUpload';
import { uploadLogoAsset } from '../api/assetsService';
import { useCart } from '../context/CartContext';
import {
  IconSelect, IconDraw, IconText, IconUndo, IconRedo, IconSave, IconExport,
  IconLayers, IconEye, IconEyeOff, IconGrip, IconUpload, IconPlus, IconMinus, IconPan,
  IconKit, IconPalette, IconTag, IconChevronLeft,
} from '../customize/icons';
import ColorPicker from '../customize/ColorPicker';
import {
  customizerCls, topbarCls, topbarLeftCls, topbarRightCls, topbarCenterCls,
  iconBtnCls, exportBtnCls, sideToggleCls, sideBtnCls, bodyCls, railCls,
  canvasCls, canvasCardCls, previewWrapCls, previewKitCls, previewKitImgCls,
  zoomCls, zoomBtnCls, zoomSpanCls, infoBarCls, colorSwatchCls, toastCls,
  toastErrorCls, toastDismissCls,
  sidebarCls, tabsCls, tabCls, panelCls, panelBoxCls, sectionCls, labelCls,
  kitGridCls, kitBtnCls, kitThumbCls, sportGridCls, sportBtnCls, sportBackCls,
  pillRowCls, pillCls, sizeGridCls, sizeBtnCls, templateGridCls, templateBtnCls,
  templateThumbCls, moreBtnCls, customSizeRowCls, customSizeInputCls,
  unitDropdownCls, unitDropdownBtnCls, unitDropdownListCls, unitDropdownItemCls,
  segmentedCls, segmentCls, hintCls, colorPreviewCls, colorPreviewSwatchCls,
  colorPreviewTitleCls, colorPreviewHexCls, paletteCls, swatchCls, sliderRowCls,
  sliderRowLabeledCls, sliderLabelCls, sliderCls, sliderValueCls, fontGridCls,
  fontBtnCls, fontBtnSpanCls, posRowCls, posColCls, posColLabelCls, posGridCls,
  posBtnCls, drawStudioLinkCls, dropzoneCls, dropzonePreviewCls, linkBtnCls,
  badgeBtnCls, badgeThumbCls, layerListCls, layerRowCls, layerGripCls,
  layerNameCls, layerEyeCls, stateBoxCls, stateRowCls, stateRowLabelCls,
  stateValueCls, stateSwatchCls, inputCls,
} from '../customize/customizerClasses';
import cricketShirtImg from '../assets/cricket-shirt-front.png';
import cricketTrousersImg from '../assets/cricket-trousers-front.png';
import cricketTrousersBackImg from '../assets/cricket-trousers-back.png';
import cricketSweaterImg from '../assets/cricket-sweater-front.png';
import cricketCapImg from '../assets/cricket-cap.png';
import footballJerseyImg from '../assets/football-jersey-front.png';
import footballShortsImg from '../assets/football-shorts-front.png';
import footballShortsBackImg from '../assets/football-shorts-back.png';
import goalkeeperKitImg from '../assets/goalkeeperkit-front.png';
import goalkeeperKitBackImg from '../assets/goalkeeperkit-back.png';
import basketballJerseyImg from '../assets/basketball-jersey-front.png';
import basketballJerseyBackImg from '../assets/basketball-jersey-back.png';
import basketballShortsImg from '../assets/basketball-shorts-front.png';
import basketballShortsBackImg from '../assets/basketball-shorts-back.png';
import basketballHeadbandImg from '../assets/basketball-headband.png';
import trainingTShirtImg from '../assets/training-T-shit-front.png';
import trainingShortsImg from '../assets/training-shorts-front.png';
import trainingShortsBackImg from '../assets/training-shorts-back.png';
import trainingVestImg from '../assets/training-vest-front.png';
import trainingVestBackImg from '../assets/training-vest-back.png';
import tracksuitImg from '../assets/tracksuit-front.png';
import tracksuitBackImg from '../assets/tracksuit-back.png';
import warmupSuitImg from '../assets/warmup-suit-front.png';
import trainingBibImg from '../assets/training-bib-front.png';
import trainingBibBackImg from '../assets/training-bib-back.png';
import teamSocksImg from '../assets/socks.png';
import hockeyKitImg from '../assets/hockey-kit-front.png';
import cyclingKitImg from '../assets/cycling-kit-front.png';
import cyclingKitBackImg from '../assets/cycling-kit-back.png';
import rugbyKitImg from '../assets/rugby-kit-front.png';
import rugbyKitBackImg from '../assets/rugby-kit-back.png';

/**
 * Sport → specific product catalog, each mapped to a KIT_TYPES id so the SVG preview knows what to
 * render. Exported so productShapes.test.js can assert every label here resolves to a deliberate
 * shape — see kitShapes.js's PRODUCT_SHAPES doc comment for why that guard exists.
 */
export const SPORT_KIT_GROUPS = [
  {
    id: 'cricket', label: 'Cricket',
    items: [
      { id: 'cricket-shirt',    label: 'Cricket Shirt',    image: cricketShirtImg,    kitType: 'polo' },
      { id: 'cricket-trousers', label: 'Cricket Trousers', image: cricketTrousersImg, imageBack: cricketTrousersBackImg, kitType: 'shorts' },
      { id: 'cricket-sweater',  label: 'Cricket Sweater',  image: cricketSweaterImg,  kitType: 'jumper' },
      { id: 'cricket-cap',      label: 'Cricket Cap',      image: cricketCapImg,      kitType: 'cap' },
    ],
  },
  {
    id: 'football', label: 'Football',
    items: [
      { id: 'football-jersey', label: 'Football Jersey', image: footballJerseyImg, kitType: 'jersey' },
      { id: 'football-shorts', label: 'Football Shorts', image: footballShortsImg, imageBack: footballShortsBackImg, kitType: 'shorts' },
      { id: 'goalkeeper-kit',  label: 'Goalkeeper Shirt',  image: goalkeeperKitImg,  imageBack: goalkeeperKitBackImg,  kitType: 'jersey' },
      { id: 'training-bib',    label: 'Training Bib',    image: trainingBibImg,    imageBack: trainingBibBackImg,    kitType: 'jersey' },
    ],
  },
  {
    id: 'basketball', label: 'Basketball',
    items: [
      { id: 'basketball-jersey', label: 'Basketball Jersey', image: basketballJerseyImg, imageBack: basketballJerseyBackImg, kitType: 'jersey' },
      { id: 'basketball-shorts', label: 'Basketball Shorts', image: basketballShortsImg, imageBack: basketballShortsBackImg, kitType: 'shorts' },
      { id: 'basketball-headband', label: 'Basketball Headband', image: basketballHeadbandImg, kitType: 'cap' },
      { id: 'warmup-suit',       label: 'Warm-up Suit',      image: warmupSuitImg,       kitType: 'jumper' },
    ],
  },
  {
    id: 'training', label: 'Training',
    items: [
      { id: 'training-tshirt', label: 'Training T-Shirt', image: trainingTShirtImg, kitType: 'jersey' },
      { id: 'training-shorts', label: 'Training Shorts',  image: trainingShortsImg, imageBack: trainingShortsBackImg, kitType: 'shorts' },
      { id: 'training-vest',   label: 'Training Vest',    image: trainingVestImg,   imageBack: trainingVestBackImg,   kitType: 'jersey' },
      { id: 'tracksuit',       label: 'Tracksuit',        image: tracksuitImg,      imageBack: tracksuitBackImg,      kitType: 'jumper' },
    ],
  },
  {
    id: 'others', label: 'Others',
    items: [
      { id: 'team-socks', label: 'Team Socks',     image: teamSocksImg,  kitType: 'socks' },
      { id: 'hockey-kit',  label: 'Hockey Shirt',   image: hockeyKitImg,  kitType: 'jersey' },
      { id: 'cycling-kit', label: 'Cycling Shirt',  image: cyclingKitImg, imageBack: cyclingKitBackImg, kitType: 'jersey' },
      { id: 'rugby-kit',   label: 'Rugby Shirt',    image: rugbyKitImg,   imageBack: rugbyKitBackImg,   kitType: 'jersey' },
    ],
  },
];

function findKitItem(slug) {
  for (const group of SPORT_KIT_GROUPS) {
    const item = group.items.find(it => it.id === slug);
    if (item) return { group, item };
  }
  return null;
}

/**
 * textPosition/numberPosition/nameSize/numberSize/logoPosition/logoScale used to be plain fields
 * on `design`, shared by every garment — nudge the number on a jersey, switch to a headband, and
 * that exact nudge (now safe-area-mapped, but still THAT nudge) carried straight over, because
 * there was only ever one copy of these six fields regardless of which garment was active. Each
 * garment now keeps its own: switching away snapshots the outgoing garment's current values into
 * garmentMemoryRef (keyed below), and switching in either restores what THIS garment had the last
 * time it was active in this session, or — the first time it's ever selected — starts from
 * DEFAULT_DESIGN's values, not whatever the previous garment happened to have.
 *
 * Keyed by kitProduct (the label, e.g. "Basketball Headband"), falling back to kitType when there
 * is no product — the same fallback resolveShapeKey uses, for the same reason: kitProduct is what
 * actually identifies a specific garment, kitType alone only identifies its pricing/shape family.
 */
const GARMENT_TEXT_FIELDS = [
  'textPosition', 'numberPosition', 'nameSize', 'numberSize', 'logoPosition', 'logoScale',
];

function garmentKeyFor(kitType, kitProduct) {
  return kitProduct || kitType;
}

function pickGarmentFields(source) {
  const out = {};
  for (const field of GARMENT_TEXT_FIELDS) out[field] = source[field];
  return out;
}

const TABS = [
  { id: 'kit',    label: 'Kit',    icon: <IconKit /> },
  { id: 'colors', label: 'Colors', icon: <IconPalette /> },
  { id: 'text',   label: 'Text',   icon: <IconText /> },
  { id: 'draw',   label: 'Draw',   icon: <IconDraw /> },
  { id: 'assets', label: 'Assets', icon: <IconTag /> },
  { id: 'layers', label: 'Layers', icon: <IconLayers /> },
];

const TARGET_COLOR_KEY = { body: 'bodyColor', sleeves: 'sleeveColor', number: 'numberColor', collar: 'collarColor' };

const DEFAULT_LAYER_ORDER = [
  { id: 'number',  label: 'Squad Number' },
  { id: 'name',    label: 'Player Name' },
  { id: 'logo',    label: 'Club Logo' },
  { id: 'sleeves', label: 'Sleeve Color' },
  { id: 'body',    label: 'Body Base' },
];

export default function Customize() {
  const [searchParams] = useSearchParams();
  // Coming from a Kits catalog card carries ?kit=<slug> so this opens straight into that kit
  // instead of whatever was last customized. sport comes from the group that owns the item —
  // group ids and the SPORTS enum are the same 5 values, so this is always valid.
  const [design, setDesign, { undo, redo, canUndo, canRedo }] = useHistoryState(() => {
    const stored = loadStoredDesign();
    const match = findKitItem(searchParams.get('kit'));
    if (!match) return stored;
    // `stored`'s text/logo fields belong to whatever garment was last customized — carrying them
    // over unchanged is exactly the bug being fixed, just via a page load instead of a click. If
    // this link lands on the SAME garment that was already active, keep it (nothing to reset). If
    // it's a DIFFERENT garment, start those six fields from DEFAULT_DESIGN instead — a fresh
    // garment gets its true defaults, not the previous garment's customization — then still shrink
    // (never grow) numberSize/logoScale to fit, in case even the defaults overflow this shape.
    const sameGarment = garmentKeyFor(stored.kitType, stored.kitProduct)
      === garmentKeyFor(match.item.kitType, match.item.label);
    const base = sameGarment ? pickGarmentFields(stored) : pickGarmentFields(DEFAULT_DESIGN);
    return {
      ...stored,
      kitType: match.item.kitType, kitProduct: match.item.label, sport: match.group.id,
      ...base,
      numberSize: Math.min(base.numberSize, maxNumberSizeFor(match.item.kitType, match.item.label)),
      logoScale: Math.min(base.logoScale, maxLogoScaleFor(match.item.kitType, match.item.label)),
    };
  });
  const [activeTab, setActiveTab] = useState('kit');
  const [activeTool, setActiveTool] = useState('select');
  const [applyTarget, setApplyTarget] = useState('body');
  // Coming back from the Kit Editor carries ?side=front|back so this reopens on the same side
  // that was just edited, instead of always defaulting to front.
  const [side, setSide] = useState(() => (searchParams.get('side') === 'back' ? 'back' : 'front'));
  const [railHidden, setRailHidden] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  // { text, kind: 'info' | 'error' } or null. The kind decides whether it auto-dismisses — an
  // error the user has to act on must not disappear on its own.
  const [toast, setToast] = useState(null);
  const [dragLayerId, setDragLayerId] = useState(null);
  const previewRef = useRef(null);
  const fileInputRef = useRef(null);
  // Initialised to null (= "last write succeeded") so the first successful autosave on mount is a
  // no-change and does not fire the recovery toast at the user for nothing.
  const lastAutosaveError = useRef(null);
  // Per-garment memory for text/logo position and size (see GARMENT_TEXT_FIELDS above) — a plain
  // ref, not state: writing to it must never itself trigger a render, only the patch() that
  // follows a garment switch should. Session-only by design, same as undo/redo history — it does
  // not need to survive a reload, only a switch away and back within one visit.
  const garmentMemoryRef = useRef({});

  /**
   * ┌─ EVERY GATED ACTION MUST READ THE DESIGN FROM HERE, NOT FROM THE `design` BINDING ──────────┐
   * │                                                                                            │
   * │ gated() hands its `run` callback to AuthContext, which stores it and calls intent.run()     │
   * │ after sign-in. That callback is a closure from the render in which the button was CLICKED.  │
   * │ The auth modal can stay open for a minute, and the user can keep editing behind it — so a   │
   * │ closure over `design` acts on the design as it was BEFORE they signed in, silently          │
   * │ discarding everything they changed while the modal was up.                                  │
   * │                                                                                            │
   * │ This ref is reassigned on every render, so a stale closure still reads what is on screen    │
   * │ now. handleSave and handleAddToCart both use it; anything new that goes through gated()     │
   * │ must too. It is the same class as the stale-response race in Phase 2.5 — there a slow       │
   * │ response overwrote a newer one, here a slow user does.                                     │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  const designRef = useRef(design);
  designRef.current = design;

  /**
   * The local preview, held OUTSIDE `design` on purpose — this is the whole point of the phase.
   *
   * `design` is (a) serialised into localStorage by the autosave effect on every change and (b)
   * tracked by useHistoryState for undo/redo. A blob: URL in there would be persisted as garbage
   * and could be restored by undo *after* it had been revoked, rendering a broken image. Keeping
   * it in separate state makes both impossible by construction rather than by remembering to
   * filter it out.
   *
   * It is a blob: URL (~40 chars), never base64 — the data URL exists only as a local const inside
   * the upload call.
   */
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const uploadSeq = useRef(null);
  if (!uploadSeq.current) uploadSeq.current = createUploadSequencer();
  const panState = useRef({ dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 });
  const navigate = useNavigate();
  const { user, openSignIn } = useAuth();
  const { add: addToCart, maxItems: cartMax } = useCart();

  /**
   * Same rule as designRef, same reason: handleSave runs through gated() and can replay after
   * sign-in, from a closure captured in the click's render — where `user` was still null. Reading
   * `user` directly there would save under a stale (missing) id; userRef.current is reassigned on
   * every render, so a replayed save reads whoever actually ended up signed in.
   */
  const userRef = useRef(user);
  userRef.current = user;

  const selectTool = useCallback((tool, tab) => {
    setActiveTool(tool);
    if (tab) setActiveTab(tab);
  }, []);

  const handlePreviewPointerDown = useCallback((e) => {
    if (activeTool !== 'pan') return;
    panState.current = { dragging: true, startX: e.clientX, startY: e.clientY, originX: panOffset.x, originY: panOffset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [activeTool, panOffset]);

  const handlePreviewPointerMove = useCallback((e) => {
    if (!panState.current.dragging) return;
    const dx = e.clientX - panState.current.startX;
    const dy = e.clientY - panState.current.startY;
    setPanOffset({ x: panState.current.originX + dx, y: panState.current.originY + dy });
  }, []);

  const handlePreviewPointerUp = useCallback((e) => {
    panState.current.dragging = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }, []);

  const resetView = useCallback(() => {
    setPanOffset({ x: 0, y: 0 });
    setZoom(100);
  }, []);

  const showInfo = useCallback((text) => setToast({ text, kind: 'info' }), []);
  const showError = useCallback((text) => setToast({ text, kind: 'error' }), []);
  const dismissToast = useCallback(() => setToast(null), []);

  /**
   * Success toasts still auto-dismiss after 2200ms. Error toasts deliberately do NOT.
   *
   * "Design saved" is worth two seconds. "We can't start checkout until it saves" is not: it
   * explains why a button the user just pressed appeared to do nothing, and if it vanishes before
   * they finish reading, they are left with what looks like a broken button — which throws away
   * most of the value of blocking the navigation in the first place. Errors carry an explicit
   * dismiss instead.
   */
  useEffect(() => {
    if (!toast || toast.kind === 'error') return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  /**
   * Autosave. This runs on EVERY design change — every colour drag, every nudge — so it cannot
   * toast on each failure or the fix becomes its own bug, firing continuously while the user drags
   * a slider. lastAutosaveError holds the previous outcome so the message appears once when
   * saving starts failing, and once more (as a recovery) when it starts working again.
   */
  useEffect(() => {
    const failure = writeStorage(DESIGN_STORAGE_KEY, JSON.stringify(design));

    if (failure !== lastAutosaveError.current) {
      lastAutosaveError.current = failure;
      if (failure) showError(`${STORAGE_MESSAGE[failure]} Your work is not being saved.`);
      else showInfo('Saving again — your design is safe.');
    }
  }, [design, showError, showInfo]);

  // Shows the flattened, drawn-on kit from the Kit Editor (if this side has one) in place of the
  // live SVG preview — so coming "Back" from editing actually shows what was drawn.
  const [editedKitUrl, setEditedKitUrl] = useState(() => loadEditedKitImage(side, resolveShapeKey(design.kitType, design.kitProduct)));

  useEffect(() => {
    setEditedKitUrl(loadEditedKitImage(side, resolveShapeKey(design.kitType, design.kitProduct)));
  }, [side, design.kitType, design.kitProduct]);

  // Arriving from a Kits catalog card (?kit=<slug>) chooses a specific garment, but that path
  // sets state directly instead of going through a mutator, so nothing else clears the frozen
  // snapshot from a previous Kit Editor session. The kitType tag alone wouldn't cover this:
  // switching between two kits that share a kitType (football-jersey -> hockey-kit, both
  // 'jersey') would still replay the old drawing. Mount-only on purpose — re-running when
  // searchParams changes identity would wipe a fresh edit as the editor navigates back.
  useEffect(() => {
    if (!searchParams.get('kit')) return;
    clearEditedKitImage('front');
    clearEditedKitImage('back');
    setEditedKitUrl(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Any further customization (color/text/logo/etc.) invalidates the frozen snapshot for this
  // side — otherwise those changes would silently stop showing up on screen. Called explicitly
  // from each mutator below rather than reactively off `design`, since a "have we run yet" ref
  // guard for that would itself misfire under StrictMode's dev-only double-invoke of effects.
  const invalidateEditedKit = useCallback(() => {
    clearEditedKitImage(side);
    setEditedKitUrl(null);
  }, [side]);

  const patch = useCallback((partial) => {
    setDesign(prev => ({ ...prev, ...partial }));
    invalidateEditedKit();
  }, [setDesign, invalidateEditedKit]);

  /**
   * The kit-picker's onClick used to be a plain patch({ kitType, kitProduct, sport }) — every
   * garment sharing the SAME textPosition/numberPosition/nameSize/numberSize/logoPosition/
   * logoScale fields on `design` meant switching garments carried whatever the previous one had
   * straight over. This snapshots the OUTGOING garment's six fields into garmentMemoryRef before
   * switching, then either restores what the INCOMING garment had the last time it was active in
   * this session, or — first time selected — starts it from DEFAULT_DESIGN, still shrunk (never
   * grown) to fit via maxNumberSizeFor/maxLogoScaleFor in case even the defaults overflow this shape.
   */
  const switchGarment = useCallback((kitType, kitProduct, sport) => {
    const prevKey = garmentKeyFor(design.kitType, design.kitProduct);
    garmentMemoryRef.current[prevKey] = pickGarmentFields(design);

    const newKey = garmentKeyFor(kitType, kitProduct);
    const base = garmentMemoryRef.current[newKey] || pickGarmentFields(DEFAULT_DESIGN);

    patch({
      kitType, kitProduct, sport,
      ...base,
      numberSize: Math.min(base.numberSize, maxNumberSizeFor(kitType, kitProduct)),
      logoScale: Math.min(base.logoScale, maxLogoScaleFor(kitType, kitProduct)),
    });
  }, [design, patch]);

  const patchOpacity = useCallback((target, value) => {
    setDesign(prev => ({ ...prev, opacity: { ...prev.opacity, [target]: value } }));
    invalidateEditedKit();
  }, [setDesign, invalidateEditedKit]);

  const toggleLayer = useCallback((id) => {
    setDesign(prev => ({ ...prev, layers: { ...prev.layers, [id]: !prev.layers[id] } }));
    invalidateEditedKit();
  }, [setDesign, invalidateEditedKit]);

  const reorderLayers = useCallback((fromId, toId) => {
    if (fromId === toId) return;
    setDesign(prev => {
      const order = [...prev.layerOrder];
      const fromIdx = order.indexOf(fromId);
      const toIdx = order.indexOf(toId);
      order.splice(fromIdx, 1);
      order.splice(toIdx, 0, fromId);
      return { ...prev, layerOrder: order };
    });
    invalidateEditedKit();
  }, [setDesign, invalidateEditedKit]);

  const handleSave = useCallback(() => {
    // Via the refs, not `design`/`user` — this runs through gated(), so it can be replayed after
    // sign-in with a closure captured before the modal opened. See the boxed comment above.
    const current = designRef.current;
    const userId = userRef.current?.id;
    // gated() guarantees sign-in before this runs; this is defensive, not the actual guard.
    if (userId == null) return;

    const saved = readSavedDesigns(userId);
    saved.push({ ...current, id: Date.now(), kitTypeLabel: current.kitProduct || KIT_TYPES.find(k => k.id === current.kitType)?.label });

    const failure = writeStorage(savedDesignsKey(userId), JSON.stringify(capSavedDesigns(saved)));

    // INSIDE the outcome check, not unconditionally after it. This previously said "Design saved"
    // even when the write had thrown — not a silent failure but an active false confirmation,
    // which is worse: the user has been told their work is safe when it is gone.
    //
    // "My Designs" now reads the newest entry back (kitShapes.js's loadMostRecentSavedDesign), so
    // the message can finally say so — it could not before, when nothing ever read these back.
    if (failure) showError(STORAGE_MESSAGE[failure]);
    else showInfo('Design saved — open it anytime from My Designs');
    // No `design`/`user` dependency: both are read from refs at call time, so re-creating this
    // callback per change would achieve nothing except a new closure to go stale.
  }, [showError, showInfo]);

  const handleExport = useCallback(() => {
    const svgEl = previewRef.current?.querySelector('svg');
    if (!svgEl) return;
    const data = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([data], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kit-design-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    showInfo('Exported SVG');
  }, []);

  /**
   * REVOCATION LIVES HERE, not in the upload callback.
   *
   * React runs the previous cleanup before re-running the effect AND on unmount, so this one
   * mechanism covers all three cases — replaced, resolved, unmounted. Two properties matter:
   *
   *  - Each render's cleanup closes over ITS OWN logoPreview, so it can never revoke a URL
   *    belonging to a different upload. Revoking manually inside the async handler is exactly the
   *    stale-closure leak this avoids: that closure captures the value from when it started, which
   *    may no longer be the one on screen.
   *  - Cleanup runs AFTER React commits the next render, so the <img> is already pointing at the
   *    new src before the old URL dies. A URL that is still rendering is never revoked.
   */
  useEffect(() => {
    if (!logoPreview) return undefined;
    return () => URL.revokeObjectURL(logoPreview);
  }, [logoPreview]);

  // Declared before handleLogoFile, which lists it as a dependency — the other order is a
  // temporal-dead-zone reference error at render.
  const openFilePicker = useCallback(() => fileInputRef.current?.click(), []);

  const handleLogoFile = useCallback(async (file) => {
    if (!file) return;

    // Shown immediately, so the picture appears as instantly as it did before this phase. Only
    // the confirmation waits on the network.
    setLogoPreview(URL.createObjectURL(file));
    setLogoUploading(true);

    const result = await uploadLogoSequenced({
      sequencer: uploadSeq.current,
      file,
      readAsDataUrl: readFileAsDataUrl,
      post: uploadLogoAsset,
    });

    // Superseded by a newer pick. Touch NOTHING — the newer call owns the preview, the spinner and
    // any message, and its blob URL is already on screen. This upload's URL was revoked by the
    // effect above when setLogoPreview replaced it.
    if (result.stale) return;

    setLogoUploading(false);

    if (!result.ok) {
      setLogoPreview(null);   // triggers revoke; design keeps whatever logo it already had

      if (result.kind === 'unauthorized') {
        // The token expired between the gate and the response. Reopen the picker after sign-in
        // rather than retrying with this File: the modal can sit open for minutes, and re-picking
        // is cheaper than reasoning about whether the handle is still readable.
        openSignIn({ id: 'customize:upload', label: 'upload a logo', run: openFilePicker });
      } else {
        showError(result.message);
      }
      return;
    }

    // Success. On the offline path result.url IS the data URL — deliberately, so the logo is sent
    // inline with the order — and that is the only route by which base64 reaches `design`.
    patch({ logoDataUrl: result.url, logoPreset: null });
    setLogoPreview(null);
    if (result.offline) showError(result.message);
  }, [patch, openSignIn, openFilePicker, showError]);

  // Reads designRef, not `design` — gated action, see the boxed comment where the ref is declared.
  const handleAddToCart = useCallback(() => {
    const current = designRef.current;
    const result = addToCart({ design: current, size: current.size, quantity: 1 });

    if (result.error === 'cart-full') {
      showError(`Your cart is full (${cartMax} designs). Remove one to add another.`);
      return;
    }
    showInfo(result.merged ? 'Added — quantity updated' : 'Added to cart');
  }, [addToCart, cartMax, showError, showInfo]);

  /**
   * Wraps an action so a logged-out user gets the auth modal instead of a silent no-op. The
   * intent is handed to the modal, which resumes it on success and leaves the user on this page.
   */
  const gated = useCallback((id, label, run) => () => {
    if (user) return run();
    openSignIn({ id, label, run });
  }, [user, openSignIn]);

  const guardedSave = gated('customize:save', 'save your design', handleSave);
  const guardedExport = gated('customize:export', 'export your design', handleExport);
  const guardedUpload = gated('customize:upload', 'upload a logo', openFilePicker);
  const guardedAddToCart = gated('customize:add-to-cart', 'add this design to your cart', handleAddToCart);

  const kitLabel = design.kitProduct || KIT_TYPES.find(k => k.id === design.kitType)?.label || 'Jersey';

  return (
    <div className={customizerCls}>
      {/* ── Top toolbar ─────────────────────────────────────── */}
      <div className={topbarCls}>
        <div className={topbarLeftCls}>
          <ToolBtn onClick={() => setRailHidden(v => !v)} title={railHidden ? 'Show tools' : 'Hide tools'}>
            <IconChevronLeft style={{ transform: railHidden ? 'rotate(180deg)' : 'none' }} />
          </ToolBtn>
        </div>

        <div className={topbarCenterCls}>
          <div className={sideToggleCls}>
            <button onClick={() => setSide('front')} className={sideBtnCls(side === 'front')}>Front</button>
            <button onClick={() => setSide('back')} className={sideBtnCls(side === 'back')}>Back</button>
          </div>
        </div>

        <div className={topbarRightCls}>
          <ToolBtn onClick={undo} disabled={!canUndo} title="Undo"><IconUndo /></ToolBtn>
          <ToolBtn onClick={redo} disabled={!canRedo} title="Redo"><IconRedo /></ToolBtn>
          <ToolBtn onClick={guardedSave} title="Save"><IconSave /></ToolBtn>
          <button onClick={guardedExport} className={`btn btn-grey ${exportBtnCls}`}>
            <IconExport /> Export
          </button>
          {/* Synchronous — Phase 2.5 means the design already carries a logo URL, so there is no
              upload to wait on here and no spinner to show. */}
          <button onClick={guardedAddToCart} className={`btn btn-grey ${exportBtnCls}`}>
            Add to Cart
          </button>
        </div>
      </div>

      <div className={bodyCls(railHidden)}>
        {/* ── Left icon rail ──────────────────────────────────── */}
        {!railHidden && (
          <div className={railCls}>
            <ToolBtn active={activeTool === 'select'} onClick={() => selectTool('select', 'kit')} title="Select"><IconSelect /></ToolBtn>
            <ToolBtn active={activeTool === 'pan'} onClick={() => selectTool('pan')} title="Pan"><IconPan /></ToolBtn>
            <ToolBtn onClick={() => navigate(`/kit-editor?side=${side}`)} title="Draw"><IconDraw /></ToolBtn>
            <ToolBtn active={activeTool === 'text'} onClick={() => selectTool('text', 'text')} title="Text"><IconText /></ToolBtn>
            <ToolBtn active={activeTool === 'layers'} onClick={() => selectTool('layers', 'layers')} title="Layers"><IconLayers /></ToolBtn>
          </div>
        )}

        {/* ── Canvas ──────────────────────────────────────────── */}
        <main className={canvasCls}>
          <div className={canvasCardCls}>
            <div
              className={previewWrapCls(activeTool)}
              ref={previewRef}
              onPointerDown={handlePreviewPointerDown}
              onPointerMove={handlePreviewPointerMove}
              onPointerUp={handlePreviewPointerUp}
              onDoubleClick={resetView}
            >
              <div
                className={previewKitCls(activeTool === 'pan')}
                style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom / 100})` }}
              >
                {editedKitUrl ? (
                  <img src={editedKitUrl} alt="Your edited kit" className={previewKitImgCls} />
                ) : (
                  <KitPreview
                    kitType={design.kitType}
                    kitProduct={design.kitProduct}
                    bodyColor={design.bodyColor}
                    sleeveColor={design.sleeveColor}
                    numberColor={design.numberColor}
                    collarColor={design.collarColor}
                    opacity={design.opacity}
                    template={design.template}
                    playerName={design.playerName}
                    playerNumber={design.playerNumber}
                    font={design.font}
                    nameSize={design.nameSize}
                    numberSize={design.numberSize}
                    textPosition={design.textPosition}
                    numberPosition={design.numberPosition}
                    /* Preview wins while an upload is in flight, so the kit shows the new logo
                       immediately instead of the previous one until the round trip finishes. */
                    logoDataUrl={logoPreview ?? design.logoDataUrl}
                    logoPreset={design.logoPreset}
                    logoScale={design.logoScale}
                    logoOpacity={design.logoOpacity}
                    logoPosition={design.logoPosition}
                    side={side}
                    layers={design.layers}
                  />
                )}
              </div>
            </div>

            <div className={zoomCls}>
              <button className={zoomBtnCls} onClick={() => setZoom(z => Math.max(50, z - 10))} aria-label="Zoom out"><IconMinus /></button>
              <span className={zoomSpanCls}>{zoom}%</span>
              <button className={zoomBtnCls} onClick={() => setZoom(z => Math.min(150, z + 10))} aria-label="Zoom in"><IconPlus /></button>
            </div>
          </div>

          <div className={infoBarCls}>
            <span><strong className="text-onsurface-300">Kit:</strong> {kitLabel}</span>
            <span><strong className="text-onsurface-300">Sport:</strong> {SPORTS.find(s => s.id === design.sport)?.label}</span>
            <span><strong className="text-onsurface-300">Template:</strong> {DESIGN_TEMPLATES.find(t => t.id === design.template)?.name}</span>
            <span><strong className="text-onsurface-300">Size:</strong> {design.size === 'Custom' && design.customSize ? `${design.customSize} ${design.customSizeUnit}` : design.size}</span>
            <span className={colorSwatchCls} style={{ background: design.bodyColor }} title={`Body: ${design.bodyColor}`} />
            <span className={colorSwatchCls} style={{ background: design.sleeveColor }} title={`Sleeves: ${design.sleeveColor}`} />
          </div>
        </main>

        {/* ── Right panel ─────────────────────────────────────── */}
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
            {activeTab === 'kit' && (
              <KitPanel design={design} patch={patch} switchGarment={switchGarment} initialKitSlug={searchParams.get('kit')} side={side} />
            )}

            {activeTab === 'colors' && (
              <ColorsPanel
                design={design} applyTarget={applyTarget} setApplyTarget={setApplyTarget}
                onColor={(hex) => patch({ [TARGET_COLOR_KEY[applyTarget]]: hex })}
                onOpacity={(v) => patchOpacity(applyTarget, v)}
              />
            )}

            {activeTab === 'text' && (
              <TextPanel design={design} patch={patch} side={side} setSide={setSide} />
            )}

            {activeTab === 'draw' && <DrawPanel side={side} />}

            {activeTab === 'assets' && (
              <AssetsPanel
                design={design} patch={patch}
                logoPreview={logoPreview} uploading={logoUploading}
                fileInputRef={fileInputRef}
                onUploadClick={guardedUpload}
                onFile={handleLogoFile}
              />
            )}

            {activeTab === 'layers' && (
              <LayersPanel
                design={design}
                toggleLayer={toggleLayer}
                reorderLayers={reorderLayers}
                dragLayerId={dragLayerId}
                setDragLayerId={setDragLayerId}
              />
            )}
          </div>
        </aside>
      </div>

      {toast && (
        <div className={toast.kind === 'error' ? toastErrorCls : toastCls} role={toast.kind === 'error' ? 'alert' : 'status'}>
          <span>{toast.text}</span>
          {/* Errors do not auto-dismiss, so they need a way out. Success toasts time out on
              their own and adding a button to those would be noise. */}
          {toast.kind === 'error' && (
            <button type="button" onClick={dismissToast} className={toastDismissCls} aria-label="Dismiss">×</button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Small reusable toolbar button ─────────────────────────── */
function ToolBtn({ active, disabled, onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={iconBtnCls(active)}
    >
      {children}
    </button>
  );
}

/* ── Kit Panel (Kit Type / Sport / Templates) ──────────────── */
/* ── Custom dropdown for size units — avoids the browser's native blue option highlight ── */
function UnitDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = SIZE_UNITS.find(u => u.id === value);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div className={unitDropdownCls} ref={ref}>
      <button type="button" className={unitDropdownBtnCls} onClick={() => setOpen(v => !v)}>
        {current?.label}
        <IconChevronLeft style={{ transform: 'rotate(-90deg)', width: 12, height: 12 }} />
      </button>
      {open && (
        <ul className={unitDropdownListCls}>
          {SIZE_UNITS.map(u => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => { onChange(u.id); setOpen(false); }}
                className={unitDropdownItemCls(u.id === value)}
              >
                {u.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KitPanel({ design, patch, switchGarment, initialKitSlug, side }) {
  const [expandedSport, setExpandedSport] = useState(() => findKitItem(initialKitSlug)?.group.id ?? null);
  const activeGroup = SPORT_KIT_GROUPS.find(g => g.id === expandedSport);
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const visibleTemplates = showAllTemplates ? DESIGN_TEMPLATES : DESIGN_TEMPLATES.slice(0, 4);

  return (
    <div className={panelBoxCls}>
      <div className={sectionCls({ first: true, noBorder: true })}>
        <h3 className={labelCls}>Kit Type</h3>

        {!activeGroup ? (
          <div className={sportGridCls}>
            {SPORT_KIT_GROUPS.map(g => (
              <button
                key={g.id}
                onClick={() => setExpandedSport(g.id)}
                className={sportBtnCls}
              >
                {g.label}
              </button>
            ))}
          </div>
        ) : (
          <>
            <button className={sportBackCls} onClick={() => setExpandedSport(null)}>
              ← {activeGroup.label}
            </button>
            <div className={kitGridCls}>
              {activeGroup.items.map(item => (
                <button
                  key={item.id}
                  onClick={() => switchGarment(item.kitType, item.label, activeGroup.id)}
                  className={kitBtnCls(design.kitProduct === item.label)}
                >
                  <img src={side === 'back' && item.imageBack ? item.imageBack : item.image} alt={item.label} className={kitThumbCls} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className={sectionCls({ noBorder: true, afterNoBorder: true })}>
        <h3 className={labelCls}>Templates</h3>
        <div className={templateGridCls}>
          {visibleTemplates.map(t => (
            <button
              key={t.id}
              onClick={() => patch({ template: t.id })}
              className={templateBtnCls(design.template === t.id)}
            >
              <TemplateThumb id={t.id} base={design.bodyColor} accent={design.sleeveColor} />
              <span>{t.name}</span>
            </button>
          ))}
        </div>
        {DESIGN_TEMPLATES.length > 4 && (
          <button className={moreBtnCls} onClick={() => setShowAllTemplates(v => !v)}>
            {showAllTemplates ? 'Show less' : 'More'}
          </button>
        )}
      </div>

      <div className={sectionCls({ last: true, afterNoBorder: true })}>
        <h3 className={labelCls}>Size</h3>
        <div className={sizeGridCls}>
          {SIZES.map(s => (
            <button
              key={s}
              onClick={() => patch({ size: s })}
              className={sizeBtnCls(design.size === s)}
            >
              {s}
            </button>
          ))}
        </div>
        {design.size === 'Custom' && (
          <>
            <div className={customSizeRowCls}>
              <input
                type="text"
                className={`${inputCls} ${customSizeInputCls}`}
                placeholder="e.g. 44 chest, or your own measurement"
                value={design.customSize}
                onChange={e => patch({ customSize: e.target.value })}
              />
              <UnitDropdown value={design.customSizeUnit} onChange={u => patch({ customSizeUnit: u })} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TemplateThumb({ id, base = '#CC0000', accent = '#1a1a1a' }) {
  const acc = accent;
  return (
    <svg viewBox="0 0 60 70" className={templateThumbCls}>
      <defs>
        <linearGradient id="thumb-fade-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={acc} stopOpacity="0" />
          <stop offset="100%" stopColor={acc} stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id="thumb-fade-left-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={acc} stopOpacity="0.85" />
          <stop offset="100%" stopColor={acc} stopOpacity="0" />
        </linearGradient>
        <pattern id="thumb-striped" width="6.5" height="60" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="2.7" height="60" fill={acc} opacity="0.8" />
        </pattern>
        <pattern id="thumb-hoops" width="50" height="6.5" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="50" height="2.7" fill={acc} opacity="0.8" />
        </pattern>
      </defs>
      <clipPath id="thumb-clip"><rect x="5" y="5" width="50" height="60" rx="4" /></clipPath>
      <rect x="5" y="5" width="50" height="60" rx="4" fill={base} />
      <g clipPath="url(#thumb-clip)">
        {id === 'two-tone' && <><rect x="5" y="5" width="13" height="60" fill={acc} opacity="0.85" /><rect x="42" y="5" width="13" height="60" fill={acc} opacity="0.85" /></>}
        {id === 'striped' && <rect x="5" y="5" width="50" height="60" fill="url(#thumb-striped)" />}
        {id === 'diagonal' && <path d="M 5,65 L 55,5 L 55,65 Z" fill={acc} opacity="0.55" />}
        {id === 'hoops' && <rect x="5" y="5" width="50" height="60" fill="url(#thumb-hoops)" />}
        {id === 'halves' && <rect x="30" y="5" width="25" height="60" fill={acc} opacity="0.85" />}
        {id === 'chevron' && <path d="M 30,20 L 45,50 L 37,50 L 30,36 L 23,50 L 15,50 Z" fill={acc} opacity="0.65" />}
        {id === 'sash' && <path d="M 3,20 L 15,4 L 57,50 L 45,66 Z" fill={acc} opacity="0.75" />}
        {id === 'fade' && <rect x="5" y="5" width="50" height="60" fill="url(#thumb-fade-grad)" />}
        {id === 'fade-left' && <rect x="5" y="5" width="50" height="60" fill="url(#thumb-fade-left-grad)" />}
        {id === 'dots' && [[16,20],[30,14],[44,20],[16,34],[30,28],[44,34],[16,48],[30,42],[44,48],[30,56]].map(([cx,cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.4" fill={acc} opacity="0.85" />
        ))}
        {id === 'sleeves' && <>
          <path d="M 5,9.8 L 20,5.6 L 22.5,18.2 L 13.5,26 L 5,23 Z" fill={acc} opacity="0.9" />
          <path d="M 55,9.8 L 40,5.6 L 37.5,18.2 L 46.5,26 L 55,23 Z" fill={acc} opacity="0.9" />
        </>}
      </g>
    </svg>
  );
}

/* ── Colors Panel (Kit Colors) ──────────────────────────────── */
function ColorsPanel({ design, applyTarget, setApplyTarget, onColor, onOpacity }) {
  const currentHex = design[TARGET_COLOR_KEY[applyTarget]];
  const currentOpacity = design.opacity[applyTarget] ?? 100;
  const targetLabel = APPLY_TARGETS.find(t => t.id === applyTarget)?.label;
  const presetName = COLOR_PALETTE.find(c => c.hex.toLowerCase() === currentHex?.toLowerCase())?.name || 'Custom';

  return (
    <div className={panelBoxCls}>
      <div className={sectionCls({ first: true })}>
        <h3 className={labelCls}>Apply To</h3>
        <div className={segmentedCls}>
          {APPLY_TARGETS.map(t => (
            <button
              key={t.id}
              onClick={() => setApplyTarget(t.id)}
              className={segmentCls(applyTarget === t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className={sectionCls()}>
        <div className={colorPreviewCls}>
          <span className={colorPreviewSwatchCls} style={{ background: currentHex }} />
          <div>
            <div className={colorPreviewTitleCls}>{targetLabel} — {presetName}</div>
            <div className={colorPreviewHexCls}>{currentHex?.toUpperCase()}</div>
          </div>
        </div>
      </div>

      <div className={sectionCls()}>
        <h3 className={labelCls}>Preset Colors</h3>
        <div className={paletteCls}>
          {COLOR_PALETTE.map(c => (
            <button
              key={c.hex}
              onClick={() => onColor(c.hex)}
              className={swatchCls(currentHex?.toLowerCase() === c.hex.toLowerCase())}
              style={{ background: c.hex, border: c.hex === '#FFFFFF' ? '1px solid var(--color-swatch-outline)' : 'none' }}
              title={c.name}
              aria-label={c.name}
            />
          ))}
        </div>
      </div>

      <div className={sectionCls()}>
        <h3 className={labelCls}>Custom Color</h3>
        <ColorPicker value={currentHex} onChange={onColor} />
      </div>

      <div className={sectionCls({ last: true })}>
        <h3 className={labelCls}>Opacity</h3>
        <div className={sliderRowCls}>
          <input
            type="range" min="0" max="100" value={currentOpacity}
            onChange={e => onOpacity(Number(e.target.value))}
            className={sliderCls}
          />
          <span className={sliderValueCls}>{currentOpacity}%</span>
        </div>
      </div>
    </div>
  );
}

/* ── Text Panel ─────────────────────────────────────────────── */
function TextPanel({ design, patch, side, setSide }) {
  const [showAllFonts, setShowAllFonts] = useState(false);
  const visibleFonts = showAllFonts ? FONTS : FONTS.slice(0, 4);

  return (
    <div className={panelBoxCls}>
      <div className={sectionCls({ first: true })}>
        <h3 className={labelCls}>Editing Side</h3>
        <div className={segmentedCls}>
          <button
            onClick={() => setSide('front')}
            className={segmentCls(side === 'front')}
          >
            Front
          </button>
          <button
            onClick={() => setSide('back')}
            className={segmentCls(side === 'back')}
          >
            Back
          </button>
        </div>
      </div>

      <div className={sectionCls()}>
        <h3 className={labelCls}>Player Name</h3>
        <input
          type="text" className={inputCls} placeholder="e.g. RASHFORD" maxLength={18}
          value={design.playerName[side]}
          onChange={e => patch({ playerName: { ...design.playerName, [side]: e.target.value } })}
        />
      </div>

      <div className={sectionCls()}>
        <h3 className={labelCls}>Squad Number</h3>
        <input
          type="text" className={inputCls} placeholder="e.g. 7" maxLength={3}
          value={design.playerNumber[side]}
          onChange={e => patch({ playerNumber: { ...design.playerNumber, [side]: e.target.value.replace(/\D/g, '') } })}
        />
      </div>

      <div className={sectionCls({ noBorder: true })}>
        <h3 className={labelCls}>Font Style</h3>
        <div className={fontGridCls}>
          {visibleFonts.map(f => (
            <button
              key={f.id}
              onClick={() => patch({ font: f.id })}
              className={fontBtnCls(design.font === f.id)}
              style={{ fontFamily: f.id }}
            >
              Aa <span className={fontBtnSpanCls}>{f.label}</span>
            </button>
          ))}
        </div>
        {FONTS.length > 4 && (
          <button className={moreBtnCls} onClick={() => setShowAllFonts(v => !v)}>
            {showAllFonts ? 'Show less' : 'More'}
          </button>
        )}
      </div>

      <div className={sectionCls({ afterNoBorder: true })}>
        <h3 className={labelCls}>Text Size</h3>
        <SliderRow label="Name" value={design.nameSize} min={8} max={30} onChange={v => patch({ nameSize: v })} />
        <SliderRow label="Number" value={design.numberSize} min={NUMBER_SIZE_MIN} max={80} onChange={v => patch({ numberSize: v })} />
      </div>

      <div className={sectionCls({ last: true })}>
        <h3 className={labelCls}>Position</h3>
        <div className={posRowCls}>
          <div className={posColCls}>
            <span className={posColLabelCls}>Name</span>
            <PositionGrid value={design.textPosition[side]} onChange={v => patch({ textPosition: { ...design.textPosition, [side]: v } })} />
          </div>
          <div className={posColCls}>
            <span className={posColLabelCls}>Number</span>
            <PositionGrid value={design.numberPosition[side]} onChange={v => patch({ numberPosition: { ...design.numberPosition, [side]: v } })} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SliderRow({ label, value, min, max, onChange }) {
  return (
    <div className={`${sliderRowCls} ${sliderRowLabeledCls}`}>
      <span className={sliderLabelCls}>{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} className={sliderCls} />
      <span className={sliderValueCls}>{value}</span>
    </div>
  );
}

const POSITION_STEP = 0.035;
const POSITION_BOUNDS = { xMin: 0.15, xMax: 0.85, yMin: 0.12, yMax: 0.88 };

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function PositionGrid({ value, onChange }) {
  return (
    <div className={posGridCls}>
      {POSITIONS.map(p => {
        const dx = p.col - 1;
        const dy = p.row - 1;
        const isCenter = dx === 0 && dy === 0;
        return (
          <button
            key={p.id}
            onClick={() => {
              if (isCenter) { onChange({ x: 0.5, y: 0.5 }); return; }
              onChange({
                x: clamp(value.x + dx * POSITION_STEP, POSITION_BOUNDS.xMin, POSITION_BOUNDS.xMax),
                y: clamp(value.y + dy * POSITION_STEP, POSITION_BOUNDS.yMin, POSITION_BOUNDS.yMax),
              });
            }}
            className={posBtnCls}
            title={isCenter ? 'Center' : `Nudge ${p.id}`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Draw Panel — launches the full Fabric.js kit editor ───────── */
function DrawPanel({ side }) {
  return (
    <div className={panelBoxCls}>
      <div className={sectionCls({ first: true, last: true })}>
        <Link to={`/kit-editor?side=${side}`} className={`btn btn-grey ${drawStudioLinkCls}`}>
          Open kit editor →
        </Link>
      </div>
    </div>
  );
}

/* ── Assets Panel ───────────────────────────────────────────── */
function AssetsPanel({ design, patch, logoPreview, uploading, fileInputRef, onFile, onUploadClick }) {
  const [dragOver, setDragOver] = useState(false);

  // The in-flight preview takes precedence over the stored logo, so the panel and the kit agree.
  const shownLogo = logoPreview ?? design.logoDataUrl;

  return (
    <div className={panelBoxCls}>
      <div className={sectionCls({ first: true })}>
        <h3 className={labelCls}>Upload Logo / Badge</h3>
        <div
          className={dropzoneCls(dragOver)}
          onClick={uploading ? undefined : onUploadClick}
          onDragOver={e => { e.preventDefault(); if (!uploading) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); if (!uploading) onFile(e.dataTransfer.files?.[0]); }}
        >
          {shownLogo ? (
            <img src={shownLogo} alt="Uploaded logo" className={dropzonePreviewCls} />
          ) : (
            <>
              <IconUpload />
              <p className="text-[12px] font-semibold">Click to upload or drag &amp; drop</p>
              {/* SVG is deliberately absent: the server rejects it because SVG is XML and can
                  carry scripts, so offering it only invites a choice that cannot succeed. */}
              <span className="text-[10px] text-onsurface-600">PNG, JPG, WebP · Max 5MB</span>
            </>
          )}
          {uploading && (
            <span className="absolute inset-0 grid place-items-center bg-black/55 text-white text-[11px] font-bold rounded-[inherit]">
              Uploading…
            </span>
          )}
          <input
            ref={fileInputRef} type="file" accept={ACCEPTED_LOGO_TYPES} hidden disabled={uploading}
            onChange={e => onFile(e.target.files?.[0])}
          />
        </div>
        {design.logoDataUrl && !uploading && (
          <button className={linkBtnCls} onClick={() => patch({ logoDataUrl: null })}>Remove logo</button>
        )}
      </div>

      <div className={sectionCls()}>
        <h3 className={labelCls}>Badge Presets</h3>
        <div className={pillRowCls}>
          {BADGE_PRESETS.map(b => (
            <button
              key={b.id}
              onClick={() => patch({ logoPreset: b.id, logoDataUrl: null })}
              className={badgeBtnCls(design.logoPreset === b.id && !design.logoDataUrl)}
              title={b.label}
            >
              <img src={b.image} alt={b.label} className={badgeThumbCls} />
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div className={sectionCls()}>
        <h3 className={labelCls}>Logo Size</h3>
        <SliderRow label="Scale" value={design.logoScale} min={30} max={150} onChange={v => patch({ logoScale: v })} />
        <SliderRow label="Opacity" value={design.logoOpacity} min={0} max={100} onChange={v => patch({ logoOpacity: v })} />
      </div>

      <div className={sectionCls({ last: true })}>
        <h3 className={labelCls}>Logo Position</h3>
        <PositionGrid value={design.logoPosition} onChange={v => patch({ logoPosition: v })} />
      </div>
    </div>
  );
}

/* ── Layers Panel ───────────────────────────────────────────── */
function LayersPanel({ design, toggleLayer, reorderLayers, dragLayerId, setDragLayerId }) {
  return (
    <div className={panelBoxCls}>
      <div className={sectionCls({ first: true })}>
        <h3 className={labelCls}>Layer Stack</h3>
        <div className={layerListCls}>
          {design.layerOrder.map(id => {
            const meta = DEFAULT_LAYER_ORDER.find(l => l.id === id);
            const visible = design.layers[id];
            return (
              <div
                key={id}
                className={layerRowCls(dragLayerId === id)}
                draggable
                onDragStart={() => setDragLayerId(id)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => { reorderLayers(dragLayerId, id); setDragLayerId(null); }}
                onDragEnd={() => setDragLayerId(null)}
              >
                <span className={layerGripCls}><IconGrip /></span>
                <span className={layerNameCls(!visible)}>{meta?.label}</span>
                <button className={layerEyeCls} onClick={() => toggleLayer(id)} aria-label={`Toggle ${meta?.label}`}>
                  {visible ? <IconEye /> : <IconEyeOff />}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className={sectionCls({ last: true })}>
        <h3 className={labelCls}>Design State</h3>
        <div className={stateBoxCls}>
          <StateRow label="Kit" value={design.kitProduct || KIT_TYPES.find(k => k.id === design.kitType)?.label} />
          <StateRow label="Sport" value={SPORTS.find(s => s.id === design.sport)?.label} />
          <StateRow label="Template" value={DESIGN_TEMPLATES.find(t => t.id === design.template)?.name} />
          <StateRow label="Body" value={design.bodyColor} swatch={design.bodyColor} />
          <StateRow label="Sleeves" value={design.sleeveColor} swatch={design.sleeveColor} />
          <StateRow label="Number" value={design.numberColor} swatch={design.numberColor} />
        </div>
      </div>
    </div>
  );
}

function StateRow({ label, value, swatch }) {
  return (
    <div className={stateRowCls}>
      <span className={stateRowLabelCls}>{label}</span>
      <span className={stateValueCls}>
        {swatch && <i className={stateSwatchCls} style={{ background: swatch }} />}
        {value}
      </span>
    </div>
  );
}
