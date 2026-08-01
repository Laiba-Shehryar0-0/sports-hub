import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import KitPreview from '../customize/KitPreview';
import useHistoryState from '../hooks/useHistoryState';
import {
  KIT_TYPES, SPORTS, SIZES, SIZE_UNITS, COLOR_PALETTE, APPLY_TARGETS,
  FONTS, DESIGN_TEMPLATES, BADGE_PRESETS, POSITIONS,
  DESIGN_STORAGE_KEY, SAVED_DESIGNS_KEY, loadStoredDesign,
  loadEditedKitImage, clearEditedKitImage,
} from '../customize/kitShapes';
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
import boxingKitImg from '../assets/boxing-kit.png';
import hockeyKitImg from '../assets/hockey-kit-front.png';
import cyclingKitImg from '../assets/cycling-kit-front.png';
import cyclingKitBackImg from '../assets/cycling-kit-back.png';
import rugbyKitImg from '../assets/rugby-kit-front.png';
import rugbyKitBackImg from '../assets/rugby-kit-back.png';

/** Sport → specific product catalog, each mapped to a KIT_TYPES id so the SVG preview knows what to render */
const SPORT_KIT_GROUPS = [
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
      { id: 'goalkeeper-kit',  label: 'Goalkeeper Kit',  image: goalkeeperKitImg,  imageBack: goalkeeperKitBackImg,  kitType: 'jersey' },
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
      { id: 'boxing-kit',  label: 'Boxing Kit',  image: boxingKitImg,  kitType: 'shorts' },
      { id: 'hockey-kit',  label: 'Hockey Kit',  image: hockeyKitImg,  kitType: 'jersey' },
      { id: 'cycling-kit', label: 'Cycling Kit', image: cyclingKitImg, imageBack: cyclingKitBackImg, kitType: 'jersey' },
      { id: 'rugby-kit',   label: 'Rugby Kit',   image: rugbyKitImg,   imageBack: rugbyKitBackImg,   kitType: 'jersey' },
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
  // instead of whatever was last customized.
  const [design, setDesign, { undo, redo, canUndo, canRedo }] = useHistoryState(() => {
    const stored = loadStoredDesign();
    const match = findKitItem(searchParams.get('kit'));
    return match ? { ...stored, kitType: match.item.kitType, kitProduct: match.item.label } : stored;
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
  const [toast, setToast] = useState('');
  const [dragLayerId, setDragLayerId] = useState(null);
  const previewRef = useRef(null);
  const fileInputRef = useRef(null);
  const panState = useRef({ dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 });
  const navigate = useNavigate();

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

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    try { localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify(design)); } catch { /* storage unavailable */ }
  }, [design]);

  // Shows the flattened, drawn-on kit from the Kit Editor (if this side has one) in place of the
  // live SVG preview — so coming "Back" from editing actually shows what was drawn.
  const [editedKitUrl, setEditedKitUrl] = useState(() => loadEditedKitImage(side));

  useEffect(() => {
    setEditedKitUrl(loadEditedKitImage(side));
  }, [side]);

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
    try {
      const saved = JSON.parse(localStorage.getItem(SAVED_DESIGNS_KEY) || '[]');
      saved.push({ ...design, id: Date.now(), kitTypeLabel: design.kitProduct || KIT_TYPES.find(k => k.id === design.kitType)?.label });
      localStorage.setItem(SAVED_DESIGNS_KEY, JSON.stringify(saved));
    } catch { /* storage unavailable — ignore */ }
    setToast('Design saved');
  }, [design]);

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
    setToast('Exported SVG');
  }, []);

  const handleLogoFile = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => patch({ logoDataUrl: reader.result, logoPreset: null });
    reader.readAsDataURL(file);
  }, [patch]);

  const handlePlaceOrder = useCallback(() => {
    try { localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify(design)); } catch { /* storage unavailable */ }
    navigate('/checkout');
  }, [design, navigate]);

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
          <ToolBtn onClick={handleSave} title="Save"><IconSave /></ToolBtn>
          <button onClick={handleExport} className={`btn btn-grey ${exportBtnCls}`}>
            <IconExport /> Export
          </button>
          <button onClick={handlePlaceOrder} className={`btn btn-darkred ${exportBtnCls}`}>
            Place Order
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
                    logoDataUrl={design.logoDataUrl}
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
              <KitPanel design={design} patch={patch} initialKitSlug={searchParams.get('kit')} side={side} />
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
                fileInputRef={fileInputRef}
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

      {toast && <div className={toastCls}>{toast}</div>}
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

function KitPanel({ design, patch, initialKitSlug, side }) {
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
                  onClick={() => patch({ kitType: item.kitType, kitProduct: item.label })}
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
        <SliderRow label="Number" value={design.numberSize} min={20} max={80} onChange={v => patch({ numberSize: v })} />
      </div>

      <div className={sectionCls({ last: true })}>
        <h3 className={labelCls}>Position</h3>
        <div className={posRowCls}>
          <div className={posColCls}>
            <span className={posColLabelCls}>Name</span>
            <PositionGrid value={design.textPosition} onChange={v => patch({ textPosition: v })} />
          </div>
          <div className={posColCls}>
            <span className={posColLabelCls}>Number</span>
            <PositionGrid value={design.numberPosition} onChange={v => patch({ numberPosition: v })} />
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
function AssetsPanel({ design, patch, fileInputRef, onFile }) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className={panelBoxCls}>
      <div className={sectionCls({ first: true })}>
        <h3 className={labelCls}>Upload Logo / Badge</h3>
        <div
          className={dropzoneCls(dragOver)}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); onFile(e.dataTransfer.files?.[0]); }}
        >
          {design.logoDataUrl ? (
            <img src={design.logoDataUrl} alt="Uploaded logo" className={dropzonePreviewCls} />
          ) : (
            <>
              <IconUpload />
              <p className="text-[12px] font-semibold">Click to upload or drag &amp; drop</p>
              <span className="text-[10px] text-onsurface-600">PNG, SVG, JPG · Max 5MB</span>
            </>
          )}
          <input
            ref={fileInputRef} type="file" accept=".png,.svg,.jpg,.jpeg" hidden
            onChange={e => onFile(e.target.files?.[0])}
          />
        </div>
        {design.logoDataUrl && (
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
