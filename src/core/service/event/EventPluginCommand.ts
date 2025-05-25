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

    console.log('EventPluginCommand', eCommand, eventName);

    if (eCommand.event) {
      streamMessage.pluginEventData = eCommand.event.values;
      activePlugins[eCommand.pluginname].onEvent(eCommand.event.name, streamMessage);
      return;
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
