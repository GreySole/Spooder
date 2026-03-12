import { KeyedObject, StreamMessage } from '../../../Types';
import { spooderLog } from '../../Logging';
import { runResponseScript } from '../../util/ResponseUtil';
import { EventService } from '../EventService';
import PluginService from '../PluginService';

export default function EventPluginCommand(
  eCommand: any,
  eventName: string,
  streamMessage: StreamMessage,
  extra: KeyedObject = {},
) {
  const activePlugins = PluginService.getActivePlugins();
  return async () => {
    let commandDuration = parseFloat(eCommand.duration);

    console.log('EventPluginCommand', eCommand, eventName);

    if (eCommand.event) {
      streamMessage.pluginEventData = structuredClone(eCommand.event.values);
      const eventValues = streamMessage.pluginEventData;

      if (!streamMessage.pluginEventData) {
        streamMessage.pluginEventData = {};
      }

      if (Object.keys(eventValues ?? {}).some((key) => key.startsWith('_'))) {
        for (const key in eventValues) {
          if (key.startsWith('_')) {
            const preProcessFlags = eventValues[key];
            const realValueName = key.substring(1);
            if (preProcessFlags.use_response_processor) {
              const responseScript = eventValues[realValueName];
              console.log(
                `Preprocessing plugin response script for ${eCommand.pluginname} for ${streamMessage.username}`,
              );
              const response = await runResponseScript(
                eventName,
                streamMessage,
                extra,
                responseScript,
              );
              if (response.status === 'ok') {
                streamMessage.pluginEventData[realValueName] = response.response;
              } else {
                spooderLog(
                  `Error preprocessing plugin response script for ${eCommand.pluginname} in ${eCommand.event.name} for ${eventName}: ${response.response}`,
                );
              }
            }
          }
        }
      }

      console.log(
        'Triggering plugin event',
        eCommand.pluginname,
        eCommand.event.name,
        streamMessage.pluginEventData,
      );
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
