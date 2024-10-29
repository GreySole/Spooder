import { backendDir, KeyedObject } from 'src/Types.ts';
import OSCManager from './OSCManager.ts';
import si from 'systeminformation';

export default class MonitorManager {
  private static instance: MonitorManager;

  constructor() {
    if (MonitorManager.instance) {
      return MonitorManager.instance;
    }

    MonitorManager.instance = this;

    try {
      const oscFilePath = backendDir + '/settings/osc-tunnels.json';
    } catch (e: any) {
      console.log('OSC file error', e);
    }
  }

  /*private systemCheckInterval = setInterval(() => {
    this.getSystemStatus().then((status) => {
      console.log('System Status', status);
      OSCManager.sendToTCP('/monitor/system', JSON.stringify(status));
    });
  }, 3000);*/

  private monitorLogs = {
    logs: [] as KeyedObject[],
    pluginlogs: [] as KeyedObject[],
    liveLogging: 0,
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

  static pluginError = (pluginName: string, type: string, message: string) => {
    let timestamp = Date.now();
    MonitorManager.instance.monitorLogs.pluginlogs.push({
      timestamp: timestamp,
      name: pluginName,
      type: type,
      message: message,
    });
    if (MonitorManager.instance.monitorLogs.pluginlogs.length > 1000) {
      MonitorManager.instance.monitorLogs.pluginlogs.shift();
    }

    if (MonitorManager.instance.monitorLogs.liveLogging == 1) {
      OSCManager.sendToTCP(
        '/frontend/monitor/plugin',
        JSON.stringify({
          timestamp: timestamp,
          name: pluginName,
          type: type,
          message: message,
        }),
      );
    }
  };

  static sendToMonitor = (proto: string, direction: string, data: KeyedObject) => {
    let timestamp = Date.now();
    MonitorManager.instance.monitorLogs.logs.push({
      timestamp: timestamp,
      type: 'osc',
      protocol: proto,
      direction: direction,
      data: data,
    });
    if (MonitorManager.instance.monitorLogs.logs.length > 1000) {
      MonitorManager.instance.monitorLogs.logs.shift();
    }
    if (MonitorManager.instance.monitorLogs.liveLogging == 1) {
      OSCManager.sendToTCP(
        '/frontend/monitor/osc',
        JSON.stringify({
          timestamp: timestamp,
          type: 'osc',
          protocol: proto,
          direction: direction,
          data: data,
        }),
      );
    }
  };

  static getMonitorLogs = () => {
    return MonitorManager.instance.monitorLogs;
  };

  static getSystemStatus = async () => {
    return MonitorManager.instance.getSystemStatus();
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
