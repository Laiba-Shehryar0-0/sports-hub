// Snapshot of ../kit-frontend as of 2026-08-12 — reference only, do not edit here.
// Source: src/pages/Checkout.jsx

import { useState, useCallback, useEffect, useRef } from 'react';
import { useCart } from '../context/CartContext';
import { Link, useNavigate } from 'react-router-dom';
import KitPreview from '../customize/KitPreview';
import { required, validateFields } from '../utils/validation';
import { placeOrder } from '../api/ordersService';
import {
  SHIPPING_COUNTRIES, DOMESTIC_COUNTRY, allowedDeliveryIds, isDeliveryAllowedForCountry,
} from '../data/countries';
import {
  // DELIVERY_METHODS carries names, ETAs and descriptions — no money at all since its `price`
  // and `priceLabel` were deleted. Delivery money comes from the quote, like every other figure.
  KIT_TYPES, DELIVERY_METHODS, PAYMENT_METHODS,
} from '../customize/kitShapes';
import {
  IconChevronLeft, IconLock, IconTruck, IconCard, IconBank, IconCash,
  IconShield, IconCheck,
} from '../customize/icons';

const inputCls = 'bg-surface-600 border border-line text-onsurface-100 py-[10px] px-4 text-[0.9rem] outline-none w-full rounded-sm transition-[border-color_150ms_ease] focus:border-gold placeholder:text-onsurface-700';
const fieldLabelCls = 'text-[11px] font-bold tracking-[0.8px] uppercase text-onsurface-600';

const STEPS = [
  { id: 1, label: 'Design',    status: 'Completed' },
  { id: 2, label: 'Order',     status: 'In Progress' },
  { id: 3, label: 'Delivered', status: 'Est. 7–14 days' },
];


function formatPKR(n) {
  return `PKR ${Math.round(n).toLocaleString('en-US')}`;
}

export default function Checkout() {
  const navigate = useNavigate();

  /**
   * Everything priced comes from the CART and the SERVER'S QUOTE.
   *
   * This page used to compute its own totals from BASE_PRICES and a frontend DELIVERY_METHODS
   * copy — two hardcoded tables agreeing with kit_prices/delivery_methods by maintenance rather
   * than by mechanism, complete with a `?? 2800` fallback that priced an unknown kit type as a
   * jersey. That is exactly what /orders/quote exists to replace.
   */
  const {
    items, quote, quoteStatus, quoteIsStale, refreshQuote,
    deliveryId, setDeliveryId, clear: clearCart,
  } = useCart();

  const [instructions, setInstructions] = useState('');

  const [contact, setContact] = useState({ firstName: '', lastName: '', email: '', phone: '', clubName: '' });
  const [address, setAddress] = useState({ street: '', city: '', province: '', postalCode: '', country: 'Pakistan' });

  const [paymentId, setPaymentId] = useState('card');
  const [card, setCard] = useState({ number: '', expiry: '', cvv: '', name: '' });

  const [errors, setErrors] = useState({});
  /** null until an order is placed, then the SERVER's response — reference, id and pricing. */
  const [confirmation, setConfirmation] = useState(null);
  /** Set when the API was unreachable: nothing was sent, so this is not a confirmation. */
  const [offline, setOffline] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** Set when the cart changes underneath us — another tab. Warn, never navigate away. */
  const [cartChangedElsewhere, setCartChangedElsewhere] = useState(false);
  // One key per checkout ATTEMPT, not per request. A double-click, or a retry after a submit
  // that timed out but actually succeeded, must reuse this or the server creates two orders.
  // useRef so regenerating it never triggers a render.
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const [submitError, setSubmitError] = useState('');

  /**
   * Quote on mount and whenever the delivery method changes — the only checkout input that moves
   * the price. Contact and address do not, except via the country/delivery coupling, which changes
   * deliveryId anyway. No debounce: these are discrete selections, not typing.
   */
  useEffect(() => {
    if (items.length === 0) return;
    refreshQuote();
  }, [refreshQuote, items.length]);

  /**
   * Another tab emptied or changed the cart. WARN, DO NOT NAVIGATE — this page holds an address
   * the user has typed, and losing it to a background change is worse than the inconsistency.
   */
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key && e.key.startsWith('kitlab_cart:')) setCartChangedElsewhere(true);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Presentation only — names, ETAs and descriptions. The PRICE comes from the quote.
  const delivery = DELIVERY_METHODS.find(d => d.id === deliveryId) ?? DELIVERY_METHODS[0];

  /**
   * Money is stale together or not at all: any change invalidates every figure, since delivery and
   * subtotal are computed across all lines. Same rule as the cart page.
   */
  const pricesPending = quoteIsStale || quoteStatus === 'loading';
  const priced = quoteStatus === 'ok' && !quoteIsStale ? quote : null;

  /**
   * Delivery prices for the SELECTOR, which shows every method so the user can compare — a quote
   * prices only the selected one. Served by the quote's deliveryOptions so the frontend keeps no
   * price table of its own; null until it arrives, rendered as a dash rather than a guess.
   */
  const deliveryPriceOf = (id) => {
    const option = quote?.deliveryOptions?.find((o) => o.id === id);
    return option ? option.price : null;
  };

  const setField = (setter) => (key, value) => setter(prev => ({ ...prev, [key]: value }));
  const setContactField = setField(setContact);
  const setAddressField = setField(setAddress);
  const setCardField = setField(setCard);

  /**
   * Changing country can invalidate the selected delivery method, so they move together.
   * Leaving a now-illegal deliveryId in state would submit an order the API rejects with a
   * cross-field 422 the user has no obvious way to act on.
   */
  const setCountry = useCallback((country) => {
    setAddress(prev => ({ ...prev, country }));
    setDeliveryId(prev => (isDeliveryAllowedForCountry(country, prev) ? prev : allowedDeliveryIds(country)[0]));
  }, []);

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
    setOffline(false);
    try {
      const response = await placeOrder({
        items: items.map(i => ({ design: i.design, size: i.size, quantity: i.quantity })),
        contact, address, deliveryId, paymentId, instructions,
        // Sent for the server's price_mismatch comparison and then DISCARDED (rule 2). Never read
        // back — the confirmation below renders what the SERVER returned.
        pricing: priced ?? undefined,
      }, idempotencyKeyRef.current);

      /**
       * The offline branch of placeOrder fabricates { simulated: true } so a demo works with the
       * API down. NOTHING WAS SENT, so this is not an order and must not be shown as one — a
       * confirmation with no reference would claim something that did not happen, which is a
       * bigger lie than a blank total. The key is deliberately NOT rotated, so a retry reuses it
       * and cannot create a second order.
       */
      if (response?.simulated) {
        setOffline(true);
        return;
      }

      // Succeeded — any further order placed from this screen is genuinely a new one.
      idempotencyKeyRef.current = crypto.randomUUID();
      setConfirmation(response);
      clearCart();
    } catch (err) {
      setSubmitError(err.message || 'Could not place your order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [items, contact, address, paymentId, card, deliveryId, instructions, priced, clearCart]);

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
          <Card step={1} title={`Your Cart (${items.length} design${items.length === 1 ? '' : 's'})`}>
            <ul className="flex flex-col gap-3 list-none p-0 m-0">
              {items.map((item, index) => {
                const line = priced?.items?.[index];
                return (
                  <li key={item.id} className="flex gap-4 items-start">
                    <div className="w-[72px] h-[72px] flex-shrink-0 bg-[linear-gradient(160deg,var(--color-canvas-light)_0%,var(--color-canvas-light-dark)_100%)] rounded-md p-1.5">
                      <KitPreview
                        kitType={item.design.kitType} bodyColor={item.design.bodyColor} sleeveColor={item.design.sleeveColor}
                        numberColor={item.design.numberColor} collarColor={item.design.collarColor} opacity={item.design.opacity}
                        template={item.design.template} playerName={item.design.playerName} playerNumber={item.design.playerNumber}
                        font={item.design.font} nameSize={item.design.nameSize} numberSize={item.design.numberSize}
                        textPosition={item.design.textPosition} numberPosition={item.design.numberPosition}
                        logoDataUrl={item.design.logoDataUrl} logoPreset={item.design.logoPreset}
                        logoScale={item.design.logoScale} logoOpacity={item.design.logoOpacity} logoPosition={item.design.logoPosition}
                        side="front" layers={item.design.layers}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <strong className="block text-[13px]">{item.design.kitProduct || KIT_TYPES.find(k => k.id === item.design.kitType)?.label || 'Kit'}</strong>
                      <span className="text-[11px] text-onsurface-500">Size {item.size} · x{item.quantity}</span>
                    </div>
                    {/* Line money is quote-derived, so it dims with everything else. */}
                    <span className={`text-[13px] font-semibold ${pricesPending ? 'opacity-40' : ''}`}>
                      {line ? formatPKR(line.lineTotal) : '—'}
                    </span>
                  </li>
                );
              })}
            </ul>
            <Link to="/cart" className="self-start mt-1 text-gold text-[12px] font-bold underline">Edit cart</Link>

            <div className="flex flex-col gap-[6px] mt-2">
              <label className={fieldLabelCls}>Special Instructions (optional)</label>
              <textarea
                className={`${inputCls} resize-y [font-family:inherit]`} rows={3}
                placeholder="Any customisation notes..."
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
            <div className="flex flex-col gap-[6px]">
              <label htmlFor="checkout-country" className="text-[11px] font-bold tracking-[0.3px] text-onsurface-500">Country</label>
              <select
                id="checkout-country"
                value={address.country}
                onChange={e => setCountry(e.target.value)}
                className={inputCls}
              >
                {SHIPPING_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {address.country !== DOMESTIC_COUNTRY && (
                <p className="text-[11.5px] text-onsurface-600">
                  Orders outside Pakistan ship via International Shipping.
                </p>
              )}
            </div>
          </Card>

          <Card step={4} title="Delivery Method">
            <div className="flex flex-col gap-2">
              {DELIVERY_METHODS.map(m => {
                const active = deliveryId === m.id;
                // Domestic couriers can't serve an address abroad, and DHL isn't for a Pakistan
                // address. The server enforces the same rule, so this is UX, not the control.
                const allowed = isDeliveryAllowedForCountry(address.country, m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => allowed && setDeliveryId(m.id)}
                    disabled={!allowed}
                    title={allowed ? undefined : `Not available for ${address.country}.`}
                    className={`flex items-center gap-4 p-4 bg-surface-600 border-[1.5px] border-line rounded-md text-left transition-[all_180ms_ease] ${allowed ? 'cursor-pointer hover:border-onsurface-500' : 'opacity-40 cursor-not-allowed'}`}
                  >
                    <span className={`w-[18px] h-[18px] rounded-full border-2 flex-shrink-0 relative ${active ? 'border-onsurface-100 after:content-[\'\'] after:absolute after:inset-[3px] after:rounded-full after:bg-onsurface-100' : 'border-line-strong'}`} />
                    <span className="flex-1 flex flex-col gap-[3px]">
                      <span className="text-[13.5px] font-bold text-onsurface-100 flex items-center gap-2">
                        {m.name} {m.popular && <em className="not-italic text-[9px] font-extrabold tracking-[0.5px] uppercase bg-red text-light-100 py-[2px] px-[7px] rounded-full">Popular</em>}
                      </span>
                      <span className="text-[11.5px] text-onsurface-600">{m.days} · {m.desc}</span>
                    </span>
                    {/* The SERVER's price for this method, from the quote's deliveryOptions — not
                        the hardcoded priceLabel that used to sit here. That string could disagree
                        with the total directly below it, which is the whole failure this phase
                        removed. Dashes until the quote arrives rather than a stale number. */}
                    <span className={`text-[13px] font-extrabold text-onsurface-100 whitespace-nowrap ${pricesPending ? 'opacity-40' : ''}`}>
                      {deliveryPriceOf(m.id) === null
                        ? '—'
                        : deliveryPriceOf(m.id) === 0 ? 'Free' : formatPKR(deliveryPriceOf(m.id))}
                    </span>
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

            <p className="text-[11.5px] text-onsurface-600">
              {items.length} design{items.length === 1 ? '' : 's'} · {priced ? `${priced.totalKits} kits` : '—'}
            </p>

            {/* Every figure below is quote-derived, so they dim TOGETHER. Dimming one while another
                looked authoritative would show a line disagreeing with the total. */}
            <div className={`flex flex-col gap-2 pt-4 border-t border-line ${pricesPending ? 'opacity-40' : ''}`}>
              <div className="flex justify-between text-[12.5px] text-onsurface-500"><span>Subtotal</span><span className="text-onsurface-200 font-semibold">{priced ? formatPKR(priced.kitPrice) : '—'}</span></div>
              <div className="flex justify-between text-[12.5px] text-onsurface-500"><span>{delivery.name}</span><span className="text-onsurface-200 font-semibold">{priced ? (priced.deliveryPrice === 0 ? 'Free' : formatPKR(priced.deliveryPrice)) : '—'}</span></div>
              <div className="flex justify-between text-[12.5px] text-onsurface-500"><span>Design fee</span><span className="text-gold font-bold">FREE</span></div>
            </div>

            <div className={`flex items-center justify-between pt-4 border-t border-line text-[13px] text-onsurface-300 font-bold uppercase tracking-[1px] ${pricesPending ? 'opacity-40' : ''}`}>
              <span>Total</span>
              <strong className="font-body font-bold text-[1.65rem] text-gold tracking-[0.2px]">{priced ? formatPKR(priced.total) : '—'}</strong>
            </div>

            {pricesPending && (
              <p className="text-[11px] font-semibold tracking-[1px] uppercase text-onsurface-500 text-center">Updating prices…</p>
            )}

            <ul className="flex flex-col gap-2 pt-3 border-t border-line">
              <li className="flex items-center gap-2 text-[11.5px] text-onsurface-500 [&>svg]:w-[14px] [&>svg]:h-[14px] [&>svg]:text-gold [&>svg]:flex-shrink-0"><IconShield /> Quality guarantee on all kits</li>
              <li className="flex items-center gap-2 text-[11.5px] text-onsurface-500 [&>svg]:w-[14px] [&>svg]:h-[14px] [&>svg]:text-gold [&>svg]:flex-shrink-0"><IconCheck /> Free revision on printing errors</li>
              <li className="flex items-center gap-2 text-[11.5px] text-onsurface-500 [&>svg]:w-[14px] [&>svg]:h-[14px] [&>svg]:text-gold [&>svg]:flex-shrink-0"><IconTruck /> Tracked delivery, door to door</li>
              <li className="flex items-center gap-2 text-[11.5px] text-onsurface-500 [&>svg]:w-[14px] [&>svg]:h-[14px] [&>svg]:text-gold [&>svg]:flex-shrink-0"><IconLock /> Secure encrypted payments</li>
            </ul>

            {/* Disabled while the price is stale or in flight. The figure on screen at click time
                is therefore always the most recent SERVER-computed one — never a client
                calculation, and never one the client already knows is out of date. It is still
                not a guarantee of what is charged: the server recomputes inside the order
                transaction, so the confirmation below shows what it actually returned. */}
            <button
              onClick={handlePlaceOrder}
              className="btn btn-darkred w-full p-[15px] text-[13px] disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={submitting || pricesPending || !priced}
            >
              {submitting ? 'Placing Order…' : pricesPending ? 'Updating prices…' : 'Place Order'}
            </button>
            {submitError && <p className="text-[11px] text-danger text-center" role="alert">{submitError}</p>}
            <p className="text-[10.5px] text-onsurface-700 text-center leading-[1.6]">
              By placing your order you agree to our <Link to="/contact" className="text-onsurface-500 underline">Terms of Service &amp; Return Policy</Link>
            </p>
          </div>
        </aside>
      </div>

      {/* THE SERVER'S FIGURES, not the local quote. If a price moved between the last quote and
          the POST, this is where the real number appears — at the only moment it matters. */}
      {confirmation && (
        <div role="status" className="fixed inset-x-0 bottom-6 mx-auto w-fit max-w-[min(560px,calc(100vw-2rem))] flex flex-col gap-1 bg-gold text-bg-800 font-bold text-[13px] py-4 px-7 rounded-xl shadow-[0_4px_24px_rgba(245,166,35,0.4)] z-[100]">
          <span className="flex items-center gap-2 [&>svg]:w-4 [&>svg]:h-4">
            <IconCheck /> Order {confirmation.reference} placed — {formatPKR(confirmation.pricing.total)} charged.
          </span>
          <span className="font-semibold opacity-80">
            Confirmation sent to {contact.email || 'your email'}.
          </span>
        </div>
      )}

      {/* NOT a confirmation. placeOrder fabricates { simulated: true } when the API is unreachable,
          so nothing was sent: there is no reference and no server pricing. Showing an "order
          placed" message here would claim something that did not happen. */}
      {offline && (
        <div role="alert" className="fixed inset-x-0 bottom-6 mx-auto w-fit max-w-[min(560px,calc(100vw-2rem))] flex flex-col gap-2 bg-[#5a1220] text-white border border-[#8d1f33] text-[13px] py-4 px-6 rounded-xl z-[100]">
          <strong>Your order has not been sent.</strong>
          <span className="font-semibold opacity-90">
            We couldn’t reach the server{priced ? ` — the estimated total was ${formatPKR(priced.total)}` : ''}. Your cart is untouched; try again when you’re back online.
          </span>
          <button type="button" onClick={handlePlaceOrder} className="self-start btn btn-grey py-2 px-4 text-[11px] font-bold tracking-[1px] uppercase">
            Try again
          </button>
        </div>
      )}

      {/* Another tab changed the cart. Warn only — navigating away would destroy a typed address. */}
      {cartChangedElsewhere && !confirmation && (
        <div role="alert" className="fixed inset-x-0 top-[84px] mx-auto w-fit max-w-[min(560px,calc(100vw-2rem))] flex items-center gap-3 bg-surface-600 border border-line-strong text-onsurface-100 text-[12px] font-semibold py-3 px-5 rounded-xl z-[100]">
          <span>Your cart changed in another tab.</span>
          <button type="button" onClick={() => window.location.reload()} className="btn btn-grey py-1.5 px-3 text-[11px] font-bold tracking-[1px] uppercase">
            Refresh
          </button>
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
