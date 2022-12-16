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

class WebUI {

    constructor(devMode){

        var expressPort = null;
        var webUI = this;

        if(sconfig.network.externalhandle == "ngrok" && sconfig.network.ngrokauthtoken != ""){
            startNgrok();
        }

        const clientId = oauth['client-id'];
        const clientSecret = oauth['client-secret'];

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
        })        

        router.get("/overlay/get", async(req, res) => {

            let isExternal = req.query.external;
            
            var pluginName = req.query.plugin;
            var pluginSettings = null;

            try{
                var thisPlugin = fs.readFileSync(backendDir+"/plugins/"+pluginName+"/settings.json", {encoding:'utf8'});
                pluginSettings = JSON.parse(thisPlugin);
            }catch(e){
                console.log("Plugin has no settings");
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

        router.get('/handle', async (req,res)=>{
            console.log("Got code");
            token = req.query.code;
            var twitchParams = "?client_id="+clientId+
                "&client_secret="+clientSecret+
                "&grant_type=authorization_code"+
                "&code="+token+
                "&redirect_uri=http://localhost:"+expressPort+"/handle"+
                "&response_type=code";
                
                
            await Axios.post('https://id.twitch.tv/oauth2/token'+twitchParams)
                    .then((response)=>{
                        
                        if(typeof response.data.access_token != "undefined"){
                            token = response.data.access_token;
                            refreshToken = response.data.refresh_token;
                            oauth.token = token;
                            oauth.refreshToken = refreshToken;
                            fs.writeFile(backendDir+"/settings/oauth.json", JSON.stringify(oauth), "utf-8", (err, data)=>{
                                console.log("oauth saved!");
                            });

                        }
                    }).catch(error=>{
                        console.error(error);
                        return;
                    });
            console.log("Got token");
            
            await Axios({
                url: 'https://id.twitch.tv/oauth2/validate',
                method: 'get',
                headers:{
                    "Authorization": "Bearer "+token
                }
            })
            .then((response)=>{
                
                username = response.data.login;
            }).catch(error=>{
                console.error(error);
                return;
            });
            this.onLogin();
            res.redirect("http://localhost:"+(devMode==true?3000:expressPort));
        });

        router.get("/revoke", async(req, res) => {
            let cid = clientId;
            let revokeBroadcaster = req.query.broadcaster == true;
            let revokeToken = token;
            if(revokeBroadcaster){
                revokeToken = oauth.broadcaster_token;
            }else{
                revokeToken = token;
            }
            console.log("Revoking: "+cid);
            await Axios({
                url: 'https://id.twitch.tv/oauth2/revoke?client_id='+cid+"&token="+revokeToken,
                method: 'POST',
                headers:{
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            })
            .then((response)=>{

                if(oauth.broadcaster_token == token){
                    oauth.broadcaster_token = "";
                    oauth.broadcaster_refreshToken = "";
                    token = "";
                    refreshToken = "";
                    oauth.token = token;
                    oauth.refreshToken = refreshToken;
                    console.log("Main token matches broadcaster, both oauth revoked");
                    res.send({status:"Main token matches broadcaster, both oauth revoked"});
                }else{
                    if(revokeBroadcaster){
                        oauth.broadcaster_token = "";
                        oauth.broadcaster_refreshToken = "";
                        console.log("Broadcaster oauth revoked, main token preserved");
                        res.send({status:"Broadcaster oauth revoked, main token preserved"});
                    }else{
                        token = "";
                        refreshToken = "";
                        oauth.token = token;
                        oauth.refreshToken = refreshToken;
                        console.log("Broadcaster oauth preserved");
                        res.send({status:"Main token revoked, broadcaster oauth preserved"});
                    }
                    
                }
                
                fs.writeFile(backendDir+"/settings/oauth.json", JSON.stringify(oauth), "utf-8", (err, data)=>{
                    console.log("oauth saved!");
                });

            }).catch(error=>{
                console.error(error);
                return;
            });
        });

        router.get("/save_auth_to_broadcaster", async(req, res) => {
            oauth["broadcaster_token"] = token;
            oauth["broadcaster_refreshToken"] = refreshToken;
            fs.writeFile(backendDir+"/settings/oauth.json", JSON.stringify(oauth), "utf-8", (err, data)=>{
                console.log("oauth saved!");
                res.send({status:"SUCCESS"});
            });
            
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
            let backups = {
                settings:fs.existsSync(backupSettingsDir)?fs.readdirSync(backupSettingsDir):{},
                plugins:fs.existsSync(backupPluginsDir)?fs.readdirSync(backupPluginsDir):{}
            }
            res.send({express: JSON.stringify({config:sconfig, backup:backups})});
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
                console.log("SAVED COMMANDS");
            });
        });

        router.post("/saveConfig", async (req, res) => {
            let statusMsg = "";
            if(sconfig.network.externalhandle == "ngrok" && req.body.network.externalhandle != "ngrok"){
                stopNgrok();
                statusMsg += " (Ngrok stopped)";
            }else if(sconfig.network.externalhandle != "ngrok" && req.body.network.externalhandle == "ngrok"){
                sconfig.network.ngrokauthtoken = req.body.network.ngrokauthtoken;
                await startNgrok();
                statusMsg += " (Ngrok started)";
            }

            if(sconfig.network.externalhandle != req.body.network.externalhandle || sconfig.network.external_http_url != req.body.external_http_url){
                sconfig.network.externalhandle = req.body.network.externalhandle;
                sconfig.network.external_http_url = req.body.network.external_http_url;
                sconfig.network.ngrokauthtoken = sconfig.network.ngrokauthtoken;
                refreshEventSubs();
                statusMsg += " (Refreshing EventSubs)";
            }
            
            
            fs.writeFile(backendDir+"/settings/config.json", JSON.stringify(req.body), "utf-8", (err, data)=>{
                
                sconfig = req.body;
                res.send({status:statusMsg});
                console.log("SAVED THE CONFIG");
            });
        });

        router.post("/saveCustomSpooder", async (req, res) => {
            themes.spooderpet = req.body;
            fs.writeFile(backendDir+"/settings/themes.json", JSON.stringify(themes), "utf-8", (err, data)=>{
                let statusMsg = "Spooder Saved!"
                res.send({status:statusMsg});
                console.log("SAVED THE SPOODER");
            });
        })

        router.post("/saveOSCTunnels", async(req, res) => {
            fs.writeFile(backendDir+"/settings/osc-tunnels.json", JSON.stringify(req.body), "utf-8", (err, data)=>{
                osctunnels = req.body;
                sosc.updateOSCListeners();
                res.send({status:"SAVE SUCCESS"});
                console.log("SAVED THE TUNNELS");
            });
        });

        router.post("/saveEventSubs", async(req, res) => {
            delete req.body.callback_url;
            fs.writeFile(backendDir+"/settings/eventsub.json", JSON.stringify(req.body), "utf-8", (err, data)=>{
                eventsubs = req.body;
                res.send({status:"SAVE SUCCESS"});
            });
        })

        router.post('/install_plugin', async (req, res) => {
            try{
                if(!req.files){
                    console.log("NO FILES FOUND");
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
                    console.log("EXTRACT ZIP");
                    let zip = new AdmZip(tempFile);
                    zip.extractAllTo(tempDir);

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

                        chmodr(overlayDir,0o777, (err) => {
                            if(err) throw err;
                            
                        });
                    }

                    if(fs.existsSync(tempDir+"/settings")){
                        await fs.move(tempDir+"/settings", settingsDir, {overwrite:true});

                        chmodr(overlayDir,0o777, (err) => {
                            if(err) throw err;
                            
                        });
                    }

                    if(fs.existsSync(tempDir+"/icon.png")){
                        await fs.move(tempDir+"/icon.png", iconDir, {overwrite:true});

                        chmodr(overlayDir,0o777, (err) => {
                            if(err) throw err;
                            
                        });
                    }
                    
                    console.log("COMPLETE!");
                    fs.rm(tempFile);
                    fs.rm(tempDir, {recursive:true});
                    getPlugins();
                    res.send({
                        status:true,
                        message: "File Upload Success"
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
            console.log("DOWNLOADING SETTINGS", path.join(backendDir, "backup", "settings", backupName));
            res.setHeader("Content-disposition", backupName);
            res.download(path.join(backendDir, "backup", "settings", backupName));
        });

        router.get("/checkout_plugins/*", async (req, res) => {
            let backupName = req.params['0'];
            console.log("DOWNLOADING PLUGINS", path.join(backendDir, "backup", "settings", backupName));
            res.setHeader("Content-disposition", backupName);
            res.download(path.join(backendDir, "backup", "plugins", backupName));
        })

        router.post("/checkin_settings", (req, res) => {
            if(!req.files){
                console.log("NO FILES FOUND");
                res.send({
                    status: false,
                    message: 'No file uploaded'
                })
            }else{
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
                console.log("NO FILES FOUND");
                res.send({
                    status: false,
                    message: 'No file uploaded'
                })
            }else{
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
                console.log("BACKUP COMPLETE");
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
            console.log("Writing backup. This can take a while depending on how many plugins you have. I wish I could show you progress...");
            
            zip.writeZip(backendDir+"/backup/plugins/"+backupName+".zip", (e)=>{
                if(e){
                    throw new Error(e.message);
                }
                let newPluginBackups = fs.readdirSync(path.join(backendDir, "backup", "plugins"));
                res.send({newbackups:newPluginBackups});
                console.log("BACKUP COMPLETE");
            });
        });

        router.post("/delete_backup_settings", (req, res) => {
            let backupName = req.body.backupName;
            let backupDir = path.join(backendDir, "backup", "settings");
            let fullPath = path.join(backupDir, backupName);

            if(fs.existsSync(fullPath)){
                fs.rmSync(fullPath);
                let newPluginBackups = fs.readdirSync(path.join(backendDir, "backup", "settings"));
                console.log("BACKUP DELETED: "+backupName);
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
                console.log("BACKUP DELETED: "+backupName);
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
                console.log("CHECKING", s+".json");
                if(selections[s] == true){
                    if(fs.existsSync(path.join(fileDir, s+".json"))){
                        console.log("OVERWRITE "+s+".json");
                        fs.copySync(path.join(fileDir, s+".json"), path.join(backendDir, "settings", s+".json"), {overwrite:true});
                    }else{
                        console.log(path.join(fileDir, s+".json"),"NOT FOUND");
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
            console.log("COMPLETE");
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

            console.log("GET BACKUP", fileName, fileDir);

            if(fs.existsSync(fileDir)){
                await fs.rm(fileDir, {recursive:true});
            }

            let zip = new AdmZip(path.join(backendDir, "tmp", fileName));
            zip.extractAllTo(fileDir);

            let pluginList = fs.readdirSync(path.join(fileDir, "plugins"));
            console.log("Deleting Plugins...");
            fs.rmSync(path.join(backendDir, "plugins"),{recursive:true});
            fs.mkdirSync(path.join(backendDir, "plugins"));

            console.log("Copying Plugins...");
            for(let p in pluginList){
                console.log(pluginList[p]);
                fs.copySync(path.join(fileDir, "plugins", pluginList[p]), path.join(backendDir, "plugins", pluginList[p]));
            }

            let webfolders = fs.readdirSync(path.join(backendDir, "web"));
            console.log("Deleting Web Folders...");
            for(let w in webfolders){
                if(webfolders[w] != "mod"){
                    
                    fs.rmSync(path.join(backendDir, "web", webfolders[w]), {recursive:true});
                }
            }

            let newWebFolders = fs.readdirSync(path.join(fileDir, "web"));
            console.log("Copying Web Folders...");
            for(let w in newWebFolders){
                if(newWebFolders[w] != "mod"){
                    console.log(newWebFolders[w])
                    fs.copySync(path.join(fileDir, "web", newWebFolders[w]),
                    path.join(backendDir, "web", newWebFolders[w]));
                }
            }
            console.log("Cleaning up...")
            if(fs.existsSync(fileDir)){
                await fs.rm(fileDir, {recursive:true});
            }

            if(fs.existsSync(path.join(backendDir, "tmp", fileName))){
                await fs.rm(path.join(backendDir, "tmp", fileName));
            }
            getPlugins();
            let newPluginBackups = fs.readdirSync(path.join(backendDir, "backup", "plugins"));
            console.log("COMPLETE");
            res.send({status:"SUCCESS",newbackups:newPluginBackups});
        });

        router.post("/refresh_plugins", async (req, res) => {
            getPlugins();
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
                    console.log("NO FILES FOUND");
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
                    console.log("COMPLETE!");
                    
                    getPlugins();

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
            getPlugins();
        });

        router.post('/save_plugin', async(req, res) => {
            let newSettings = req.body;
            let settingsFile = path.join(backendDir, "plugins", newSettings.pluginName, "settings.json");
            console.log("SAVING", settingsFile ,newSettings);
            fs.writeFile(settingsFile, JSON.stringify(newSettings.settings), "utf-8", (err, data)=>{
                res.send({saveStatus:"SAVE SUCCESS"});
                console.log(""+newSettings.pluginName+" Settings Saved!");
            });

            getPlugins();
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

        router.get("/eventsubs", async(req, res) => {
            let sendSubs = Object.assign(eventsubs);
            sendSubs.callback_url = sconfig.network.external_http_url;
            res.send(JSON.stringify(sendSubs));
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

        router.get("/get_eventsub", async(req,res) => {
            await getAppToken();
            if(appToken ==""){
                console.log("NO APP TOKEN");
                return;
            }
            await Axios({
                url: 'https://api.twitch.tv/helix/eventsub/subscriptions',
                method: 'GET',
                headers:{
                    "Client-Id": oauth["client-id"],
                    "Authorization": " Bearer "+appToken,
                    "Content-Type": "application/json"
                }
            })
            .then((response)=>{
                
                res.send(JSON.stringify(response.data));
            }).catch(error=>{
                console.error(error);
                return;
            });
        });

        router.get("/get_channelpoint_rewards", async(req, res) => {
            
            await getBroadcasterID();
            await this.validateBroadcaster();

            if(broadcasterUserID == 0){
                res.send({status:"NO BROADCASTER USER ID"});
                return;
            }

            await Axios({
                url: 'https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id='+broadcasterUserID,
                method: 'GET',
                headers:{
                    "Client-Id": oauth["client-id"],
                    "Authorization": " Bearer "+oauth.broadcaster_token,
                    "Content-Type": "application/json"
                }
            })
            .then((response)=>{
                res.send(JSON.stringify(response.data));
            }).catch(error=>{
                console.error(error);
                res.send(JSON.stringify(error.response.data));
                this.onBroadcasterAuthFailure();
                return;
            });
        });

        router.get("/delete_eventsub", async(req,res) => {
            
            await Axios({
                url: 'https://api.twitch.tv/helix/eventsub/subscriptions?id='+req.query.id,
                method: 'DELETE',
                headers:{
                    "Client-Id": oauth["client-id"],
                    "Authorization": " Bearer "+appToken,
                    "Content-Type": "application/json"
                }
            })
            .then((response)=>{
                
                res.send(JSON.stringify({status:"SUCCESS"}));
            }).catch(error=>{
                console.error(error);
                return;
            });
        });

        router.get("/refresh_eventsub", async(req,res)=>{
            await refreshEventSubs();
            res.send({status:"SUCCESS"});
        })

        router.get("/init_followsub", async(req,res) => {
            let subStatus = await initEventSub(req.query.type);
            
            res.send(JSON.stringify({status:subStatus}));
        });

        router.get("/chat_channel", async(req,res) => {
            let channel = req.query.channel;
            chatSwitchChannels(channel);
            res.send(JSON.stringify({status:"SUCCESS"}));
        });

        router.get("/chat_restart", async(req, res) => {
            restartChat("restart");
            res.send(JSON.stringify({status:"SUCCESS"}));
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
                            console.log("Welcome back, "+moduser+"!");
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

        router.get("/mod/currentviewers", async(req,res) => {
            
            await Axios({
                url: "https://tmi.twitch.tv/group/user/"+channel.substr(1)+"/chatters",
                method: 'get',
            })
            .then((response)=>{
                
                res.send(JSON.stringify(response.data));
                
            }).catch(error=>{
                console.error("ERROR",error);
            });
            
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

        //HTTPS ROUTER
        router.post("/webhooks/callback", async (req, res) => {
            const messageType = req.header("Twitch-Eventsub-Message-Type");
            if (messageType === "webhook_callback_verification") {
                console.log("Verifying Webhook", req.body.subscription.type);
                return res.status(200).send(req.body.challenge);
            }

            const { type } = req.body.subscription;
            const { event } = req.body;

            console.log(
                `Receiving ${type} request for ${event.broadcaster_user_name}: `,
                event
            );

            if(type == "channel.raid"){
                await getBroadcasterID();
                if(event.to_broadcaster_user_id == broadcasterUserID){
                    event.raidType = "receive";
                }else if(event.from_broadcaster_user_id == broadcasterUserID){
                    event.raidType = "send";
                }
            }
            
            if(eventsubs){
                if(eventsubs.events[type].chat != null){
                    if(eventsubs.events[type].chat.enabled){

                        try{
							let responseFunct = eval("() => { let event = "+JSON.stringify(event)+"; "+eventsubs.events[type].chat.message.replace(/\n/g, "")+"}");
						
							let response = responseFunct();
							sayInChat(response);
						}catch(e){
							console.log("Failed to run response script. Check the event settings to verify it.");
						}
                    }
                }

                if(eventsubs.events[type].tcp != null){
                    if(eventsubs.events[type].tcp.enabled){
                        
                        if(type == "channel.raid"){
                            await getBroadcasterID();
                            
                            if(event.to_broadcaster_user_id == broadcasterUserID){
                                event.raidType = "receive";
                            }else if(event.from_broadcaster_user_id == broadcasterUserID){
                                event.raidType = "send";
                            }
                            sendToTCP(eventsubs.events[type].tcp.address, JSON.stringify(event));
                        }else{
                            sendToTCP(eventsubs.events[type].tcp.address, JSON.stringify(event));
                        }
                    }
                }

                if(eventsubs.events[type].udp != null){
                    if(eventsubs.events[type].udp.enabled){
                        sendToUDP(eventsubs.events[type].udp.dest, eventsubs.events[type].udp.address, eventsubs.events[type].udp.value);
                        setTimeout(()=>{
                            sendToUDP(eventsubs.events[type].udp.dest, eventsubs.events[type].udp.address, eventsubs.events[type].udp.valueoff);
                        }, eventsubs.events[type].udp.duration);
                    }
                }

                if(eventsubs.events[type].plugin != null){
                    if(eventsubs.events[type].plugin.enabled){
                        if(activePlugins[eventsubs.events[type].plugin.pluginname] != null){
                            if(typeof activePlugins[eventsubs.events[type].plugin.pluginname].onEvent == "undefined"){
                                console.log("NO ONEVENT FUNCTION FOUND ON "+eventsubs.events[type].plugin.pluginname);
                            }else{
                                activePlugins[eventsubs.events[type].plugin.pluginname].onEvent(eventsubs.events[type].plugin.eventname, event);
                            }
                        }
                    }
                }
            }

            if(type == "channel.channel_points_custom_reward_redemption.add"){

                for(let e in events){
                    if(events[e].triggers.redemption.enabled
                        && events[e].triggers.redemption.id == event.reward.id){
                            if(event.status == "fulfilled" || events[e].triggers.redemption.override == true){
                                runCommands(event, e);
                            }
                        }
                }

            }else if(type == "channel.channel_points_custom_reward_redemption.update"){

                for(let e in events){
                    if(events[e].triggers.redemption.enabled
                        && events[e].triggers.redemption.id == event.reward.id
                        && events[e].triggers.redemption.override == false){
                            if(event.status == "fulfilled"){
                                runCommands(event, e);
                            }else{
                                sayInChat(event.user_name+" Sorry, the "+event.reward.title+" is a no go.");
                            }
                            
                        }
                }
            }

            res.status(200).end();
        });

        app.listen(expressPort);

        console.log("Spooder Web UI is running at", "http://localhost:"+expressPort+" and http://"+suggestedNet+":"+expressPort);

        async function getBroadcasterID(){
            if(broadcasterUserID==0){
                await Axios({
                    url: 'https://api.twitch.tv/helix/users?login='+sconfig.broadcaster.username,
                    method: 'get',
                    headers:{
                        "Authorization": "Bearer "+token,
                        "Client-Id":clientId
                    }
                })
                .then((response)=>{
                    broadcasterUserID = response.data.data[0].id;
                }).catch(error=>{
                    console.error(error);
                    if(error.response?.status == 401){
                        webUI.onAuthenticationFailure();
                    }
                    return;
                });
            }
        }

        async function getAppToken(){
            if(appToken == ""){

                var twitchScopes = {
                    "channel.update":"",
                    "channel.follow":"",
                    "channel.subscribe":"channel:read:subscriptions",
                    "channel.subscription.end":"channel:read:subscriptions",
                    "channel.subscription.gift":"channel:read:subscriptions",
                    "channel.subscription.message":"channel:read:subscriptions",
                    "channel.cheer":"bits:read",
                    "channel.raid":"",
                    "channel.ban":"channel:moderate",
                    "channel.unban":"channel:moderate",
                    "channel.moderator.add":"moderation:read",
                    "channel.moderator.remove":"moderation:read",
                    "channel.channel_points_custom_reward.add":"channel:read:redemptions",
                    "channel.channel_points_custom_reward.update":"channel:read:redemptions",
                    "channel.channel_points_custom_reward.remove":"channel:read:redemptions",
                    "channel.channel_points_custom_reward_redemption.add":"channel:read:redemptions",
                    "channel.channel_points_custom_reward_redemption.update":"channel:read:redemptions",
                    "channel.poll.begin":"channel:read:polls",
                    "channel.poll.progress":"channel:read:polls",
                    "channel.poll.end":"channel:read:polls",
                    "channel.prediction.begin":"channel:read:predictions",
                    "channel.prediction.progress":"channel:read:predictions",
                    "channel.prediction.lock":"channel:read:predictions",
                    "channel.prediction.end":"channel:read:predictions",
                    "drop.entitlement.grant":"",
                    "extension.bits_transaction.create":"",
                    "channel.goal.begin":"channel:read:goals",
                    "channel.goal.progress":"channel:read:goals",
                    "channel.goal.end":"channel:read:goals",
                    "channel.hype_train.begin":"channel:read:hype_train",
                    "channel.hype_train.progress":"channel:read:hype_train",
                    "channel.hype_train.end":"channel:read:hype_train",
                    "stream.online":"",
                    "stream.offline":"",
                    "user.authorization.grant":"",
                    "user.authorization.revoke":"",
                    "user.update":""
                };
                
                let scopeString = "";
                for(let t in twitchScopes){
                    if(twitchScopes[t] == ""){continue;}
                    if(scopeString == ""){
                        scopeString += twitchScopes[t];
                    }else{
                        scopeString += "+"+twitchScopes[t];
                    }
                    
                }

                var appParams = "?client_id="+oauth["client-id"]+
                    "&client_secret="+oauth["client-secret"]+
                    "&grant_type=client_credentials"+
                    "&scope="+scopeString;
                
                await Axios.post('https://id.twitch.tv/oauth2/token'+appParams)
                        .then((response)=>{
                            
                            if(typeof response.data.access_token != "undefined"){
                                appToken = response.data.access_token;
                            }
                        }).catch(error=>{
                            console.error(error);
                            return;
                        });
            }
        }

        async function getEventSubs(){
            await getAppToken();
            if(appToken ==""){
                console.log("No app token found");
                return;
            }
            let response = await Axios({
                url: 'https://api.twitch.tv/helix/eventsub/subscriptions',
                method: 'GET',
                headers:{
                    "Client-Id": oauth["client-id"],
                    "Authorization": " Bearer "+appToken,
                    "Content-Type": "application/json"
                }
            }).catch(error=>{
                console.error(error);
                return;
            });
            return response.data;
        }

        async function refreshEventSubs(){
            let subs = await getEventSubs();
            for(let s in subs.data){
                
                if(subs.data[s].transport.callback != sconfig.network.external_http_url){
                    await deleteEventSub(subs.data[s].id)
                }
            }
            let subtype = "";
            for(let s in subs.data){
                subtype = subs.data[s].type;
                if(subs.data[s].type == "channel.raid"){
                    if(subs.data[s].condition.to_broadcaster_user_id != ""){
                        subtype += "-send"
                    }else{
                        subtype += "-receive";
                    }
                }
                await initEventSub(subtype);
            }
        }

        async function deleteEventSub(id){
            await Axios({
                url: 'https://api.twitch.tv/helix/eventsub/subscriptions?id='+id,
                method: 'DELETE',
                headers:{
                    "Client-Id": oauth["client-id"],
                    "Authorization": " Bearer "+appToken,
                    "Content-Type": "application/json"
                }
            }).catch(error=>{
                console.error(error);
                return;
            });
        }
        
        async function initEventSub(eventType){
            await getAppToken();
            await getBroadcasterID();

            var condition = {};

            if(!eventType.startsWith("channel.raid")){
                condition = {"broadcaster_user_id":broadcasterUserID};
            }else{
                if(eventType.split("-")[1] == "receive"){
                    condition = {"to_broadcaster_user_id":broadcasterUserID};
                }else{
                    condition = {"from_broadcaster_user_id":broadcasterUserID};
                }
                eventType = eventType.split("-")[0];
            }

            return new Promise((res, rej)=>{
                Axios({
                    url: 'https://api.twitch.tv/helix/eventsub/subscriptions',
                    method: 'post',
                    headers:{
                        "Client-ID":oauth["client-id"],
                        "Authorization":"Bearer "+appToken,
                        "Content-Type":"application/json"
                    },
                    data:{
                        "type":eventType,
                        "version": "1",
                        "condition":condition,
                        "transport":{
                            "method": "webhook",
                            "callback":sconfig.network.external_http_url+"/webhooks/callback",
                            "secret":"imasecretboi"
                        }
                    }
                }).then(response => res("SUCCESS"))
                .catch(error=>{
                    console.error(error);
                    res(error.response.data.message);
                });
            })
            
        };

        async function startNgrok(){
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
            refreshEventSubs();
        }
    
        function stopNgrok(){
            ngrok.disconnect();
        }

        async function getPlugins(){
            try {
              const dir = await fsPromises.opendir(backendDir+'/plugins');
              activePlugins = {};
              for await (const dirent of dir){
                delete require.cache[require.resolve(backendDir+'/plugins/'+dirent.name)];
                activePlugins[dirent.name] = new (require(backendDir+'/plugins/'+dirent.name))();
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
            } catch (err) {
              console.error(err);
            }
            
        }
        getPlugins();
    }

    onLogin = null;

    twitchSigningSecret = process.env.TWITCH_SIGNING_SECRET;

    verifyTwitchSignature = (req, res, buf, encoding) => {
        const messageId = req.header("Twitch-Eventsub-Message-Id");
        const timestamp = req.header("Twitch-Eventsub-Message-Timestamp");
        const messageSignature = req.header("Twitch-Eventsub-Message-Signature");
        const time = Math.floor(new Date().getTime() / 1000);
        console.log(`Message ${messageId} Signature: `, messageSignature);

        if (Math.abs(time - timestamp) > 600) {
            // needs to be < 10 minutes
            console.log(`Verification Failed: timestamp > 10 minutes. Message Id: ${messageId}.`);
            throw new Error("Ignore this request.");
        }

        if (!twitchSigningSecret) {
            console.log(`Twitch signing secret is empty.`);
            throw new Error("Twitch signing secret is empty.");
        }

        const computedSignature =
            "sha256=" +
            crypto
            .createHmac("sha256", twitchSigningSecret)
            .update(messageId + timestamp + buf)
            .digest("hex");
        console.log(`Message ${messageId} Computed Signature: `, computedSignature);

        if (messageSignature !== computedSignature) {
            throw new Error("Invalid signature.");
        } else {
            console.log("Verification successful");
        }
    };

    onAuthenticationFailure = () =>{
        console.log("Authentication failed, refreshing...");
        if(refreshToken == "" || refreshToken == null){
            console.log("NO REFRESH TOKEN IN OAUTH.JSON");
            return;}
        
        return new Promise((res, rej) => {
            let clientId = oauth["client-id"];
            let clientSecret = oauth["client-secret"];
            var refreshParams = "?client_id="+clientId+
                "&client_secret="+clientSecret+
                "&grant_type=refresh_token"+
                "&refresh_token="+refreshToken;
                
            Axios.post('https://id.twitch.tv/oauth2/token'+refreshParams)
                    .then((response)=>{
                        
                        if(typeof response.data.access_token != "undefined"){
                            
                            token = response.data.access_token;
                            oauth.token = token;
                            console.log("TOKEN REFRESHED");
                            fs.writeFile(backendDir+"/settings/oauth.json", JSON.stringify(oauth), "utf-8", (err, data)=>{
                                console.log("oauth saved!");
                            });
                            res(token);
                        }
                    }).catch(error=>{
                        rej(error);
                        return;
                    });
        });
	};

	onBroadcasterAuthFailure = async() =>{
        console.log("Broadcaster auth failed, refreshing...");
        if(oauth.broadcaster_refreshToken == "" || oauth.broadcaster_refreshToken == null){return;}
        let clientId = oauth["client-id"]
        let clientSecret = oauth["client-secret"];
		var refreshParams = "?client_id="+clientId+
			"&client_secret="+clientSecret+
			"&grant_type=refresh_token"+
			"&refresh_token="+oauth.broadcaster_refreshToken;
			
			console.log("Refreshing Token...");
		await Axios.post('https://id.twitch.tv/oauth2/token'+refreshParams)
				.then((response)=>{
					
					if(typeof response.data.access_token != "undefined"){
                        
						oauth.broadcaster_token = response.data.access_token;
						
						console.log("BROADCASTER TOKEN REFRESHED");
						fs.writeFile(backendDir+"/settings/oauth.json", JSON.stringify(oauth), "utf-8", (err, data)=>{
							console.log("broadcaster oauth saved!");
						});
						this.validateBroadcaster();
					}
				}).catch(error=>{
					console.error(error);
					return;
				});
		
	};

	async autoLogin(){
        if(token == "" || token == null){
            console.log("No chat oauth saved. Go into the Web UI, click the top for the navigation menu, then click 'authorize'. You must be on localhost to make auth tokens.")
        }
        await Axios({
            url: 'https://id.twitch.tv/oauth2/validate',
            method: 'get',
            headers:{
                "Authorization": "Bearer "+token
            }
        })
        .then((response)=>{
            
            username = response.data.login;
            console.log("Welcome "+username+"! Connecting to chat...");
            this.onLogin();
        }).catch(async error=>{
            console.error("ERROR",error);
            if(error.response?.status == 401){
                let newToken = await this.onAuthenticationFailure();
                if(newToken != "" && newToken != null){
                    this.onLogin();
                }
            }
        });
	}

	async validateBroadcaster(){
		if(oauth.broadcaster_token == "" || oauth.broadcaster_token == null){
            console.log("No broadcaster auth saved. Authorizing on the Web UI saves your auth tokens for chat. If that's your broadcasting account, then go to the EventSub tab and click 'Save Current Oauth as Broadcaster'. You can have both pairs of tokens be the same. If you want a separate account for chat. Log in to twitch.tv as your bot account and authorize on the Web UI.");
            return;
        }
		await Axios({
			url: 'https://id.twitch.tv/oauth2/validate',
			method: 'get',
			headers:{
				"Authorization": "Bearer "+oauth.broadcaster_token
			}
		})
		.then((response)=>{
			
			console.log("Validated broadcaster: "+response.data.login+"!");
		}).catch(error=>{
			console.error("ERROR",error);
			if(error.response?.status == 401){
				this.onBroadcasterAuthFailure();
			}
			
			return;
		});
	}

    async validateChatbot(){
        if(token == "" || token == null){
            console.log("No chat oauth saved. Go into the Web UI, click the top for the navigation menu, then click 'authorize'. You must be on localhost to make auth tokens. If this is a fresh Spooder, you'll want to log in to twitch.tv as the account you use to broadcast first. Then go to the EventSub tab to copy your auth tokens to broadcaster.");
            return;
        }
		return new Promise((res, rej)=>{
            Axios({
                url: 'https://id.twitch.tv/oauth2/validate',
                method: 'get',
                headers:{
                    "Authorization": "Bearer "+oauth.token
                }
            })
            .then((response)=>{
                
                console.log("Validated Chatbot: "+response.data.login+"!");
                res();
            }).catch(error=>{
                console.error("ERROR",error);
                if(error.response?.status == 401){
                    this.onAuthenticationFailure().then(token=>res(token));
                }
            });
        })
	}
}

module.exports = WebUI;