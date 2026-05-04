import chmodr from 'chmodr';
import express, { Request, Response } from 'express';
import fs from 'fs-extra';
import path from 'path';
import { KeyedObject, userDir } from '../../../Types';
import { webLog } from '../../Logging';

export function registerAssetRoutes(router: express.Router) {
  router.post('/delete_plugin_asset', async (req: Request, res: Response) => {
    const pluginName = req.body.pluginName;
    const assetPath = req.body.assetName;
    const fileStatus = 'SUCCESS';

    const assetDir = path.join(userDir, 'web', 'assets', pluginName, assetPath, '..');
    const assetFile = path.join(userDir, 'web', 'assets', pluginName, assetPath);
    fs.rmSync(assetFile, { recursive: true });
    const thisPluginAssets = fs.existsSync(assetDir) == true ? fs.readdirSync(assetDir) : null;

    res.send({
      status: fileStatus,
      newAssets: thisPluginAssets,
    });
  });

  router.post('/get_plugin_assets', async (req: Request, res: Response) => {
    const pluginName = req.body.pluginname;
    const mainDir = path.join(userDir, 'web', 'assets', pluginName);
    const results = {} as KeyedObject;
    const walk = function (dir: string, done: (a: any, b?: any) => void) {
      fs.readdir(dir, function (err: any, list: any) {
        if (err) return done(err);
        var pending = list.length;
        let foldername = dir.substring(mainDir.length + 1);
        if (foldername == '') {
          foldername = 'root';
        }
        if (!pending) return done(null, results);
        list.forEach(function (file: string) {
          //file = path.resolve(dir, file); <-- Makes double backslash paths on Windows >.<
          file = dir + '/' + file;
          fs.stat(file, function (err: any, stat: any) {
            let filename = file.substring(mainDir.length + 1);
            if (stat && stat.isDirectory()) {
              walk(file, function (err, res) {
                if (!--pending) done(null, results);
              });
            } else {
              if (results[foldername] == null) {
                results[foldername] = [];
              }
              results[foldername].push(filename);
              if (!--pending) done(null, results);
            }
          });
        });
      });
    };
    walk(path.join(userDir, 'web', 'assets', pluginName), (err, results) => {
      res.send({ status: 'OK', dirs: results });
    });
  });

  router.get('/browse_plugin_assets', async (req: Request, res: Response) => {
    const currentPath = req.query.folder as string;
    const pluginName = req.query.pluginname as string;

    if (!fs.existsSync(path.join(userDir, 'web', 'assets', pluginName))) {
      fs.mkdirSync(path.join(userDir, 'web', 'assets', pluginName));
    }

    if (!fs.existsSync(path.join(userDir, 'web', 'assets', pluginName, currentPath))) {
      res.send({ status: 'EMPTY', dirs: [] });
      return;
    }

    const dirs =
      fs.existsSync(path.join(userDir, 'web', 'assets', pluginName, currentPath)) == true
        ? fs.readdirSync(path.join(userDir, 'web', 'assets', pluginName, currentPath))
        : [];

    dirs.forEach((value, index, array) => {
      array[index] = currentPath === '/' ? `${value}` : `${currentPath}/${value}`;
    });

    res.send({ status: 'ok', dirs: dirs });
  });

  router.post('/upload_plugin_asset', async (req: Request, res: Response) => {
    try {
      if (!req.files) {
        webLog('NO FILES FOUND');
        res.send({
          status: false,
          message: 'No file uploaded',
        });
      } else {
        const uploadedFiles = req.files as Express.Multer.File[];
        const pluginName = req.body.pluginName;
        const assetPath = req.body.assetPath;

        const assetDir = path.join(userDir, 'web', 'assets', pluginName, assetPath);

        if (!fs.existsSync(assetDir)) {
          fs.mkdirSync(assetDir);
        }

        uploadedFiles.forEach(async (file) => {
          const assetFile = path.join(assetDir, file.originalname);
          console.log('COPYING', file, file.buffer);
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
  });

  router.post('/upload_plugin_icon', async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        webLog('NO FILES FOUND');
        res.send({
          status: false,
          message: 'No file uploaded',
        });
      } else {
        const pluginAsset = req.file as Express.Multer.File;
        const pluginName = req.body.pluginName;

        const iconDir = path.join(userDir, 'web', 'icons');
        const iconFile = path.join(iconDir, pluginName + '.png');

        if (!fs.existsSync(iconDir)) {
          fs.mkdirSync(iconDir);
        }

        await fs.move(pluginAsset.path, iconFile, {
          overwrite: true,
        });

        chmodr(iconFile, 0o777, (err) => {
          if (err) throw err;
        });
        webLog('COMPLETE!');

        res.send({
          status: 'ok',
          message: 'File Upload Success',
        });
      }
    } catch (e) {
      console.error(e);
    }
  });
}
