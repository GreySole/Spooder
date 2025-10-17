import path from 'path';
import fs from 'fs-extra';
import { Request, Response } from 'express';
import express from 'express';
import { userDir } from '../../Types';
import { webLog } from '../Logging';
import multer from 'multer';
import BackupRestoreService from '../service/BackupRestoreService';

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

  router.get('/get_backups_settings', (req: Request, res: Response) => {
    let backupSettingsDir = path.join(userDir, 'backup', 'settings');
    const backups = fs.existsSync(backupSettingsDir) ? fs.readdirSync(backupSettingsDir) : [];
    res.send(backups);
  });

  router.get('/get_backups_plugins', (req: Request, res: Response) => {
    const backupPluginsDir = path.join(userDir, 'backup', 'plugins');
    const backups = fs.existsSync(backupPluginsDir) ? fs.readdirSync(backupPluginsDir) : [];
    res.send(backups);
  });

  router.get('/checkout_settings/:filename', async (req: Request, res: Response) => {
    let backupName = req.params.filename;
    webLog('DOWNLOADING SETTINGS', path.join(userDir, 'backup', 'settings', backupName));
    res.setHeader('Content-disposition', backupName);
    res.download(path.join(userDir, 'backup', 'settings', backupName));
  });

  router.get('/checkout_plugins/:filename', async (req: Request, res: Response) => {
    let backupName = req.params.filename;
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
    try {
      const result = await BackupRestoreService.backupSettings(req.body.backupName);
      res.send(result);
    } catch (error) {
      res.status(500).send({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  router.post('/backup_plugins', async (req: Request, res: Response) => {
    try {
      const result = await BackupRestoreService.backupPlugins(req.body.backupName);
      res.send(result);
    } catch (error) {
      res.status(500).send({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  router.post('/delete_backup_settings', async (req: Request, res: Response) => {
    const backupName = req.body.backupName;
    try {
      const result = await BackupRestoreService.deleteSettingsBackup(backupName);
      res.send(result);
    } catch (error) {
      res.status(500).send({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  router.post('/delete_backup_plugins', async (req: Request, res: Response) => {
    let backupName = req.body.backupName;
    try {
      const result = await BackupRestoreService.deletePluginsBackup(backupName);
      res.send(result);
    } catch (error) {
      res.status(500).send({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  router.post('/prepare_restore_settings', async (req: Request, res: Response) => {
    try {
      const result = await BackupRestoreService.prepareRestoreSettings(
        req.file || null,
        req.body.backupName,
      );
      res.send(result);
    } catch (error) {
      res.status(500).send({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  router.post('/restore_settings', async (req: Request, res: Response) => {
    try {
      const result = await BackupRestoreService.restoreSettings(req.body.selections);
      res.send(result);
    } catch (error) {
      res.status(500).send({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  router.post('/prepare_restore_plugins', async (req: Request, res: Response) => {
    try {
      const result = await BackupRestoreService.prepareRestorePlugins(
        req.file || null,
        req.body.backupName,
      );
      res.send(result);
    } catch (error) {
      res.status(500).send({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  router.post('/restore_plugins', async (req: Request, res: Response) => {
    try {
      const result = await BackupRestoreService.restorePlugins(req.body.selections);
      res.send(result);
    } catch (error) {
      res.status(500).send({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return {
    local: router,
    public: publicRouter,
  };
}
