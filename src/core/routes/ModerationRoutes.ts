import express, { NextFunction, Request, Response } from 'express';
import { PermissionType, KeyedObject, userDir } from '../../Types';
import ConfigService from '../service/ConfigService';
import { EventService, sayInChat } from '../service/EventService';
import { ModerationService } from '../service/ModerationService';
import PluginService from '../service/PluginService';
import UserService from '../service/UserService';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import {
  buildMockStreamMessage,
  checkResponseTrigger,
  verifyResponseScript,
} from '../util/ResponseUtil';
import { isLocal, WebService } from '../service/WebService';
import { triggerExistsAndEnabled } from '../util/EventTriggerUtil';
import e from 'express';

export function validateModAccess(req: Request, res: Response, next: NextFunction) {
  const isValid = validateUser(req);

  if (isValid === 'ok') {
    next();
  } else {
    res.redirect('/login?reason=' + isValid);
  }
}

export function validateUser(req: Request) {
  const accessCookie = req.cookies?.['access'];
  if (!accessCookie) {
    return 'No access cookie';
  }
  if (UserService.getActiveUserFromCookie(accessCookie) == 'local') {
    return 'ok';
  }
  if (!UserService.isActive(accessCookie)) {
    return 'Not logged in';
  } else if (
    !UserService.checkPermission(UserService.getActiveUserFromCookie(accessCookie), [
      PermissionType.admin,
      PermissionType.mod,
    ])
  ) {
    return 'Lacking permissions';
  }
  return 'ok';
}

export function ModerationRoutes() {
  const storage = multer.memoryStorage();
  const upload = multer({ storage: storage });
  const router = express.Router();

  router.use(express.json());
  router.use(upload.none());
  const publicRouter = express.Router();
  publicRouter.use(express.json());
  publicRouter.use(upload.none());

  async function getModmap(req: Request, res: Response) {
    const isLocalHost = isLocal(req);
    const accessCookie = req.cookies['access'];
    let moduser = null;
    if (!isLocalHost) {
      if (validateUser(req) !== 'ok') {
        res.send({ status: 'unauthorized' });
        return;
      }
      moduser = UserService.getActiveUserFromCookie(accessCookie);
    } else {
      if (!UserService.isActive(accessCookie)) {
        moduser = 'local';
        let browserToken = crypto.randomBytes(48).toString('hex');
        UserService.setActiveUser(moduser, browserToken);
        res.cookie('access', browserToken, {
          maxAge: 86400 * 1000,
          httpOnly: true,
          secure: false,
        });
      } else {
        moduser = UserService.getActiveUserFromCookie(accessCookie);
      }
    }

    const events = EventService.getEvents();

    let chatCommands = {} as KeyedObject;
    for (let e in events) {
      if (triggerExistsAndEnabled(events[e], 'chat')) {
        chatCommands[e] = {
          name: events[e].name,
          group: events[e].group,
          description: events[e].description,
        };
      }
    }

    const activePlugins = PluginService.getActivePlugins();
    let modplugins = {} as KeyedObject;
    for (let p in activePlugins) {
      let hasUtility = fs.existsSync(path.join(userDir, 'web', 'utility', p));
      modplugins[p] = {
        name: activePlugins[p].name,
        modmap: activePlugins[p].getExtra('modmap'),
        utility: hasUtility,
      };
    }

    let oscURL = null;
    let oscPort = null;
    const sconfig = ConfigService.getConfig();

    if (isLocalHost) {
      oscURL = sconfig.network.host;
      oscPort = sconfig.network.host_port;
    } else {
      oscURL = WebService.getPublicOSCUrl();
    }

    const modlocks = ModerationService.getModlocks();

    const activeEvents = EventService.getActiveEvents();
    console.log('Active Events:', activeEvents);
    const modActiveEvents = {} as KeyedObject;
    for (let a in activeEvents) {
      modActiveEvents[a] = activeEvents[a].map((command: any) => {
        return {
          etype: command.etype,
          timeout: command.timeout,
          start_time: command.start_time,
          command: command.command,
        };
      });
    }

    res.send({
      status: 'ok',
      oscURL: oscURL,
      oscPort: oscPort,
      moduser: moduser,
      modmap: {
        commands: chatCommands,
        active_events: modActiveEvents,
        plugins: modplugins,
        modlocks: modlocks,
      },
    });
  }

  router.get('/modmap', getModmap);
  publicRouter.get('/modmap', getModmap);

  function modEventLock(req: Request, res: Response) {
    const isLocked = req.body.isOn === true;
    const target = req.body.eventName;

    if (validateUser(req) !== 'ok') {
      res.send({ status: 'unauthorized' });
      return;
    }
    const accessCookie = req.cookies['access'];
    const modUser = UserService.getActiveUserFromCookie(accessCookie);
    let lockString = isLocked === true ? 'locked' : 'unlocked';

    ModerationService.lockEvent(isLocked, target);
    sayInChat(`${modUser} ${lockString} ${target}`);
    res.send({ status: 'ok' });
  }

  router.post('/lock/event', modEventLock);
  publicRouter.post('/lock/event', modEventLock);

  function modPluginLock(req: Request, res: Response) {
    const isLocked = req.body.isOn === true;
    const pluginName = req.body.pluginName;
    const subLockName = req.body.subLockName;

    if (validateUser(req) !== 'ok') {
      res.send({ status: 'unauthorized' });
      return;
    }
    const accessCookie = req.cookies['access'];
    const modUser = UserService.getActiveUserFromCookie(accessCookie);
    let lockString = isLocked === true ? 'locked' : 'unlocked';
    const pluginDisplayName = PluginService.getActivePlugins()[pluginName]?.name;

    if (subLockName == null) {
      ModerationService.lockPlugin(isLocked, pluginName);
      sayInChat(`${modUser} ${lockString} ${pluginDisplayName}`);
    } else {
      ModerationService.lockPlugin(isLocked, pluginName, subLockName);
      sayInChat(`${modUser} ${lockString} ${subLockName} in ${pluginDisplayName}`);
    }
    res.send({ status: 'ok' });
  }

  router.post('/lock/plugin', modPluginLock);
  publicRouter.post('/lock/plugin', modPluginLock);

  function modLockdown(req: Request, res: Response) {
    if (validateUser(req) !== 'ok') {
      res.send({ status: 'unauthorized' });
      return;
    }
    const isLocked = req.body.isOn === true;
    const accessCookie = req.cookies['access'];
    const modUser = UserService.getActiveUserFromCookie(accessCookie);
    let lockString = isLocked === true ? 'locked' : 'unlocked';

    ModerationService.setLockdown(isLocked);
    sayInChat(`${modUser} ${lockString} the chat`);
    res.send({ status: 'ok' });
  }

  router.post('/set_lockdown', modLockdown);
  publicRouter.post('/set_lockdown', modLockdown);

  function modBlacklist(req: Request, res: Response) {
    if (validateUser(req) !== 'ok') {
      res.send({ status: 'unauthorized' });
      return;
    }
    const accessCookie = req.cookies['access'];
    const modUser = UserService.getActiveUserFromCookie(accessCookie);
    const isBlacklisted = req.body.blacklist == true;
    const blackListUser = req.body.user;

    ModerationService.blacklistUser(isBlacklisted, blackListUser, -1);

    sayInChat(`${modUser} ${isBlacklisted ? ' blacklisted ' : ' unblacklisted '} ${blackListUser}`);
    res.send({ status: 'ok' });
  }

  router.post('/blacklist', modBlacklist);
  publicRouter.post('/blacklist', modBlacklist);

  function modSpamGuard(req: Request, res: Response) {
    const isSpamGuarded = req.body.spamguard == true;
    if (validateUser(req) !== 'ok') {
      res.send({ status: 'unauthorized' });
      return;
    }
    ModerationService.setSpamGuard(isSpamGuarded);
    sayInChat(`Spam Guard is now ${isSpamGuarded ? 'enabled' : 'disabled'}`);
    res.send({ status: 'ok' });
  }

  router.post('/spamguard', modSpamGuard);
  publicRouter.post('/spamguard', modSpamGuard);

  function modSaveTheme(req: Request, res: Response) {
    console.log(req.body);

    if (validateUser(req) !== 'ok') {
      res.send({ status: 'unauthorized' });
      return;
    }
    const hue = req.body.hue;
    const saturation = req.body.saturation;
    const isDarkTheme = req.body.isDarkTheme;
    const accessCookie = req.cookies['access'];
    const modUser = UserService.getActiveUserFromCookie(accessCookie);
    const themes = ConfigService.getThemes();
    if (themes.modui[modUser] == null) {
      themes.modui[modUser] = {};
    }
    themes.modui[modUser] = { hue, saturation, isDarkTheme };
    ConfigService.saveThemes(themes);
    res.send({ status: 'ok' });
  }

  function modStopAll(req: Request, res: Response) {
    if (validateUser(req) !== 'ok') {
      res.send({ status: 'unauthorized' });
      return;
    }
    const accessCookie = req.cookies['access'];
    const modUser = UserService.getActiveUserFromCookie(accessCookie);
    sayInChat(`${modUser} stopped all events`);
    const activeEvents = EventService.getActiveEvents();
    let eventCount = 0;
    for (let a in activeEvents) {
      EventService.stopEvent(a);
      eventCount++;
    }
    res.send({ status: 'ok', event_count: eventCount });
  }

  router.post('/stop_all_events', modStopAll);
  publicRouter.post('/stop_all_events', modStopAll);

  router.post('/save_theme', modSaveTheme);
  publicRouter.post('/save_theme', modSaveTheme);

  async function verifyResponseScriptPOST(req: Request, res: Response) {
    console.log(req.body);
    const command = req.body.command;
    const script = req.body.script;
    const message = buildMockStreamMessage(req.body.message);
    const eventTemplate = {
      name: command,
      description: '',
      group: '_ModCommands',
      triggers: {
        chat: {
          enabled: true,
          command: command,
          search: false,
          vip: false,
          mod: false,
          sub: false,
          broadcaster: false,
        },
      },
      commands: [
        {
          type: 'response',
          message: script,
          delay: 0,
        },
      ],
      cooldown: 0,
      chatnotification: false,
      cooldownnotification: false,
    };
    let check = checkResponseTrigger(eventTemplate, message);
    if (check != null) {
      let response = await verifyResponseScript(
        command,
        check.message,
        check.extra as string[],
        script,
      );
      res.send(response);
    } else {
      res.send({
        status: 'error',
        response: 'The input text did not trigger the response.',
      });
    }
  }

  router.post('/verify_response_script', verifyResponseScriptPOST);
  publicRouter.post('/verify_response_script', verifyResponseScriptPOST);

  function getModCommands(req: Request, res: Response) {
    if (validateUser(req) !== 'ok') {
      res.send({ status: 'unauthorized' });
      return;
    }
    const commands = EventService.getModCommands();
    res.send(commands);
  }

  router.get('/get_mod_commands', getModCommands);
  publicRouter.get('/get_mod_commands', getModCommands);

  function addModCommand(req: Request, res: Response) {
    if (validateUser(req) !== 'ok') {
      res.send({ status: 'unauthorized' });
      return;
    }
    const command = req.body.command;
    const isSearchAndMatch = req.body.search;
    const permissions = {
      vip: req.body.vip,
      mod: req.body.mod,
      sub: req.body.sub,
      broadcaster: req.body.broadcaster,
    };
    const script = req.body.script;

    const commandId = EventService.addModCommand(command, isSearchAndMatch, permissions, script);
    res.send({ status: 'ok', commandId });
  }

  router.post('/add_mod_command', addModCommand);
  publicRouter.post('/add_mod_command', addModCommand);

  function updateModCommand(req: Request, res: Response) {
    if (validateUser(req) !== 'ok') {
      res.send({ status: 'unauthorized' });
      return;
    }
    const commandId = req.body.commandId;
    const enabled = req.body.enabled;
    const command = req.body.command;
    const isSearchAndMatch = req.body.search;
    const permissions = {
      vip: req.body.vip,
      mod: req.body.mod,
      sub: req.body.sub,
      broadcaster: req.body.broadcaster,
    };
    const script = req.body.script;

    EventService.updateModCommand(
      commandId,
      enabled,
      command,
      isSearchAndMatch,
      permissions,
      script,
    );
    res.send({ status: 'ok' });
  }

  router.post('/update_mod_command', updateModCommand);
  publicRouter.post('/update_mod_command', updateModCommand);

  function removeModCommand(req: Request, res: Response) {
    if (validateUser(req) !== 'ok') {
      res.send({ status: 'unauthorized' });
      return;
    }
    const commandId = req.body.commandId;
    EventService.removeModCommand(commandId);
  }

  router.post('/remove_mod_command', removeModCommand);
  publicRouter.post('/remove_mod_command', removeModCommand);

  return { local: router, public: publicRouter };
}
