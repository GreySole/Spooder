import AdmZip from 'adm-zip';
import { userDir } from '../../Types';
import { webLog } from '../Logging';
import { withLoading } from '../util/AppUtil';
import ConfigService from './ConfigService';
import fs from 'fs-extra';
import path from 'path';
import OSCService from './OSCService';
import PluginService from './PluginService';
import nodeSchedule from 'node-schedule';

export default class BackupRestoreService {
  // Store references to scheduled jobs
  private static settingsJob: any = null;
  private static pluginsJob: any = null;
  private static bothJob: any = null;
  static InitSchedule() {
    // Cancel any previous jobs before scheduling new ones
    if (BackupRestoreService.settingsJob) {
      BackupRestoreService.settingsJob.cancel();
      BackupRestoreService.settingsJob = null;
    }
    if (BackupRestoreService.pluginsJob) {
      BackupRestoreService.pluginsJob.cancel();
      BackupRestoreService.pluginsJob = null;
    }
    if (BackupRestoreService.bothJob) {
      BackupRestoreService.bothJob.cancel();
      BackupRestoreService.bothJob = null;
    }
    const config = ConfigService.getConfig();
    if (config.backup?.auto_backup) {
      const settingsBackupName = BackupRestoreService.generateBackupName(
        'auto_' + config.bot.bot_name,
        'settings',
      );
      const pluginsBackupName = BackupRestoreService.generateBackupName(
        'auto_' + config.bot.bot_name,
        'plugins',
      );
      const backupDir = path.join(userDir, 'backup');
      const backupSettingsDir = path.join(backupDir, 'settings');
      const backupPluginsDir = path.join(backupDir, 'plugins');

      // Helper to prune old auto_ backups
      function pruneAutoBackups(dir: string, maxCount: number) {
        if (!fs.existsSync(dir)) return;
        const files = fs
          .readdirSync(dir)
          .filter((f) => f.startsWith('auto_') && f.endsWith('.zip'))
          .map((f) => ({
            name: f,
            time: fs.statSync(path.join(dir, f)).mtime.getTime(),
          }))
          .sort((a, b) => a.time - b.time); // oldest first
        if (files.length > maxCount) {
          const toDelete = files.slice(0, files.length - maxCount);
          toDelete.forEach((f) => {
            fs.rmSync(path.join(dir, f.name));
            webLog(`Pruned old auto-backup: ${f.name}`);
          });
        }
      }

      // After each backup, prune excess auto_ backups
      const pruneSettings = () => {
        const max = config.backup?.auto_backup?.settings?.max_backups;
        if (typeof max === 'number' && max > 0) {
          pruneAutoBackups(backupSettingsDir, max);
        }
      };
      const prunePlugins = () => {
        const max = config.backup?.auto_backup?.plugins?.max_backups;
        if (typeof max === 'number' && max > 0) {
          pruneAutoBackups(backupPluginsDir, max);
        }
      };

      if (
        config.backup.auto_backup.settings.enabled &&
        config.backup.auto_backup.plugins.enabled &&
        config.backup.auto_backup.settings.schedule === config.backup.auto_backup.plugins.schedule
      ) {
        const schedule = config.backup.auto_backup.settings.schedule;
        BackupRestoreService.bothJob = nodeSchedule.scheduleJob(schedule, async () => {
          webLog('AUTO BACKUP Start');
          webLog('Backing up settings...');

          await BackupRestoreService.backupSettings(settingsBackupName);
          pruneSettings();
          webLog('Backing up plugins...');

          await BackupRestoreService.backupPlugins(pluginsBackupName);
          prunePlugins();
          webLog('AUTO BACKUP Complete');
        });
        webLog('Auto backup schedule set for both settings and plugins: ' + schedule);
      } else {
        if (config.backup.auto_backup.settings.enabled) {
          const schedule = config.backup.auto_backup.settings.schedule;
          BackupRestoreService.settingsJob = nodeSchedule.scheduleJob(schedule, async () => {
            webLog('AUTO BACKUP Start - Settings');
            webLog('Backing up settings...');
            await BackupRestoreService.backupSettings(settingsBackupName);
            pruneSettings();
            webLog('AUTO BACKUP Complete - Settings');
          });
          webLog('Auto backup schedule set for settings: ' + schedule);
        }
        if (config.backup.auto_backup.plugins.enabled) {
          const schedule = config.backup.auto_backup.plugins.schedule;
          BackupRestoreService.pluginsJob = nodeSchedule.scheduleJob(schedule, async () => {
            webLog('AUTO BACKUP Start - Plugins');
            webLog('Backing up plugins...');
            await BackupRestoreService.backupPlugins(pluginsBackupName);
            prunePlugins();
            webLog('AUTO BACKUP Complete - Plugins');
          });
          webLog('Auto backup schedule set for plugins: ' + schedule);
        }
      }
    }
  }

  private static generateBackupName(prefix: string, type: 'settings' | 'plugins') {
    let date = new Date();
    return (
      prefix +
      '_' +
      type +
      '_' +
      date.getFullYear() +
      '_' +
      (date.getMonth() + 1) +
      '_' +
      date.getDate() +
      '_' +
      date.getHours() +
      '_' +
      date.getMinutes() +
      '_' +
      date.getSeconds()
    );
  }

  static backupSettings(rawBackupName: string) {
    return new Promise((res, rej) => {
      const sconfig = ConfigService.getConfig();
      let zip = new AdmZip();

      zip.addLocalFolder(userDir + '/settings', '');

      if (!fs.existsSync(userDir + '/backup')) {
        fs.mkdirSync(userDir + '/backup', { recursive: true });
      }

      if (!fs.existsSync(userDir + '/backup/settings')) {
        fs.mkdirSync(userDir + '/backup/settings', { recursive: true });
      }

      let backupName = null;
      if (rawBackupName != null && rawBackupName != '') {
        backupName = rawBackupName;
      } else {
        backupName = BackupRestoreService.generateBackupName(sconfig.bot.bot_name, 'settings');
      }
      zip.writeZip(userDir + '/backup/settings/' + backupName + '.zip', (e) => {
        if (e) {
          throw new Error(e.message);
        }

        res('ok');
        webLog('BACKUP COMPLETE');
      });
    });
  }

  static backupPlugins(rawBackupName: string) {
    return new Promise((res, rej) => {
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
        fs.mkdirSync(userDir + '/backup', { recursive: true });
      }

      if (!fs.existsSync(userDir + '/backup/plugins')) {
        fs.mkdirSync(userDir + '/backup/plugins', { recursive: true });
      }
      let backupName = null;
      if (rawBackupName != null && rawBackupName != '') {
        backupName = rawBackupName;
      } else {
        backupName = BackupRestoreService.generateBackupName(sconfig.bot.bot_name, 'plugins');
      }

      webLog(
        'Writing backup. This can take a while depending on how many plugins you have. I wish I could show you progress...',
      );

      zip.writeZip(userDir + '/backup/plugins/' + backupName + '.zip', (e) => {
        if (e) {
          throw new Error(e.message);
        }
        let newPluginBackups = fs.readdirSync(path.join(userDir, 'backup', 'plugins'));
        res({ newbackups: newPluginBackups });
        webLog('BACKUP COMPLETE');
      });
    });
  }

  static deleteSettingsBackup(backupName: string) {
    return new Promise((res, rej) => {
      let backupDir = path.join(userDir, 'backup', 'settings');
      let fullPath = path.join(backupDir, backupName);

      if (fs.existsSync(fullPath)) {
        fs.rmSync(fullPath);
        let newPluginBackups = fs.readdirSync(path.join(userDir, 'backup', 'settings'));
        webLog('BACKUP DELETED: ' + backupName);
        res({ status: 'SUCCESS', newbackups: newPluginBackups });
      } else {
        res({ status: "FILE DOESN'T EXIST: " + fullPath });
      }
    });
  }

  static deletePluginsBackup(backupName: string) {
    return new Promise((res, rej) => {
      let backupDir = path.join(userDir, 'backup', 'plugins');
      let fullPath = path.join(backupDir, backupName);

      if (fs.existsSync(fullPath)) {
        fs.rmSync(fullPath);
        let newPluginBackups = fs.readdirSync(path.join(userDir, 'backup', 'plugins'));
        webLog('BACKUP DELETED: ' + backupName);
        res({ status: 'SUCCESS', newbackups: newPluginBackups });
      } else {
        res({ status: "FILE DOESN'T EXIST: " + fullPath });
      }
    });
  }

  static async prepareRestoreSettings(file: Express.Multer.File | null, backupName?: string) {
    let fileName = null;

    if (file) {
      fileName = file.originalname;
      await fs.move(file.path, path.join(userDir, 'backup', 'settings', fileName), {
        overwrite: true,
      });
    } else if (backupName) {
      fileName = backupName;
    }

    if (!fileName) {
      throw new Error('No file name provided');
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

    return {
      status: 'ok',
      data: zipEntries.map((e) => e.entryName.substring(0, e.entryName.lastIndexOf('.'))),
    };
  }

  static async restoreSettings(selections: { [key: string]: boolean }) {
    return withLoading(async () => {
      if (!fs.existsSync(userDir + '/tmp')) {
        fs.mkdirSync(userDir + '/tmp', { recursive: true });
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
      return { status: 'SUCCESS' };
    });
  }

  static async prepareRestorePlugins(file: Express.Multer.File | null, backupName?: string) {
    let fileName = null;
    if (!fs.existsSync(userDir + '/backup/plugins')) {
      fs.mkdirSync(userDir + '/backup/plugins', { recursive: true });
    }
    if (!fs.existsSync(userDir + '/tmp')) {
      fs.mkdirSync(userDir + '/tmp', { recursive: true });
    }

    if (fs.existsSync(path.join(userDir, 'tmp', '_active_plugins_backup'))) {
      fs.rmSync(path.join(userDir, 'tmp', '_active_plugins_backup'), { recursive: true });
    }

    if (file) {
      console.log('FILE FOUND', file);
      fileName = file.originalname;
      await fs.move(file.path, path.join(userDir, 'backup', 'plugins', fileName), {
        overwrite: true,
      });
    } else if (backupName) {
      fileName = backupName;
    }

    if (!fileName) {
      throw new Error('No file name provided');
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

    return {
      status: 'ok',
      data: pluginList,
    };
  }

  static async restorePlugins(selections: { [key: string]: boolean }) {
    return withLoading(async () => {
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
      return { status: 'SUCCESS' };
    });
  }
}
