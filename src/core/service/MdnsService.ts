import mdns from 'multicast-dns';
import { networkInterfaces } from 'os';
import { webLog } from '../Logging';
import ConfigService from './ConfigService';

/** One IPv4 address this machine holds, with the subnet it sits on. */
interface LocalAddress {
  address: string;
  /** The address and netmask as 32-bit numbers, for "is this peer on my subnet" checks. */
  ip: number;
  mask: number;
}

const TTL_SECONDS = 120;
/** How long to listen for someone else already holding the name before claiming it. */
const PROBE_MS = 1000;
const LABEL = /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/;

function toInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => ((acc << 8) | Number(octet)) >>> 0, 0);
}

/**
 * Container and VM bridges. Their addresses are private but only reachable from inside this
 * machine, so announcing them sends a LAN client to a dead end.
 */
const VIRTUAL_INTERFACE = /^(docker|br-|veth|virbr|vmnet|vboxnet|cni|flannel|podman|lxc|tun|tap)/i;

function getLocalAddresses(): LocalAddress[] {
  const found: LocalAddress[] = [];
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    if (VIRTUAL_INTERFACE.test(name)) {
      continue;
    }
    for (const net of addresses ?? []) {
      // `family` is the string 'IPv4' up to Node 17 and the number 4 after.
      const isV4 = net.family === 'IPv4' || (net.family as unknown) === 4;
      if (isV4 && !net.internal) {
        found.push({ address: net.address, ip: toInt(net.address), mask: toInt(net.netmask) });
      }
    }
  }
  return found;
}

/** RFC 1918 ranges. A LAN client can only ever reach these, so only these are announced. */
function isPrivate(ip: number): boolean {
  const a = ip >>> 24;
  const b = (ip >>> 16) & 255;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * The addresses worth announcing. A machine can also hold a public or ISP-assigned address on
 * the same network card; handing that out would send LAN clients somewhere they cannot reach.
 * Falls back to everything when there is no private address at all.
 */
function getAnnounceAddresses(): LocalAddress[] {
  const all = getLocalAddresses();
  const privateOnly = all.filter((a) => isPrivate(a.ip));
  return privateOnly.length > 0 ? privateOnly : all;
}

/**
 * Answers mDNS queries for `<name>.local` with this machine's LAN address, so the web UI and
 * overlays can be opened at e.g. http://spooder.local:3000 - the same way homeassistant.local
 * resolves. Only the hostname is published, not a service record.
 *
 * Opt-in (network.mdns.enabled), since it puts Spooder on the multicast group. Resolution only
 * reaches the local network segment: multicast does not cross routers or VLANs.
 */
export default class MdnsService {
  private static responder: ReturnType<typeof mdns> | undefined;
  private static hostname = '';
  private static startToken = 0;
  /**
   * One sending socket per local address, bound to that address on port 5353. Clients ignore
   * an mDNS reply whose source address is not on their own subnet, and a single socket lets the
   * kernel pick the source - on a machine with two addresses on one card that is the wrong one
   * for half the network. The listening socket only receives.
   */
  private static senders = new Map<string, ReturnType<typeof mdns>>();

  /** The name as it appears in a query: lowercase, with the `.local` suffix. */
  static getHostname(): string {
    return MdnsService.hostname;
  }

  static start() {
    MdnsService.stop();

    if (ConfigService.getFlags().safeMode) {
      return;
    }

    const config = ConfigService.getConfig().network.mdns;
    if (!config?.enabled) {
      return;
    }

    const label = String(config.name ?? '')
      .trim()
      .toLowerCase();
    if (!LABEL.test(label)) {
      webLog(
        `mDNS: '${config.name}' is not a valid name. Use letters, digits and hyphens, with no dots.`,
      );
      return;
    }

    const hostname = `${label}.local`;
    // Guards the probe's timer: a stop() or restart before it fires must not start a stale one.
    const token = ++MdnsService.startToken;
    const responder = mdns();
    MdnsService.responder = responder;
    MdnsService.hostname = hostname;

    responder.on('error', (e: Error) => webLog('mDNS error:', e.message));

    // Someone else answering for the name with an address that is not ours means it is taken.
    // Our own announcements come back on the loopback of the multicast group, so those are
    // told apart by address.
    let conflictWith: string | undefined;
    responder.on('response', (response) => {
      const ours = getLocalAddresses().map((a) => a.address);
      for (const answer of response.answers) {
        if (
          answer.type === 'A' &&
          answer.name.toLowerCase() === hostname &&
          !ours.includes(String(answer.data))
        ) {
          conflictWith = String(answer.data);
        }
      }
    });

    responder.on('query', (query, rinfo) => {
      const asked = query.questions.filter((q) => q.name.toLowerCase() === hostname);
      if (asked.length === 0 || conflictWith) {
        return;
      }

      const wantsA = asked.some((q) => q.type === 'A' || (q.type as string) === 'ANY');
      const wantsAAAA = asked.some((q) => q.type === 'AAAA');

      if (wantsA) {
        const chosen = MdnsService.addressesFor(rinfo.address);
        MdnsService.sendFrom(chosen, hostname, TTL_SECONDS);
        webLog(
          `mDNS: ${rinfo.address} asked for ${hostname}, answered ` +
            chosen.map((a) => a.address).join(', '),
        );
      } else if (wantsAAAA) {
        // Says "no IPv6 here" so a client that asked for both does not sit waiting on a
        // reply that will never come. Sent from the address on the asker's network.
        const from = MdnsService.addressesFor(rinfo.address)[0];
        if (from) {
          MdnsService.getSender(from.address).respond({
            answers: [
              {
                name: hostname,
                type: 'NSEC',
                ttl: TTL_SECONDS,
                data: { nextDomain: hostname, rrtypes: ['A'] },
              },
            ],
          });
        }
      }
    });

    // Ask for the name first, wait a moment, and only claim it if nobody objected.
    responder.query({ questions: [{ name: hostname, type: 'A' }] });
    setTimeout(() => {
      if (token !== MdnsService.startToken || MdnsService.responder !== responder) {
        return;
      }
      if (conflictWith) {
        webLog(
          `mDNS: ${hostname} is already in use by ${conflictWith}, so it was not claimed. ` +
            'Pick a different name in the network settings.',
        );
        return;
      }
      const announced = getAnnounceAddresses();
      MdnsService.sendFrom(announced, hostname, TTL_SECONDS);
      webLog(
        `mDNS: ${hostname} now resolves to this machine (${announced.map((a) => a.address).join(', ')})`,
      );
    }, PROBE_MS);
  }

  static stop() {
    MdnsService.startToken++;
    const responder = MdnsService.responder;
    if (!responder) {
      return;
    }
    MdnsService.responder = undefined;

    // A goodbye (TTL 0) lets neighbours drop the name now instead of when it expires.
    try {
      MdnsService.sendFrom(getAnnounceAddresses(), MdnsService.hostname, 0);
    } catch {
      // A socket may already be closing; there is nobody left to tell.
    }
    // destroy() takes effect on the next tick, after the goodbye above has been written.
    const senders = [...MdnsService.senders.values()];
    MdnsService.senders = new Map();
    setTimeout(() => {
      responder.destroy();
      senders.forEach((sender) => sender.destroy());
    }, 100);
    MdnsService.hostname = '';
  }

  /**
   * Which of our addresses to answer an asker with. A machine on two networks should hand each
   * asker the address on the network the question came from, since the other one is
   * unreachable to them. Only private addresses are offered (see getAnnounceAddresses).
   */
  private static addressesFor(askerIp: string): LocalAddress[] {
    const candidates = getAnnounceAddresses();
    const asker = toInt(askerIp);
    const sameSubnet = candidates.filter((a) => (a.ip & a.mask) >>> 0 === (asker & a.mask) >>> 0);
    return sameSubnet.length > 0 ? sameSubnet : candidates;
  }

  /** Send each address's own A record from a socket bound to that address. */
  private static sendFrom(addresses: LocalAddress[], hostname: string, ttl: number) {
    for (const local of addresses) {
      MdnsService.getSender(local.address).respond({
        answers: [{ name: hostname, type: 'A', ttl, flush: true, data: local.address }],
      });
    }
  }

  /** The sending socket for one local address, made on first use. */
  private static getSender(address: string): ReturnType<typeof mdns> {
    let sender = MdnsService.senders.get(address);
    if (!sender) {
      sender = mdns({ interface: address });
      sender.on('error', (e: Error) => webLog(`mDNS: could not send from ${address}:`, e.message));
      MdnsService.senders.set(address, sender);
    }
    return sender;
  }
}
