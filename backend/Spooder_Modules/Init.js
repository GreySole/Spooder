const fs = require("fs");

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

/*const express = require('express');
const bodyParser = require("body-parser");
const AdmZip = require('adm-zip');
const fileUpload = require('express-fileupload');*/

class Initializer{

    constructor(){
        this.beginInit();

        /*var app = new express();
        var router = express.Router();
        expressPort = 3000;
        app.use("/",router);
        if(devMode === false){
            router.use("/", express.static(frontendDir+'/init/build'));
        }
        router.use(bodyParser.urlencoded({extended:true}));
        router.use(bodyParser.json());
        router.use("/upload_settings", fileUpload());
        router.use("/upload_plugins", fileUpload());

        router.get("/save_auth_to_broadcaster", async(req, res) => {
            oauth["broadcaster_token"] = token;
            oauth["broadcaster_refreshToken"] = refreshToken;
            fs.writeFile(backendDir+"/settings/oauth.json", JSON.stringify(oauth), "utf-8", (err, data)=>{
                console.log("oauth saved!");
                res.send({status:"SUCCESS"});
            });
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
            refreshFiles();
            res.send({status:"SUCCESS",name:sconfig.bot.bot_name});
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

        router.post("/save_all", async (req, res) => {
            let newSettings = req.body;
            var newMod = {
                "trusted_users": {},
                "trusted_users_pw": {}
            }

            var newThemes = {
                webui:{},
                "spooderpet": {
                    "bigeyeleft": "o",
                    "bigeyeright": "o",
                    "littleeyeleft": "\u00ba",
                    "littleeyeright": "\u00ba",
                    "fangleft": " ",
                    "fangright": " ",
                    "mouth": "\u03c9",
                    "colors": {
                        "bigeyeleft": "white",
                        "bigeyeright": "white",
                        "littleeyeleft": "white",
                        "littleeyeright": "white",
                        "fangleft": "white",
                        "fangright": "white",
                        "mouth": "white"
                    }
                },
                modui:{}
            }
            fs.writeFile(backendDir+"/settings/oauth.json", JSON.stringify(newSettings.oauth), "utf-8", (err, data)=>{
                fs.writeFile(backendDir+"/settings/config.json", JSON.stringify(newSettings.config), "utf-8", (err, data)=>{
                    fs.writeFile(backendDir+"/settings/osc-tunnels.json", "{}", "utf-8", (err, data)=>{
                        fs.writeFile(backendDir+"/settings/mod-blacklist.json", "{}", "utf-8", (err, data)=>{
                            fs.writeFile(backendDir+"/settings/eventsub.json", "{}", "utf-8", (err, data)=>{
                                fs.writeFile(backendDir+"/settings/commands.json", "{}", "utf-8", (err, data)=>{
                                    fs.writeFile(backendDir+"/settings/mod.json", JSON.stringify(newMod), "utf-8", (err, data)=>{
                                        fs.writeFile(backendDir+"/settings/themes.json", JSON.stringify(newThemes), "utf-8", (err, data)=>{
                                    
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        })

        app.listen(expressPort);

        console.log("Open your browser and go to", "http://localhost:"+expressPort);*/
    }

    beginInit(){
        const readline = require("readline").createInterface({
            input: process.stdin,
            output: process.stdout
        });
        let artStr = String.raw`
        / / _ \ \
        \_\(_)/_/
         _//"\\_ 
          /   \
        `;
        console.log("Hi there!\n"+artStr+"\n"+"Let's get your Spooder set up!\n");
        var initData = {};
    
        console.log("We'll need some app credentials for the Twitch API. You'll need to set up your developer console at dev.twitch.tv to make app access credentials. Once that's done, enter them here. If you want to run Spooder without Twitch features, or fill them in later, you can leave these blank. Initializing overwrites most of the settings files.");
        
        readline.question("Client ID: ", cid => {
            initData.clientId = cid;
            
            readline.question("Client Secret: ", cs => {
                initData.clientSecret = cs;
                console.log("Here are the network interfaces found on this device", results);
                console.log("I suggest using this one: ", suggestedNet);
                readline.question("IP Address for OSC/Web hosting (Usually 192.168.*.*): ", ip => {
                    initData.hostIP = ip;
    
                    readline.question("What's your Spooder's name?: ", name => {
                        
                        initData.sName = name;
                        
                        readline.question(`What should the help command be? Could be !${initData.sName} or just !help: `, helpCmd => {
                            if(helpCmd.startsWith("!")){
                                initData.helpCmd = helpCmd.substring(1);
                            }else{
                                initData.helpCmd = helpCmd;
                            }
    
                            readline.question("What's your broadcaster username?: ", name => {
                                initData.bName = name;
                                var newAuth = {
                                    "client-id":initData.clientId,
                                    "client-secret":initData.clientSecret
                                };
                                
                                var newConfig = {
                                    "bot":{
                                        "sectionname":"Bot Settings",
                                        "bot_name":initData.sName,
                                        "help_command":initData.helpCmd,
                                        "introduction":"I'm a Spooder connected to the stream ^_^"
                                    },
                                    "broadcaster":{
                                        "sectionname":"Broadcaster",
                                        "username":initData.bName
                                    },"network":{
                                        "sectionname":"Network",
                                        "host":initData.hostIP,
                                        "host_port":3000,
                                        "externalhandle":"ngrok",
                                        "ngrokauthtoken":"",
                                        "external_http_url":"",
                                        "external_tcp_url":"",
                                        "udp_clients":{},
                                        "osc_udp_port":9000,
                                        "osc_tcp_port":3333
                                    }
                                };

                                var newMod = {
                                    "trusted_users": {},
                                    "trusted_users_pw": {}
                                }

                                var newThemes = {
                                    webui:{},
                                    "spooderpet": {
                                        "bigeyeleft": "o",
                                        "bigeyeright": "o",
                                        "littleeyeleft": "\u00ba",
                                        "littleeyeright": "\u00ba",
                                        "fangleft": " ",
                                        "fangright": " ",
                                        "mouth": "\u03c9",
                                        "colors": {
                                            "bigeyeleft": "white",
                                            "bigeyeright": "white",
                                            "littleeyeleft": "white",
                                            "littleeyeright": "white",
                                            "fangleft": "white",
                                            "fangright": "white",
                                            "mouth": "white"
                                        }
                                    },
                                    modui:{}
                                }
                                
                                fs.writeFile(backendDir+"/settings/oauth.json", JSON.stringify(newAuth), "utf-8", (err, data)=>{
                                    fs.writeFile(backendDir+"/settings/config.json", JSON.stringify(newConfig), "utf-8", (err, data)=>{
                                        fs.writeFile(backendDir+"/settings/osc-tunnels.json", "{}", "utf-8", (err, data)=>{
                                            fs.writeFile(backendDir+"/settings/mod-blacklist.json", "{}", "utf-8", (err, data)=>{
                                                fs.writeFile(backendDir+"/settings/eventsub.json", "{}", "utf-8", (err, data)=>{
                                                    fs.writeFile(backendDir+"/settings/commands.json", JSON.stringify({events:{},groups:[]}), "utf-8", (err, data)=>{
                                                        fs.writeFile(backendDir+"/settings/mod.json", JSON.stringify(newMod), "utf-8", (err, data)=>{
                                                            fs.writeFile(backendDir+"/settings/themes.json", JSON.stringify(newThemes), "utf-8", (err, data)=>{
                                                        
                                                            });
                                                        });
                                                    });
                                                });
                                            });
                                        });
                                    });
                                });
                                
                                readline.question("\nGreat! That's all the config essentials. Just one more thing. Close this process and call \n'npm run start' to start your Spooder. Then go to localhost:"+initData.hostIP+" in your browser. Click on the nav bar up top and authorize your Twitch account for chat. Then go to the EventSub tab to save your oauth as broadcaster to link channel point rewards to events.", name => {readline.close();});
                            });
                        });
                    });
                });
            });
        });
    }
}

module.exports = Initializer;