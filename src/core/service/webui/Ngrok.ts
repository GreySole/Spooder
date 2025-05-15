import ngrok from '@ngrok/ngrok';
import { webLog } from 'src/core/Logging.ts';
import ConfigService from '../ConfigService.ts';
import ModuleService from '../ModuleService.ts';
import { WebService } from '../WebService.ts';

export default class Ngrok {
  public async start() {
    const sconfig = ConfigService.getConfig();

    try {
      const httpListener = await ngrok.forward({
        addr: sconfig.network.host_port,
        proto: 'http',
        authtoken: sconfig.network.ngrok.authtoken,
      });

      const oscListener = await ngrok.forward({
        addr: sconfig.network.osc.osc_tcp_port,
        proto: 'http',
        authtoken: sconfig.network.ngrok.authtoken,
      });

      WebService.setPublicHTTPUrl(httpListener.url() ?? undefined);
      WebService.setPublicOSCUrl(oscListener.url() ?? undefined);

      ModuleService.onExternalNetworkChanged();
      webLog('Ngrok Tunnels Ready');
    } catch (e) {
      console.log('Error creating Ngrok tunnel', e);
      return;
    }
  }

  public stop() {
    ngrok.disconnect();
  }
}
