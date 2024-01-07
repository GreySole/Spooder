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
const cookieParser = require("cookie-parser");
const AdmZip = require('adm-zip');
const fileUpload = require('express-fileupload');
const path = require("path");
const crypto = require("crypto");

var webLog = (...content) => {
    console.log(logEffects("Bright"),logEffects("FgBlue"), ...content, logEffects("Reset"));
}

function isLocal(req){
    const remoteAddressRaw = req.ip.split(":");
    const remoteAddress = remoteAddressRaw[remoteAddressRaw.length-1];
    const isLocal = remoteAddress.startsWith('192.168.') ||
                    remoteAddress.startsWith('10.') ||
                    (remoteAddress == 1 && devMode == true) ||
                    req.headers.host.startsWith("localhost")
    if(isLocal == false){
        logToFile("external_connections", `IP: ${remoteAddress} Path: ${req.path} Cookie: ${req.cookies?.access != null ? "PRESENT" : "NONE"}`, 300);
    }
    return isLocal;
}

class WebUI {

    constructor(props){

    }

    router = null;
    publicRouter = null;

    startServer(devMode){

        var expressPort = null;

        let pluginsDir = path.join(backendDir, "plugins");
        let webDir = path.join(backendDir, "web");
        let overlayDir = path.join(backendDir, "web", "overlay");
        let utilityDir = path.join(backendDir, "web", "utility");
        let assetDir = path.join(backendDir, "web", "assets");
        let iconDir = path.join(backendDir, "web", "icons");
        
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

        if(!fs.existsSync(assetDir)){
            fs.mkdirSync(assetDir);
        }

        if(!fs.existsSync(iconDir)){
            fs.mkdirSync(iconDir);
        }

        var app = new express();
        var router = express.Router();
        var publicRouter = express.Router();
        this.router = router;
        this.publicRouter = publicRouter;

        expressPort = sconfig.network.host_port;
        if(initMode == true){
            router.use("/", express.static(frontendDir+'/init/build'));
            router.use(bodyParser.urlencoded({extended:true}));
            router.use(bodyParser.json({limit:"100mb"}));
            router.use("/restore_settings", fileUpload());
            router.use("/restore_plugins", fileUpload());
        }else{
            router.use("/", express.static(frontendDir+'/main/build'));
            router.use("/mod", express.static(frontendDir+'/mod/build'));
            router.use("/public", express.static(frontendDir+'/public/build'));

            router.use("/overlay", express.static(backendDir+'/web/overlay'));
            router.use("/utility", express.static(backendDir+'/web/utility'));
            router.use("/settings", express.static(backendDir+'/web/settings'));
            router.use("/assets", express.static(backendDir+'/web/assets'));
            router.use("/icons", express.static(backendDir+'/web/icons'));

            router.use(bodyParser.urlencoded({extended:true}));
            router.use(bodyParser.json({limit:"100mb"}));
            router.use("/install_plugin",fileUpload());
            router.use("/upload_plugin_asset/*",fileUpload());
            router.use("/upload_plugin_icon/*",fileUpload());
            router.use("/checkin_settings", fileUpload());
            router.use("/checkin_plugins", fileUpload());
            router.use(express.json({verify: this.verifyTwitchSignature}));
            router.use(cookieParser());
            
            publicRouter.use("/", express.static(frontendDir+'/public/build'));
            publicRouter.use("/login", express.static(frontendDir+'/login/build'));
            publicRouter.use("/mod", express.static(frontendDir+'/mod/build'));

            publicRouter.use("/overlay", express.static(backendDir+'/web/overlay'));
            publicRouter.use("/utility", express.static(backendDir+'/web/utility'));
            publicRouter.use("/settings", express.static(backendDir+'/web/settings'));
            publicRouter.use("/assets", express.static(backendDir+'/web/assets'));
            publicRouter.use("/icons", express.static(backendDir+'/web/icons'));

            publicRouter.use(bodyParser.urlencoded({extended:true}));
            publicRouter.use(bodyParser.json());
            publicRouter.use(cookieParser());
            publicRouter.use(express.json({verify: this.verifyTwitchSignature}));
        }
        

        app.use('/', (req, res, next) => {
            if (isLocal(req)) {
                router(req, res, next);
              } else {
                //console.log("PUBLIC CLIENT");
                publicRouter(req, res, next);
              }
          });

        app.use((req, res, next) => {
            
            res.status(404).send("<h1>Page not found on the server</h1>");
        });

        async function pluginGet(req, res){

            let isExternal = isLocal(req);
            var pluginName = req.query.plugin;
            var pluginSettings = null;

            try{
                var thisPlugin = fs.readFileSync(backendDir+"/plugins/"+pluginName+"/settings.json", {encoding:'utf8'});
                pluginSettings = JSON.parse(thisPlugin);
            }catch(e){
                webLog(pluginName+" has no settings");
            }
            
            let oscInfo = null;

            if(isExternal == false){
                oscInfo = {
                    host: sconfig.network.external_tcp_url,
                    name:pluginName,
                    port: null,
                    settings: pluginSettings
                };
            }else{
                oscInfo = {
                    host: sconfig.network.host,
                    name:pluginName,
                    port: sconfig.network.osc_tcp_port,
                    settings: pluginSettings
                };
            }

            res.send({express: JSON.stringify(oscInfo)});
        }

        router.get("/plugin/get", pluginGet);
        publicRouter.get("/plugin/get", pluginGet);

        publicRouter.get("/plugin/public", (req, res) => {
            let publicPlugins = [];
            for(let p in activePlugins){
                if(activePlugins[p].hasPublic){
                    publicPlugins.push(p);
                }
            }
            res.send({data:publicPlugins});
        });

        router.get("/plugin/public", (req, res) => {
            let publicPlugins = [];
            for(let p in activePlugins){
                if(activePlugins[p].hasPublic){
                    publicPlugins.push(p);
                }
            }
            res.send({data:publicPlugins});
        });

        router.get('/command_table', async (req, res) => {
            
            let props = {
                "events":events,
                "groups":eventGroups,
                "plugins":Object.keys(activePlugins)
            };
            res.send({express: JSON.stringify(props)});
        });
        router.get("/public/data", (req, res) => {
            let publicPlugins = {};
            for(let p in activePlugins){
                if(activePlugins[p].hasPublic){
                    publicPlugins[p] = activePlugins[p].name;
                }
            }
            res.send({
                botName:twitch.botUsername,
                homeChannel:twitch.homeChannel,
                theme:themes.public,
                plugins:publicPlugins
            });
        });
        publicRouter.get("/public/data", (req, res) => {
            let publicPlugins = {};
            for(let p in activePlugins){
                if(activePlugins[p].hasPublic){
                    publicPlugins[p] = activePlugins[p].name;
                }
            }
            res.send({
                botName:twitch.botUsername,
                homeChannel:twitch.homeChannel,
                theme:themes.public,
                plugins:publicPlugins
            });
        });

        router.get('/server_config', (req, res) => {
            let backupSettingsDir = path.join(backendDir, "backup", "settings");
            let backupPluginsDir = path.join(backendDir, "backup", "plugins");
            let backups = {
                settings:fs.existsSync(backupSettingsDir)?fs.readdirSync(backupSettingsDir):{},
                plugins:fs.existsSync(backupPluginsDir)?fs.readdirSync(backupPluginsDir):{}
            }
            res.send({config:sconfig, backups:backups});
        });

        router.get('/udp_hosts', (req, res) => {
            res.send({express:JSON.stringify(udpClients)});
        });

        router.get('/server_state', async (req, res) => {

            let activeShares = await twitch.getChannels();
            res.send({
                "host":sconfig.network.host,
                "port":sconfig.network.osc_tcp_port,
                "udp_clients":sconfig.network["udp_clients"],
                "plugins":Object.keys(activePlugins),
                "themes":themes,
                "activeShares":activeShares,
                "shares":Object.keys(shares)
            });
        });

        router.post("/saveCommandList", async (req, res) => {
            
            fs.writeFile(backendDir+"/settings/commands.json", JSON.stringify(req.body), "utf-8", (err, data)=>{
                events = req.body.events;
                
                eventGroups = req.body.groups;
                res.send({status:"SAVE SUCCESS"});
                for(let p in activePlatforms){
                    if(activePlatforms[p].onEventFileSaved){
                        activePlatforms[p].onEventFileSaved();
                    }
                }
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

            if(sconfig.network.externalhandle != req.body.network.externalhandle){
                sconfig.network.externalhandle = req.body.network.externalhandle;
                sconfig.network.external_http_url = req.body.network.external_http_url;
                sconfig.network.ngrokauthtoken = sconfig.network.ngrokauthtoken;
                twitch.refreshEventSubs();
                statusMsg += " (Refreshing EventSubs)";
            }
            
            fs.writeFile(backendDir+"/settings/config.json", JSON.stringify(req.body), "utf-8", (err, data)=>{
                
                sconfig = req.body;
                res.send({status:"CONFIG SAVED "+statusMsg});
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
        });

        router.get("/osc_tunnels", async(req, res) => {
            res.send(JSON.stringify(osctunnels));
        });

        router.post("/saveOSCTunnels", async(req, res) => {
            fs.writeFile(backendDir+"/settings/osc-tunnels.json", JSON.stringify(req.body), "utf-8", (err, data)=>{
                osctunnels = req.body;
                sosc.updateOSCListeners();
                res.send({status:"SAVE SUCCESS"});
                webLog("SAVED THE TUNNELS");
            });
        });

        router.post("/verifyResponseScript", async(req, res) => {
            let check = checkResponseTrigger(req.body.event, req.body.message);
            if(check != null){
                let response = await verifyResponseScript(req.body.eventName, check.message, check.extra, req.body.script);
                res.send(response);
            }else{
                res.send({
                    status:"error",
                    response:"The input text did not trigger the response."
                });
            }
        })

        router.get("/shares", async (req,res) => {
            let chatCommands = {};
            let activeShares = await twitch.getChannels();
            
            for(let e in events){
                if(events[e].triggers.chat.enabled){
                    chatCommands[e] = events[e].triggers.chat.command;
                }
            }
            let plugins = {};
            for(let p in activePlugins){
                plugins[p] = activePlugins[p].name;
            }
            
            res.send({
                shareData:shares,
                activeShares:activeShares,
                commandData:chatCommands,
                activePlugins:plugins
            });
        });

        router.get("/verifyShareTarget", async (req, res)=>{
            let shareUser = req.query.shareuser;
            let userInfo = await twitch.getUserInfo(shareUser);

            if(userInfo != null){
                res.send({
                    status:"ok",
                    info:userInfo
                });
            }else{
                res.send({
                    status:"notfound"
                });
            }
        })

        router.post("/saveShares", async(req, res)=>{
            let newShares = req.body;
            fs.writeFile(backendDir+"/settings/shares.json", JSON.stringify(newShares), "utf-8", (err, data)=>{
                let statusMsg = "ok"
                shares = newShares;
                res.send({status:statusMsg});
                webLog("SAVED THE SHARES");
            });
        });

        router.post("/setShare", (req,res) => {
            let shareUser = req.body.shareuser;
            let isEnabled = req.body.enabled;
            let message = req.body.message;
            
            this.setShare(shareUser, isEnabled, message);
            
            res.send({status:"ok"});
        });

        router.post('/create_plugin', async(req, res)=>{
            
            let pluginName = req.body.pluginName;
            let options = {
                createInfo:{
                    name:pluginName,
                    author:req.body.author,
                    description:req.body.description
                },
                overlay:true,
                utility:true
            };
            let pluginDirName = req.body.internalName;
            
            let pluginPath = path.join(backendDir, "tmp", pluginDirName);

            if(!fs.existsSync(pluginPath)){
                fs.mkdirSync(pluginPath, {recursive:true});
            }else{
                fs.rmSync(pluginPath, {recursive:true});
            }
            
            const childProcess = require("child_process");
            childProcess.exec("git clone https://github.com/GreySole/Spooder-Sample-Plugin "+pluginPath,{
                cwd: './'
              }, async (error, out, err)=>{
                if(error){
                    console.log(err);
                    res.send({
                        status:"error",
                        error:err
                    });
                }else{
                    res.send({
                        status:"OK",
                        pluginName:pluginName
                    });
                    
                    await this.installPluginFromTemp(pluginDirName, options);
                }
            })
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
                    let pluginDirName = req.body.internalName;
                    

                    let tempDir = path.join(backendDir, "tmp", pluginDirName);
                    if(fs.existsSync(tempDir)){
                        await fs.rm(tempDir, {recursive:true});
                    }
                    
                    fs.mkdirSync(tempDir, {recursive:true});
                    
                    let tempFile = path.join(backendDir,"tmp", pluginDirName, pluginZip.name);
                    //Cleanup before install
                    if(fs.existsSync(tempFile)){
                        await fs.rm(tempFile);
                    }
                    
                    sendToTCP("/frontend/plugin/install/progress",{
                        pluginName:pluginDirName,
                        status:"progress",
                        message:"Extracting..."
                    });
                    //Start installing
                    await pluginZip.mv(tempFile);
                    webLog("EXTRACT ZIP");
                    res.send({
                        status:true,
                        message: "File Upload Success",
                        plugin:pluginDirName
                    });
                    let zip = new AdmZip(tempFile);
                    zip.extractAllTo(tempDir);
                    fs.rm(tempFile);
                    await this.installPluginFromTemp(pluginDirName);
                   
                    
                }
            }catch(e){
                console.error(e);
            }
        });

        router.get("/reinstall_plugin", async (req, res) => {
            let pluginName = req.query.pluginname;
            await this.installPluginDependencies(pluginName, path.join(backendDir, "plugins", pluginName));
            this.getPlugins();
            res.send({status:"ok"});
        })

        router.get("/export_plugin/*", async(req, res) => {
            
            let pluginName = req.params['0'];
            
            let tempDir = path.join(backendDir, "tmp", pluginName);
            let pluginDir = path.join(backendDir,"plugins", pluginName);
            let overlayDir = path.join(backendDir, "web", "overlay", pluginName);
            let utilityDir = path.join(backendDir, "web", "utility", pluginName);
            let settingsDir = path.join(backendDir, "web", "settings", pluginName);
            let iconFile = path.join(backendDir, "web", "icons", pluginName+".png");

            let zip = new AdmZip();

            if(fs.existsSync(pluginDir)){
                zip.addLocalFolder(pluginDir, "/command", (filename)=>{return !filename.includes("node_modules")&&!filename.includes("settings.json")});
            }

            if(fs.existsSync(overlayDir)){
                zip.addLocalFolder(overlayDir, "/overlay");
            }

            if(fs.existsSync(utilityDir)){
                zip.addLocalFolder(utilityDir, "/utility");
            }

            if(fs.existsSync(settingsDir)){
                zip.addLocalFolder(settingsDir, "/settings");
            }

            if(fs.existsSync(iconFile)){
                zip.addLocalFile(iconFile, null, "icon.png");
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

            zip.addLocalFolder(backendDir+"/plugins", "/plugins", (filename)=>{return !filename.includes("node_modules")});
            
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
                backupName = sconfig.bot.bot_name+"-"+date.getFullYear()+"-"+date.getMonth()+"-"+date.getDate()+"-"+date.getHours()+"-"+date.getMinutes()+"-"+date.getSeconds();
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
            let selections = req.body.selections ?? {everything:true};
            
            if(!fs.existsSync(backendDir+"/tmp")){
                fs.mkdirSync(backendDir+"/tmp");
            }

            if(req.files){
                console.log("FILE FOUND", req.files);
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
            if(selections["everything"] == true){
                fs.copySync(path.join(fileDir), path.join(backendDir, "settings"), {overwrite:true});
            }else{
                for(let s in selections){
                    if(s=="everything"){continue;}
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
            }
            

            if(fs.existsSync(fileDir)){
                await fs.rm(fileDir, {recursive:true});
            }

            if(fs.existsSync(path.join(backendDir, "tmp", fileName))){
                await fs.rm(path.join(backendDir, "tmp", fileName));
            }

            //let newPluginBackups = fs.readdirSync(path.join(backendDir, "backup", "settings"));
            webLog("COMPLETE");
            res.send({status:"SUCCESS"});
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

            webLog("Checking for dependencies...");
            for(let p in pluginList){
                if(fs.existsSync(path.join(backendDir, "plugins", pluginList[p], "node_modules"))){
                    webLog("Clearing node_modules for "+pluginList[p]);
                    fs.rmSync(path.join(backendDir, "plugins", pluginList[p], "node_modules"), {recursive:true});
                }
                if(fs.existsSync(path.join(backendDir, "plugins", pluginList[p],"package.json"))){
                    let packagejson = JSON.parse(fs.readFileSync(path.join(backendDir, "plugins", pluginList[p],"package.json"),{encoding:"utf-8"}));
                    let hasDependencies = packagejson.dependencies != null;
                    if(hasDependencies){
                        await this.installPluginDependencies(pluginList[p], path.join(backendDir, "plugins", pluginList[p]));
                    }else{
                        webLog("No dependencies for "+pluginList[p]);
                    }
                }
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
            //let newPluginBackups = fs.readdirSync(path.join(backendDir, "backup", "plugins"));
            webLog("COMPLETE");
            res.send({status:"SUCCESS"});
        });

        router.get("/refresh_plugins", async (req, res) => {
            await this.getPlugins();
            res.send({"status":"Refresh Success!"});
        });

        router.get("/refresh_plugin", async(req, res) => {
            await this.refreshPlugin(req.query.pluginname);
            res.send({"status":"success"});
        })

        router.post('/delete_plugin_asset', async(req, res) =>{

            let pluginName = req.body.pluginName;
            let assetPath = req.body.assetName;
            let fileStatus = "SUCCESS";

            let assetDir = path.join(backendDir,"web", "assets", pluginName, assetPath, "..");
            let assetFile = path.join(backendDir,"web", "assets", pluginName, assetPath);
            fs.rmSync(assetFile, {recursive:true});
            let thisPluginAssets = fs.existsSync(assetDir)==true?fs.readdirSync(assetDir):null;

            res.send({
                status:fileStatus,
                newAssets:thisPluginAssets
            });
        });

        router.post('/get_plugin_assets', async(req, res) => {
            let pluginName = req.body.pluginname;
            let mainDir = path.join(backendDir, "web", "assets", pluginName);
            var results = {};
            let walk = function(dir, done) {
                
                fs.readdir(dir, function(err, list) {
                  if (err) return done(err);
                  var pending = list.length;
                  let foldername = dir.substring(mainDir.length+1);
                    if(foldername == ""){foldername="root";}
                  if (!pending) return done(null, results);
                  list.forEach(function(file) {
                    //file = path.resolve(dir, file); <-- Makes double backslash paths on Windows >.<
                    file = dir+"/"+file;
                    fs.stat(file, function(err, stat) {
                        let filename = file.substring(mainDir.length+1);
                      if (stat && stat.isDirectory()) {
                        
                        walk(file, function(err, res) {
                            
                            //results[filename] = res;
                          //results = results.concat(res);
                          if (!--pending) done(null, results);
                        });
                      } else {
                        
                        //console.log(filename);
                        if(results[foldername] == null){results[foldername] = []}
                        results[foldername].push(filename);
                        if (!--pending) done(null, results);
                      }
                    });
                  });
                });
              };
            walk(path.join(backendDir, "web", "assets", pluginName), (err, results)=>{
                
                res.send({status:"OK", dirs:results});
            })
        })

        router.post('/browse_plugin_assets', async(req, res) => {
            let currentPath = req.body.folder;
            let pluginName = req.body.pluginname;

            if(!fs.existsSync(path.join(backendDir, "web", "assets", pluginName))){
                fs.mkdirSync(path.join(backendDir, "web", "assets", pluginName));
            }
            
            if(!fs.existsSync(path.join(backendDir, "web", "assets", pluginName, currentPath))){
                res.send({status:"EMPTY", dirs:[]});
                return;
            }
            
            let dirs = fs.existsSync(path.join(backendDir, "web", "assets", pluginName, currentPath))==true ? 
            fs.readdirSync(path.join(backendDir, "web", "assets",pluginName, currentPath)):null;
            
            res.send({status:"ok", dirs:dirs});
        })

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
                    let assetPath = req.params['0'];

                    let assetDir = path.join(backendDir,"web", "assets", assetPath);
                    let assetFile = path.join(assetDir, pluginAsset.name);
                    
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

        router.post('/upload_plugin_icon/*', async(req, res) => {
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

                    let iconDir = path.join(backendDir,"web", "icons");
                    let iconFile = path.join(iconDir, pluginName+".png");
                    
                    if(!fs.existsSync(iconDir)){
                        fs.mkdirSync(iconDir);
                    }
                    await pluginAsset.mv(iconFile);
                    
                    chmodr(iconFile,0o777, (err) => {
                        if(err) throw err;
                        
                    });
                    webLog("COMPLETE!");
                    
                    //this.getPlugins();

                    res.send({
                        status:true,
                        message: "File Upload Success"
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
            let assetsDir = path.join(backendDir,"web", "assets", pluginName);
            let iconFile = path.join(backendDir,"web", "icons", pluginName+".png");
            if(fs.existsSync(pluginDir)){
                await fs.rm(pluginDir, {recursive:true});
            }
            if(fs.existsSync(overlayDir)){
                await fs.rm(overlayDir, {recursive:true});
            }
            if(fs.existsSync(utilityDir)){
                await fs.rm(utilityDir, {recursive:true});
            }
            if(fs.existsSync(settingsDir)){
                await fs.rm(settingsDir, {recursive:true});
            }
            if(fs.existsSync(assetsDir)){
                await fs.rm(assetsDir, {recursive:true});
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
            fs.writeFileSync(settingsFile, JSON.stringify(newSettings.settings), "utf-8");
            res.send({saveStatus:"SAVE SUCCESS"});
                fs.chmod(settingsFile, 0o777);
                webLog(""+newSettings.pluginName+" Settings Saved!");

            this.getPlugins();
        });

        router.get('/plugins', async (req, res) => {
            
            let pluginPacks = {};
            for(let a in activePlugins){
                
                let settingsFile = path.join(backendDir, "plugins", a, "settings.json");
                let thisPlugin = fs.existsSync(settingsFile)==true ?
                                JSON.parse(fs.readFileSync(settingsFile, {encoding:'utf8'})):null;

                let settingsForm = path.join(backendDir, "plugins", a, "settings-form.json");
                let thisPluginForm = fs.existsSync(settingsForm)==true ?
                                JSON.parse(fs.readFileSync(settingsForm, {encoding:'utf8'})):null;

                let overlayDir = path.join(backendDir, "web", "overlay", a);
                let utilityDir = path.join(backendDir, "web", "utility", a);
                let settingsDir = path.join(backendDir, "web", "settings", a);
                pluginPacks[a] = {
                    "name":activePlugins[a].name==null?a:activePlugins[a].name,
                    "version":activePlugins[a].version==null?"Unknown Version":activePlugins[a].version,
                    "author":activePlugins[a].author==null?"Unknown Author":activePlugins[a].author,
                    "description":activePlugins[a].description==null?"":activePlugins[a].description,
                    "dependencies":activePlugins[a].dependencies==null?{}:activePlugins[a].dependencies,
                    "settings":thisPlugin,
                    "settings-form":thisPluginForm,
                    "assetBrowserPath":"/",
                    "assetPath":path.join("assets", a),
                    "hasOverlay": fs.existsSync(overlayDir),
                    "hasUtility": fs.existsSync(utilityDir),
                    "hasExternalSettingsPage":fs.existsSync(settingsDir)
                };
                if(activePlugins[a].status != null && activePlugins[a].status != "ok"){
                    pluginPacks[a].status = activePlugins[a].status;
                }
            }
            
            res.send(JSON.stringify(pluginPacks));
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

        router.get("/users", (req, res) => {
            let returnUsers = Object.assign({}, users.trusted_users);
            returnUsers._hasPassword = {};
            for(let u in users.trusted_users.permissions){
                returnUsers._hasPassword[u] = users.trusted_users_pw[u] != null;
            }
            res.send(returnUsers);
        });

        router.get("/users/resetPassword", (req, res) => {
            let username = req.query.username;
            delete users.trusted_users_pw[username];
            fs.writeFileSync(backendDir+"/settings/users.json", JSON.stringify(users));
            res.send({status:"SUCCESS"});
        })

        router.post("/saveUsers", (req, res) => {
            let newList = req.body.users;
            let nameChanges = req.body.nameChanges;
            for(let n in nameChanges){
                if(nameChanges[n] == n){continue;}
                console.log(n,nameChanges[n]);
                newList.permissions[nameChanges[n]] = newList.permissions[n];
                newList.discord[nameChanges[n]] = newList.discord[n];
                newList.twitch[nameChanges[n]] = newList.twitch[n];
                delete newList.permissions[n];
                delete newList.discord[n];
                delete newList.twitch[n];
                
                if(users.trusted_users_pw[n] != null){
                    users.trusted_users_pw[nameChanges[n]] = Object.assign({},users.trusted_users_pw[n]);
                    delete users.trusted_users_pw[n];
                }
            }
            Object.assign(users.trusted_users, newList);
            fs.writeFileSync(backendDir+"/settings/users.json", JSON.stringify(users));
            res.send({status:"SUCCESS"});
        })

        async function userVerify(req, res){
            let vType = req.body.vtype;
            let username = req.body.username;

            if(vType == "twitch"){
                if(users["trusted_users"].twitch.includes(username)){
                    res.send({status:"found"});
                    activeUsers.pending[username.toLowerCase()] = {
                        vtype:vType,
                        verified:false
                    };
                    sayInChat(username+" it looks like you're trying to set a login for me. If this is you, please call '!verify'", "twitch");
                }else{
                    res.send({status:"notfound"});
                }
            }else if(vType == "discord"){
                if(users["trusted_users"].discord[username] != null){
                    res.send({status:"found"});
                    activeUsers.pending[username.toLowerCase()] = {
                        vtype:vType,
                        verified:false
                    };
                    
                    let response = await discord.sendDM(users["trusted_users"].discord[username], {
                        content:"Hi, it looks like you're creating a login for me. If this is you, click confirm.",
                        components:[discord.makeConfirmCancelButtons("Yes :D", "No D:")]
                    });

                    const collectorFilter = i => i.user.id === users["trusted_users"].discord[username];

                    try {
                        const confirmation = await response.awaitMessageComponent({ filter: collectorFilter, time: 60000 });
                        if (confirmation.customId === 'confirm') {
                            activeUsers.pending[username].verified = true;
                            await confirmation.update({ content: 'Verified!', components: [] });
                        } else if (confirmation.customId === 'cancel') {
                            delete activeUsers.pending[username];
                            await confirmation.update({ content: 'Declined!', components: [] });
                        }
                    } catch (e) {
                        delete activeUsers.pending[username];
                    }
                }else{
                    res.send({status:"notfound"});
                }
            }
        }
        router.post("/user/verify", userVerify);
        publicRouter.post("/user/verify", userVerify);

        function verifyCheck(req, res) {
            console.log(req.query);
            if(activeUsers.pending[req.query.username] == null){
                console.log("NULL PENDING");
                res.send("verify-cancelled");
                return;
            }
            if(activeUsers.pending[req.query.username].verified == true){
                res.send("verify-complete");
            }else{
                res.send("verify-waiting");
            }
        }
        router.get("/user/verifycheck", verifyCheck)
        publicRouter.get("/user/verifycheck", verifyCheck)

        async function userLogin(req,res){

            let username = req.body.username.toLowerCase();
            let password = req.body.password;
            if(username == "local"){
                res.send({status:"nolocal"});
                return;
            }
            if(users["trusted_users_pw"][username] == null){
                let vusername = req.body.vusername;
                if(vusername == null){
                    res.send({status:"nologin"});
                    return;
                }
                if(activeUsers.pending[vusername].verified == true){
                    delete activeUsers.pending[vusername];
                    let newSalt = crypto.randomBytes(16).toString('hex');
                    let newHash = crypto.pbkdf2Sync(password, newSalt, 1000, 64, `sha512`).toString('hex');
                    
                    users["trusted_users_pw"][username] = {
                        salt:newSalt,
                        hash:newHash
                    };
                    let browserToken = crypto.randomBytes(48).toString('hex');
                    activeUsers[browserToken] = username;
                    fs.writeFileSync(backendDir+"/settings/users.json", JSON.stringify(users));
                    res.cookie('access', browserToken, {
                        maxAge: 86400*1000,
                        httpOnly:true,
                        secure:true
                    });
                    res.send({status:"active"});
                }
                
            }else{
                if(crypto.pbkdf2Sync(password, users["trusted_users_pw"][username].salt, 1000, 64, `sha512`).toString(`hex`) === users["trusted_users_pw"][username].hash){
                    webLog("Welcome back, "+username+"!");
                    let browserToken = crypto.randomBytes(48).toString('hex');
                    activeUsers[browserToken] = username;
                    res.cookie('access', browserToken, {
                        maxAge: 86400*1000,
                        httpOnly:true,
                        secure:true
                    });
                    res.send({status:"active"});
                }else{
                    res.send({status:"badpassword"});
                }
            }
        }

        router.post("/user/authentication", (req, res) => {
            
            let browserToken = crypto.randomBytes(48).toString('hex');
            activeUsers[browserToken] = "local";
            res.cookie('access', browserToken, {
                maxAge: 86400*1000,
                httpOnly:true,
                secure:true
            });
            res.send({status:"active"});
        });
        publicRouter.post("/user/authentication", userLogin);

        async function modUtil(req, res){
            let isLocalHost = isLocal(req);
            let accessCookie = req.cookies["access"];
            //console.log("ACCESS COOKIE", req.cookies);
            let moduser = null;
            if(!isLocalHost){
                if(activeUsers[accessCookie] == null){
                    res.send({status:"notactive"});
                    return;
                }else{
                    if(!users.trusted_users.permissions[activeUsers[accessCookie]].includes("m") &&
                    !users.trusted_users.permissions[activeUsers[accessCookie]].includes("a") ){
                        res.send({status:"nopermission"});
                        return;
                    }
                    moduser = activeUsers[accessCookie];
                }
                
            }else{
                if(activeUsers[accessCookie] == null){
                    
                    moduser = "local";
                    let browserToken = crypto.randomBytes(48).toString('hex');
                    activeUsers[browserToken] = moduser;
                    res.cookie('access', browserToken, {
                        maxAge: 86400*1000,
                        httpOnly:true,
                        secure:false
                    });
                    
                }else{
                    moduser = activeUsers[accessCookie];
                }
            }
            
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
            if(isLocalHost){
                oscURL = sconfig.network.host;
                oscPort = sconfig.network.osc_tcp_port;
                
            }else{
                oscURL = sconfig.network.external_tcp_url;
            }

            res.send(JSON.stringify({
                status:"ok",
                oscURL:oscURL,
                oscPort:oscPort,
                moduser:moduser,
                token:req.cookies["access"],
                modmap:{
                    events:modevents,
                    plugins:modplugins,
                    modlocks:modlocks,
                },
                theme:modTheme
            }));
        }

        router.get("/mod/utilities", modUtil);
        publicRouter.get("/mod/utilities", modUtil);

        publicRouter.post("/webhooks/caption", (req, res)=>{
            console.log("I HEAR VOICE", req.body);
            res.status(200).end();
        })

        

        app.listen(expressPort);

        webLog("Spooder Web UI is running at", "http://localhost:"+expressPort+" and http://"+suggestedNet+":"+expressPort);

        
        return router;
    }

    async refreshPlugin(pluginName){
        try{
            if(activePlugins[pluginName].onClose != null){
                await activePlugins[pluginName].onClose();
            }

            delete require.cache[require.resolve(backendDir+'/plugins/'+pluginName)];
            try{
                activePlugins[pluginName] = new (require(backendDir+'/plugins/'+pluginName))();
                if(fs.existsSync(backendDir+"/plugins/"+pluginName+"/package.json")){
                    let pluginMeta = JSON.parse(fs.readFileSync(backendDir+"/plugins/"+pluginName+"/package.json",{encoding:'utf8'}));
                    activePlugins[pluginName].name = pluginMeta.name;
                    activePlugins[pluginName].author = pluginMeta.author;
                    activePlugins[pluginName].version = pluginMeta.version;
                    activePlugins[pluginName].description = pluginMeta.description;
                    activePlugins[pluginName].dependencies = pluginMeta.dependencies;
                    let overlayDir = path.join(backendDir, "web", "overlay", pluginName);
                    let utilityDir = path.join(backendDir, "web", "utility", pluginName);
                    activePlugins[pluginName].hasOverlay = fs.existsSync(overlayDir);
                    activePlugins[pluginName].hasUtility = fs.existsSync(utilityDir);
                    //console.log(activePlugins[dirent.name].name, activePlugins[dirent.name].author, activePlugins[dirent.name].version, activePlugins[dirent.name].description, activePlugins[dirent.name].dependencies)
                    activePlugins[pluginName].status = "ok";
                }
                if(fs.existsSync(backendDir+"/plugins/"+pluginName+"/settings.json")){
                    activePlugins[pluginName].settings = JSON.parse(fs.readFileSync(backendDir+"/plugins/"+pluginName+"/settings.json",{encoding:'utf8'}));
                    
                    if(activePlugins[pluginName].onSettings != null){
                        activePlugins[pluginName].onSettings(activePlugins[pluginName].settings);
                    }
                }
            }catch(e){
                let pluginMeta = JSON.parse(fs.readFileSync(backendDir+"/plugins/"+pluginName+"/package.json",{encoding:'utf8'}));
                activePlugins[pluginName] = {};
                activePlugins[pluginName].name = pluginName;
                activePlugins[pluginName].status = "failed";
                activePlugins[pluginName].description = e.code+" - "+e.message;
                activePlugins[pluginName].dependencies = pluginMeta.dependencies;
                console.log("Refresh Failed", e);
            }
        }catch(e){
            console.error(e);
        }
    }

    async getPlugins(){
        try {
          const dir = await fsPromises.opendir(backendDir+'/plugins');
          for(let p in activePlugins){
            if(activePlugins[p].onStop != null){
                await activePlugins[p].onStop();
            }
          }
          activePlugins = {};
          for await (const dirent of dir){
            delete require.cache[require.resolve(backendDir+'/plugins/'+dirent.name)];
            try{
                activePlugins[dirent.name] = new (require(backendDir+'/plugins/'+dirent.name))();
            }catch(e){
                let pluginMeta = JSON.parse(fs.readFileSync(backendDir+"/plugins/"+dirent.name+"/package.json",{encoding:'utf8'}));
                activePlugins[dirent.name] = {};
                activePlugins[dirent.name].name = dirent.name;
                activePlugins[dirent.name].status = "failed";
                activePlugins[dirent.name].description = e.code+" - "+e.message;
                activePlugins[dirent.name].dependencies = pluginMeta.dependencies;
                console.log("PLUGIN FAILED TO LOAD", e);
                continue;
            }
            
            if(fs.existsSync(backendDir+"/plugins/"+dirent.name+"/package.json")){
                let pluginMeta = JSON.parse(fs.readFileSync(backendDir+"/plugins/"+dirent.name+"/package.json",{encoding:'utf8'}));
                activePlugins[dirent.name].name = pluginMeta.name;
                activePlugins[dirent.name].author = pluginMeta.author;
                activePlugins[dirent.name].version = pluginMeta.version;
                activePlugins[dirent.name].description = pluginMeta.description;
                activePlugins[dirent.name].dependencies = pluginMeta.dependencies;
                let overlayDir = path.join(backendDir, "web", "overlay", dirent.name);
                let utilityDir = path.join(backendDir, "web", "utility", dirent.name);
                let publicDir = path.join(backendDir, "web", "public", dirent.name);
                activePlugins[dirent.name].hasOverlay = fs.existsSync(overlayDir);
                activePlugins[dirent.name].hasUtility = fs.existsSync(utilityDir);
                activePlugins[dirent.name].hasPublic = fs.existsSync(publicDir);
                
                if(activePlugins[dirent.name].hasPublic == true){
                    this.publicRouter.use("/plugin/"+dirent.name, express.static(publicDir));
                }
                if(activePlugins[dirent.name].onPublic != null){
                    console.log("ON PUBLIC", dirent.name);
                    activePlugins[dirent.name].onPublic(this.publicRouter);
                }
                //console.log(activePlugins[dirent.name].name, activePlugins[dirent.name].author, activePlugins[dirent.name].version, activePlugins[dirent.name].description, activePlugins[dirent.name].dependencies)
                activePlugins[dirent.name].status = "ok";
            }
            if(fs.existsSync(backendDir+"/plugins/"+dirent.name+"/settings.json")){
                activePlugins[dirent.name].settings = JSON.parse(fs.readFileSync(backendDir+"/plugins/"+dirent.name+"/settings.json",{encoding:'utf8'}));
                
                if(activePlugins[dirent.name].onSettings != null){
                    activePlugins[dirent.name].onSettings(activePlugins[dirent.name].settings);
                }
            }
        }
          webLog("Plugins Refreshed!");
          if(this.onPluginsLoaded != null){
            this.onPluginsLoaded();
          }
        } catch (err) {
          console.error(err);
        }
        
    }

    async installPluginFromTemp(pluginDirName, options){
        if(options == null){options = {
            createInfo:null,
            overlay:true,
            utility:true
        }}
        sendToTCP("/frontend/plugin/install/progress", {
            pluginName:pluginDirName,
            status:"progress",
            message:"Copying folders..."
        });
        let tempDir = path.join(backendDir, "tmp", pluginDirName);
        let pluginDir = path.join(backendDir,"plugins", pluginDirName);
        let overlayDir = path.join(backendDir,"web", "overlay", pluginDirName);
        let utilityDir = path.join(backendDir, "web", "utility", pluginDirName);
        let settingsDir = path.join(backendDir, "web", "settings", pluginDirName);
        let assetsDir = path.join(backendDir, "web", "assets", pluginDirName);
        let iconDir = path.join(backendDir, "web", "icons", pluginDirName+".png");

        if(!fs.existsSync(tempDir+"/command")){
            return{
                status: false,
                message: 'No command folder'
            };
        }else{

            if(options.createInfo != null){
                if(fs.existsSync(tempDir+"/command/package.json")){
                    try{
                        let thisPackage = JSON.parse(fs.readFileSync(tempDir+"/command/package.json", {encoding:"utf-8"}));
                        thisPackage.name = options.createInfo.name;
                        thisPackage.author = options.createInfo.author;
                        thisPackage.description = options.createInfo.description;
                        fs.writeFileSync(tempDir+"/command/package.json", JSON.stringify(thisPackage));
                    }catch(e){
                        webLog("Something went wrong with applying create info to the plugin's package.json", e);
                    }
                }
            }

            if(fs.existsSync(path.join(tempDir+"/command", "node_modules"))){
                fs.rmSync(path.join(tempDir+"/command", "node_modules"), {recursive:true});
            }

            if(fs.existsSync(pluginDir)){
                mergeDirectories(tempDir+"/command", pluginDir);
            }else{
                await fs.move(tempDir+"/command", pluginDir, {overwrite:true});
            }
            

            chmodr(pluginDir,0o777, (err) => {
                if(err) throw err;
                
            });
        }
        
        if(fs.existsSync(tempDir+"/overlay") && options.overlay == true){
            await fs.move(tempDir+"/overlay", overlayDir, {overwrite:true});

            chmodr(overlayDir,0o777, (err) => {
                if(err) throw err;
                
            });
        }

        if(fs.existsSync(tempDir+"/utility") && options.utility == true){
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

        if(fs.existsSync(tempDir+"/assets")){
            if(fs.existsSync(assetsDir)){
                mergeDirectories(tempDir+"/assets", assetsDir);
            }else{
                await fs.move(tempDir+"/assets", assetsDir, {overwrite:true});
            }

            chmodr(assetsDir,0o777, (err) => {
                if(err) throw err;
                
            });
        }else{
            fs.mkdirSync(assetsDir, {recursive:true});
        }

        if(fs.existsSync(tempDir+"/icon.png")){
            await fs.move(tempDir+"/icon.png", iconDir, {overwrite:true});

            chmodr(iconDir,0o777, (err) => {
                if(err) throw err;
                
            });
        }
        
        webLog("Plugin added successfully!");
        fs.rm(tempDir, {recursive:true});
        await this.installPluginDependencies(pluginDirName, pluginDir);
        this.getPlugins();
        sendToTCP("/frontend/plugin/install/complete", {
            pluginName:pluginDirName,
            status:"complete",
            message:"Complete!"
        });
        return {
            status:"OK",
            message:""
        };
    }

    installPluginDependencies(pluginDirName, pluginPath, packagename=""){
        if(packagename != ""){packagename = " "+packagename}
        else if(fs.existsSync(path.join(pluginPath, "node_modules"))){
            fs.rmSync(path.join(pluginPath, "node_modules"), {recursive:true});
        }
        const childProcess = require("child_process");
        webLog("Installing dependencies on "+pluginPath);
        sendToTCP("/frontend/plugin/install/progress", {
            pluginName:pluginDirName,
            status:"progress",
            message:"Installing dependencies..."
        });
        return new Promise((res, rej)=>{
            childProcess.exec("npm install"+packagename,{
            cwd: pluginPath
            }, (error, out, err)=>{
            if(error){
                rej(error);
                return;
            }
            res("OK");
            })
        }).catch(error=>{
            console.log("INSTALL DEPS FAILED");
            sendToTCP("/frontend/plugin/install/complete", {
                pluginName:pluginDirName,
                status:"failed",
                message:error.message
            });
        })
    }

    async startNgrok(){
        if(maintainenceMode == true || devMode == true){
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

    setShare(shareUser, isEnabled, message){
        if(message == null){
            if(isEnabled){
                message = shares[shareUser].joinMessage;
            }else{
                message = shares[shareUser].leaveMessage;
            }
        }
        
        //shares[shareUser].enabled = isEnabled;
        if(isEnabled){
            twitch.joinChannel(shareUser, message);
            sendToTCP("/share/activate", shareUser);
            if(shares[shareUser].discordId != null){
                
                let sharedPlugins = shares[shareUser].plugins;
                let sharedPluginMessage = [];
                for(let p in sharedPlugins){
                    if(activePlugins[sharedPlugins[p]].hasOverlay){
                        sharedPluginMessage.push(
                            activePlugins[sharedPlugins[p]].name+": "+sconfig.network.external_http_url+"/"+path.join("overlay", sharedPlugins[p])+"?channel="+shareUser
                        );
                    }
                }
                if(sharedPluginMessage.length>0){
                    discord.findUser(shares[shareUser].discordId)
                    .then(user=>{
                        user.send(twitch.homeChannel+" shared a plugin with you! \n"+sharedPluginMessage.join("\n"));
                    })
                }
                
            }
        }else{
            twitch.leaveChannel(shareUser, message);
            sendToTCP("/share/deactivate", shareUser);
        }
    }
}

//Contribution by ChatGPT :3
function mergeDirectories(sourceDir, destDir) {
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir);
    }
  
    const files = fs.readdirSync(sourceDir);
  
    files.forEach((file) => {
      const srcPath = path.join(sourceDir, file);
      const destPath = path.join(destDir, file);
  
      const stats = fs.statSync(srcPath);
  
      if (stats.isDirectory()) {
        mergeDirectories(srcPath, destPath);
      } else {
        fs.moveSync(srcPath, destPath, { overwrite: true });
      }
    });
  }

module.exports = WebUI;