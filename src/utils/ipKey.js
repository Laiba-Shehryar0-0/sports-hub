import { isIP } from 'node:net';

/**
 * Collapses a client IP into a stable rate-limiting key.
 *
 * express-rate-limit@7.5.1 as installed here does NOT export its `ipKeyGenerator` helper (its
 * named exports are only MemoryStore/default/rateLimit), and supplying a custom `keyGenerator`
 * bypasses the library's own IP handling entirely — so this does the IPv6 normalization.
 *
 * Why /64 rather than the full address: a residential or VPS IPv6 customer is universally
 * assigned at least a /64, so that block is the unit of "one attacker". Keying on the full /128
 * would let them mint a fresh rate-limit bucket per request for free, i.e. no limit at all.
 * IPv4 has no equivalent problem, so it is used as-is.
 */

const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/** Expands `::` and strips leading zeros so every spelling of one address yields one key. */
function expandIpv6(address) {
  const [head, tail = ''] = address.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const fill = address.includes('::')
    ? Array(8 - headGroups.length - tailGroups.length).fill('0')
    : [];
  return [...headGroups, ...fill, ...tailGroups]
    .map((group) => (group.replace(/^0+/, '') || '0'));
}

export function ipKey(ip) {
  // Strip any zone id ("fe80::1%eth0") before parsing — isIP rejects it otherwise.
  const address = String(ip ?? '').split('%')[0].toLowerCase();
  const version = isIP(address);

  if (version === 0) return 'unknown';
  if (version === 4) return address;

  // ::ffff:127.0.0.1 is an IPv4 client seen through a dual-stack socket — key it as IPv4 so it
  // shares a bucket with the same client arriving over a plain IPv4 socket.
  const mapped = address.match(IPV4_MAPPED);
  if (mapped) return mapped[1];

  return `${expandIpv6(address).slice(0, 4).join(':')}::/64`;
}
