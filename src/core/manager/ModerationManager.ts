import { KeyedObject, backendDir } from '../../Types.ts';
import { oscLog } from '../Logging.ts';
import { EventManager } from './EventManager.ts';
import OSCManager from './OSCManager.ts';
import PluginManager from './PluginManager.ts';
import fs from 'fs';

type ModCommand = string | number | boolean;

export class ModerationManager {
  private static instance: ModerationManager;

  constructor() {
    if (ModerationManager.instance) {
      return ModerationManager.instance;
    }

    ModerationManager.instance = this;

    try {
      const modFilePath = backendDir + '/settings/mod.json';
      if (!fs.existsSync(modFilePath)) {
        ModerationManager.saveModFile();
      } else {
        const modFile = fs.readFileSync(modFilePath, {
          encoding: 'utf8',
        });
        ModerationManager.instance.modlocks = JSON.parse(modFile);
      }
    } catch (e: any) {
      if (e.code == 'ENOENT') {
      }
    }
  }

  static getModlocks() {
    return ModerationManager.instance.modlocks;
  }

  modlocks = {
    lockdown: 0,
    spamguard: 0,
    events: {},
    plugins: {},
    blacklist: {},
  } as KeyedObject;

  static blacklistUser(viewername: string, duration: number) {
    if (ModerationManager.instance.modlocks.blacklist[viewername] == null) {
      ModerationManager.instance.modlocks.blacklist[viewername] = {};
    }
    ModerationManager.instance.modlocks.blacklist[viewername].active = 1;
    if (duration != null) {
      ModerationManager.instance.modlocks.blacklist[viewername].timeout = setTimeout(() => {
        ModerationManager.instance.modlocks.blacklist[viewername].active = 0;
      }, duration);
    }

    ModerationManager.saveModFile();

    oscLog('Mod file saved!');
  }

  static saveModFile() {
    fs.writeFileSync(
      backendDir + '/settings/mod.json',
      JSON.stringify(ModerationManager.instance.modlocks),
      'utf-8',
    );
  }

  static isEventLocked(target: string) {
    return ModerationManager.instance.modlocks.events[target] == 1;
  }

  static isPluginLocked(target: string) {
    return ModerationManager.instance.modlocks.plugins[target] == 1;
  }

  static lockEvent(modCommand: ModCommand, target: string) {
    const events = EventManager.getEvents();

    if (typeof modCommand == 'number') {
      modCommand = modCommand == 1 ? 'lock' : 'unlock';
    } else if (typeof modCommand == 'boolean') {
      modCommand = modCommand == true ? 'lock' : 'unlock';
    }
    let eventLocked = false;
    for (let e in events) {
      if (target == 'all') {
        ModerationManager.instance.modlocks.events[e] = modCommand == 'lock' ? 1 : 0;
        OSCManager.sendToTCP(
          '/mod/local/' + modCommand + '/event/' + e,
          modCommand == 'lock' ? 1 : 0,
        );
        eventLocked = true;
      } else if (e == target) {
        ModerationManager.instance.modlocks.events[e] = modCommand == 'lock' ? 1 : 0;
        OSCManager.sendToTCP(
          '/mod/local/' + modCommand + '/event/' + e,
          modCommand == 'lock' ? 1 : 0,
        );
        eventLocked = true;
        break;
      }
    }
    return eventLocked;
  }

  static lockPlugin(modCommand: ModCommand, plugin: string, target?: string) {
    const activePlugins = PluginManager.getActivePlugins();

    if (typeof modCommand == 'number') {
      modCommand = modCommand == 1 ? 'lock' : 'unlock';
    } else if (typeof modCommand == 'boolean') {
      modCommand = modCommand == true ? 'lock' : 'unlock';
    }
    let pluginLocked = false;
    for (let p in activePlugins) {
      if (plugin == 'all') {
        ModerationManager.instance.modlocks.plugins[p] = modCommand == 'lock' ? 1 : 0;
        OSCManager.sendToTCP(
          '/mod/local/' + modCommand + '/plugin/' + p,
          modCommand == 'lock' ? 1 : 0,
        );
        pluginLocked = true;
      } else if (p == plugin) {
        if (ModerationManager.instance.modlocks.plugins[p] == null) {
          ModerationManager.instance.modlocks.plugins[p] = {};
        }
        if (target == null) {
          ModerationManager.instance.modlocks.plugins[p] = modCommand == 'lock' ? 1 : 0;
          OSCManager.sendToTCP(
            '/mod/local/' + modCommand + '/plugin/' + p,
            modCommand == 'lock' ? 1 : 0,
          );
          pluginLocked = true;
          break;
        } else {
          if (activePlugins[p].modmap) {
            if (activePlugins[p].modmap.locks) {
              activePlugins[p].modmap.locks[target] = modCommand == 'lock' ? 1 : 0;
              OSCManager.sendToTCP(
                '/mod/local/' + modCommand + '/plugin/' + p + '/' + target,
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
    const events = EventManager.getEvents();
    const activeEvents = EventManager.getActiveEvents();
    if (cEvent == 'all') {
      let eventCount = 0;
      for (let a in activeEvents) {
        EventManager.stopEvent(a);
        eventCount++;
      }

      return eventCount + ' events have been stopped!';
    } else if (typeof activeEvents[cEvent] != 'undefined') {
      EventManager.stopEvent(cEvent);
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
    const boolIsOn = ModerationManager.instance.convertToBoolean(isOn);
    if (isOn != null) {
      if (isOn == 'on') {
        ModerationManager.instance.modlocks.spamguard = 1;
      } else if (isOn == 'off') {
        ModerationManager.instance.modlocks.spamguard = 0;
      }
    } else {
      ModerationManager.instance.modlocks.spamguard =
        ModerationManager.instance.modlocks.spamguard == 1 ? 0 : 1;
    }
    if (ModerationManager.instance.modlocks.spamguard == 1) {
      return 'Spam guard is ON';
    } else {
      return 'Spam guard is OFF';
    }
  }
}
