import path from 'path';
import fs from 'fs-extra';
import { Request, Response } from 'express';
import AdmZip from 'adm-zip';
import express from 'express';
import { userDir } from '../../Types';
import { webLog } from '../Logging';
import ConfigService from '../service/ConfigService';
import PluginService from '../service/PluginService';
import multer from 'multer';
import OSCService from '../service/OSCService';

export function BackupRestoreRoutes() {
  const router = express.Router();
  const publicRouter = express.Router();

  const tempStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(userDir, 'tmp', 'multer'));
    },
  });
  const restoreUpload = multer({ storage: tempStorage });

  router.use(express.json());
  router.use('/delete_backup_settings', restoreUpload.none());
  router.use('/delete_backup_plugins', restoreUpload.none());
  router.use('/prepare_restore_settings', restoreUpload.single('file'));
  router.use('/prepare_restore_plugins', restoreUpload.single('file'));

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

  router.post('/checkin_settings', async (req, res) => {
    if (!req.files) {
      webLog('NO FILES FOUND');
      res.send({
        status: false,
        message: 'No file uploaded',
      });
    } else {
      const file = req.file as Express.Multer.File;
      if (!fs.existsSync(path.join(userDir, 'backup'))) {
        fs.mkdirSync(path.join(userDir, 'backup'));
      }
      if (!fs.existsSync(path.join(userDir, 'backup', 'settings'))) {
        fs.mkdirSync(path.join(userDir, 'backup', 'settings'));
      }
      await fs.promises.writeFile(
        path.join(userDir, 'backup', 'settings', file.originalname),
        file.buffer,
      );
      let newSettingsBackups = fs.readdirSync(path.join(userDir, 'backup', 'settings'));

      res.send({ newbackups: newSettingsBackups });
    }
  });

  router.post('/checkin_plugins', async (req: Request, res: Response) => {
    if (!req.files) {
      webLog('NO FILES FOUND');
      res.send({
        status: false,
        message: 'No file uploaded',
      });
    } else {
      const file = req.file as Express.Multer.File;
      if (!fs.existsSync(path.join(userDir, 'backup'))) {
        fs.mkdirSync(path.join(userDir, 'backup'));
      }
      if (!fs.existsSync(path.join(userDir, 'backup', 'plugins'))) {
        fs.mkdirSync(path.join(userDir, 'backup', 'plugins'));
      }
      await fs.promises.writeFile(
        path.join(userDir, 'backup', 'plugins', file.originalname),
        file.buffer,
      );
      let newSettingsBackups = fs.readdirSync(path.join(userDir, 'backup', 'plugins'));

      res.send({ newbackups: newSettingsBackups });
    }
  });

  router.post('/backup_settings', async (req: Request, res: Response) => {
    const sconfig = ConfigService.getConfig();
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
        sconfig.bot.bot_name +
        '_settings_' +
        date.getFullYear() +
        '_' +
        date.getMonth() +
        '_' +
        date.getDate() +
        '_' +
        date.getHours() +
        '_' +
        date.getMinutes() +
        '_' +
        date.getSeconds();
    }
    zip.writeZip(userDir + '/backup/settings/' + backupName + '.zip', (e) => {
      if (e) {
        throw new Error(e.message);
      }

      res.send({ status: 'ok' });
      webLog('BACKUP COMPLETE');
    });
  });

  router.post('/backup_plugins', async (req: Request, res: Response) => {
    const sconfig = ConfigService.getConfig();
    const zip = new AdmZip();

    const pluginDirs = fs
      .readdirSync(userDir + '/plugins', { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    const progressSteps = pluginDirs.length * 2;
    let progress = 0;

    pluginDirs.forEach((pluginDir) => {
      const pluginContents = fs.readdirSync(path.join(userDir, 'plugins', pluginDir), {
        withFileTypes: true,
      });
      pluginContents.forEach((pluginContent) => {
        console.log('PLUGIN CONTENT', pluginContent);
        progress++;
        OSCService.sendToTCP('/spooder/restore/plugin', {
          name: pluginDir,
          message: `Backing up ${pluginContent.name}`,
          progress: progress,
          totalProgress: progressSteps,
        });
        console.log('PLUGIN CONTENT', pluginContent.name, pluginContent.isDirectory());
        if (pluginContent.isDirectory()) {
          if (pluginContent.name !== 'node_modules') {
            zip.addLocalFolder(
              path.join(userDir, 'plugins', pluginDir, pluginContent.name),
              '/plugins/' + pluginDir + '/' + pluginContent.name,
            );
          }
        } else {
          zip.addLocalFile(
            path.join(userDir, 'plugins', pluginDir, pluginContent.name),
            '/plugins/' + pluginDir,
            pluginContent.name,
          );
        }
      });
    });

    OSCService.sendToTCP('/spooder/restore/plugin', {
      name: 'Web',
      message: `Backing up web directory`,
      progress: progress,
      totalProgress: progressSteps,
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
        '_plugins_' +
        date.getFullYear() +
        '_' +
        date.getMonth() +
        '_' +
        date.getDate() +
        '_' +
        date.getHours() +
        '_' +
        date.getMinutes() +
        '_' +
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

  router.post('/prepare_restore_settings', async (req: Request, res: Response) => {
    let fileName = null;

    if (req.file) {
      const file = req.file as Express.Multer.File;
      fileName = req.file.originalname;
      await fs.move(file.path, path.join(userDir, 'backup', 'settings', fileName), {
        overwrite: true,
      });
    } else if (req.body.backupName) {
      fileName = req.body.backupName;
    }

    if (fs.existsSync(path.join(userDir, 'tmp', fileName))) {
      await fs.rm(path.join(userDir, 'tmp', fileName));
    }
    fs.copySync(
      path.join(userDir, 'backup', 'settings', fileName),
      path.join(userDir, 'tmp', '_active_settings_backup.zip'),
      { overwrite: true },
    );

    const zip = new AdmZip(path.join(userDir, 'tmp', '_active_settings_backup.zip'));
    const zipEntries = zip.getEntries();
    console.log(
      'BACKUP SETTINGS ENTRIES',
      zipEntries.map((e) => e.entryName),
    );

    res.send({
      status: 'ok',
      data: zipEntries.map((e) => e.entryName.substring(0, e.entryName.lastIndexOf('.'))),
    });
  });

  router.post('/restore_settings', async (req: Request, res: Response) => {
    const selections = req.body.selections;

    if (!fs.existsSync(userDir + '/tmp')) {
      fs.mkdirSync(userDir + '/tmp');
    }

    const tempDir = path.join(userDir, 'tmp');
    const tempBackupDirectory = path.join(tempDir, '_active_settings_backup');
    const tempBackupFileName = '_active_settings_backup.zip';

    const zip = new AdmZip(path.join(tempDir, tempBackupFileName));
    zip.extractAllTo(tempDir);
    for (let s in selections) {
      if (selections[s] !== true) {
        continue;
      }
      webLog('CHECKING', s + '.json');
      if (fs.existsSync(path.join(tempDir, s + '.json'))) {
        webLog('OVERWRITE ' + s + '.json');
        fs.copySync(path.join(tempDir, s + '.json'), path.join(userDir, 'settings', s + '.json'), {
          overwrite: true,
        });
      } else {
        webLog(path.join(tempDir, s + '.json'), 'NOT FOUND');
      }
    }

    if (fs.existsSync(tempBackupDirectory)) {
      await fs.rm(tempBackupDirectory, { recursive: true });
    }

    if (fs.existsSync(tempBackupFileName)) {
      await fs.rm(tempBackupFileName);
    }

    webLog('COMPLETE');
    res.send({ status: 'SUCCESS' });
  });

  router.post('/prepare_restore_plugins', async (req: Request, res: Response) => {
    let fileName = null;
    if (!fs.existsSync(userDir + '/backup/plugins')) {
      fs.mkdirSync(userDir + '/backup/plugins');
    }
    if (!fs.existsSync(userDir + '/tmp')) {
      fs.mkdirSync(userDir + '/tmp');
    }

    if (fs.existsSync(path.join(userDir, 'tmp', '_active_plugins_backup'))) {
      fs.rmSync(path.join(userDir, 'tmp', '_active_plugins_backup'), { recursive: true });
    }

    fileName = req.body.backupName;

    if (req.file) {
      const file = req.file as Express.Multer.File;
      console.log('FILE FOUND', req.file);
      fileName = req.file.originalname;
      await fs.move(file.path, path.join(userDir, 'backup', 'plugins', fileName), {
        overwrite: true,
      });
    }

    if (fs.existsSync(path.join(userDir, 'tmp', fileName))) {
      await fs.rm(path.join(userDir, 'tmp', fileName));
    }
    fs.copySync(
      path.join(userDir, 'backup', 'plugins', fileName),
      path.join(userDir, 'tmp', '_active_plugins_backup.zip'),
      { overwrite: true },
    );

    const zip = new AdmZip(path.join(userDir, 'tmp', '_active_plugins_backup.zip'));
    zip.extractAllTo(path.join(userDir, 'tmp', '_active_plugins_backup'));
    const pluginNames = fs.readdirSync(
      path.join(userDir, 'tmp', '_active_plugins_backup', 'plugins'),
    );

    const pluginList = pluginNames
      .map((p) => {
        const packageJsonPath = path.join(
          userDir,
          'tmp',
          '_active_plugins_backup',
          'plugins',
          p,
          'package.json',
        );
        if (fs.existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, { encoding: 'utf-8' }));
          return {
            dirName: p,
            name: packageJson.name,
            version: packageJson.version,
          };
        }
      })
      .filter((plugin) => plugin !== undefined);

    console.log('BACKUP PLUGINS ENTRIES', pluginList);

    res.send({
      status: 'ok',
      data: pluginList,
    });
  });

  router.post('/restore_plugins', async (req: Request, res: Response) => {
    const selections = req.body.selections;

    const pluginNames = fs.readdirSync(
      path.join(userDir, 'tmp', '_active_plugins_backup', 'plugins'),
    );
    console.log('SELECTIONS', selections);

    const pluginList = pluginNames
      .map((p) => {
        const packageJsonPath = path.join(
          userDir,
          'tmp',
          '_active_plugins_backup',
          'plugins',
          p,
          'package.json',
        );
        if (fs.existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, { encoding: 'utf-8' }));
          return {
            dirName: p,
            name: packageJson.name,
            version: packageJson.version,
          };
        }
      })
      .filter((plugin) => plugin !== undefined);

    const pluginDir = path.join(userDir, 'plugins');
    const webDir = path.join(userDir, 'web');
    const overlayDir = path.join(webDir, 'overlay');
    const utilityDir = path.join(webDir, 'utility');
    const assetDir = path.join(webDir, 'assets');
    const iconDir = path.join(webDir, 'icons');

    function deletePluginDir(basePath: string, pluginDirName: string) {
      if (fs.existsSync(path.join(basePath, pluginDirName))) {
        fs.rmSync(path.join(basePath, pluginDirName), { recursive: true });
      }
    }

    function copyToPluginDir(basePath: string, pluginDirName: string) {
      if (
        fs.existsSync(path.join(userDir, 'tmp', '_active_plugins_backup', basePath, pluginDirName))
      ) {
        fs.copySync(
          path.join(userDir, 'tmp', '_active_plugins_backup', basePath, pluginDirName),
          path.join(userDir, basePath, pluginDirName),
          { overwrite: true },
        );
      }
    }

    await PluginService.stopAllPlugins();

    const selectionKeys = Object.keys(selections);
    const progressSteps = selectionKeys.length * 2;
    let progress = 0;

    for (let s = 0; s < selectionKeys.length; s++) {
      const selectionKey = selectionKeys[s];
      if (selections[selectionKey] !== true) {
        continue;
      }

      const plugin = pluginList.find((p) => p.dirName === selectionKey);
      if (!plugin) {
        webLog('Plugin not found: ' + selectionKey);
        continue;
      }
      webLog('Deleting: ' + plugin.dirName);
      deletePluginDir(pluginDir, plugin.dirName);
      deletePluginDir(overlayDir, plugin.dirName);
      deletePluginDir(utilityDir, plugin.dirName);
      deletePluginDir(assetDir, plugin.dirName);
      deletePluginDir(iconDir, `${plugin.dirName}.png`);

      const copyLogMessage = 'Copying: ' + plugin.dirName;
      progress++;
      OSCService.sendToTCP('/spooder/restore/plugin', {
        name: plugin.name,
        message: copyLogMessage,
        progress: progress,
        totalProgress: progressSteps,
      });
      webLog(copyLogMessage);
      copyToPluginDir('plugins', plugin.dirName);
      copyToPluginDir(path.join('web', 'overlay'), plugin.dirName);
      copyToPluginDir(path.join('web', 'utility'), plugin.dirName);
      copyToPluginDir(path.join('web', 'assets'), plugin.dirName);
      copyToPluginDir(path.join('web', 'icons'), `${plugin.dirName}.png`);

      progress++;

      if (fs.existsSync(path.join(userDir, 'plugins', plugin.dirName, 'package.json'))) {
        let packagejson = JSON.parse(
          fs.readFileSync(path.join(userDir, 'plugins', plugin.dirName, 'package.json'), {
            encoding: 'utf-8',
          }),
        );
        let hasDependencies = packagejson.dependencies != null;
        if (hasDependencies) {
          const installLogMessage = 'Installing dependencies for ' + plugin.dirName;
          OSCService.sendToTCP('/spooder/restore/plugin', {
            name: plugin.name,
            message: installLogMessage,
            progress: progress,
            totalProgress: progressSteps,
          });
          webLog(installLogMessage);
          await PluginService.installPluginDependencies(
            plugin.dirName,
            path.join(userDir, 'plugins', plugin.dirName),
          );
        } else {
          const installLogMessage = 'No dependencies for ' + plugin.dirName;
          OSCService.sendToTCP('/spooder/restore/plugin', {
            name: plugin.name,
            message: installLogMessage,
            progress: progress,
            totalProgress: progressSteps,
          });
          webLog('No dependencies for ' + plugin.dirName);
        }
      }
    }

    progress = progressSteps;
    OSCService.sendToTCP('/spooder/restore/plugin', {
      name: 'Done',
      message: 'Cleaning up...',
      progress: progress,
      totalProgress: progress,
    });

    webLog('Cleaning up...');

    if (fs.existsSync(path.join(userDir, 'tmp', '_active_plugins_backup'))) {
      fs.rmSync(path.join(userDir, 'tmp', '_active_plugins_backup'), { recursive: true });
    }
    if (fs.existsSync(path.join(userDir, 'tmp', '_active_plugins_backup.zip'))) {
      fs.rmSync(path.join(userDir, 'tmp', '_active_plugins_backup.zip'));
    }

    PluginService.refreshAllPlugins();
    webLog('COMPLETE');
    res.send({ status: 'SUCCESS' });
  });

  return {
    local: router,
    public: publicRouter,
  };
}
