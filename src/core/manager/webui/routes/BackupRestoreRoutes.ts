import bodyParser from 'body-parser';
import path from 'path';
import fs from 'fs-extra';
import { Request, Response } from 'express';
import AdmZip from 'adm-zip';
import fileUpload, { UploadedFile } from 'express-fileupload';
import express from 'express';
import { backendDir } from '../../../../Types.ts';
import { webLog } from '../../../Logging.ts';
import ConfigManager from '../../ConfigManager.ts';
import PluginManager from '../../PluginManager.ts';

export function BackupRestoreRoutes() {
  const router = express.Router();
  const publicRouter = express.Router();

  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json({ limit: '100mb' }));
  router.use('/recovery/install_plugin', fileUpload());
  router.use('/recovery/upload_plugin_asset/*', fileUpload());
  router.use('/recovery/upload_plugin_icon/*', fileUpload());
  router.use('/recovery/checkin_settings', fileUpload());
  router.use('/recovery/checkin_plugins', fileUpload());

  router.get('/recovery/checkout_settings/*', async (req: Request, res: Response) => {
    let backupName = req.params['0'];
    webLog('DOWNLOADING SETTINGS', path.join(backendDir, 'backup', 'settings', backupName));
    res.setHeader('Content-disposition', backupName);
    res.download(path.join(backendDir, 'backup', 'settings', backupName));
  });

  router.get('/checkout_plugins/*', async (req: Request, res: Response) => {
    let backupName = req.params['0'];
    webLog('DOWNLOADING PLUGINS', path.join(backendDir, 'backup', 'settings', backupName));
    res.setHeader('Content-disposition', backupName);
    res.download(path.join(backendDir, 'backup', 'plugins', backupName));
  });

  router.post('/recovery/checkin_settings', (req: Request, res: Response) => {
    if (!req.files) {
      webLog('NO FILES FOUND');
      res.send({
        status: false,
        message: 'No file uploaded',
      });
    } else {
      const file = req.files.file as UploadedFile;
      if (!fs.existsSync(path.join(backendDir, 'backup'))) {
        fs.mkdirSync(path.join(backendDir, 'backup'));
      }
      if (!fs.existsSync(path.join(backendDir, 'backup', 'settings'))) {
        fs.mkdirSync(path.join(backendDir, 'backup', 'settings'));
      }
      file.mv(path.join(backendDir, 'backup', 'settings', file.name));
      let newSettingsBackups = fs.readdirSync(path.join(backendDir, 'backup', 'settings'));

      res.send({ newbackups: newSettingsBackups });
    }
  });

  router.post('/recovery/checkin_plugins', (req: Request, res: Response) => {
    if (!req.files) {
      webLog('NO FILES FOUND');
      res.send({
        status: false,
        message: 'No file uploaded',
      });
    } else {
      const file = req.files.file as UploadedFile;
      if (!fs.existsSync(path.join(backendDir, 'backup'))) {
        fs.mkdirSync(path.join(backendDir, 'backup'));
      }
      if (!fs.existsSync(path.join(backendDir, 'backup', 'plugins'))) {
        fs.mkdirSync(path.join(backendDir, 'backup', 'plugins'));
      }
      file.mv(path.join(backendDir, 'backup', 'plugins', file.name));
      let newSettingsBackups = fs.readdirSync(path.join(backendDir, 'backup', 'plugins'));

      res.send({ newbackups: newSettingsBackups });
    }
  });

  router.post('/recovery/backup_settings', async (req: Request, res: Response) => {
    let zip = new AdmZip();

    zip.addLocalFolder(backendDir + '/settings', '');

    if (!fs.existsSync(backendDir + '/backup')) {
      fs.mkdirSync(backendDir + '/backup');
    }

    if (!fs.existsSync(backendDir + '/backup/settings')) {
      fs.mkdirSync(backendDir + '/backup/settings');
    }

    let backupName = null;
    if (req.body.backupName != null && req.body.backupName != '') {
      backupName = req.body.backupName;
    } else {
      let date = new Date();
      backupName =
        date.getFullYear() +
        '-' +
        date.getMonth() +
        '-' +
        date.getDate() +
        '-' +
        date.getHours() +
        '-' +
        date.getMinutes() +
        '-' +
        date.getSeconds();
    }
    zip.writeZip(backendDir + '/backup/settings/' + backupName + '.zip', (e) => {
      if (e) {
        throw new Error(e.message);
      }
      let newSettingsBackups = fs.readdirSync(path.join(backendDir, 'backup', 'settings'));

      res.send({ newbackups: newSettingsBackups });
      webLog('BACKUP COMPLETE');
    });
  });

  router.post('/recovery/backup_plugins', async (req: Request, res: Response) => {
    const sconfig = ConfigManager.getConfig();
    let zip = new AdmZip();

    zip.addLocalFolder(backendDir + '/plugins', '/plugins', (entry: any) => {
      return !entry.isDirectory || !entry.name.endsWith('/node_modules');
    });

    zip.addLocalFolder(backendDir + '/web', '/web');

    if (!fs.existsSync(backendDir + '/backup')) {
      fs.mkdirSync(backendDir + '/backup');
    }

    if (!fs.existsSync(backendDir + '/backup/plugins')) {
      fs.mkdirSync(backendDir + '/backup/plugins');
    }
    let backupName = null;
    if (req.body.backupName != null && req.body.backupName != '') {
      backupName = req.body.backupName;
    } else {
      let date = new Date();
      backupName =
        sconfig.bot.bot_name +
        '-' +
        date.getFullYear() +
        '-' +
        date.getMonth() +
        '-' +
        date.getDate() +
        '-' +
        date.getHours() +
        '-' +
        date.getMinutes() +
        '-' +
        date.getSeconds();
    }

    webLog(
      'Writing backup. This can take a while depending on how many plugins you have. I wish I could show you progress...',
    );

    zip.writeZip(backendDir + '/backup/plugins/' + backupName + '.zip', (e) => {
      if (e) {
        throw new Error(e.message);
      }
      let newPluginBackups = fs.readdirSync(path.join(backendDir, 'backup', 'plugins'));
      res.send({ newbackups: newPluginBackups });
      webLog('BACKUP COMPLETE');
    });
  });

  router.post('/recovery/delete_backup_settings', (req: Request, res: Response) => {
    let backupName = req.body.backupName;
    let backupDir = path.join(backendDir, 'backup', 'settings');
    let fullPath = path.join(backupDir, backupName);

    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath);
      let newPluginBackups = fs.readdirSync(path.join(backendDir, 'backup', 'settings'));
      webLog('BACKUP DELETED: ' + backupName);
      res.send({ status: 'SUCCESS', newbackups: newPluginBackups });
    } else {
      res.send({ status: "FILE DOESN'T EXIST: " + fullPath });
    }
  });

  router.post('/recovery/delete_backup_plugins', (req: Request, res: Response) => {
    let backupName = req.body.backupName;
    let backupDir = path.join(backendDir, 'backup', 'plugins');
    let fullPath = path.join(backupDir, backupName);

    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath);
      let newPluginBackups = fs.readdirSync(path.join(backendDir, 'backup', 'plugins'));
      webLog('BACKUP DELETED: ' + backupName);
      res.send({ status: 'SUCCESS', newbackups: newPluginBackups });
    } else {
      res.send({ status: "FILE DOESN'T EXIST: " + fullPath });
    }
  });

  router.post('/recovery/restore_settings', async (req: Request, res: Response) => {
    let fileName = null;
    let selections = req.body.selections ?? { everything: true };

    if (!fs.existsSync(backendDir + '/tmp')) {
      fs.mkdirSync(backendDir + '/tmp');
    }

    if (req.files) {
      const file = req.files.file as UploadedFile;
      console.log('FILE FOUND', req.files);
      fileName = file.name;
      if (fs.existsSync(path.join(backendDir, 'tmp', fileName))) {
        await fs.rm(path.join(backendDir, 'tmp', fileName));
      }
      await file.mv(path.join(backendDir, 'tmp', fileName));
    } else if (req.body.backupName) {
      fileName = req.body.backupName;
      if (fs.existsSync(path.join(backendDir, 'tmp', fileName))) {
        await fs.rm(path.join(backendDir, 'tmp', fileName));
      }
      fs.copySync(
        path.join(backendDir, 'backup', 'settings', fileName),
        path.join(backendDir, 'tmp', fileName),
        { overwrite: true },
      );
    }

    let fileDir = path.join(backendDir, 'tmp', fileName.split('.')[0]);

    if (fs.existsSync(fileDir)) {
      await fs.rm(fileDir, { recursive: true });
    }

    let zip = new AdmZip(path.join(backendDir, 'tmp', fileName));
    zip.extractAllTo(fileDir);
    if (selections['everything'] == true) {
      fs.copySync(path.join(fileDir), path.join(backendDir, 'settings'), { overwrite: true });
    } else {
      for (let s in selections) {
        if (s == 'everything') {
          continue;
        }
        webLog('CHECKING', s + '.json');
        if (selections[s] == true) {
          if (fs.existsSync(path.join(fileDir, s + '.json'))) {
            webLog('OVERWRITE ' + s + '.json');
            fs.copySync(
              path.join(fileDir, s + '.json'),
              path.join(backendDir, 'settings', s + '.json'),
              { overwrite: true },
            );
          } else {
            webLog(path.join(fileDir, s + '.json'), 'NOT FOUND');
          }
        }
      }
    }

    if (fs.existsSync(fileDir)) {
      await fs.rm(fileDir, { recursive: true });
    }

    if (fs.existsSync(path.join(backendDir, 'tmp', fileName))) {
      await fs.rm(path.join(backendDir, 'tmp', fileName));
    }

    //let newPluginBackups = fs.readdirSync(path.join(backendDir, "backup", "settings"));
    webLog('COMPLETE');
    res.send({ status: 'SUCCESS' });
  });

  router.post('/recovery/restore_plugins', async (req: Request, res: Response) => {
    let fileName = null;
    let selections = req.body.selections;
    if (!fs.existsSync(backendDir + '/tmp')) {
      fs.mkdirSync(backendDir + '/tmp');
    }

    if (req.files) {
      const file = req.files.file as UploadedFile;
      fileName = file.name;
      if (fs.existsSync(path.join(backendDir, 'tmp', fileName))) {
        await fs.rm(path.join(backendDir, 'tmp', fileName));
      }
      await file.mv(path.join(backendDir, 'tmp', fileName));
    } else if (req.body.backupName) {
      fileName = req.body.backupName;
      if (fs.existsSync(path.join(backendDir, 'tmp', fileName))) {
        await fs.rm(path.join(backendDir, 'tmp', fileName));
      }
      fs.copySync(
        path.join(backendDir, 'backup', 'plugins', fileName),
        path.join(backendDir, 'tmp', fileName),
        { overwrite: true },
      );
    }

    let fileDir = path.join(backendDir, 'tmp', fileName.split('.')[0]);

    webLog('GET BACKUP', fileName, fileDir);

    if (fs.existsSync(fileDir)) {
      await fs.rm(fileDir, { recursive: true });
    }

    let zip = new AdmZip(path.join(backendDir, 'tmp', fileName));
    zip.extractAllTo(fileDir);

    let pluginList = fs.readdirSync(path.join(fileDir, 'plugins'));
    webLog('Deleting Plugins...');
    fs.rmSync(path.join(backendDir, 'plugins'), { recursive: true });
    fs.mkdirSync(path.join(backendDir, 'plugins'));

    webLog('Copying Plugins...');
    for (let p in pluginList) {
      webLog(pluginList[p]);
      fs.copySync(
        path.join(fileDir, 'plugins', pluginList[p]),
        path.join(backendDir, 'plugins', pluginList[p]),
      );
    }

    webLog('Checking for dependencies...');
    for (let p in pluginList) {
      if (fs.existsSync(path.join(backendDir, 'plugins', pluginList[p], 'node_modules'))) {
        webLog('Clearing node_modules for ' + pluginList[p]);
        fs.rmSync(path.join(backendDir, 'plugins', pluginList[p], 'node_modules'), {
          recursive: true,
        });
      }
      if (fs.existsSync(path.join(backendDir, 'plugins', pluginList[p], 'package.json'))) {
        let packagejson = JSON.parse(
          fs.readFileSync(path.join(backendDir, 'plugins', pluginList[p], 'package.json'), {
            encoding: 'utf-8',
          }),
        );
        let hasDependencies = packagejson.dependencies != null;
        if (hasDependencies) {
          await PluginManager.installPluginDependencies(
            pluginList[p],
            path.join(backendDir, 'plugins', pluginList[p]),
          );
        } else {
          webLog('No dependencies for ' + pluginList[p]);
        }
      }
    }

    let webfolders = fs.readdirSync(path.join(backendDir, 'web'));
    webLog('Deleting Web Folders...');
    for (let w in webfolders) {
      if (webfolders[w] != 'mod') {
        fs.rmSync(path.join(backendDir, 'web', webfolders[w]), { recursive: true });
      }
    }

    let newWebFolders = fs.readdirSync(path.join(fileDir, 'web'));
    webLog('Copying Web Folders...');
    for (let w in newWebFolders) {
      if (newWebFolders[w] != 'mod') {
        webLog(newWebFolders[w]);
        fs.copySync(
          path.join(fileDir, 'web', newWebFolders[w]),
          path.join(backendDir, 'web', newWebFolders[w]),
        );
      }
    }
    webLog('Cleaning up...');
    if (fs.existsSync(fileDir)) {
      await fs.rm(fileDir, { recursive: true });
    }

    if (fs.existsSync(path.join(backendDir, 'tmp', fileName))) {
      await fs.rm(path.join(backendDir, 'tmp', fileName));
    }
    PluginManager.refreshAllPlugins();
    //let newPluginBackups = fs.readdirSync(path.join(backendDir, "backup", "plugins"));
    webLog('COMPLETE');
    res.send({ status: 'SUCCESS' });
  });

  return {
    local: router,
    public: publicRouter,
  };
}
