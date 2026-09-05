import { userDir, KeyedObject } from '../../Types';
import { spooderLog } from '../Logging';
import OSCService from './OSCService';
import si from 'systeminformation';

export interface OSCLog {
  address: string;
  direction: 'send' | 'receive';
  args: any[];
  timestamp: string;
}

export enum MonitorDataType {
  TCP = 'tcp',
  UDP = 'udp',
  Plugin = 'plugin',
}

export enum MonitorDirection {
  Send = 'send',
  Receive = 'receive',
}

// How often the background poll refreshes systemStatus. Matches DashboardTab's own refetch
// interval, so a client polling at its normal cadence always finds a fresh-enough value
// waiting rather than triggering the collection itself.
const SYSTEM_STATUS_POLL_MS = 3_000;

export default class MonitorService {
  private static instance: MonitorService;

  constructor() {
    if (MonitorService.instance) {
      return MonitorService.instance;
    }

    MonitorService.instance = this;

    // Collecting systemStatus (cpu/mem/disk/net via systeminformation) can take a couple of
    // seconds - fsSize and networkStats both shell out and enumerate every mount/interface.
    // Doing that inline on each /status request left the Dashboard tab's first load (and every
    // 3s refetch after it) waiting on the slowest of those calls. Polling in the background
    // instead means a request only ever reads the last completed snapshot, so it returns
    // immediately regardless of how long collection takes.
    this.refreshSystemStatus();
    setInterval(() => this.refreshSystemStatus(), SYSTEM_STATUS_POLL_MS);
  }

  private monitorLogs = {
    logs: [] as KeyedObject[],
    pluginlogs: [] as KeyedObject[],
    liveLogging: 0,
  };

  private oscMessageLog: KeyedObject = {
    udp: [] as OSCLog[],
    tcp: [] as OSCLog[],
    plugin: [] as OSCLog[],
  };

  // How long a subscriber can go without a heartbeat before it's swept as gone (tab closed,
  // crashed, network dropped) rather than explicitly unsubscribing.
  private static readonly LIVE_LOGGING_TTL_MS = 12_000;

  // Frontend instances currently watching the live feed (OSC Monitor tab, OSC Receive node
  // previews), keyed by a client-generated id and valued by last-seen timestamp. Replaces a
  // single shared on/off flag: with one flag, any instance closing - or another one turning
  // it off - silenced the feed for every other open instance too.
  private liveLoggingSubscribers = new Map<string, number>();

  private systemStatus = {
    cpu: 0,
    memory: {
      used: 0,
      total: 0,
    },
    disk: [] as KeyedObject[],
    net: {
      up: 0,
      down: 0,
      upSpeed: 0,
      downSpeed: 0,
    },
  };

  private sweepLiveLoggingSubscribers() {
    const cutoff = Date.now() - MonitorService.LIVE_LOGGING_TTL_MS;
    for (const [id, lastSeen] of this.liveLoggingSubscribers) {
      if (lastSeen < cutoff) {
        this.liveLoggingSubscribers.delete(id);
        spooderLog(`Live logging subscriber timed out: ${id}`);
      }
    }
  }

  // Registers a subscriber, or refreshes it if already known - mount and heartbeat both call
  // this, so there's no separate "renew" path to fall out of sync with "create".
  static subscribeLiveLogging(clientId: string) {
    const instance = MonitorService.instance;
    if (!instance.liveLoggingSubscribers.has(clientId)) {
      spooderLog(`Live logging subscriber connected: ${clientId}`);
    }
    instance.liveLoggingSubscribers.set(clientId, Date.now());
    instance.sweepLiveLoggingSubscribers();
  }

  static unsubscribeLiveLogging(clientId: string) {
    const instance = MonitorService.instance;
    if (instance.liveLoggingSubscribers.delete(clientId)) {
      spooderLog(`Live logging subscriber disconnected: ${clientId}`);
    }
  }

  private static isLiveLoggingEnabled() {
    const instance = MonitorService.instance;
    instance.sweepLiveLoggingSubscribers();
    return instance.liveLoggingSubscribers.size > 0;
  }

  static addLog(type: MonitorDataType, direction: MonitorDirection, address: string, args: any[]) {
    const timestamp = new Date().toISOString();
    const liveLogData = {
      type: type,
      address: address,
      direction: direction,
      args: args,
      timestamp: timestamp,
    };

    switch (type) {
      case MonitorDataType.TCP:
        MonitorService.instance.oscMessageLog.tcp.push(liveLogData);
        break;
      case MonitorDataType.UDP:
        MonitorService.instance.oscMessageLog.udp.push(liveLogData);
        break;
      case MonitorDataType.Plugin:
        MonitorService.instance.oscMessageLog.plugin.push(liveLogData);
        break;
    }

    if (MonitorService.instance.oscMessageLog.tcp.length > 100) {
      MonitorService.instance.oscMessageLog.tcp.shift();
    }
    if (MonitorService.instance.oscMessageLog.udp.length > 100) {
      MonitorService.instance.oscMessageLog.udp.shift();
    }
    if (MonitorService.instance.oscMessageLog.plugin.length > 100) {
      MonitorService.instance.oscMessageLog.plugin.shift();
    }

    if (MonitorService.isLiveLoggingEnabled()) {
      OSCService.sendToTCP('/spooder/monitor/log', JSON.stringify(liveLogData), false);
    }
  }

  static sendToMonitor = (proto: string, direction: string, data: KeyedObject) => {
    let timestamp = Date.now();
    console.log('SEND TO MONITOR', proto, direction, data);
    MonitorService.instance.oscMessageLog[proto]?.push({
      timestamp: timestamp,
      type: 'osc',
      protocol: proto,
      direction: direction,
      data: data,
    });
  };

  static getMonitorLogs = () => {
    return {
      ...MonitorService.instance.oscMessageLog,
      liveLogging: MonitorService.instance.liveLoggingSubscribers.size,
    };
  };

  // Always answers from the last completed background poll - see the constructor - rather
  // than collecting a fresh reading, so callers never wait on systeminformation.
  static getSystemStatus = async () => {
    return MonitorService.instance.systemStatus;
  };

  // Guards against a slow poll (e.g. a hung `df`) still running when the next tick fires,
  // which would otherwise pile up overlapping systeminformation calls.
  private refreshingSystemStatus = false;

  private refreshSystemStatus = async () => {
    if (this.refreshingSystemStatus) {
      return;
    }
    this.refreshingSystemStatus = true;
    try {
      const [cpu, memory, disk, net] = await Promise.all([
        this.getCpuUsage(),
        this.getMemoryUsage(),
        this.getDiskUsage(),
        this.getNetworkUsage(),
      ]);
      this.systemStatus = { cpu, memory, disk, net };
    } finally {
      this.refreshingSystemStatus = false;
    }
  };

  private getCpuUsage = async () => {
    try {
      const load = await si.currentLoad();
      return load.currentLoad;
    } catch (e) {
      console.error('CPU usage error:', e);
      return 0.0;
    }
  };

  private getMemoryUsage = async () => {
    try {
      const memory = await si.mem();
      const used = memory.active;
      const total = memory.total;
      return {
        used: used,
        total: total,
      };
    } catch (e) {
      console.error('Memory usage error:', e);
      return {
        used: 0,
        total: 0,
      };
    }
  };

  private getDiskUsage = async () => {
    try {
      const fsSize = await si.fsSize();
      if (fsSize) {
        return fsSize.map((fs) => {
          const used = fs.used;
          const total = fs.size;
          return {
            label: fs.fs,
            used: used,
            total: total,
            usage: fs.use,
          };
        });
      } else {
        throw new Error('Root filesystem not found');
      }
    } catch (e) {
      console.error('Disk usage error:', e);
      return [];
    }
  };

  private previousNetworkStats = {
    totalReceived: 0,
    totalSent: 0,
    timestamp: Date.now(),
  };

  private getNetworkUsage = async () => {
    try {
      const networkStats = await si.networkStats();

      let totalReceived = 0;
      let totalSent = 0;

      networkStats.forEach((iface) => {
        totalReceived += iface.rx_bytes;
        totalSent += iface.tx_bytes;
      });

      const currentTime = Date.now();
      const timeDiff = (currentTime - this.previousNetworkStats.timestamp) / 1000; // Time difference in seconds

      const receivedSpeed = (totalReceived - this.previousNetworkStats.totalReceived) / timeDiff; // Bytes per second
      const sentSpeed = (totalSent - this.previousNetworkStats.totalSent) / timeDiff; // Bytes per second

      // Update previous stats
      this.previousNetworkStats.totalReceived = totalReceived;
      this.previousNetworkStats.totalSent = totalSent;
      this.previousNetworkStats.timestamp = currentTime;

      const up = totalSent;
      const down = totalReceived;
      const upSpeed = sentSpeed;
      const downSpeed = receivedSpeed;

      return {
        up: up,
        down: down,
        upSpeed: upSpeed,
        downSpeed: downSpeed,
      };
    } catch (e) {
      console.error('Network usage error:', e);
      return {
        up: 0,
        down: 0,
        upSpeed: 0,
        downSpeed: 0,
      };
    }
  };
}
