import bodyParser from 'body-parser';
import path from 'path';
import fs from 'fs-extra';
import { Request, Response } from 'express';
import AdmZip from 'adm-zip';
import fileUpload, { UploadedFile } from 'express-fileupload';
import express from 'express';
import { userDir } from '../../Types.ts';
import { webLog } from '../Logging.ts';
import ConfigService from '../service/ConfigService.ts';
import PluginService from '../service/PluginService.ts';

export function BackupRestoreRoutes() {
  const router = express.Router();
  const publicRouter = express.Router();

  /*router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json({ limit: '100mb' }));
  router.use('/install_plugin', fileUpload());
  router.use('/upload_plugin_asset/*', fileUpload());
  router.use('/upload_plugin_icon/*', fileUpload());*/
  router.use(fileUpload());
  router.use(bodyParser.json({ limit: '100mb' }));

  router.get('/get_backups_settings', (req, res) => {
    let backupSettingsDir = path.join(userDir, 'backup', 'settings');
    const backups = fs.existsSync(backupSettingsDir) ? fs.readdirSync(backupSettingsDir) : [];
    res.send(backups);
  });

  router.get('/get_backups_plugins', (req, res) => {
    const backupPluginsDir = path.join(userDir, 'backup', 'plugins');
    const backups = fs.existsSync(backupPluginsDir) ? fs.readdirSync(backupPluginsDir) : [];
    res.send(backups);
  });

  router.get('/checkout_settings/*', async (req: Request, res: Response) => {
    let backupName = req.params['0'];
    webLog('DOWNLOADING SETTINGS', path.join(userDir, 'backup', 'settings', backupName));
    res.setHeader('Content-disposition', backupName);
    res.download(path.join(userDir, 'backup', 'settings', backupName));
  });

  router.get('/checkout_plugins/*', async (req: Request, res: Response) => {
    let backupName = req.params['0'];
    webLog('DOWNLOADING PLUGINS', path.join(userDir, 'backup', 'settings', backupName));
    res.setHeader('Content-disposition', backupName);
    res.download(path.join(userDir, 'backup', 'plugins', backupName));
  });

  router.post('/checkin_settings', (req, res) => {
    if (!req.files) {
      webLog('NO FILES FOUND');
      res.send({
        status: false,
        message: 'No file uploaded',
      });
    } else {
      const file = req.files.file as UploadedFile;
      if (!fs.existsSync(path.join(userDir, 'backup'))) {
        fs.mkdirSync(path.join(userDir, 'backup'));
      }
      if (!fs.existsSync(path.join(userDir, 'backup', 'settings'))) {
        fs.mkdirSync(path.join(userDir, 'backup', 'settings'));
      }
      file.mv(path.join(userDir, 'backup', 'settings', file.name));
      let newSettingsBackups = fs.readdirSync(path.join(userDir, 'backup', 'settings'));

      res.send({ newbackups: newSettingsBackups });
    }
  });

  router.post('/checkin_plugins', (req: Request, res: Response) => {
    if (!req.files) {
      webLog('NO FILES FOUND');
      res.send({
        status: false,
        message: 'No file uploaded',
      });
    } else {
      const file = req.files.file as UploadedFile;
      if (!fs.existsSync(path.join(userDir, 'backup'))) {
        fs.mkdirSync(path.join(userDir, 'backup'));
      }
      if (!fs.existsSync(path.join(userDir, 'backup', 'plugins'))) {
        fs.mkdirSync(path.join(userDir, 'backup', 'plugins'));
      }
      file.mv(path.join(userDir, 'backup', 'plugins', file.name));
      let newSettingsBackups = fs.readdirSync(path.join(userDir, 'backup', 'plugins'));

      res.send({ newbackups: newSettingsBackups });
    }
  });

  router.post('/backup_settings', async (req: Request, res: Response) => {
    let zip = new AdmZip();

    zip.addLocalFolder(userDir + '/settings', '');

    if (!fs.existsSync(userDir + '/backup')) {
      fs.mkdirSync(userDir + '/backup');
    }

    if (!fs.existsSync(userDir + '/backup/settings')) {
      fs.mkdirSync(userDir + '/backup/settings');
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
    zip.writeZip(userDir + '/backup/settings/' + backupName + '.zip', (e) => {
      if (e) {
        throw new Error(e.message);
      }
      let newSettingsBackups = fs.readdirSync(path.join(userDir, 'backup', 'settings'));

      res.send({ newbackups: newSettingsBackups });
      webLog('BACKUP COMPLETE');
    });
  });

  router.post('/backup_plugins', async (req: Request, res: Response) => {
    const sconfig = ConfigService.getConfig();
    let zip = new AdmZip();

    zip.addLocalFolder(userDir + '/plugins', '/plugins', (entry: any) => {
      return !entry.isDirectory || !entry.name.endsWith('/node_modules');
    });

    zip.addLocalFolder(userDir + '/web', '/web');

    if (!fs.existsSync(userDir + '/backup')) {
      fs.mkdirSync(userDir + '/backup');
    }

    if (!fs.existsSync(userDir + '/backup/plugins')) {
      fs.mkdirSync(userDir + '/backup/plugins');
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

    zip.writeZip(userDir + '/backup/plugins/' + backupName + '.zip', (e) => {
      if (e) {
        throw new Error(e.message);
      }
      let newPluginBackups = fs.readdirSync(path.join(userDir, 'backup', 'plugins'));
      res.send({ newbackups: newPluginBackups });
      webLog('BACKUP COMPLETE');
    });
  });

  router.post('/delete_backup_settings', (req: Request, res: Response) => {
    let backupName = req.body.backupName;
    let backupDir = path.join(userDir, 'backup', 'settings');
    let fullPath = path.join(backupDir, backupName);

    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath);
      let newPluginBackups = fs.readdirSync(path.join(userDir, 'backup', 'settings'));
      webLog('BACKUP DELETED: ' + backupName);
      res.send({ status: 'SUCCESS', newbackups: newPluginBackups });
    } else {
      res.send({ status: "FILE DOESN'T EXIST: " + fullPath });
    }
  });

  router.post('/delete_backup_plugins', (req: Request, res: Response) => {
    let backupName = req.body.backupName;
    let backupDir = path.join(userDir, 'backup', 'plugins');
    let fullPath = path.join(backupDir, backupName);

    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath);
      let newPluginBackups = fs.readdirSync(path.join(userDir, 'backup', 'plugins'));
      webLog('BACKUP DELETED: ' + backupName);
      res.send({ status: 'SUCCESS', newbackups: newPluginBackups });
    } else {
      res.send({ status: "FILE DOESN'T EXIST: " + fullPath });
    }
  });

  router.post('/restore_settings', async (req: Request, res: Response) => {
    let fileName = null;
    let selections = req.body.selections ?? { everything: true };

    if (!fs.existsSync(userDir + '/tmp')) {
      fs.mkdirSync(userDir + '/tmp');
    }

    if (req.files) {
      const file = req.files.file as UploadedFile;
      console.log('FILE FOUND', req.files);
      fileName = file.name;
      if (fs.existsSync(path.join(userDir, 'tmp', fileName))) {
        await fs.rm(path.join(userDir, 'tmp', fileName));
      }
      await file.mv(path.join(userDir, 'tmp', fileName));
    } else if (req.body.backupName) {
      fileName = req.body.backupName;
      if (fs.existsSync(path.join(userDir, 'tmp', fileName))) {
        await fs.rm(path.join(userDir, 'tmp', fileName));
      }
      fs.copySync(
        path.join(userDir, 'backup', 'settings', fileName),
        path.join(userDir, 'tmp', fileName),
        { overwrite: true },
      );
    }

    let fileDir = path.join(userDir, 'tmp', fileName.split('.')[0]);

    if (fs.existsSync(fileDir)) {
      await fs.rm(fileDir, { recursive: true });
    }

    let zip = new AdmZip(path.join(userDir, 'tmp', fileName));
    zip.extractAllTo(fileDir);
    if (selections.everything == true) {
      fs.copySync(path.join(fileDir), path.join(userDir, 'settings'), { overwrite: true });
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
              path.join(userDir, 'settings', s + '.json'),
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

    if (fs.existsSync(path.join(userDir, 'tmp', fileName))) {
      await fs.rm(path.join(userDir, 'tmp', fileName));
    }

    //let newPluginBackups = fs.readdirSync(path.join(userDir, "backup", "settings"));
    webLog('COMPLETE');
    res.send({ status: 'SUCCESS' });
  });

  router.post('/restore_plugins', async (req: Request, res: Response) => {
    let fileName = null;
    let selections = req.body.selections;
    if (!fs.existsSync(userDir + '/tmp')) {
      fs.mkdirSync(userDir + '/tmp');
    }

    if (req.files) {
      const file = req.files.file as UploadedFile;
      fileName = file.name;
      if (fs.existsSync(path.join(userDir, 'tmp', fileName))) {
        await fs.rm(path.join(userDir, 'tmp', fileName));
      }
      await file.mv(path.join(userDir, 'tmp', fileName));
    } else if (req.body.backupName) {
      fileName = req.body.backupName;
      if (fs.existsSync(path.join(userDir, 'tmp', fileName))) {
        await fs.rm(path.join(userDir, 'tmp', fileName));
      }
      fs.copySync(
        path.join(userDir, 'backup', 'plugins', fileName),
        path.join(userDir, 'tmp', fileName),
        { overwrite: true },
      );
    }

    let fileDir = path.join(userDir, 'tmp', fileName.split('.')[0]);

    webLog('GET BACKUP', fileName, fileDir);

    if (fs.existsSync(fileDir)) {
      await fs.rm(fileDir, { recursive: true });
    }

    let zip = new AdmZip(path.join(userDir, 'tmp', fileName));
    zip.extractAllTo(fileDir);

    let pluginList = fs.readdirSync(path.join(fileDir, 'plugins'));
    webLog('Deleting Plugins...');
    fs.rmSync(path.join(userDir, 'plugins'), { recursive: true });
    fs.mkdirSync(path.join(userDir, 'plugins'));

    webLog('Copying Plugins...');
    for (let p in pluginList) {
      webLog(pluginList[p]);
      fs.copySync(
        path.join(fileDir, 'plugins', pluginList[p]),
        path.join(userDir, 'plugins', pluginList[p]),
      );
    }

    webLog('Checking for dependencies...');
    for (let p in pluginList) {
      if (fs.existsSync(path.join(userDir, 'plugins', pluginList[p], 'node_modules'))) {
        webLog('Clearing node_modules for ' + pluginList[p]);
        fs.rmSync(path.join(userDir, 'plugins', pluginList[p], 'node_modules'), {
          recursive: true,
        });
      }
      if (fs.existsSync(path.join(userDir, 'plugins', pluginList[p], 'package.json'))) {
        let packagejson = JSON.parse(
          fs.readFileSync(path.join(userDir, 'plugins', pluginList[p], 'package.json'), {
            encoding: 'utf-8',
          }),
        );
        let hasDependencies = packagejson.dependencies != null;
        if (hasDependencies) {
          await PluginService.installPluginDependencies(
            pluginList[p],
            path.join(userDir, 'plugins', pluginList[p]),
          );
        } else {
          webLog('No dependencies for ' + pluginList[p]);
        }
      }
    }

    let webfolders = fs.readdirSync(path.join(userDir, 'web'));
    webLog('Deleting Web Folders...');
    for (let w in webfolders) {
      if (webfolders[w] != 'mod') {
        fs.rmSync(path.join(userDir, 'web', webfolders[w]), { recursive: true });
      }
    }

    let newWebFolders = fs.readdirSync(path.join(fileDir, 'web'));
    webLog('Copying Web Folders...');
    for (let w in newWebFolders) {
      if (newWebFolders[w] != 'mod') {
        webLog(newWebFolders[w]);
        fs.copySync(
          path.join(fileDir, 'web', newWebFolders[w]),
          path.join(userDir, 'web', newWebFolders[w]),
        );
      }
    }
    webLog('Cleaning up...');
    if (fs.existsSync(fileDir)) {
      await fs.rm(fileDir, { recursive: true });
    }

    if (fs.existsSync(path.join(userDir, 'tmp', fileName))) {
      await fs.rm(path.join(userDir, 'tmp', fileName));
    }
    PluginService.refreshAllPlugins();
    //let newPluginBackups = fs.readdirSync(path.join(userDir, "backup", "plugins"));
    webLog('COMPLETE');
    res.send({ status: 'SUCCESS' });
  });

  return {
    local: router,
    public: publicRouter,
  };
}
