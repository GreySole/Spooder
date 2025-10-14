import ModuleService from '../../core/service/ModuleService';
import OBS from './main';
import { sayInChat } from '../../core/service/EventService';

export default class ObsStreamMonitor {
  streamReconnecting = false;
  streamBleeding = false;
  streamBleedCount = 0;
  streamNormalCount = 0;
  skippedFrames = 0;
  monitorInterval: NodeJS.Timeout | null = null;
  constructor() {}

  startMonitoring() {
    const obs = ModuleService.getControlModule('obs') as OBS;
    const obsWebsocket = obs.websocket;
    this.monitorInterval = setInterval(() => {
      obsWebsocket
        .call('GetStreamStatus')
        .then((data: any) => {
          //console.log('OBS Stream Status:', data);
          if (data.outputReconnecting) {
            if (this.streamReconnecting == false) {
              this.streamReconnecting = true;
              console.log('OBS Stream: Reconnecting...');
              sayInChat('Stream is reconnecting...');
            }
          } else {
            if (this.streamReconnecting == true) {
              this.streamReconnecting = false;
              console.log('OBS Stream: Connection restored.');
              sayInChat('Stream is back online! Refresh your browser to catch up!');
            }
          }

          if (this.streamReconnecting) {
            return;
          }

          if (data.skippedFrames > this.skippedFrames) {
            this.skippedFrames = data.skippedFrames;
            this.streamBleedCount += 1;
          } else {
            if (this.streamBleeding) {
              this.streamNormalCount += 1;
              if (this.streamNormalCount >= 5) {
                this.streamBleeding = false;
                this.streamNormalCount = 0;
                this.streamBleedCount = 0;
                console.log('OBS Stream: Stream has stabilized.');
                sayInChat(
                  'Looks like the stream has stabilized. Refresh your browser to catch up!',
                );
              }
            }
          }

          if (this.streamBleedCount >= 5 && this.streamBleeding == false) {
            this.streamBleeding = true;

            console.log('OBS Stream: Detected skipped frames. Stream may be lagging.');
            sayInChat('Warning: Stream is experiencing skipped frames. Viewers may notice lag.');
          }
        })
        .catch(() => {
          console.log('OBS Stream Status: Unable to fetch stream status.');
        });
    }, 1000);
  }

  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }
}
