import OSCService from '../../core/service/OSCService';

// Every OSC message OBS emits goes out on the module's own websocket (/osc/obs), never the
// shared /osc socket - see OBS.oscChannel. Only webui pages that mount an OscProvider with
// tag='obs' (the OBS Remote deck) receive any of it, so the meter stream stops costing
// anything the moment nobody has the deck open.
export const OBS_OSC_CHANNEL = 'obs';

export function sendToObsChannel(address: string, oscValue: any, log?: boolean) {
  OSCService.sendToChannel(OBS_OSC_CHANNEL, address, oscValue, log);
}

// True while at least one deck is connected to /osc/obs.
export function hasObsChannelClients() {
  return OSCService.getChannel(OBS_OSC_CHANNEL)?.hasClients ?? false;
}
