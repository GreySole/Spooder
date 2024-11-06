import { spooderLog } from 'src/core/Logging.ts';
import { EventService } from '../EventService.ts';
import PluginService from '../PluginService.ts';
import { StreamMessage } from 'src/Types.ts';

export default function EventPluginCommand(
  eCommand: any,
  eventName: string,
  streamMessage: StreamMessage,
) {
  const activePlugins = PluginService.getActivePlugins();
  return () => {
    let commandDuration = parseFloat(eCommand.duration);
    if (activePlugins[eCommand.pluginname] != null) {
      if (typeof activePlugins[eCommand.pluginname].onEvent == 'undefined') {
        spooderLog(activePlugins[eCommand.pluginname], 'onEvent() NOT FOUND');
        return;
      }
    }

    if (activePlugins[eCommand.pluginname]?.onEvent != null) {
      if (eCommand.stop_eventname) {
        EventService.createTimeout(
          eventName,
          eCommand,
          'timed',
          function () {
            activePlugins[eCommand.pluginname].onEvent(eCommand.stop_eventname, streamMessage);
          },
          commandDuration,
        );
      }
      activePlugins[eCommand.pluginname].onEvent(eCommand.eventname, streamMessage);
    }
  };
}
