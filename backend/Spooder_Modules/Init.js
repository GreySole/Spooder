const fs = require("fs");
const WebUI = require("./WebUI");
const Twitch = require("./Twitch");
const Discord = require("./Discord");
const YouTube = require("./YouTube");

const { networkInterfaces } = require('os');

const nets = networkInterfaces();

class Initializer{

    constructor(){
        console.log("HELLO MOTO");
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

            const results = Object.create(null); // Or just '{}', an empty object

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
                    }
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
            console.log(newSettings);

            global.sconfig = newSettings;
            fs.writeFileSync(backendDir+"/settings/config.json", JSON.stringify(newSettings))
            res.send({status:"ok"});
        });

        this.webUI.router.post("/save_themes", async (req, res) => {
            let newSettings = req.body;
            global.themes = newSettings;
            fs.writeFileSync(backendDir+"/settings/themes.json", JSON.stringify(newSettings))
            res.send({status:"ok"});
        });

        console.log("Init UI ready! You must open this on localhost to set up Twitch.", "http://localhost:"+sconfig.network.host_port);
    }
}

module.exports = Initializer;