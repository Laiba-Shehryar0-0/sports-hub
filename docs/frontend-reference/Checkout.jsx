import { useState, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import KitPreview from '../customize/KitPreview';
import { required, validateFields } from '../utils/validation';
import { placeOrder } from '../api/ordersService';
import {
  KIT_TYPES, SPORTS, SIZES, DESIGN_TEMPLATES, BASE_PRICES,
  DELIVERY_METHODS, QUANTITY_PRESETS, PAYMENT_METHODS, loadStoredDesign, loadEditedKitImage,
} from '../customize/kitShapes';
import {
  IconChevronLeft, IconLock, IconTruck, IconCard, IconBank, IconCash,
  IconShield, IconCheck, IconMinus, IconPlus,
} from '../customize/icons';

const inputCls = 'bg-surface-600 border border-line text-onsurface-100 py-[10px] px-4 text-[0.9rem] outline-none w-full rounded-sm transition-[border-color_150ms_ease] focus:border-gold placeholder:text-onsurface-700';
const fieldLabelCls = 'text-[11px] font-bold tracking-[0.8px] uppercase text-onsurface-600';

const STEPS = [
  { id: 1, label: 'Design',    status: 'Completed' },
  { id: 2, label: 'Order',     status: 'In Progress' },
  { id: 3, label: 'Delivered', status: 'Est. 7–14 days' },
];

const PROMO_CODES = { SAVE10: 0.1, HUB15: 0.15 };

function formatPKR(n) {
  return `PKR ${Math.round(n).toLocaleString('en-US')}`;
}

export default function Checkout() {
  const [design] = useState(loadStoredDesign);
  const [editedKit] = useState(() => loadEditedKitImage('front'));
  const navigate = useNavigate();

  const [totalKits, setTotalKits] = useState(11);
  const [primarySize, setPrimarySize] = useState(design.size || 'M');
  const [instructions, setInstructions] = useState('');

  const [contact, setContact] = useState({ firstName: '', lastName: '', email: '', phone: '', clubName: '' });
  const [address, setAddress] = useState({ street: '', city: '', province: '', postalCode: '', country: 'Pakistan' });

  const [deliveryId, setDeliveryId] = useState('express');
  const [paymentId, setPaymentId] = useState('card');
  const [card, setCard] = useState({ number: '', expiry: '', cvv: '', name: '' });

  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(null);
  const [promoError, setPromoError] = useState('');

  const [errors, setErrors] = useState({});
  const [placed, setPlaced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!placed) return;
    const t = setTimeout(() => setPlaced(false), 3200);
    return () => clearTimeout(t);
  }, [placed]);

  const kitLabel = KIT_TYPES.find(k => k.id === design.kitType)?.label || 'Jersey';
  const templateName = DESIGN_TEMPLATES.find(t => t.id === design.template)?.name || 'Solid';
  const sportLabel = SPORTS.find(s => s.id === design.sport)?.label || 'Football';
  const sizeDisplay = design.size === 'Custom' && design.customSize
    ? `${design.customSize} ${design.customSizeUnit || 'in'}`
    : design.size;
  const unitPrice = BASE_PRICES[design.kitType] ?? 2800;
  const delivery = DELIVERY_METHODS.find(d => d.id === deliveryId) ?? DELIVERY_METHODS[0];

  const kitPrice = unitPrice * totalKits;
  const discount = promoApplied ? Math.round(kitPrice * promoApplied) : 0;
  const total = kitPrice + delivery.price - discount;

  const setField = (setter) => (key, value) => setter(prev => ({ ...prev, [key]: value }));
  const setContactField = setField(setContact);
  const setAddressField = setField(setAddress);
  const setCardField = setField(setCard);

  const applyPromo = useCallback(() => {
    const code = promoCode.trim().toUpperCase();
    if (PROMO_CODES[code]) {
      setPromoApplied(PROMO_CODES[code]);
      setPromoError('');
    } else {
      setPromoApplied(null);
      setPromoError('Invalid or expired code');
    }
  }, [promoCode]);

  const handlePlaceOrder = useCallback(async () => {
    const values = {
      firstName: contact.firstName, lastName: contact.lastName,
      email: contact.email, phone: contact.phone,
      street: address.street, city: address.city,
      cardNumber: card.number, cardExpiry: card.expiry, cardCvv: card.cvv, cardName: card.name,
    };
    const schema = {
      firstName: [required()], lastName: [required()],
      email: [required()], phone: [required()],
      street: [required()], city: [required()],
    };
    if (paymentId === 'card') {
      schema.cardNumber = [required()];
      schema.cardExpiry = [required()];
      schema.cardCvv = [required()];
      schema.cardName = [required()];
    }
    const nextErrors = validateFields(values, schema);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      document.querySelector('[data-field-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      await placeOrder({
        design, contact, address, deliveryId, paymentId,
        totalKits, primarySize, instructions,
        pricing: {
          kitLabel, templateName, sportLabel, unitPrice, kitPrice,
          deliveryName: delivery.name, deliveryPrice: delivery.price,
          discount, promoApplied, total,
        },
      });
      setPlaced(true);
    } catch (err) {
      setSubmitError(err.message || 'Could not place your order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [design, contact, address, paymentId, card, deliveryId, totalKits, primarySize, instructions,
      kitLabel, templateName, sportLabel, unitPrice, kitPrice, delivery, discount, promoApplied, total]);

  return (
    <div className="min-h-[calc(100vh-72px)] mt-[72px] bg-surface-800 pb-16">
      <div className="flex items-center justify-between py-4 px-6 bg-surface-900 border-b border-line max-[640px]:py-3 max-[640px]:px-4">
        <Link to="/customize" className="inline-flex items-center gap-[6px] text-onsurface-300 text-[13px] font-bold tracking-[0.5px] uppercase transition-[color_150ms_ease] hover:text-gold">
          <IconChevronLeft /> Back to Studio
        </Link>
        <span className="inline-flex items-center gap-[6px] text-onsurface-500 text-[12px] font-bold tracking-[1px] uppercase"><IconLock /> Secure Checkout</span>
      </div>

      <Stepper />

      <div className="grid grid-cols-[1fr_360px] gap-6 max-w-[1180px] mx-auto px-6 items-start max-[980px]:grid-cols-1">
        <main className="flex flex-col gap-5 min-w-0">
          <Card step={1} title="Kit Summary">
            <div className="flex gap-5 max-[640px]:flex-col">
              <div className="w-[110px] h-[110px] flex-shrink-0 bg-[linear-gradient(160deg,var(--color-canvas-light)_0%,var(--color-canvas-light-dark)_100%)] rounded-md p-2">
                {editedKit ? (
                  <img src={editedKit} alt="Your edited kit" className="w-full h-full object-contain rounded-sm" />
                ) : (
                  <KitPreview
                    kitType={design.kitType} bodyColor={design.bodyColor} sleeveColor={design.sleeveColor}
                    numberColor={design.numberColor} collarColor={design.collarColor} opacity={design.opacity}
                    template={design.template} playerName={design.playerName} playerNumber={design.playerNumber}
                    font={design.font} nameSize={design.nameSize} numberSize={design.numberSize}
                    textPosition={design.textPosition} numberPosition={design.numberPosition} logoDataUrl={design.logoDataUrl} logoPreset={design.logoPreset}
                    logoScale={design.logoScale} logoOpacity={design.logoOpacity} logoPosition={design.logoPosition}
                    side="front" layers={design.layers}
                  />
                )}
              </div>
              <div className="flex-1 flex flex-col gap-[9px]">
                <FactRow label="Kit Type" value={`${sportLabel} ${kitLabel}`} />
                <FactRow label="Size" value={sizeDisplay} />
                <FactRow label="Template" value={templateName} />
                <FactRow label="Name / No." value={`${design.playerName.front || design.playerName.back || 'PLAYER'} / #${design.playerNumber.front || design.playerNumber.back || '—'}`} />
                <FactRow label="Colors" value={
                  <span className="flex gap-[6px]">
                    <i className="w-[14px] h-[14px] rounded-full inline-block border border-[rgba(255,255,255,0.2)]" style={{ background: design.bodyColor }} />
                    <i className="w-[14px] h-[14px] rounded-full inline-block border border-[rgba(255,255,255,0.2)]" style={{ background: design.sleeveColor }} />
                  </span>
                } />
                <FactRow label="Unit Price" value={formatPKR(unitPrice)} />
                <Link to="/customize" className="self-start mt-1 text-gold text-[12px] font-bold underline">Edit in Studio</Link>
              </div>
            </div>
          </Card>

          <Card step={2} title="Quantity & Sizes">
            <div className="flex gap-6 flex-wrap">
              <div className="flex flex-col gap-[6px]">
                <label className={fieldLabelCls}>Total Kits *</label>
                <div className="flex items-center gap-3 bg-surface-600 border border-line rounded-sm py-[6px] px-[10px] w-fit">
                  <button className="flex items-center justify-center w-[26px] h-[26px] rounded-full border-none bg-surface-500 text-onsurface-100 cursor-pointer transition-[background_150ms_ease] hover:bg-gold hover:text-bg-800" onClick={() => setTotalKits(q => Math.max(5, q - 1))} aria-label="Decrease"><IconMinus /></button>
                  <span className="min-w-[26px] text-center font-bold text-[15px]">{totalKits}</span>
                  <button className="flex items-center justify-center w-[26px] h-[26px] rounded-full border-none bg-surface-500 text-onsurface-100 cursor-pointer transition-[background_150ms_ease] hover:bg-gold hover:text-bg-800" onClick={() => setTotalKits(q => q + 1)} aria-label="Increase"><IconPlus /></button>
                </div>
              </div>
              <div className="flex flex-col gap-[6px]">
                <label className={fieldLabelCls}>Primary Size *</label>
                <select value={primarySize} onChange={e => setPrimarySize(e.target.value)} className={inputCls}>
                  {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            {primarySize === 'Custom' && (
              <p className="text-[11.5px] text-onsurface-600 leading-[1.6]">Custom size: <strong>{sizeDisplay}</strong> (as entered in the Studio)</p>
            )}
            <p className="text-[11.5px] text-onsurface-600 leading-[1.6]">For mixed sizes, note individual sizes in special instructions. Minimum order: 5 kits.</p>
            <div className="flex gap-2 flex-wrap">
              {QUANTITY_PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => setTotalKits(p.value)}
                  className={`py-[7px] px-[14px] border-[1.5px] text-[11px] font-bold rounded-full transition-[all_180ms_ease] ${totalKits === p.value ? 'bg-gold border-gold text-bg-800' : 'bg-surface-600 border-line text-onsurface-500 hover:border-onsurface-400 hover:text-onsurface-100'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-[6px]">
              <label className={fieldLabelCls}>Special Instructions (optional)</label>
              <textarea
                className={`${inputCls} resize-y [font-family:inherit]`} rows={3}
                placeholder="e.g. 3×S, 5×M, 2×L, 1×XL or any customisation notes..."
                value={instructions} onChange={e => setInstructions(e.target.value)}
              />
            </div>
          </Card>

          <Card step={3} title="Delivery Details">
            <h4 className="text-[12px] font-bold tracking-[1px] uppercase text-gold mt-2">Contact Information</h4>
            <div className="grid grid-cols-2 gap-4 max-[640px]:grid-cols-1">
              <TextField label="First Name" required value={contact.firstName} error={errors.firstName} onChange={v => { setContactField('firstName', v); setErrors(e => ({ ...e, firstName: false })); }} />
              <TextField label="Last Name" required value={contact.lastName} error={errors.lastName} onChange={v => { setContactField('lastName', v); setErrors(e => ({ ...e, lastName: false })); }} />
              <TextField label="Email Address" required type="email" placeholder="team@club.com" value={contact.email} error={errors.email} onChange={v => { setContactField('email', v); setErrors(e => ({ ...e, email: false })); }} />
              <TextField label="Phone Number" required placeholder="+92 3XX XXXXXXX" value={contact.phone} error={errors.phone} onChange={v => { setContactField('phone', v); setErrors(e => ({ ...e, phone: false })); }} />
            </div>
            <TextField label="Club / Team Name" placeholder="e.g. FC United Sialkot" value={contact.clubName} onChange={v => setContactField('clubName', v)} />

            <h4 className="text-[12px] font-bold tracking-[1px] uppercase text-gold mt-2">Shipping Address</h4>
            <TextField label="Street Address" required placeholder="House #, Street, Area" value={address.street} error={errors.street} onChange={v => { setAddressField('street', v); setErrors(e => ({ ...e, street: false })); }} />
            <div className="grid grid-cols-3 gap-4 max-[640px]:grid-cols-1">
              <TextField label="City" required value={address.city} error={errors.city} onChange={v => { setAddressField('city', v); setErrors(e => ({ ...e, city: false })); }} />
              <TextField label="Province" value={address.province} onChange={v => setAddressField('province', v)} />
              <TextField label="Postal Code" value={address.postalCode} onChange={v => setAddressField('postalCode', v)} />
            </div>
            <TextField label="Country" value={address.country} onChange={v => setAddressField('country', v)} />
          </Card>

          <Card step={4} title="Delivery Method">
            <div className="flex flex-col gap-2">
              {DELIVERY_METHODS.map(m => {
                const active = deliveryId === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setDeliveryId(m.id)}
                    className="flex items-center gap-4 p-4 bg-surface-600 border-[1.5px] border-line rounded-md cursor-pointer text-left transition-[all_180ms_ease] hover:border-onsurface-500"
                  >
                    <span className={`w-[18px] h-[18px] rounded-full border-2 flex-shrink-0 relative ${active ? 'border-onsurface-100 after:content-[\'\'] after:absolute after:inset-[3px] after:rounded-full after:bg-onsurface-100' : 'border-line-strong'}`} />
                    <span className="flex-1 flex flex-col gap-[3px]">
                      <span className="text-[13.5px] font-bold text-onsurface-100 flex items-center gap-2">
                        {m.name} {m.popular && <em className="not-italic text-[9px] font-extrabold tracking-[0.5px] uppercase bg-red text-light-100 py-[2px] px-[7px] rounded-full">Popular</em>}
                      </span>
                      <span className="text-[11.5px] text-onsurface-600">{m.days} · {m.desc}</span>
                    </span>
                    <span className="text-[13px] font-extrabold text-onsurface-100 whitespace-nowrap">{m.priceLabel}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card step={5} title="Payment">
            <div className="flex gap-2">
              {PAYMENT_METHODS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPaymentId(p.id)}
                  className={`flex-1 flex items-center justify-center gap-2 p-3 border-[1.5px] text-[12px] font-bold rounded-md cursor-pointer transition-[all_180ms_ease] ${paymentId === p.id ? 'border-onsurface-100 text-onsurface-100 bg-surface-600' : 'bg-surface-600 border-line text-onsurface-400 hover:border-onsurface-400 hover:text-onsurface-100'}`}
                >
                  {p.id === 'card' && <IconCard />}
                  {p.id === 'bank' && <IconBank />}
                  {p.id === 'cod' && <IconCash />}
                  {p.label}
                </button>
              ))}
            </div>

            {paymentId === 'card' && (
              <div className="flex flex-col gap-4">
                <TextField label="Card Number" required placeholder="1234 5678 9012 3456" value={card.number} error={errors.cardNumber} onChange={v => { setCardField('number', v); setErrors(e => ({ ...e, cardNumber: false })); }} />
                <div className="grid grid-cols-2 gap-4 max-[640px]:grid-cols-1">
                  <TextField label="Expiry Date" required placeholder="MM / YY" value={card.expiry} error={errors.cardExpiry} onChange={v => { setCardField('expiry', v); setErrors(e => ({ ...e, cardExpiry: false })); }} />
                  <TextField label="CVV" required placeholder="•••" maxLength={4} value={card.cvv} error={errors.cardCvv} onChange={v => { setCardField('cvv', v); setErrors(e => ({ ...e, cardCvv: false })); }} />
                </div>
                <TextField label="Name on Card" required placeholder="Full name as on card" value={card.name} error={errors.cardName} onChange={v => { setCardField('name', v); setErrors(e => ({ ...e, cardName: false })); }} />
                <p className="text-[11.5px] text-onsurface-600 leading-[1.6] flex items-center gap-[6px] [&>svg]:w-[13px] [&>svg]:h-[13px] [&>svg]:flex-shrink-0"><IconLock /> Your payment details are encrypted with 256-bit SSL. We never store card data.</p>
              </div>
            )}
            {paymentId === 'bank' && (
              <p className="text-[11.5px] text-onsurface-600 leading-[1.6]">Bank transfer details will be emailed after you place the order. Orders are produced once payment is confirmed.</p>
            )}
            {paymentId === 'cod' && (
              <p className="text-[11.5px] text-onsurface-600 leading-[1.6]">Pay in cash when your kits are delivered. A confirmation call will be made before dispatch.</p>
            )}
          </Card>
        </main>

        <aside className="sticky top-[calc(72px+24px)] max-[980px]:static">
          <div className="bg-surface-700 border border-line rounded-lg p-6 flex flex-col gap-5">
            <h3 className="font-body font-bold text-[1.15rem] tracking-[0.4px] text-onsurface-100">Order Summary</h3>

            <div className="flex gap-3">
              <div className="w-14 h-14 flex-shrink-0 bg-[linear-gradient(160deg,var(--color-canvas-light)_0%,var(--color-canvas-light-dark)_100%)] rounded-sm p-1">
                {editedKit ? (
                  <img src={editedKit} alt="Your edited kit" className="w-full h-full object-contain rounded-sm" />
                ) : (
                  <KitPreview
                    kitType={design.kitType} bodyColor={design.bodyColor} sleeveColor={design.sleeveColor}
                    numberColor={design.numberColor} collarColor={design.collarColor} opacity={design.opacity}
                    template={design.template} playerName={design.playerName} playerNumber={design.playerNumber}
                    font={design.font} nameSize={design.nameSize} numberSize={design.numberSize}
                    textPosition={design.textPosition} numberPosition={design.numberPosition} logoDataUrl={design.logoDataUrl} logoPreset={design.logoPreset}
                    logoScale={design.logoScale} logoOpacity={design.logoOpacity} logoPosition={design.logoPosition}
                    side="front" layers={design.layers}
                  />
                )}
              </div>
              <div className="flex flex-col gap-[3px] text-[11.5px] text-onsurface-600 min-w-0">
                <strong className="text-[13px] text-onsurface-100 font-bold">{sportLabel} {kitLabel} Custom</strong>
                <span>{templateName} Template</span>
                <span>#{design.playerNumber.front || design.playerNumber.back || '—'} {(design.playerName.front || design.playerName.back || 'PLAYER').toUpperCase()} · Size: {sizeDisplay} · Qty: {totalKits}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-4 border-t border-line">
              <div className="flex justify-between text-[12.5px] text-onsurface-500"><span>Kit price (×{totalKits})</span><span className="text-onsurface-200 font-semibold">{formatPKR(kitPrice)}</span></div>
              <div className="flex justify-between text-[12.5px] text-onsurface-500"><span>{delivery.name}</span><span className="text-onsurface-200 font-semibold">{delivery.price === 0 ? 'Free' : formatPKR(delivery.price)}</span></div>
              <div className="flex justify-between text-[12.5px] text-onsurface-500"><span>Design fee</span><span className="text-gold font-bold">FREE</span></div>
              {promoApplied && <div className="flex justify-between text-[12.5px] text-onsurface-500"><span>Promo discount</span><span className="text-success font-bold">-{formatPKR(discount)}</span></div>}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-line text-[13px] text-onsurface-300 font-bold uppercase tracking-[1px]">
              <span>Total</span>
              <strong className="font-body font-bold text-[1.65rem] text-gold tracking-[0.2px]">{formatPKR(total)}</strong>
            </div>

            <div className="flex gap-2">
              <input
                type="text" placeholder="Promo code" value={promoCode}
                onChange={e => { setPromoCode(e.target.value); setPromoError(''); }}
                className="flex-1 bg-surface-600 border border-line text-onsurface-100 py-[9px] px-3 rounded-sm text-[12.5px] outline-none focus:border-gold"
              />
              <button onClick={applyPromo} className="btn btn-outline py-[9px] px-[18px] text-[11px]">Apply</button>
            </div>
            {promoError && <p className="text-[11px] text-red-light mt-[-8px]">{promoError}</p>}
            {promoApplied && <p className="text-[11px] text-success mt-[-8px] flex items-center gap-[5px] [&>svg]:w-3 [&>svg]:h-3"><IconCheck /> Code applied — {Math.round(promoApplied * 100)}% off</p>}

            <ul className="flex flex-col gap-2 pt-3 border-t border-line">
              <li className="flex items-center gap-2 text-[11.5px] text-onsurface-500 [&>svg]:w-[14px] [&>svg]:h-[14px] [&>svg]:text-gold [&>svg]:flex-shrink-0"><IconShield /> Quality guarantee on all kits</li>
              <li className="flex items-center gap-2 text-[11.5px] text-onsurface-500 [&>svg]:w-[14px] [&>svg]:h-[14px] [&>svg]:text-gold [&>svg]:flex-shrink-0"><IconCheck /> Free revision on printing errors</li>
              <li className="flex items-center gap-2 text-[11.5px] text-onsurface-500 [&>svg]:w-[14px] [&>svg]:h-[14px] [&>svg]:text-gold [&>svg]:flex-shrink-0"><IconTruck /> Tracked delivery, door to door</li>
              <li className="flex items-center gap-2 text-[11.5px] text-onsurface-500 [&>svg]:w-[14px] [&>svg]:h-[14px] [&>svg]:text-gold [&>svg]:flex-shrink-0"><IconLock /> Secure encrypted payments</li>
            </ul>

            <button onClick={handlePlaceOrder} className="btn btn-darkred w-full p-[15px] text-[13px]" disabled={submitting}>
              {submitting ? 'Placing Order…' : 'Place Order'}
            </button>
            {submitError && <p className="text-[11px] text-danger text-center" role="alert">{submitError}</p>}
            <p className="text-[10.5px] text-onsurface-700 text-center leading-[1.6]">
              By placing your order you agree to our <Link to="/contact" className="text-onsurface-500 underline">Terms of Service &amp; Return Policy</Link>
            </p>
          </div>
        </aside>
      </div>

      {placed && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-gold text-bg-800 font-bold text-[13px] py-[14px] px-[26px] rounded-full shadow-[0_4px_24px_rgba(245,166,35,0.4)] z-[100] animate-[checkoutToastPop_220ms_ease] [&>svg]:w-4 [&>svg]:h-4">
          <IconCheck /> Order placed! Confirmation sent to {contact.email || 'your email'}.
        </div>
      )}
    </div>
  );
}

/* ── Stepper ────────────────────────────────────────────────── */
function Stepper() {
  return (
    <div className="flex items-start justify-center py-8 px-6 max-w-[640px] mx-auto max-[980px]:max-w-full">
      {STEPS.map((s, i) => {
        const done = i < 2;
        return (
          <div key={s.id} className="flex items-center flex-1">
            <span className={`flex items-center justify-center w-[34px] h-[34px] rounded-full font-bold text-[13px] flex-shrink-0 ${done ? 'bg-red border-2 border-red text-light-100' : 'bg-surface-600 border-2 border-line-strong text-onsurface-500'}`}>{i < 1 ? <IconCheck /> : s.id}</span>
            <span className="flex flex-col ml-3 whitespace-nowrap">
              <strong className="text-[12px] font-bold text-onsurface-200 uppercase tracking-[0.5px] max-[640px]:text-[10px]">{s.label}</strong>
              <em className={`not-italic text-[10.5px] max-[640px]:hidden ${done ? 'text-gold' : 'text-onsurface-600'}`}>{s.status}</em>
            </span>
            {i < STEPS.length - 1 && <span className={`flex-1 h-0.5 mx-3 self-center ${done ? 'bg-red' : 'bg-line-strong'}`} />}
          </div>
        );
      })}
    </div>
  );
}

/* ── Small building blocks ─────────────────────────────────── */
function Card({ step, title, children }) {
  return (
    <section className="bg-surface-700 border border-line rounded-lg p-6 flex flex-col gap-4">
      <h2 className="flex items-center gap-3 font-body font-bold text-[1.2rem] tracking-[0.4px] text-onsurface-100">
        <span className="flex items-center justify-center w-[26px] h-[26px] rounded-full bg-gold text-bg-800 font-body text-[12px] font-extrabold flex-shrink-0">{step}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function FactRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-onsurface-600 font-semibold">{label}</span>
      <span className="text-onsurface-100 font-bold">{value}</span>
    </div>
  );
}

function TextField({ label, required, type = 'text', placeholder, value, onChange, error, maxLength }) {
  return (
    <div className="flex flex-col gap-[6px]" data-field-error={error ? 'true' : undefined}>
      <label className={error ? 'text-[11px] font-bold tracking-[0.8px] uppercase text-red-light' : fieldLabelCls}>{label}{required && ' *'}</label>
      <input
        type={type} placeholder={placeholder} value={value} maxLength={maxLength}
        onChange={e => onChange(e.target.value)}
        className={error ? `${inputCls} border-red-light` : inputCls}
      />
    </div>
  );
}
