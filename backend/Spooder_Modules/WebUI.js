const Axios = require("axios");
const fs = require("fs-extra");

const { networkInterfaces } = require('os');

const nets = networkInterfaces();
const results = Object.create(null); // Or just '{}', an empty object
var suggestedNet = null;

for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
        // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
        // 'IPv4' is in Node <= 17, from 18 it's a number 4 or 6
        const familyV4Value = typeof net.family === 'string' ? 'IPv4' : 4
        if (net.family === familyV4Value && !net.internal) {
            if (!results[name]) {
                results[name] = [];
            }
            results[name].push(net.address);
            if(net.address.startsWith("192")){
                suggestedNet = net.address;
            }
        }
    }
}

const chmodr = require('chmodr');
const fsPromises = require('fs/promises');
const ngrok = require("ngrok");

const express = require('express');
const bodyParser = require("body-parser");
const AdmZip = require('adm-zip');
const fileUpload = require('express-fileupload');
const path = require("path");
const crypto = require("crypto");

var webLog = (...content) => {
    console.log(logEffects("Bright"),logEffects("FgBlue"), ...content, logEffects("Reset"));
}

class WebUI {

    constructor(props){

    }

    startServer(devMode){

        var expressPort = null;

        let pluginsDir = path.join(backendDir, "plugins");
        let webDir = path.join(backendDir, "web");
        let overlayDir = path.join(backendDir, "web", "overlay");
        let utilityDir = path.join(backendDir, "web", "utility");
        
        if(!fs.existsSync(pluginsDir)){
            fs.mkdirSync(pluginsDir);
        }

        if(!fs.existsSync(webDir)){
            fs.mkdirSync(webDir);
        }

        if(!fs.existsSync(overlayDir)){
            fs.mkdirSync(overlayDir);
        }

        if(!fs.existsSync(utilityDir)){
            fs.mkdirSync(utilityDir);
        }

        var app = new express();
        var router = express.Router();

        channel = "#"+sconfig.broadcaster.username;
        expressPort = devMode===false?sconfig.network.host_port:3001;
        app.use("/",router);
        if(devMode === false){
            router.use("/", express.static(frontendDir+'/main/build'));
        }
        router.use("/mod", express.static(frontendDir+'/mod/build'));

        router.use("/overlay", express.static(backendDir+'/web/overlay'));
        router.use("/utility", express.static(backendDir+'/web/utility'));
        router.use("/settings", express.static(backendDir+'/web/settings'));
        router.use("/icons", express.static(backendDir+'/web/icons'));

        router.use(bodyParser.urlencoded({extended:true}));
        router.use(bodyParser.json());
        router.use("/install_plugin",fileUpload());
        router.use("/upload_plugin_asset/*",fileUpload());
        router.use("/checkin_settings", fileUpload());
        router.use("/checkin_plugins", fileUpload());
        router.use(express.json({verify: this.verifyTwitchSignature}));

        app.use((req, res, next) => {
            
            res.status(404).send("<h1>Page not found on the server</h1>")
        });

        router.get("/overlay/get", async(req, res) => {

            let isExternal = req.query.external;
            
            var pluginName = req.query.plugin;
            var pluginSettings = null;

            try{
                var thisPlugin = fs.readFileSync(backendDir+"/plugins/"+pluginName+"/settings.json", {encoding:'utf8'});
                pluginSettings = JSON.parse(thisPlugin);
            }catch(e){
                webLog("Plugin has no settings");
            }
            
            let oscInfo = null;

            if(isExternal == "true"){
                oscInfo = {
                    host: sconfig.network.external_tcp_url,
                    port: null,
                    settings: pluginSettings
                };
            }else{
                oscInfo = {
                    host: sconfig.network.host,
                    port: sconfig.network.osc_tcp_port,
                    settings: pluginSettings
                };
            }

            res.send({express: JSON.stringify(oscInfo)});
        });

        router.get('/command_table', async (req, res) => {
            let obs = {};
            if(sosc.obs.connected){
                let obsInputs = await callOBS("GetInputList");
                let obsScenes = await callOBS("GetSceneList");
                obs.inputs = obsInputs.inputs;
                obs.scenes = obsScenes.scenes;
                obs.sceneItems = {};
                
                for(let s in obs.scenes){
                    obs.sceneItems[obs.scenes[s].sceneName] = await callOBS("GetSceneItemList", {sceneName:obs.scenes[s].sceneName});
                }
            }
            
            let props = {
                "events":events,
                "groups":eventGroups,
                "plugins":Object.keys(activePlugins),
                "obs":obs
            };
            res.send({express: JSON.stringify(props)});
        });

        router.get('/server_config', (req, res) => {
            let backupSettingsDir = path.join(backendDir, "backup", "settings");
            let backupPluginsDir = path.join(backendDir, "backup", "plugins");
            let discordSettingsDir = path.join(backendDir, "settings", "discord.json");
            let backups = {
                settings:fs.existsSync(backupSettingsDir)?fs.readdirSync(backupSettingsDir):{},
                plugins:fs.existsSync(backupPluginsDir)?fs.readdirSync(backupPluginsDir):{}
            }
            let discordData = fs.existsSync(discordSettingsDir)?JSON.parse(fs.readFileSync(discordSettingsDir, {encoding:"utf-8"})):{
                token:"",
                autosendngrok:{
                    enabled:false,
                    destguild:"",
                    destchannel:""
                }
            }
            if(discord.loggedIn){
                discordData.guilds = discord.guilds;
            }
            //console.log({config:sconfig, discord:discordData, backups:backups});
            res.send({config:sconfig, discord:discordData, backups:backups});
        });

        router.get('/udp_hosts', (req, res) => {
            res.send({express:JSON.stringify(udpClients)});
        });

        router.get('/server_state', async (req, res) => {
            var oscReturn = {
                host:sconfig.network.host,
                port:sconfig.network.osc_tcp_port,
                udp_clients:sconfig.network["udp_clients"],
                plugins:Object.keys(activePlugins),
            }

            var hostReturn = {
                port:expressPort
            }
            
            res.send({
                "user":username,
                "clientID": oauth["client-id"],
                "osc":oscReturn,
                "host":hostReturn,
                "themes":themes
            });
        });

        router.post("/saveCommandList", async (req, res) => {
            
            fs.writeFile(backendDir+"/settings/commands.json", JSON.stringify(req.body), "utf-8", (err, data)=>{
                events = req.body.events;
                eventGroups = req.body.groups;
                res.send({status:"SAVE SUCCESS"});
                webLog("SAVED COMMANDS");
            });
        });

        router.post("/saveConfig", async (req, res) => {
            let statusMsg = "";
            if(sconfig.network.externalhandle == "ngrok" && req.body.network.externalhandle != "ngrok"){
                this.stopNgrok();
                statusMsg += " (Ngrok stopped)";
            }else if(sconfig.network.externalhandle != "ngrok" && req.body.network.externalhandle == "ngrok"){
                sconfig.network.ngrokauthtoken = req.body.network.ngrokauthtoken;
                await this.startNgrok();
                statusMsg += " (Ngrok started)";
            }

            if(sconfig.network.externalhandle != req.body.network.externalhandle || sconfig.network.external_http_url != req.body.external_http_url){
                sconfig.network.externalhandle = req.body.network.externalhandle;
                sconfig.network.external_http_url = req.body.network.external_http_url;
                sconfig.network.ngrokauthtoken = sconfig.network.ngrokauthtoken;
                twitch.refreshEventSubs();
                statusMsg += " (Refreshing EventSubs)";
            }
            
            
            fs.writeFile(backendDir+"/settings/config.json", JSON.stringify(req.body), "utf-8", (err, data)=>{
                
                sconfig = req.body;
                res.send({status:statusMsg});
                webLog("SAVED THE CONFIG");
            });
        });

        router.post("/saveCustomSpooder", async (req, res) => {
            themes.spooderpet = req.body;
            fs.writeFile(backendDir+"/settings/themes.json", JSON.stringify(themes), "utf-8", (err, data)=>{
                let statusMsg = "Spooder Saved!"
                res.send({status:statusMsg});
                webLog("SAVED THE SPOODER");
            });
        })

        router.post("/saveOSCTunnels", async(req, res) => {
            fs.writeFile(backendDir+"/settings/osc-tunnels.json", JSON.stringify(req.body), "utf-8", (err, data)=>{
                osctunnels = req.body;
                sosc.updateOSCListeners();
                res.send({status:"SAVE SUCCESS"});
                webLog("SAVED THE TUNNELS");
            });
        });

        

        router.post('/install_plugin', async (req, res) => {
            try{
                if(!req.files){
                    webLog("NO FILES FOUND");
                    res.send({
                        status: false,
                        message: 'No file uploaded'
                    })
                }else{
                    let pluginZip = req.files.file;
                    let pluginDirName = pluginZip.name.split(".")[0];
                    let renameCount = 1;
                    while(fs.existsSync(path.join(backendDir, "plugins", pluginDirName))){
                        if(!fs.existsSync(path.join(backendDir, "plugins", pluginDirName+renameCount))){
                            pluginDirName += renameCount;
                            break;
                        }else{
                            renameCount++;
                        }
                    }

                    //Make /tmp
                    if(!fs.existsSync(backendDir+"/tmp")){
                        fs.mkdirSync(backendDir+"/tmp");
                    }

                    let tempFile = path.join(backendDir,"tmp", pluginZip.name);
                    let tempDir = path.join(backendDir, "tmp", pluginDirName);
                    let pluginDir = path.join(backendDir,"plugins", pluginDirName);
                    let overlayDir = path.join(backendDir,"web", "overlay", pluginDirName);
                    let utilityDir = path.join(backendDir, "web", "utility", pluginDirName);
                    let settingsDir = path.join(backendDir, "web", "settings", pluginDirName);
                    let iconDir = path.join(backendDir, "web", "icons", pluginDirName+".png");
                    //Cleanup before install
                    if(fs.existsSync(tempFile)){
                        await fs.rm(tempFile);
                    }
                    if(fs.existsSync(tempDir)){
                        await fs.rm(tempDir, {recursive:true});
                    }

                    //Start installing
                    await pluginZip.mv(tempFile);
                    webLog("EXTRACT ZIP");
                    let zip = new AdmZip(tempFile);
                    zip.extractAllTo(tempDir);

                    if(!fs.existsSync(tempDir+"/command")){
                        res.send({
                            status: false,
                            message: 'No command folder'
                        })
                    }

                    if(fs.existsSync(tempDir+"/command")){
                        await fs.move(tempDir+"/command", pluginDir, {overwrite:true});

                        chmodr(pluginDir,0o777, (err) => {
                            if(err) throw err;
                            
                        });
                    }
                    
                    if(fs.existsSync(tempDir+"/overlay")){
                        await fs.move(tempDir+"/overlay", overlayDir, {overwrite:true});

                        chmodr(overlayDir,0o777, (err) => {
                            if(err) throw err;
                            
                        });
                    }

                    if(fs.existsSync(tempDir+"/utility")){
                        await fs.move(tempDir+"/utility", utilityDir, {overwrite:true});

                        chmodr(utilityDir,0o777, (err) => {
                            if(err) throw err;
                            
                        });
                    }

                    if(fs.existsSync(tempDir+"/settings")){
                        await fs.move(tempDir+"/settings", settingsDir, {overwrite:true});

                        chmodr(settingsDir,0o777, (err) => {
                            if(err) throw err;
                            
                        });
                    }

                    if(fs.existsSync(tempDir+"/icon.png")){
                        await fs.move(tempDir+"/icon.png", iconDir, {overwrite:true});

                        chmodr(iconDir,0o777, (err) => {
                            if(err) throw err;
                            
                        });
                    }
                    
                    webLog("COMPLETE!");
                    fs.rm(tempFile);
                    fs.rm(tempDir, {recursive:true});
                    this.getPlugins();
                    res.send({
                        status:true,
                        message: "File Upload Success",
                        plugin:pluginDirName
                    });
                }
            }catch(e){
                console.error(e);
            }
        });

        router.get("/export_plugin/*", async(req, res) => {
            
            let pluginName = req.params['0'];
            
            //let tempFile = path.join(backendDir,"tmp", pluginZip.name);
            let tempDir = path.join(backendDir, "tmp", pluginName);
            let pluginDir = path.join(backendDir,"plugins", pluginName);
            let overlayDir = path.join(backendDir, "web", "overlay", pluginName);
            let utilityDir = path.join(backendDir, "web", "utility", pluginName);
            let settingsDir = path.join(backendDir, "web", "settings", pluginName);
            let iconFile = path.join(backendDir, "web", "icons", pluginName+".png");
            if(fs.existsSync(pluginDir)){
                fs.copySync(pluginDir, tempDir+"/command");
            }
            
            if(fs.existsSync(overlayDir)){
                fs.copySync(overlayDir, tempDir+"/overlay");
                if(fs.existsSync(tempDir+"/overlay/assets")){
                    await fs.rm(tempDir+"/overlay/assets", {recursive:true});
                }
            }

            if(fs.existsSync(utilityDir)){
                fs.copySync(utilityDir, tempDir+"/utility");
            }

            if(fs.existsSync(settingsDir)){
                fs.copySync(settingsDir, tempDir+"/settings");
            }

            if(fs.existsSync(iconFile)){
                fs.copyFileSync(iconFile, tempDir+"/icon.png");
            }

            let zip = new AdmZip();

            if(fs.existsSync(tempDir+"/command")){
                zip.addLocalFolder(tempDir+"/command", "/command");
            }

            if(fs.existsSync(tempDir+"/overlay")){
                zip.addLocalFolder(tempDir+"/overlay", "/overlay");
            }

            if(fs.existsSync(tempDir+"/utility")){
                zip.addLocalFolder(tempDir+"/utility", "/utility");
            }

            if(fs.existsSync(tempDir+"/settings")){
                zip.addLocalFolder(tempDir+"/settings", "/settings");
            }

            if(fs.existsSync(tempDir+"/icon.png")){
                zip.addLocalFile(tempDir+"/icon.png");
            }
            
            zip.writeZip(tempDir+"/"+pluginName+".zip");

            res.setHeader('Content-disposition', pluginName+".zip");
            res.download(tempDir+"/"+pluginName+".zip");

            fs.rm(tempDir, {recursive:true});
        });

        router.get("/checkout_settings/*", async (req, res) => {
            let backupName = req.params['0'];
            webLog("DOWNLOADING SETTINGS", path.join(backendDir, "backup", "settings", backupName));
            res.setHeader("Content-disposition", backupName);
            res.download(path.join(backendDir, "backup", "settings", backupName));
        });

        router.get("/checkout_plugins/*", async (req, res) => {
            let backupName = req.params['0'];
            webLog("DOWNLOADING PLUGINS", path.join(backendDir, "backup", "settings", backupName));
            res.setHeader("Content-disposition", backupName);
            res.download(path.join(backendDir, "backup", "plugins", backupName));
        })

        router.post("/checkin_settings", (req, res) => {
            if(!req.files){
                webLog("NO FILES FOUND");
                res.send({
                    status: false,
                    message: 'No file uploaded'
                })
            }else{
                if(!fs.existsSync(path.join(backendDir, "backup"))){
                    fs.mkdirSync(path.join(backendDir, "backup"));
                }
                if(!fs.existsSync(path.join(backendDir, "backup", "settings"))){
                    fs.mkdirSync(path.join(backendDir, "backup", "settings"));
                }
                req.files.file.mv(path.join(backendDir, "backup", "settings", req.files.file.name));
                let newSettingsBackups = fs.readdirSync(path.join(backendDir, "backup", "settings"));
                
                res.send({newbackups:newSettingsBackups});
            }
        })

        router.post("/checkin_plugins", (req, res) => {
            if(!req.files){
                webLog("NO FILES FOUND");
                res.send({
                    status: false,
                    message: 'No file uploaded'
                })
            }else{
                if(!fs.existsSync(path.join(backendDir, "backup"))){
                    fs.mkdirSync(path.join(backendDir, "backup"));
                }
                if(!fs.existsSync(path.join(backendDir, "backup", "plugins"))){
                    fs.mkdirSync(path.join(backendDir, "backup", "plugins"));
                }
                req.files.file.mv(path.join(backendDir, "backup", "plugins", req.files.file.name));
                let newSettingsBackups = fs.readdirSync(path.join(backendDir, "backup", "plugins"));
                
                res.send({newbackups:newSettingsBackups});
            }
        })

        router.post("/backup_settings", async(req, res)=>{
            let zip = new AdmZip();
            
            zip.addLocalFolder(backendDir+"/settings", "");

            if(!fs.existsSync(backendDir+"/backup")){
                fs.mkdirSync(backendDir+"/backup");
            }

            if(!fs.existsSync(backendDir+"/backup/settings")){
                fs.mkdirSync(backendDir+"/backup/settings");
            }
            
            let backupName = null;
            if(req.body.backupName != null && req.body.backupName != ''){
                backupName = req.body.backupName;
            }else{
                let date = new Date();
                backupName = date.getFullYear()+"-"+date.getMonth()+"-"+date.getDate()+"-"+date.getHours()+"-"+date.getMinutes()+"-"+date.getSeconds();
            }
            zip.writeZip(backendDir+"/backup/settings/"+backupName+".zip",(e)=>{
                if(e){
                    throw new Error(e.message);
                }
                let newSettingsBackups = fs.readdirSync(path.join(backendDir, "backup", "settings"));
                
                res.send({newbackups:newSettingsBackups});
                webLog("BACKUP COMPLETE");
            });
        });

        router.post("/backup_plugins", async(req, res)=>{
            let zip = new AdmZip();

            zip.addLocalFolder(backendDir+"/plugins", "/plugins");
            zip.addLocalFolder(backendDir+"/web", "/web");

            if(!fs.existsSync(backendDir+"/backup")){
                fs.mkdirSync(backendDir+"/backup");
            }

            if(!fs.existsSync(backendDir+"/backup/plugins")){
                fs.mkdirSync(backendDir+"/backup/plugins");
            }
            let backupName = null;
            if(req.body.backupName != null && req.body.backupName != ''){
                backupName = req.body.backupName;
            }else{
                let date = new Date();
                backupName = date.getFullYear()+"-"+date.getMonth()+"-"+date.getDate()+"-"+date.getHours()+"-"+date.getMinutes()+"-"+date.getSeconds();
            }
            webLog("Writing backup. This can take a while depending on how many plugins you have. I wish I could show you progress...");
            
            zip.writeZip(backendDir+"/backup/plugins/"+backupName+".zip", (e)=>{
                if(e){
                    throw new Error(e.message);
                }
                let newPluginBackups = fs.readdirSync(path.join(backendDir, "backup", "plugins"));
                res.send({newbackups:newPluginBackups});
                webLog("BACKUP COMPLETE");
            });
        });

        router.post("/delete_backup_settings", (req, res) => {
            let backupName = req.body.backupName;
            let backupDir = path.join(backendDir, "backup", "settings");
            let fullPath = path.join(backupDir, backupName);

            if(fs.existsSync(fullPath)){
                fs.rmSync(fullPath);
                let newPluginBackups = fs.readdirSync(path.join(backendDir, "backup", "settings"));
                webLog("BACKUP DELETED: "+backupName);
                res.send({status:"SUCCESS",newbackups:newPluginBackups});
            }else{
                res.send({status:"FILE DOESN'T EXIST: "+fullPath});
            }
        });

        router.post("/delete_backup_plugins", (req, res) => {
            let backupName = req.body.backupName;
            let backupDir = path.join(backendDir, "backup", "plugins");
            let fullPath = path.join(backupDir, backupName);

            if(fs.existsSync(fullPath)){
                fs.rmSync(fullPath);
                let newPluginBackups = fs.readdirSync(path.join(backendDir, "backup", "plugins"));
                webLog("BACKUP DELETED: "+backupName);
                res.send({status:"SUCCESS",newbackups:newPluginBackups});
            }else{
                res.send({status:"FILE DOESN'T EXIST: "+fullPath});
            }
        })

        router.post("/restore_settings", async(req, res) => {
            let fileName = null;
            let selections = req.body.selections;
            if(!fs.existsSync(backendDir+"/tmp")){
                fs.mkdirSync(backendDir+"/tmp");
            }

            if(req.files){
                fileName = req.files.file.name;
                if(fs.existsSync(path.join(backendDir, "tmp", fileName))){
                    await fs.rm(path.join(backendDir, "tmp", fileName));
                }
                await req.files.file.mv(path.join(backendDir, "tmp", fileName));

            }else if(req.body.backupName){
                fileName = req.body.backupName;
                if(fs.existsSync(path.join(backendDir, "tmp", fileName))){
                    await fs.rm(path.join(backendDir, "tmp", fileName));
                }
                fs.copySync(path.join(backendDir, "backup", "settings", fileName), path.join(backendDir, "tmp", fileName), {overwrite:true});
            }

            let fileDir = path.join(backendDir, "tmp", fileName.split(".")[0]);

            if(fs.existsSync(fileDir)){
                await fs.rm(fileDir, {recursive:true});
            }

            let zip = new AdmZip(path.join(backendDir, "tmp", fileName));
            zip.extractAllTo(fileDir);
            
            for(let s in selections){
                webLog("CHECKING", s+".json");
                if(selections[s] == true){
                    if(fs.existsSync(path.join(fileDir, s+".json"))){
                        webLog("OVERWRITE "+s+".json");
                        fs.copySync(path.join(fileDir, s+".json"), path.join(backendDir, "settings", s+".json"), {overwrite:true});
                    }else{
                        webLog(path.join(fileDir, s+".json"),"NOT FOUND");
                    }
                }
            }

            if(fs.existsSync(fileDir)){
                await fs.rm(fileDir, {recursive:true});
            }

            if(fs.existsSync(path.join(backendDir, "tmp", fileName))){
                await fs.rm(path.join(backendDir, "tmp", fileName));
            }

            let newPluginBackups = fs.readdirSync(path.join(backendDir, "backup", "settings"));
            webLog("COMPLETE");
            res.send({status:"SUCCESS",newbackups:newPluginBackups});
        });

        router.post("/restore_plugins", async(req, res) => {
            let fileName = null;
            let selections = req.body.selections;
            if(!fs.existsSync(backendDir+"/tmp")){
                fs.mkdirSync(backendDir+"/tmp");
            }

            if(req.files){
                fileName = req.files.file.name;
                if(fs.existsSync(path.join(backendDir, "tmp", fileName))){
                    await fs.rm(path.join(backendDir, "tmp", fileName));
                }
                await req.files.file.mv(path.join(backendDir, "tmp", fileName));

            }else if(req.body.backupName){
                fileName = req.body.backupName;
                if(fs.existsSync(path.join(backendDir, "tmp", fileName))){
                    await fs.rm(path.join(backendDir, "tmp", fileName));
                }
                fs.copySync(path.join(backendDir, "backup", "plugins", fileName), path.join(backendDir, "tmp", fileName), {overwrite:true});
            }

            let fileDir = path.join(backendDir, "tmp", fileName.split(".")[0]);

            webLog("GET BACKUP", fileName, fileDir);

            if(fs.existsSync(fileDir)){
                await fs.rm(fileDir, {recursive:true});
            }

            let zip = new AdmZip(path.join(backendDir, "tmp", fileName));
            zip.extractAllTo(fileDir);

            let pluginList = fs.readdirSync(path.join(fileDir, "plugins"));
            webLog("Deleting Plugins...");
            fs.rmSync(path.join(backendDir, "plugins"),{recursive:true});
            fs.mkdirSync(path.join(backendDir, "plugins"));

            webLog("Copying Plugins...");
            for(let p in pluginList){
                webLog(pluginList[p]);
                fs.copySync(path.join(fileDir, "plugins", pluginList[p]), path.join(backendDir, "plugins", pluginList[p]));
            }

            let webfolders = fs.readdirSync(path.join(backendDir, "web"));
            webLog("Deleting Web Folders...");
            for(let w in webfolders){
                if(webfolders[w] != "mod"){
                    
                    fs.rmSync(path.join(backendDir, "web", webfolders[w]), {recursive:true});
                }
            }

            let newWebFolders = fs.readdirSync(path.join(fileDir, "web"));
            webLog("Copying Web Folders...");
            for(let w in newWebFolders){
                if(newWebFolders[w] != "mod"){
                    webLog(newWebFolders[w])
                    fs.copySync(path.join(fileDir, "web", newWebFolders[w]),
                    path.join(backendDir, "web", newWebFolders[w]));
                }
            }
            webLog("Cleaning up...")
            if(fs.existsSync(fileDir)){
                await fs.rm(fileDir, {recursive:true});
            }

            if(fs.existsSync(path.join(backendDir, "tmp", fileName))){
                await fs.rm(path.join(backendDir, "tmp", fileName));
            }
            this.getPlugins();
            let newPluginBackups = fs.readdirSync(path.join(backendDir, "backup", "plugins"));
            webLog("COMPLETE");
            res.send({status:"SUCCESS",newbackups:newPluginBackups});
        });

        router.post("/refresh_plugins", async (req, res) => {
            this.getPlugins();
            res.send({"status":"Refresh Success!"});
        });

        router.post('/delete_plugin_asset', async(req, res) =>{

            let pluginName = req.body.pluginName;
            let assetName = req.body.assetName;
            let fileStatus = "SUCCESS";

            let assetDir = path.join(backendDir,"web", "overlay", pluginName, "assets");
            let assetFile = path.join(backendDir,"web", "overlay", pluginName, "assets", assetName);
            await fs.rm(assetFile, (err) => {
                if(err) throw err;

                let thisPluginAssets = fs.existsSync(assetDir)==true ?
                                    fs.readdirSync(assetDir):null;

                res.send({
                    status:fileStatus,
                    newAssets:thisPluginAssets
                });
            });
        });

        router.post('/upload_plugin_asset/*', async(req, res) => {
            try{
                if(!req.files){
                    webLog("NO FILES FOUND");
                    res.send({
                        status: false,
                        message: 'No file uploaded'
                    })
                }else{
                    let pluginAsset = req.files.file;
                    let pluginName = req.params['0'];

                    let assetDir = path.join(backendDir,"web", "overlay", pluginName, "assets");
                    let assetFile = path.join(backendDir,"web", "overlay", pluginName, "assets", pluginAsset.name);
                    
                    if(!fs.existsSync(assetDir)){
                        fs.mkdirSync(assetDir);
                    }
                    await pluginAsset.mv(assetFile);
                    
                    chmodr(assetFile,0o777, (err) => {
                        if(err) throw err;
                        
                    });
                    webLog("COMPLETE!");
                    
                    this.getPlugins();

                    let thisPluginAssets = fs.existsSync(assetDir)==true ? fs.readdirSync(assetDir):null;

                    res.send({
                        status:true,
                        message: "File Upload Success",
                        newAssets:thisPluginAssets
                    });
                }
            }catch(e){
                console.error(e);
            }
        });

        router.post('/delete_plugin', async(req, res) => {
            
            let thisBody = req.body;
            
            let pluginName = thisBody.pluginName;

            let pluginDir = path.join(backendDir,"plugins", pluginName);
            let overlayDir = path.join(backendDir,"web", "overlay", pluginName);
            let utilityDir = path.join(backendDir,"web", "utility", pluginName);
            let settingsDir = path.join(backendDir,"web", "settings", pluginName);
            let iconFile = path.join(backendDir,"web", "icons", pluginName+".png");
            await fs.rm(pluginDir, {recursive:true});
            if(fs.existsSync(overlayDir)){
                await fs.rm(overlayDir, {recursive:true});
            }
            if(fs.existsSync(utilityDir)){
                await fs.rm(utilityDir, {recursive:true});
            }
            if(fs.existsSync(settingsDir)){
                await fs.rm(settingsDir, {recursive:true});
            }
            if(fs.existsSync(iconFile)){
                await fs.rm(iconFile);
            }
            res.send(JSON.stringify({status:"SUCCESS"}));
            this.getPlugins();
        });

        router.post('/save_plugin', async(req, res) => {
            let newSettings = req.body;
            let settingsFile = path.join(backendDir, "plugins", newSettings.pluginName, "settings.json");
            webLog("SAVING", settingsFile ,newSettings);
            fs.writeFile(settingsFile, JSON.stringify(newSettings.settings), "utf-8", (err, data)=>{
                res.send({saveStatus:"SAVE SUCCESS"});
                webLog(""+newSettings.pluginName+" Settings Saved!");
            });

            this.getPlugins();
        });

        router.get('/plugins', async (req, res) => {
            
            let pluginPacks = {};
            for(let a in activePlugins){
                
                let thisPluginPath = "http://"+sconfig.network.host+":"+expressPort+"/overlay/"+a;
                let settingsFile = path.join(backendDir, "plugins", a, "settings.json");
                let thisPlugin = fs.existsSync(settingsFile)==true ?
                                JSON.parse(fs.readFileSync(settingsFile, {encoding:'utf8'})):null;

                let settingsForm = path.join(backendDir, "plugins", a, "settings-form.html");
                let thisPluginForm = fs.existsSync(settingsForm)==true ?
                                fs.readFileSync(settingsForm, {encoding:'utf8'}):null;

                let assetDir = path.join(backendDir, "web", "overlay", a, "assets");
                
                let thisPluginAssets = fs.existsSync(assetDir)==true ?
                                    fs.readdirSync(assetDir):null;

                let overlayDir = path.join(backendDir, "web", "overlay", a);
                let utilityDir = path.join(backendDir, "web", "utility", a);
                let settingsDir = path.join(backendDir, "web", "settings", a);
                pluginPacks[a] = {
                    "name":activePlugins[a]._name==null?a:activePlugins[a]._name,
                    "version":activePlugins[a]._version==null?"Unknown Version":activePlugins[a]._version,
                    "author":activePlugins[a]._author==null?"Unknown Author":activePlugins[a]._author,
                    "description":activePlugins[a]._description==null?"":activePlugins[a]._description,
                    "settings":thisPlugin,
                    "settings-form":thisPluginForm,
                    "assets":thisPluginAssets,
                    "path":thisPluginPath,
                    "hasOverlay": fs.existsSync(overlayDir),
                    "hasUtility": fs.existsSync(utilityDir),
                    "hasExternalSettingsPage":fs.existsSync(settingsDir)
                };
            }
            
            res.send(JSON.stringify(pluginPacks));
        });

        router.get("/osc_tunnels", async(req, res) => {
            res.send(JSON.stringify(osctunnels));
        });

        router.get("/get_plugin/*", async(req,res) => {
            
            let plugin = {};
            let a = req.params['0'];
            let thisPlugin = fs.readFileSync(backendDir+"/plugins/"+a+"/settings.json", {encoding:'utf8'});
            let thisPluginIcon = backendDir+"/icons/"+a+".png";

            let assetDir = path.join(backendDir, "web", "overlay", a, "assets");
                
            let thisPluginAssets = fs.existsSync(assetDir)==true ?
                                fs.readdirSync(assetDir):null;

            plugin = {
                "settings":JSON.parse(thisPlugin),
                "assets":thisPluginAssets,
                "udpClients":sconfig.network["udp_clients"],
                "icon":thisPluginIcon
            }
            
            res.send(plugin);
        });

        router.post("/mod/authentication", async(req, res) => {
            let modlist = await chat.mods(channel);
            let isLocal = false;
            if(req.headers.referer != null){
                if(req.headers.referer.startsWith("http:")){
                    isLocal = true;
                }
            }

            if(isLocal){
                activeMods[username] = "active";
                res.send({status:"active", localUser:username});
                return;
            }

            let moduser = req.body.moduser;
            let modcode = req.body.code;
            
            if(modlist.includes(moduser) && modData["trusted_users"][moduser]?.includes("m")){
                if(modData["trusted_users_pw"][moduser] == null){
                    let newSalt = crypto.randomBytes(16).toString('hex');
                    let newHash = crypto.pbkdf2Sync(modcode, newSalt, 1000, 64, `sha512`).toString('hex');
                    activeMods[moduser] = "pending";
                    modData["trusted_users_pw"][moduser] = {
                        salt:newSalt,
                        hash:newHash
                    };
                    sayInChat(moduser+" if you're trying to access the Mod UI, please call '!mod verify' to authenticate your device.");
                    res.send({status:"new"});
                }else{
                    if(activeMods[moduser] != "pending"){
                        if(crypto.pbkdf2Sync(modcode, modData["trusted_users_pw"][moduser].salt, 1000, 64, `sha512`).toString(`hex`) === modData["trusted_users_pw"][moduser].hash){
                            webLog("Welcome back, "+moduser+"!");
                            activeMods[moduser] = "active";
                            res.send({status:"active"});
                        }else{
                            res.send({status:"badpassword"});
                        }
                    }else{
                        res.send({status:"stillpending"});
                    }
                }
            }else{
                res.send({status:"untrusted"});
            }
        });

        router.get("/mod/utilities", async(req, res) => {
            if(activeMods[req.query.moduser] == "active" || req.headers.referer.startsWith("http:")){
                let modevents = {};
                for(let e in events){
                    if(events[e].triggers.chat.enabled){
                        modevents[e] = {
                            name:events[e].name,
                            group:events[e].group,
                            description:events[e].description
                        }
                    }
                }
                let modplugins = {};
                for(let p in activePlugins){
                    let hasUtility = fs.existsSync(path.join(backendDir, "web", "utility", p));
                    modplugins[p] = {
                        name:p,
                        modmap:activePlugins[p].modmap,
                        utility:hasUtility
                    }
                }
                let modTheme = null;
                if(themes.modui[req.query.moduser] != null){
                    modTheme = themes.modui[req.query.moduser];
                }
                let oscURL = null;
                let oscPort = null;
                if(req.headers.referer.startsWith("http:")){
                    oscURL = sconfig.network.host;
                    oscPort = sconfig.network.osc_tcp_port;
                    
                }else{
                    oscURL = sconfig.network.external_tcp_url;
                }
    
                res.send(JSON.stringify({
                    status:"ok",
                    oscURL:oscURL,
                    oscPort:oscPort,
                    modmap:{
                        events:modevents,
                        plugins:modplugins,
                        modlocks:modlocks,
                    },
                    theme:modTheme
                }));
            }else{
                res.send(JSON.stringify({
                    status:"notmod",
                }));
            }
        });

        

        app.listen(expressPort);

        webLog("Spooder Web UI is running at", "http://localhost:"+expressPort+" and http://"+suggestedNet+":"+expressPort);

        
        return router;
    }

    async getPlugins(){
        try {
          const dir = await fsPromises.opendir(backendDir+'/plugins');
          activePlugins = {};
          for await (const dirent of dir){
            delete require.cache[require.resolve(backendDir+'/plugins/'+dirent.name)];
            try{
                activePlugins[dirent.name] = new (require(backendDir+'/plugins/'+dirent.name))();
            }catch(e){
                console.log("PLUGIN FAILED TO LOAD", e);
                continue;
            }
            
            if(fs.existsSync(backendDir+"/plugins/"+dirent.name+"/package.json")){
                let pluginMeta = JSON.parse(fs.readFileSync(backendDir+"/plugins/"+dirent.name+"/package.json",{encoding:'utf8'}));
                activePlugins[dirent.name]._name = pluginMeta.name;
                activePlugins[dirent.name]._author = pluginMeta.author;
                activePlugins[dirent.name]._version = pluginMeta.version;
                activePlugins[dirent.name]._description = pluginMeta.description;
            }
            if(fs.existsSync(backendDir+"/plugins/"+dirent.name+"/settings.json")){
                activePlugins[dirent.name].settings = JSON.parse(fs.readFileSync(backendDir+"/plugins/"+dirent.name+"/settings.json",{encoding:'utf8'}));
                if(activePlugins[dirent.name].onSettings != null){
                    activePlugins[dirent.name].onSettings(activePlugins[dirent.name].settings);
                }
            }
          }
          webLog("Plugins Refreshed!");
        } catch (err) {
          console.error(err);
        }
        
    }

    async startNgrok(){
        if(maintainenceMode == true){
            return;
        }
        
        await ngrok.connect({
            authtoken:sconfig.network.ngrokauthtoken,
        });
        let napi = ngrok.getApi();
        
        let tunnels = await napi.listTunnels();
        for(let t in tunnels.tunnels){
            napi.stopTunnel(tunnels.tunnels[t].name);
        }

        let httpURL = await napi.startTunnel({
            name:"webui",
            proto:"http",
            addr:sconfig.network.host_port
        });

        tunnels = await napi.listTunnels();

        for(let t in tunnels.tunnels){
            if(tunnels.tunnels[t].proto == "http"){
                napi.stopTunnel(tunnels.tunnels[t].name);
            }
        }

        let oscURL = await napi.startTunnel({
            name:"modui",
            proto:"http",
            addr:sconfig.network.osc_tcp_port
        });

        tunnels = await napi.listTunnels();

        for(let t in tunnels.tunnels){
            if(tunnels.tunnels[t].proto == "http"){
                napi.stopTunnel(tunnels.tunnels[t].name);
            }
        }
        
        sconfig.network.external_http_url = httpURL.public_url;
        sconfig.network.external_tcp_url = oscURL.public_url;
        
        if(typeof this.onNgrokStart == "function"){
            this.onNgrokStart();
        }
    }

    stopNgrok(){
        ngrok.disconnect();
    }

    onNgrokStart = null;

    
}

module.exports = WebUI;