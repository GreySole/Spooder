const Axios = require("axios");
const fs = require("fs-extra");

class WebUI {

    constructor(devMode){

        var expressPort = null;

        const Axios = require("axios");
        const chmodr = require('chmodr');
        const fsPromises = require('fs/promises');

        const express = require('express');
        const bodyParser = require("body-parser");
        const AdmZip = require('adm-zip');
        const fileUpload = require('express-fileupload');
        const path = require("path");

        const clientId = oauth['client-id'];
        const clientSecret = oauth['client-secret'];

        let pluginsDir = path.join(backendDir, "plugins");
        let webDir = path.join(backendDir, "web");
        let overlayDir = path.join(backendDir, "web", "overlay");
        
        if(!fs.existsSync(pluginsDir)){
            fs.mkdirSync(pluginsDir);
        }

        if(!fs.existsSync(webDir)){
            fs.mkdirSync(webDir);
        }

        if(!fs.existsSync(overlayDir)){
            fs.mkdirSync(overlayDir);
        }

        var app = new express();
        var router = express.Router();

        channel = "#"+config.broadcaster.username;
        expressPort = devMode===false?config.network.host_port:3001;
        app.use("/",router);
        router.use("/overlay", express.static(backendDir+'/web/overlay'));
        router.get("/overlay/get", async(req, res) => {
            var pluginName = req.query.plugin;
            var pluginSettings = null;

            try{
                var thisPlugin = fs.readFileSync(backendDir+"/plugins/"+pluginName+"/settings.json", {encoding:'utf8'});
                pluginSettings = JSON.parse(thisPlugin);
            }catch(e){
                console.log("Plugin has no settings");
            }
            
            let oscInfo = {
                host: config.network.host,
                port: config.network.osc_tcp_port,
                settings: pluginSettings
            };

            res.send({express: JSON.stringify(oscInfo)});
        });

        if(devMode === false){
            router.use("/", express.static(frontendDir));
        }

        router.use(bodyParser.urlencoded({extended:true}));
        router.use(bodyParser.json());
        router.use("/install_plugin",fileUpload());
        router.use("/upload_plugin_asset/*",fileUpload());
        router.use(express.json({verify: this.verifyTwitchSignature}));
        //router.use(express.static("/plugin/*", ReactDomServer));

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
            res.redirect("http://localhost:"+(devMode==true?3000:expressPort)+"/?user="+username);
        });

        router.get("/save_auth_to_broadcaster", async(req, res) => {
            oauth["broadcaster_token"] = token;
            oauth["broadcaster_refreshToken"] = refreshToken;
            fs.writeFile(backendDir+"/settings/oauth.json", JSON.stringify(oauth), "utf-8", (err, data)=>{
                console.log("oauth saved!");
                res.send({status:"SUCCESS"});
            });
            
        });

        router.get('/command_table', (req, res) => {
            let props = {
                "events":events,
                "groups":eventGroups,
                "plugins":Object.keys(activePlugins)
            };
            res.send({express: JSON.stringify(props)});
        });

        router.get('/server_config', (req, res) => {
            res.send({express: JSON.stringify(config)});
        });

        router.get('/udp_hosts', (req, res) => {
            res.send({express:JSON.stringify(udpClients)});
        });

        router.get('/server_state', async (req, res) => {

            var oscReturn = {
                host:config.network.host,
                port:config.network.osc_tcp_port,
                udp_clients:config.network["udp_clients"],
                plugins:Object.keys(activePlugins)
            }

            var hostReturn = {
                port:expressPort
            }
            
            if(username == "" || username == null){
                res.send({user:"", osc:oscReturn, host:hostReturn});
            }else{
                res.send({
                    "user":username,
                    "osc":oscReturn,
                    "host":hostReturn
                });
            }
            
            
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
            console.log("SAVING CONFIG",req.body);
            
            fs.writeFile(backendDir+"/settings/config.json", JSON.stringify(req.body), "utf-8", (err, data)=>{
                config = req.body;
                res.send({status:"SAVE SUCCESS"});
                console.log("SAVED THE CONFIG");
            });
            
            //restartOSC();
        });

        router.post("/saveOSCTunnels", async(req, res) => {
            fs.writeFile(backendDir+"/settings/osc-tunnels.json", JSON.stringify(req.body), "utf-8", (err, data)=>{
                osctunnels = req.body;
                sosc.updateOSCListeners();
                res.send({status:"SAVE SUCCESS"});
                console.log("SAVED THE TUNNELS");
            });
        });

        router.post("/saveEventSubs", async(req, res) => {
            fs.writeFile(backendDir+"/settings/eventsub.json", JSON.stringify(req.body), "utf-8", (err, data)=>{
                eventsubs = req.body;
                res.send({status:"SAVE SUCCESS"});
            });
        })

        router.post('/install_plugin', async (req, res) => {
            console.log("INSTALL PLUGIN",req.files);
            
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

                    //Make /tmp
                    if(!fs.existsSync(backendDir+"/tmp")){
                        fs.mkdirSync(backendDir+"/tmp");
                    }


                    let tempFile = path.join(backendDir,"tmp", pluginZip.name);
                    let tempDir = path.join(backendDir, "tmp", pluginDirName);
                    let pluginDir = path.join(backendDir,"plugins", pluginDirName);
                    let overlayDir = path.join(backendDir,"web", "overlay", pluginDirName);
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

            if(fs.existsSync(pluginDir)){
                fs.copySync(pluginDir, tempDir+"/command");
            }
            
            if(fs.existsSync(overlayDir)){
                fs.copySync(overlayDir, tempDir+"/overlay");
                if(fs.existsSync(tempDir+"/overlay/assets")){
                    await fs.rm(tempDir+"/overlay/assets", {recursive:true});
                }
            }

            let zip = new AdmZip();

            if(fs.existsSync(tempDir+"/command")){
                zip.addLocalFolder(tempDir+"/command", "/command");
            }

            if(fs.existsSync(tempDir+"/overlay")){
                zip.addLocalFolder(tempDir+"/overlay", "/overlay");
            }
            
            zip.writeZip(tempDir+"/"+pluginName+".zip");

            res.setHeader('Content-disposition', pluginName+".zip");
            res.download(tempDir+"/"+pluginName+".zip");

            fs.rm(tempDir, {recursive:true});
        })

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
            console.log(req);
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
            
            let thisBody = req.body
            
            let pluginName = thisBody.pluginName;

            let pluginDir = path.join(backendDir,"plugins", pluginName);
            let overlayDir = path.join(backendDir,"web", "overlay", pluginName);
            await fs.rm(pluginDir, {recursive:true});
            await fs.rm(overlayDir, {recursive:true});
            res.send(JSON.stringify({status:"SUCCESS"}));
            getPlugins();
        });

        router.post('/save_plugin', async(req, res) => {
            let newSettings = req.body;
            let settingsFile = path.join(backendDir, "plugins", newSettings.pluginName, "settings.json");
            console.log("SAVING", settingsFile ,newSettings);
            fs.writeFile(settingsFile, JSON.stringify(newSettings.settings), "utf-8", (err, data)=>{
                res.send({saveStatus:"SAVE SUCCESS"});
                console.log("I SAVED THE "+newSettings.pluginName+" SETTINGS!");
            });

            getPlugins();
        });

        router.get('/plugins', async (req, res) => {
            
            let pluginPacks = {};
            for(let a in activePlugins){
                console.log(a);
                let thisPluginPath = "http://"+config.network.host+":"+expressPort+"/overlay/"+a;
                let settingsFile = path.join(backendDir, "plugins", a, "settings.json");
                let thisPlugin = fs.existsSync(settingsFile)==true ?
                                JSON.parse(fs.readFileSync(settingsFile, {encoding:'utf8'})):null;

                let settingsForm = path.join(backendDir, "plugins", a, "settings-form.html");
                let thisPluginForm = fs.existsSync(settingsForm)==true ?
                                fs.readFileSync(settingsForm, {encoding:'utf8'}):null;

                let assetDir = path.join(backendDir, "web", "overlay", a, "assets");
                console.log("HAS ASSETS?", fs.existsSync(assetDir));
                let thisPluginAssets = fs.existsSync(assetDir)==true ?
                                    fs.readdirSync(assetDir):null;
                pluginPacks[a] = {
                    "settings":thisPlugin,
                    "settings-form":thisPluginForm,
                    "assets":thisPluginAssets,
                    "path":thisPluginPath
                };
            }
            
            res.send(JSON.stringify(pluginPacks));
        });

        router.get("/osc_tunnels", async(req, res) => {
            res.send(JSON.stringify(osctunnels));
        });

        router.get("/eventsubs", async(req, res) => {
            res.send(JSON.stringify(eventsubs));
        });

        router.get("/get_plugin/*", async(req,res) => {
            
            let plugin = {};
            let a = req.params['0'];
            let thisPlugin = fs.readFileSync(backendDir+"/plugins/"+a+"/settings.json", {encoding:'utf8'});
            let thisPluginForm = fs.readFileSync(backendDir+"/plugins/"+a+"/settings-form.json", {encoding:'utf8'});
            let thisPluginIcon = backendDir+"/overlay/"+a+"/icon.png";
            plugin[a] = {
                "settings":thisPlugin,
                "settings-form":thisPluginForm,
                "icon":thisPluginIcon
            }
            
            res.send(JSON.stringify(plugin));
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

        router.get("/init_followsub", async(req,res) => {
            let subStatus = await initEventSub(req.query.type);
            console.log(subStatus);
            res.send(JSON.stringify({status:subStatus}));
        });

        //HTTPS ROUTER
        router.post("/webhooks/callback", async (req, res) => {
            const messageType = req.header("Twitch-Eventsub-Message-Type");
            if (messageType === "webhook_callback_verification") {
                console.log("Verifying Webhook");
                return res.status(200).send(req.body.challenge);
            }

            const { type } = req.body.subscription;
            const { event } = req.body;

            console.log(
                `Receiving ${type} request for ${event.broadcaster_user_name}: `,
                event
            );
            
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
                        sendToTCP(eventsubs.events[type].tcp.address, JSON.stringify(event));
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
                        if(typeof activePlugins[eventsubs.events[type].plugin.pluginname].onEvent == "undefined"){
                            console.log("NO ONEVENT FUNCTION FOUND ON "+eventsubs.events[type].plugin.pluginname);
                        }else{
                            activePlugins[eventsubs.events[type].plugin.pluginname].onEvent(type, event);
                        }
                    }
                }
            }

            if(type == "channel.channel_points_custom_reward_redemption.add"){

                if(event.status == "fulfilled"){
                    for(let e in events){
                        if(events[e].triggers.redemption.enabled
                            && events[e].triggers.redemption.id == event.reward.id){
                                runCommands(event, e);
                            }
                    }
                }

            }else if(type == "channel.channel_points_custom_reward_redemption.update"){
                if(event.status == "fulfilled"){
                    for(let e in events){
                        if(events[e].triggers.redemption.enabled
                            && events[e].triggers.redemption.id == event.reward.id){
                                runCommands(event, e);
                            }
                    }
                }else{
                    sayInChat(event.user_name+" Sorry, the "+event.reward.title+" is a no go.");
                }
            }

        res.status(200).end();
        });

        app.listen(expressPort);

        console.log("Spooder Web UI is running at", "http://"+config.network.host+":"+expressPort);

        async function getBroadcasterID(){
            if(broadcasterUserID==0){
                await Axios({
                    url: 'https://api.twitch.tv/helix/users?login='+config.broadcaster.username,
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
                    return;
                });
            }
        }

        async function getAppToken(){
            if(appToken == ""){

                var twitchScopes = fs.readFileSync("./twitch_scopes.json",{encoding:'utf8'});
                twitchScopes = JSON.parse(twitchScopes);
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
                            console.log(response);
                            if(typeof response.data.access_token != "undefined"){
                                appToken = response.data.access_token;
                            }
                        }).catch(error=>{
                            console.error(error);
                            return;
                        });
            }
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
                            "callback":eventsubs.callback_url+"/webhooks/callback",
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

        async function getPlugins(){
            try {
              const dir = await fsPromises.opendir(backendDir+'/plugins');
              activePlugins = {};
              for await (const dirent of dir){
                delete require.cache[require.resolve(backendDir+'/plugins/'+dirent.name)];
                activePlugins[dirent.name] = new (require(backendDir+'/plugins/'+dirent.name))();
                if(fs.existsSync(backendDir+"/plugins/"+dirent.name+"/settings.json")){
                    activePlugins[dirent.name].settings = JSON.parse(fs.readFileSync(backendDir+"/plugins/"+dirent.name+"/settings.json",{encoding:'utf8'}));
                }
              }
            } catch (err) {
              console.error(err);
            }
            
        }
        getPlugins();
    }
    

    onLogin = null;

    crypto = require("crypto");
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

    onAuthenticationFailure = async() =>{
        let clientId = oauth["client-id"]
        let clientSecret = oauth["client-secret"];
		var refreshParams = "?client_id="+clientId+
			"&client_secret="+clientSecret+
			"&grant_type=refresh_token"+
			"&refresh_token="+refreshToken;
			
			console.log("Refreshing Token...");
		await Axios.post('https://id.twitch.tv/oauth2/token'+refreshParams)
				.then((response)=>{
					
					if(typeof response.data.access_token != "undefined"){
						token = response.data.access_token;
						oauth.token = token;
						console.log("TOKEN REFRESHED");
						fs.writeFile(backendDir+"/settings/oauth.json", JSON.stringify(oauth), "utf-8", (err, data)=>{
							console.log("oauth saved!");
						});
						this.autoLogin();
					}
				}).catch(error=>{
					console.error(error);
					return;
				});
		
	};

	onBroadcasterAuthFailure = async() =>{
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
						
						console.log("TOKEN REFRESHED");
						fs.writeFile(backendDir+"/settings/oauth.json", JSON.stringify(oauth), "utf-8", (err, data)=>{
							console.log("oauth saved!");
						});
						this.validateBroadcaster();
					}
				}).catch(error=>{
					console.error(error);
					return;
				});
		
	};

	async autoLogin(){

        
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
        }).catch(error=>{
            console.error("ERROR",error);
            if(error.response.status == 401){
                this.onAuthenticationFailure();
            }
        });
	}

	async validateBroadcaster(){
		
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
			if(error.response.status == 401){
				this.onBroadcasterAuthFailure();
			}
			
			return;
		});
	}
}

module.exports = WebUI;