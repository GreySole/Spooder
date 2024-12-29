import ngrok from 'ngrok';
import { webLog } from 'src/core/Logging.ts';
import ConfigService from '../ConfigService.ts';
import ModuleService from '../ModuleService.ts';

export default class Ngrok {
  public async start() {
    const sconfig = ConfigService.getConfig();
    if (ConfigService.getFlags().safeMode == true) {
      return;
    }

    try {
      await ngrok.connect({
        authtoken: sconfig.network.ngrokauthtoken,
      });
    } catch (e) {
      console.log('Error creating Ngrok tunnel', e);
      return;
    }

    let napi = ngrok.getApi();

    if (!napi) {
      webLog('Ngrok error: Could not connect to API');
      return;
    }

    let tunnels = await napi.listTunnels();
    for (let t in tunnels.tunnels) {
      napi.stopTunnel(tunnels.tunnels[t].name);
    }

    let httpURL = await napi.startTunnel({
      name: 'webui',
      proto: 'http',
      addr: sconfig.network.host_port,
    });

    tunnels = await napi.listTunnels();

    for (let t in tunnels.tunnels) {
      if (tunnels.tunnels[t].proto == 'http') {
        napi.stopTunnel(tunnels.tunnels[t].name);
      }
    }

    let oscURL = await napi.startTunnel({
      name: 'modui',
      proto: 'http',
      addr: sconfig.network.osc_tcp_port,
    });

    tunnels = await napi.listTunnels();

    for (let t in tunnels.tunnels) {
      if (tunnels.tunnels[t].proto == 'http') {
        napi.stopTunnel(tunnels.tunnels[t].name);
      }
    }

    sconfig.network.external_http_url = httpURL.public_url;
    sconfig.network.external_tcp_url = oscURL.public_url;

    const streamModules = ModuleService.getStreamModules();
    const communityModules = ModuleService.getCommunityModules();

    for (let s in streamModules) {
      streamModules[s].onNgrokStart();
    }

    for (let c in communityModules) {
      communityModules[c].onNgrokStart();
    }
  }

  public stop() {
    ngrok.disconnect();
  }
}
