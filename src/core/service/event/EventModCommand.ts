import { sayInChat, EventService } from '../EventService';
import { ModerationService } from '../ModerationService';

export default function EventModCommand(
  eCommand: any,
  eventName: string,
  streamMessage: any,
  extra: any,
) {
  return () => {
    let commandDuration = parseFloat(eCommand.duration);
    const modlocks = ModerationService.getModlocks();
    if (eCommand.function == 'lock') {
      if (eCommand.targettype == 'all') {
        if (eCommand.etype == 'toggle') {
          modlocks.lockdown = modlocks.lockdown == 1 ? 0 : 1;
          ModerationService.lockEvent(modlocks.lockdown == 1 ? 'unlock' : 'lock', 'all');
          ModerationService.lockPlugin(modlocks.lockdown == 1 ? 'unlock' : 'lock', 'all');
          sayInChat(
            modlocks.lockdown == 0
              ? 'Lockdown initiated! All commands are blocked.'
              : 'Lockdown lifted!',
            streamMessage.platform,
            streamMessage.channel,
          );
        } else if (eCommand.etype == 'timed') {
          modlocks.lockdown = 1;
          ModerationService.lockEvent('lock', 'all');
          ModerationService.lockPlugin('lock', 'all');
          sayInChat(
            'Lockdown initiated for ' +
              EventService.convertDuration(commandDuration) +
              '! All commands are blocked until then.',
            streamMessage.platform,
            streamMessage.channel,
          );
          EventService.createTimeout(
            eventName,
            eCommand,
            eCommand.type,
            function () {
              ModerationService.lockEvent('unlock', 'all');
              ModerationService.lockPlugin('unlock', 'all');
              sayInChat('Lockdown lifted!', streamMessage.platform, streamMessage.channel);
            },
            commandDuration,
          );
        }
      } else if (eCommand.targettype == 'event') {
        if (eCommand.etype == 'toggle') {
          ModerationService.lockEvent(
            ModerationService.isEventLocked(eCommand.target) ? 'unlock' : 'lock',
            eCommand.target,
          );
        } else if (eCommand.etype == 'timed') {
          ModerationService.lockEvent('lock', eCommand.target);
          EventService.createTimeout(
            eventName,
            eCommand,
            eCommand.type,
            function () {
              ModerationService.lockEvent('unlock', eCommand.target);
            },
            commandDuration,
          );
        }
        extra[eCommand.target] = ModerationService.isEventLocked(eCommand.target);
      } else if (eCommand.targettype == 'plugin') {
        if (eCommand.etype == 'toggle') {
          ModerationService.lockPlugin(
            ModerationService.isPluginLocked(eCommand.target) ? 'unlock' : 'lock',
            eCommand.target,
          );
        } else if (eCommand.etype == 'timed') {
          ModerationService.lockPlugin('lock', eCommand.target);

          EventService.createTimeout(
            eventName,
            eCommand,
            eCommand.type,
            function () {
              ModerationService.lockPlugin('unlock', eCommand.target);
            },
            commandDuration,
          );
        }
        extra[eCommand.target] = ModerationService.isPluginLocked(eCommand.target);
      }
    } else if (eCommand.function == 'spamguard') {
      sayInChat(
        ModerationService.setSpamGuard(modlocks.spamguard == 1 ? 'off' : 'on'),
        streamMessage.platform,
        streamMessage.channel,
      );
      extra['_spamguard'] = modlocks.spamguard == 1;
    } else if (eCommand.function == 'stop') {
      if (eCommand.targettype == 'all') {
        sayInChat(
          ModerationService.stopEvent(eCommand.targettype),
          streamMessage.platform,
          streamMessage.channel,
        );
      } else {
        sayInChat(
          ModerationService.stopEvent(eCommand.target),
          streamMessage.platform,
          streamMessage.channel,
        );
      }
    }
  };
}
