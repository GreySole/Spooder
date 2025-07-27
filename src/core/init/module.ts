import { json, Request, Response } from 'express';
import { networkInterfaces } from 'os';
import { KeyedObject, userDir } from '../../Types.ts';
import ConfigService from '../service/ConfigService.ts';
import { WebService } from '../service/WebService.ts';
import AdmZip from 'adm-zip';
import path from 'path';
import { spooderLog, webLog } from '../Logging.ts';
import fs from 'fs-extra';
import multer from 'multer';
import { isIPCConnected, sendToApp } from '../util/AppUtil.ts';

interface NetworkInterface {
  name: string;
  address: string;
}

export default class Initializer {
  constructor() {
    new ConfigService();
    const webUI = new WebService();

    webUI.router?.get('/init', async (req, res) => {
      const config = ConfigService.getConfig();
      const themes = ConfigService.getThemes();

      const nets = networkInterfaces();

      const results = [] as NetworkInterface[];

      if (nets !== undefined) {
        for (const name of Object.keys(nets)) {
          for (const net of nets[name]!) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            // 'IPv4' is in Node <= 17, from 18 it's a number 4 or 6
            const familyV4Value = typeof net.family === 'string' ? 'IPv4' : 4;
            if (net.family === familyV4Value && !net.internal) {
              results.push({
                name: name,
                address: net.address,
              } as NetworkInterface);
            }
          }
        }
      }

      res.send({
        config: config,
        nets: results,
        themes: themes,
      });
    });

    fs.existsSync(path.join(userDir, 'tmp', 'multer')) ||
      fs.mkdirSync(path.join(userDir, 'tmp', 'multer'));

    webUI.router?.use(json());
    const tempStorage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, path.join(userDir, 'tmp', 'multer'));
      },
    });
    const restoreUpload = multer({ storage: tempStorage });
    webUI.router?.use('/prepare_restore_settings', restoreUpload.single('file'));

    webUI.router?.get('/finish_init', (req, res) => {
      const ipcConnected = isIPCConnected();
      res.send({ status: 'ok', ipcConnected: ipcConnected });
      if (ipcConnected) {
        sendToApp({ action: 'restart' });
      } else {
        spooderLog('Spooder is headless, manual restart required.');
      }
    });

    webUI.router?.post('/save_config', async (req: Request, res: Response) => {
      const newSettings = req.body;
      console.log('Saving new settings', newSettings);
      ConfigService.saveConfig(newSettings);
      res.send({ status: 'ok' });
    });

    webUI.router?.post('/save_themes', async (req: Request, res: Response) => {
      const newSettings = req.body;
      const currentThemes = Object.assign({}, ConfigService.getThemes());
      currentThemes.webui = newSettings.webui;
      currentThemes.spooderpet = newSettings.spooderpet;
      console.log('Saving new themes', newSettings);
      ConfigService.saveThemes(newSettings);
      res.send({ status: 'ok' });
    });

    webUI.router?.post('/prepare_restore_settings', async (req: Request, res: Response) => {
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

      res.send({
        status: 'ok',
        data: zipEntries.map((e) => e.entryName.substring(0, e.entryName.lastIndexOf('.'))),
      });
    });

    webUI.router?.post('/restore_settings', async (req: Request, res: Response) => {
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
          fs.copySync(
            path.join(tempDir, s + '.json'),
            path.join(userDir, 'settings', s + '.json'),
            {
              overwrite: true,
            },
          );
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
      if (selections['config']) {
        ConfigService.refreshConfig();
      }
      if (selections['themes']) {
        ConfigService.refreshThemes();
      }
      res.send({ status: 'SUCCESS' });
    });

    console.log('Init UI ready! You must open this on localhost to set up Twitch.');
  }
}
