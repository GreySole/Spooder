import { KeyedObject, userDir } from '../../Types';
import { oscLog } from '../Logging';
import { EventService } from './EventService';
import OSCService from './OSCService';
import PluginService from './PluginService';
import fs from 'fs';

type ModCommand = string | number | boolean;

export class ModerationService {
  private static instance: ModerationService;

  constructor() {
    if (ModerationService.instance) {
      return ModerationService.instance;
    }

    ModerationService.instance = this;

    try {
      const modFilePath = userDir + '/settings/mod.json';
      if (!fs.existsSync(modFilePath)) {
        ModerationService.saveModFile();
      } else {
        const modFile = fs.readFileSync(modFilePath, {
          encoding: 'utf8',
        });
        ModerationService.instance.modlocks = JSON.parse(modFile);
      }
    } catch (e: any) {
      if (e.code == 'ENOENT') {
      }
    }
  }

  static getModlocks() {
    return ModerationService.instance.modlocks;
  }

  modlocks = {
    lockdown: 0,
    spamguard: 0,
    events: {},
    plugins: {},
    blacklist: {},
  } as KeyedObject;

  static blacklistUser(isBlacklisted: boolean, viewername: string, durationInSeconds?: number) {
    if (isBlacklisted) {
      ModerationService.instance.modlocks.blacklist[viewername].active = 0;
      clearTimeout(ModerationService.instance.modlocks.blacklist[viewername].timeout);
      ModerationService.instance.modlocks.blacklist[viewername].timeout = null;
    } else {
      ModerationService.instance.modlocks.blacklist[viewername].active = 1;
      if (durationInSeconds != null) {
        ModerationService.instance.modlocks.blacklist[viewername].timeout = setTimeout(() => {
          ModerationService.instance.modlocks.blacklist[viewername].active = 0;
        }, durationInSeconds * 1000);
      }
    }
    OSCService.sendToTCP('/mod/blacklist/' + viewername, {
      active: ModerationService.instance.modlocks.blacklist[viewername].active,
      timeout: durationInSeconds ? durationInSeconds * 1000 : null,
    });
    ModerationService.saveModFile();

    oscLog('Mod file saved!');
  }

  static saveModFile() {
    fs.writeFileSync(
      userDir + '/settings/mod.json',
      JSON.stringify(ModerationService.instance.modlocks),
      'utf-8',
    );
  }

  static isEventLocked(target: string) {
    return ModerationService.instance.modlocks.events[target] == 1;
  }

  static isPluginLocked(target: string) {
    return ModerationService.instance.modlocks.plugins[target] == 1;
  }

  static isOnLockdown() {
    return ModerationService.instance.modlocks.lockdown == 1;
  }

  static isSpamGuardOn() {
    return ModerationService.instance.modlocks.spamguard == 1;
  }

  static lockEvent(modCommand: ModCommand, target: string) {
    const events = EventService.getEvents();

    if (typeof modCommand == 'number') {
      modCommand = modCommand == 1 ? 'lock' : 'unlock';
    } else if (typeof modCommand == 'boolean') {
      modCommand = modCommand == true ? 'lock' : 'unlock';
    }
    let eventLocked = false;
    for (let e in events) {
      if (target == 'all') {
        ModerationService.instance.modlocks.events[e] = modCommand == 'lock' ? 1 : 0;
        OSCService.sendToTCP('/mod/lock/event/' + e, modCommand == 'lock' ? 1 : 0);
        eventLocked = true;
      } else if (e == target) {
        ModerationService.instance.modlocks.events[e] = modCommand == 'lock' ? 1 : 0;
        OSCService.sendToTCP('/mod/lock/event/' + e, modCommand == 'lock' ? 1 : 0);
        eventLocked = true;
        break;
      }
    }
    return eventLocked;
  }

  static setLockdown(modCommand: ModCommand) {
    if (typeof modCommand == 'number') {
      modCommand = modCommand == 1 ? 'lock' : 'unlock';
    } else if (typeof modCommand == 'boolean') {
      modCommand = modCommand == true ? 'lock' : 'unlock';
    }

    if (modCommand == 'lock') {
      ModerationService.instance.modlocks.lockdown = 1;
      OSCService.sendToTCP('/mod/lockdown', 1);
      return true;
    } else {
      ModerationService.instance.modlocks.lockdown = 0;
      OSCService.sendToTCP('/mod/lockdown', 0);
      return false;
    }
  }

  static lockPlugin(modCommand: ModCommand, plugin: string, target?: string) {
    const activePlugins = PluginService.getActivePlugins();

    if (typeof modCommand == 'number') {
      modCommand = modCommand == 1 ? 'lock' : 'unlock';
    } else if (typeof modCommand == 'boolean') {
      modCommand = modCommand == true ? 'lock' : 'unlock';
    }
    let pluginLocked = false;
    for (let p in activePlugins) {
      if (plugin == 'all') {
        ModerationService.instance.modlocks.plugins[p] = modCommand == 'lock' ? 1 : 0;
        OSCService.sendToTCP('/mod/lock/plugin/' + p, modCommand == 'lock' ? 1 : 0);
        pluginLocked = true;
      } else if (p == plugin) {
        if (ModerationService.instance.modlocks.plugins[p] == null) {
          ModerationService.instance.modlocks.plugins[p] = {};
        }
        if (target == null) {
          ModerationService.instance.modlocks.plugins[p] = modCommand == 'lock' ? 1 : 0;
          OSCService.sendToTCP('/mod/lock/plugin/' + p, modCommand == 'lock' ? 1 : 0);
          pluginLocked = true;
          break;
        } else {
          if (activePlugins[p].getExtra('modmap')) {
            const pluginModmap = activePlugins[p].getExtra('modmap');
            if (pluginModmap.locks) {
              pluginModmap.locks[target] = modCommand == 'lock' ? 1 : 0;
              OSCService.sendToTCP(
                '/mod/lock/plugin/' + p + '/' + target,
                modCommand == 'lock' ? 1 : 0,
              );
              pluginLocked = true;
              break;
            }
          }
        }
      }
    }
    return pluginLocked;
  }

  static stopEvent(cEvent: string) {
    const events = EventService.getEvents();
    const activeEvents = EventService.getActiveEvents();
    if (cEvent == 'all') {
      let eventCount = 0;
      for (let a in activeEvents) {
        EventService.stopEvent(a);
        eventCount++;
      }

      return eventCount + ' events have been stopped!';
    } else if (typeof activeEvents[cEvent] != 'undefined') {
      EventService.stopEvent(cEvent);
      return events[cEvent].name + ' has been stopped!';
    } else {
      return "I can't stop " + cEvent + '!';
    }
  }

  private convertToBoolean(modCommand: ModCommand): boolean {
    if (typeof modCommand == 'number') {
      return modCommand == 1 ? true : false;
    } else if (typeof modCommand == 'string') {
      return modCommand == 'lock' ? true : false;
    } else if (typeof modCommand == 'boolean') {
      return modCommand;
    }

    return false;
  }

  static setSpamGuard(isOn: ModCommand) {
    const boolIsOn = ModerationService.instance.convertToBoolean(isOn);
    if (isOn != null) {
      if (isOn == 'on') {
        ModerationService.instance.modlocks.spamguard = 1;
      } else if (isOn == 'off') {
        ModerationService.instance.modlocks.spamguard = 0;
      }
    } else {
      ModerationService.instance.modlocks.spamguard =
        ModerationService.instance.modlocks.spamguard == 1 ? 0 : 1;
    }
    OSCService.sendToTCP('/mod/spamguard', ModerationService.instance.modlocks.spamguard);
    if (ModerationService.instance.modlocks.spamguard == 1) {
      return 'Spam guard is ON';
    } else {
      return 'Spam guard is OFF';
    }
  }
}
