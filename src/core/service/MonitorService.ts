import { userDir, KeyedObject } from '../../Types';
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

export default class MonitorService {
  private static instance: MonitorService;

  constructor() {
    if (MonitorService.instance) {
      return MonitorService.instance;
    }

    MonitorService.instance = this;
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
    liveLogEnabled: 0,
  };

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

  static enableLiveLogging() {
    MonitorService.instance.oscMessageLog.liveLogEnabled = 1;
  }

  static disableLiveLogging() {
    MonitorService.instance.oscMessageLog.liveLogEnabled = 0;
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

    if (MonitorService.instance.oscMessageLog.liveLogEnabled == 1) {
      console.log('Live Send To Monitor', type, direction, address, liveLogData);

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
    return MonitorService.instance.oscMessageLog;
  };

  static getSystemStatus = async () => {
    return MonitorService.instance.getSystemStatus();
  };

  private getSystemStatus = async () => {
    this.systemStatus.cpu = await this.getCpuUsage();
    this.systemStatus.memory = await this.getMemoryUsage();
    this.systemStatus.disk = await this.getDiskUsage();
    this.systemStatus.net = await this.getNetworkUsage();
    return this.systemStatus;
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
