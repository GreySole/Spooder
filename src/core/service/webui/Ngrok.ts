import ngrok from 'ngrok';
import { webLog } from 'src/core/Logging.ts';
import ConfigService from '../ConfigService.ts';
import ModuleService from '../ModuleService.ts';
import { WebService } from '../WebService.ts';

export default class Ngrok {
  public async start() {
    const sconfig = ConfigService.getConfig();

    try {
      await ngrok.connect({
        authtoken: sconfig.network.ngrok.authtoken,
        subdomain: sconfig.network.ngrok.subdomain,
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
      addr: sconfig.network.osc.osc_tcp_port,
    });

    tunnels = await napi.listTunnels();

    for (let t in tunnels.tunnels) {
      if (tunnels.tunnels[t].proto == 'http') {
        napi.stopTunnel(tunnels.tunnels[t].name);
      }
    }

    WebService.setPublicHTTPUrl(httpURL.public_url);
    WebService.setPublicOSCUrl(oscURL.public_url);

    ModuleService.onExternalNetworkChanged();
    webLog('Ngrok Tunnels Ready');
  }

  public stop() {
    ngrok.disconnect();
  }
}
