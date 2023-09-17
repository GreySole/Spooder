const fs = require("fs");
const WebUI = require("./WebUI");
const Twitch = require("./Twitch");
const Discord = require("./Discord");
const YouTube = require("./YouTube");

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

class Initializer{

    constructor(){

        this.webUI = new WebUI();

        sconfig.network = {host_port:3000};

        this.webUI.startServer(true);

        this.twitch = new Twitch(this.webUI.router, this.webUI.publicRouter);
        this.youtube = new YouTube(this.webUI.router, this.webUI.publicRouter);
        this.discord = new Discord(this.webUI.router);

        this.webUI.router.get("/init", async (req, res) => {
            sconfig = fs.existsSync(backendDir+"/settings/config.json")?JSON.parse(fs.readFileSync(backendDir+"/settings/config.json")):null;
            themes = fs.existsSync(backendDir+"/settings/themes.json")?JSON.parse(fs.readFileSync(backendDir+"/settings/themes.json")):null;
            let twitchBotUser = null;
            let twitchBroadcasterUser = null;
            let discordUser = null;
            if(this.twitch.oauth?.["token"] != null){
                if(this.twitch.loggedIn == false){
                    await this.twitch.autoLogin();
                }
            }
            if(this.twitch.loggedIn == true){
                twitchBotUser = await this.twitch.getUserInfo(this.twitch.botUsername);
                twitchBroadcasterUser = await this.twitch.getUserInfo(this.twitch.homeChannel);
            }

            /*if(this.youtube.oauth?.["token"] != null){
                if(this.youtube.loggedIn == false){
                    await this.youtube.autoLogin();
                }
            }

            if(this.youtube.loggedIn == true){

            }*/

            if(this.discord.config?.["token"] != null){
                if(this.discord.loggedIn == false){
                    await this.discord.autoLogin();
                }
            }
            if(this.discord.loggedIn == true){
                let masterUser = await this.discord.findUser(this.discord.config.master);
                discordUser = {
                    botUser:{username:this.discord.client.user.username, profilepic:this.discord.client.user.displayAvatarURL()},
                    master:{username:masterUser.username, profilepic:masterUser.displayAvatarURL()}
                }
            }
            
            res.send({
                config:sconfig,
                nets:results,
                twitch:this.twitch.oauth ?? {},
                twitch_user:{botUser:twitchBotUser, broadcasterUser:twitchBroadcasterUser},
                discord:this.discord.config ?? {},
                discord_user:discordUser,
                themes:themes
            })
        })

        this.webUI.router.post("/save_twitch", async(req, res) => {
            let newTwitch = req.body;
            console.log("OAUTH",req.body);
            this.twitch.oauth = newTwitch;
            fs.writeFileSync(backendDir+"/settings/twitch.json", JSON.stringify(newTwitch));
            res.send({status:"ok"});
        })

        this.webUI.router.post("/save_config", async (req, res) => {
            
            let newSettings = req.body;
            var newMod = {
                "trusted_users": {},
                "trusted_users_pw": {}
            }

            var newThemes = req.body.themes;
            global.sconfig = newSettings;
            fs.writeFileSync(backendDir+"/settings/config.json", JSON.stringify(newSettings))
            res.send({status:"ok"});
        });

        console.log("Init UI ready! You must open this on localhost to set up Twitch.", "http://localhost:"+sconfig.network.host_port);
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