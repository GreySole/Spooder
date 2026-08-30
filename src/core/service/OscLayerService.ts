import OSCService from './OSCService';

interface OscClaim {
  owner: string;
  priority: number;
  value: any;
  dest: string;
  // What to send if this claim is dropped and nothing else holds the layer. Carried on the
  // claim rather than supplied at release time so a force-stopped event (EventService
  // .stopEvent, which never reaches its Release node) can still restore the address - the
  // legacy path got this right by running the command's timeout function on stop.
  releaseValue: any;
}

// Shared ownership of an OSC address, so overlapping events don't clobber each other.
//
// This replaced the OSC Send node's `priority` field, which is gone: saved timed sends were
// rewritten into Claim -> Delay -> Release by upgradeOscSendNodes (EventGraphMigration.ts).
// The problem it solves: several effects drive the same address (e.g. a pitch shifter), and
// when a short one ends it must not reset a value a longer, higher-priority one is still
// holding.
//
// Whoever holds the highest priority decides the value. Releasing hands the address back to
// the next-highest holder rather than switching it off.
export default class OscLayerService {
  private static layers = new Map<string, OscClaim[]>();

  // `slot` scopes contention *within* an address without affecting what gets sent - MIDI
  // sends everything to /cc, so two events are only in conflict when they target the same CC
  // number. Blank means the whole address is the layer.
  private static layerKey(dest: string, address: string, slot: string) {
    return `${dest}|${address}|${slot ?? ''}`;
  }

  // Highest priority wins; ties go to the most recent claim, matching the legacy comparison
  // where an equal priority did not yield to an existing holder.
  private static topClaim(claims: OscClaim[]): OscClaim | undefined {
    let top: OscClaim | undefined;
    for (const claim of claims) {
      if (!top || claim.priority >= top.priority) {
        top = claim;
      }
    }
    return top;
  }

  static claim(
    dest: string,
    address: string,
    slot: string,
    owner: string,
    priority: number,
    value: any,
    releaseValue: any,
  ) {
    if (!address) {
      return;
    }
    const key = OscLayerService.layerKey(dest, address, slot);
    // A re-claim by the same owner updates its claim rather than stacking a second one.
    const claims = (OscLayerService.layers.get(key) ?? []).filter((c) => c.owner !== owner);
    claims.push({ owner, priority: Number(priority) || 0, value, dest, releaseValue });
    OscLayerService.layers.set(key, claims);

    const top = OscLayerService.topClaim(claims);
    if (top) {
      OSCService.sendToUDP(top.dest, address, top.value);
    }
  }

  static release(dest: string, address: string, slot: string, owner: string) {
    if (!address) {
      return;
    }
    const key = OscLayerService.layerKey(dest, address, slot);
    const existing = OscLayerService.layers.get(key) ?? [];
    const released = existing.find((c) => c.owner === owner);
    const claims = existing.filter((c) => c.owner !== owner);

    if (claims.length === 0) {
      OscLayerService.layers.delete(key);
      if (released) {
        OSCService.sendToUDP(released.dest, address, released.releaseValue);
      }
      return;
    }

    OscLayerService.layers.set(key, claims);
    // Restore whoever still holds the layer instead of switching the address off.
    const top = OscLayerService.topClaim(claims)!;
    OSCService.sendToUDP(top.dest, address, top.value);
  }

  // Claims live here rather than in EventService.activeEvents, so an event that stops before
  // reaching its Release node would otherwise hold its layer forever. EventService.stopEvent
  // calls this so the address falls back to the next holder.
  static releaseAllForOwner(owner: string) {
    for (const [key, claims] of [...OscLayerService.layers.entries()]) {
      if (!claims.some((c) => c.owner === owner)) {
        continue;
      }
      const remaining = claims.filter((c) => c.owner !== owner);
      const address = key.split('|')[1];

      if (remaining.length === 0) {
        OscLayerService.layers.delete(key);
        const released = claims.find((c) => c.owner === owner)!;
        OSCService.sendToUDP(released.dest, address, released.releaseValue);
        continue;
      }
      OscLayerService.layers.set(key, remaining);
      const top = OscLayerService.topClaim(remaining)!;
      OSCService.sendToUDP(top.dest, address, top.value);
    }
  }

  static getLayers() {
    return [...OscLayerService.layers.entries()].map(([key, claims]) => ({
      key,
      claims: claims.map((c) => ({ owner: c.owner, priority: c.priority, value: c.value })),
    }));
  }
}
