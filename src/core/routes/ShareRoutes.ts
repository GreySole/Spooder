import express, { json, Request, Response } from 'express';
import { KeyedObject, userDir } from '../../Types';
import { EventService } from '../service/EventService';
import ModuleService from '../service/ModuleService';
import PluginService from '../service/PluginService';
import ShareService from '../service/ShareService';
import { webLog } from '../Logging';
import { triggerExistsAndEnabled } from '../util/EventTriggerUtil';
import ConfigService from '../service/ConfigService';
import path, { dirname } from 'path';
import multer from 'multer';
import chmodr from 'chmodr';
import fs from 'fs-extra';

export function ShareRoutes() {
  const router = express.Router();
  const publicRouter = express.Router();

  router.get('/list', async (req: Request, res: Response) => {
    let chatCommands = {} as KeyedObject;

    const events = EventService.getEvents();
    const activePlugins = PluginService.getActivePlugins();
    const shares = ShareService.getShares();

    for (let e in events) {
      if (triggerExistsAndEnabled(events[e].triggers, 'chat')) {
        chatCommands[e] = events[e].triggers.chat.command;
      }
    }
    let plugins = {} as KeyedObject;
    for (let p in activePlugins) {
      plugins[p] = activePlugins[p].name;
    }

    res.send(shares);
  });

  router.get('/plugin_keys', async (req: Request, res: Response) => {
    const pluginKeys = ShareService.getShares().pluginKeys;
    res.send(pluginKeys);
  });

  router.post('/delete_plugin_key', async (req: Request, res: Response) => {
    const pluginKey = req.body.plugin_key as string;
    const pluginKeys = ShareService.getShares().pluginKeys;
    res.send(pluginKeys);
  });

  router.get('/active_shares', async (req: Request, res: Response) => {
    const activeShares = await ShareService.getActiveShares();
    res.send(activeShares);
  });

  router.get('/verify_share_target', async (req: Request, res: Response) => {
    const shareUser = req.query.shareuser as string;
    const sharePlatform = req.query.shareplatform as string;
    const streamModules = ModuleService.getStreamModules();
    if (!streamModules[sharePlatform]) {
      return;
    }
    streamModules[sharePlatform]
      .verifyShareTarget(shareUser)
      .then((userInfo) => {
        if (userInfo != null) {
          res.send({
            status: 'ok',
            info: userInfo,
          });
        } else {
          res.send({
            status: 'notfound',
          });
        }
      })
      .catch((e) => {
        console.log('Error verifying share target', e);
        res.send({
          status: 'error',
          message: 'Error verifying share target',
        });
      });
  });

  router.post('/save_share', async (req: Request, res: Response) => {
    const { shareId, shareData } = req.body;
    ShareService.saveShare(shareId, shareData);
    res.send({ status: 'ok' });
    webLog('SAVED THE SHARES');
  });

  router.post('/create_share', async (req: Request, res: Response) => {
    const { streamingPlatforms } = req.body;
    ShareService.createShare(streamingPlatforms);
    res.send({ status: 'ok' });
  });

  router.post('/delete_share', async (req: Request, res: Response) => {
    const { shareId } = req.body;
    ShareService.deleteShare(shareId);
    res.send({ status: 'ok' });
  });

  router.post('/set_share', (req: Request, res: Response) => {
    const shareUser = req.body.shareId;
    const isEnabled = req.body.enabled;
    const joinMessage = req.body.joinMessage;
    const leaveMessage = req.body.leaveMessage;

    ShareService.setShare(shareUser, isEnabled, isEnabled ? joinMessage : leaveMessage);

    res.send({ status: 'ok' });
  });

  router.post('/set_auto_share', (req: Request, res: Response) => {
    const shareId = req.body.shareId as string;
    const isEnabled = req.body.enabled as boolean;
    ShareService.setAutoShare(shareId, isEnabled);
    res.send({ status: 'ok' });
  });

  router.post('/create_share_key', (req: Request, res: Response) => {
    const shareId = req.body.shareId as string;
    const shareKey = ShareService.generateShareKey(shareId, false);
    res.send({
      status: 'ok',
      shareKey: shareKey,
    });
  });

  router.post('/delete_share_key', (req: Request, res: Response) => {
    const shareId = req.body.shareId as string;
    ShareService.deleteShareKey(shareId);
    res.send({ status: 'ok' });
  });

  function getShareUser(req: Request, res: Response) {
    const shareKey = req.query.key as string;
    const config = ConfigService.getConfig();
    if (!shareKey) {
      return res.status(400).send({
        owner: {
          ownerName: config.bot.owner_name,
          botName: config.bot.bot_name,
        },
        error: 'Share key is required',
      });
    }
    const share = ShareService.getShareByKey(shareKey);
    if (!share) {
      return res.status(404).send({
        owner: {
          ownerName: config.bot.owner_name,
          botName: config.bot.bot_name,
        },
        error: 'Share not found',
      });
    }

    res.send({
      owner: {
        ownerName: config.bot.owner_name,
        botName: config.bot.bot_name,
      },
      share: share,
    });
  }

  router.get('/get_user', getShareUser);
  publicRouter.get('/get_user', getShareUser);

  function getSharedCommands(req: Request, res: Response) {
    const shareKey = req.query.key as string;
    if (!shareKey) {
      return res.status(400).send({ error: 'Share key is required' });
    }
    const userShare = ShareService.getShareByKey(shareKey);

    if (!userShare) {
      return res.status(404).send({ error: 'Share not found' });
    }

    const share = userShare.share;
    const events = EventService.getEvents();
    const sharedCommandNames = Object.keys(share.commands) || [];
    const sharedCommands = sharedCommandNames.map((commandName) => {
      const event = events[commandName];
      if (!event) {
        return null; // Skip if the event does not exist
      }
      return {
        name: event.name,
        description: event.description,
        command: event.triggers.chat ? event.triggers.chat.command : 'No command',
      };
    });
    res.send(sharedCommands);
  }

  router.get('/get_shared_commands', getSharedCommands);
  publicRouter.get('/get_shared_commands', getSharedCommands);

  function getSharedPlugins(req: Request, res: Response) {
    const shareKey = req.query.key as string;
    if (!shareKey) {
      return res.status(400).send({ error: 'Share key is required' });
    }
    const userShare = ShareService.getShareByKey(shareKey);

    if (!userShare) {
      return res.status(404).send({ error: 'Share not found' });
    }

    const share = userShare.share;
    const activePlugins = PluginService.getActivePlugins();
    const sharedPluginNames = Object.keys(share.plugins) || [];
    const sharedPlugins = {} as KeyedObject;
    sharedPluginNames.forEach((pluginName) => {
      const plugin = activePlugins[pluginName];
      sharedPlugins[pluginName] = {
        dirname: plugin.dirname,
        name: plugin.name,
        description: plugin.description,
        version: plugin.version,
        hasOverlay: plugin.hasOverlay,
        hasUtility: plugin.hasUtility,
        hasPublic: plugin.hasPublic,
      };
    });
    res.send(sharedPlugins);
  }

  router.get('/get_shared_plugins', getSharedPlugins);
  publicRouter.get('/get_shared_plugins', getSharedPlugins);

  function saveSharedSettings(req: Request, res: Response) {
    const shareKey = req.body.key as string;
    const name = req.body.name as string;
    const joinMessage = req.body.joinMessage as string;
    const leaveMessage = req.body.leaveMessage as string;

    if (!shareKey) {
      return res.status(400).send({ error: 'Share key and commands are required' });
    }

    ShareService.saveShareSettings(shareKey, name, joinMessage, leaveMessage);

    res.send({ status: 'ok' });
  }

  router.post('/save_share_settings', saveSharedSettings);
  publicRouter.post('/save_share_settings', saveSharedSettings);

  function saveSharedCommands(req: Request, res: Response) {
    const shareKey = req.body.key as string;
    const commands = req.body.new_commands as KeyedObject;

    if (!shareKey || !commands) {
      return res.status(400).send({ error: 'Share key and commands are required' });
    }

    ShareService.saveSharedCommands(shareKey, commands);

    res.send({ status: 'ok' });
  }

  router.post('/save_shared_commands', saveSharedCommands);
  publicRouter.post('/save_shared_commands', saveSharedCommands);

  function saveSharedPlugins(req: Request, res: Response) {
    const shareKey = req.body.key as string;
    const pluginName = req.body.pluginName as string;
    const enabled = req.body.enable as boolean;
    if (!shareKey || !pluginName) {
      return res.status(400).send({ error: 'Share key and plugins are required' });
    }
    ShareService.toggleSharedPlugin(shareKey, pluginName, enabled);
    res.send({ status: 'ok' });
  }

  router.post('/toggle_shared_plugin', saveSharedPlugins);
  publicRouter.post('/toggle_shared_plugin', saveSharedPlugins);

  function getSharePluginSettings(req: Request, res: Response) {
    const shareKey = req.body.key as string;
    const pluginName = req.body.pluginName as string;
    if (!shareKey || !pluginName) {
      return res.status(400).send({ error: 'Share key and plugin name are required' });
    }
    const settings = PluginService.getSharePluginSettings(shareKey, pluginName);
    const form = PluginService.getSharePluginSettingsForm(shareKey, pluginName);
    if (settings && form) {
      res.send({ settings, form });
    } else {
      res.status(404).send({ error: 'Settings not found for the given share key and plugin name' });
    }
  }

  router.post('/get_share_plugin_settings', getSharePluginSettings);
  publicRouter.post('/get_share_plugin_settings', getSharePluginSettings);

  function saveSharePluginSettings(req: Request, res: Response) {
    const shareKey = req.body.key as string;
    const newSettings = req.body.new_settings;
    const pluginName = req.body.pluginName;
    const saveStatus = PluginService.saveSharePluginSettings(shareKey, pluginName, newSettings);
    if (saveStatus) {
      res.send({ status: 'ok' });
      webLog('Shared ' + pluginName + ' Settings Saved!');
    } else {
      res.send({
        status: 'error',
        error: 'Failed to save settings. Check app console for details.',
      });
    }

    PluginService.refreshPlugin(pluginName);
  }

  router.post('/save_share_plugin_settings', saveSharePluginSettings);
  publicRouter.post('/save_share_plugin_settings', saveSharePluginSettings);

  async function browseSharePluginAssets(req: Request, res: Response) {
    const shareKey = req.body.key as string;
    const pluginName = req.body.pluginName as string;
    const currentPath = req.body.folder as string;

    const userShare = ShareService.getShareByKey(shareKey);
    if (!userShare) {
      return res.status(404).send({ error: 'Share not found' });
    }

    const shareId = userShare.shareId;

    if (!fs.existsSync(path.join(userDir, 'web', 'assets', pluginName, '_share', shareId))) {
      fs.mkdirSync(path.join(userDir, 'web', 'assets', pluginName, '_share', shareId), {
        recursive: true,
      });
    }

    if (
      !fs.existsSync(
        path.join(userDir, 'web', 'assets', pluginName, '_share', shareId, currentPath),
      )
    ) {
      res.send({ status: 'EMPTY', dirs: [] });
      return;
    }

    const dirs = fs.existsSync(
      path.join(userDir, 'web', 'assets', pluginName, '_share', shareId, currentPath),
    )
      ? fs.readdirSync(
          path.join(userDir, 'web', 'assets', pluginName, '_share', shareId, currentPath),
        )
      : [];

    dirs.forEach((value, index, array) => {
      array[index] = currentPath === '/' ? `${value}` : `${currentPath}/${value}`;
    });

    res.send({ status: 'ok', dirs: dirs });
  }

  router.post('/browse_share_plugin_assets', browseSharePluginAssets);
  publicRouter.post('/browse_share_plugin_assets', browseSharePluginAssets);

  async function uploadSharePluginAsset(req: Request, res: Response) {
    const shareKey = req.body.key as string;
    const userShare = ShareService.getShareByKey(shareKey);
    if (!userShare) {
      return res.status(404).send({ error: 'Share not found' });
    }
    const shareId = userShare.shareId;
    try {
      if (!req.files) {
        webLog('NO FILES FOUND');
        res.send({
          status: false,
          message: 'No file uploaded',
        });
      } else {
        console.log('Share found', userShare);
        const uploadedFiles = req.files as Express.Multer.File[];
        const pluginName = req.body.pluginName;
        const assetPath = req.body.assetPath;

        const assetDir = path.join(
          userDir,
          'web',
          'assets',
          pluginName,
          '_share',
          shareId,
          assetPath,
        );

        if (!fs.existsSync(assetDir)) {
          fs.mkdirSync(assetDir, { recursive: true });
        }

        console.log('Uploading files to:', assetDir);

        uploadedFiles.forEach(async (file) => {
          const assetFile = path.join(assetDir, file.originalname);
          await fs.move(file.path, assetFile, { overwrite: true });
          chmodr(assetFile, 0o777, (err) => {
            if (err) throw err;
          });
        });

        webLog('COMPLETE!');

        res.send({
          status: true,
          message: 'File Upload Success',
        });
      }
    } catch (e) {
      console.error(e);
    }
  }

  const tempStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(userDir, 'tmp', 'multer'));
    },
  });
  const fileUpload = multer({ storage: tempStorage, limits: { fileSize: 10 * 1024 * 1024 } });

  router.use('/upload_share_plugin_asset', fileUpload.array('files'));
  publicRouter.use('/upload_share_plugin_asset', fileUpload.array('files'));

  router.post('/upload_share_plugin_asset', uploadSharePluginAsset);
  publicRouter.post('/upload_share_plugin_asset', uploadSharePluginAsset);

  return {
    local: router,
    public: publicRouter,
  };
}
