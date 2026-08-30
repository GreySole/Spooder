import { EventService } from '../../core/service/EventService';
import ModuleService from '../../core/service/ModuleService';
import { buildMockStreamMessage } from '../../core/util/ResponseUtil';
import { KeyedObject } from '../../Types';
import OBS from './obs';

// How many consecutive polls have to show new skipped frames before the stream counts as
// bleeding, and how many clean polls in a row bring it back to normal. Polls are one second
// apart, so these are effectively seconds.
const BLEED_POLLS = 5;
const RECOVERY_POLLS = 5;

export default class ObsStreamMonitor {
  streamBleeding = false;
  streamBleedCount = 0;
  streamNormalCount = 0;
  skippedFrames = 0;
  monitorInterval: NodeJS.Timeout | null = null;
  constructor() {}

  // The monitor only reports - what happens on a run of dropped frames is up to whatever event
  // graphs listen for the trigger.
  private emit(triggerNodeId: string, payload: KeyedObject) {
    const streamMessage = buildMockStreamMessage('');
    streamMessage.platformEventData = payload;
    EventService.emitTrigger('obs', triggerNodeId, payload, streamMessage);
  }

  startMonitoring() {
    // A fresh output starts from a clean slate: skipped-frame counts reset with it, so carrying
    // the last stream's totals over would read every frame as newly skipped.
    this.stopMonitoring();
    this.streamBleeding = false;
    this.streamBleedCount = 0;
    this.streamNormalCount = 0;
    this.skippedFrames = 0;

    const obs = ModuleService.getControlModule('obs') as OBS;
    const obsWebsocket = obs.websocket;
    this.monitorInterval = setInterval(() => {
      obsWebsocket
        .call('GetStreamStatus')
        .then((data: any) => {
          const frames = {
            skippedFrames: data.outputSkippedFrames ?? 0,
            totalFrames: data.outputTotalFrames ?? 0,
          };

          // Frames skipped while the output is reconnecting say nothing about how the stream is
          // holding up, so the count only moves while the connection is up. The reconnect itself
          // is OBS's own StreamStateChanged event, not something to poll for.
          if (data.outputReconnecting) {
            return;
          }

          if (frames.skippedFrames > this.skippedFrames) {
            this.skippedFrames = frames.skippedFrames;
            this.streamBleedCount += 1;
          } else {
            if (this.streamBleeding) {
              this.streamNormalCount += 1;
              if (this.streamNormalCount >= RECOVERY_POLLS) {
                this.streamBleeding = false;
                this.streamNormalCount = 0;
                this.streamBleedCount = 0;
                console.log('OBS Stream: Stream has stabilized.');
                this.emit('stream_frame_drops', { isDropping: false, ...frames });
              }
            }
          }

          if (this.streamBleedCount >= BLEED_POLLS && this.streamBleeding == false) {
            this.streamBleeding = true;

            console.log('OBS Stream: Detected skipped frames. Stream may be lagging.');
            this.emit('stream_frame_drops', { isDropping: true, ...frames });
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
