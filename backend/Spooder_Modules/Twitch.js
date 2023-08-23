const Axios = require("axios");
const { OAuth2Routes } = require("discord.js");
const fs = require("fs");
<<<<<<< Updated upstream

const clientId = oauth['client-id'];
const clientSecret = oauth['client-secret'];

global.username = "";
global.channel = null;
global.broadcasterUserID = 0;

global.token = "";
global.refreshToken = "";

if(oauth.token != null && oauth.token != ""){
    token = oauth.token;
}

if(oauth.refreshToken != null && oauth.refreshToken != ""){
    refreshToken = oauth.refreshToken;
}

//For Event Subs
global.appToken = "";

=======
>>>>>>> Stashed changes
const tmi = require("tmi.js");

var twitchLog = (...content) => {
    console.log(logEffects("Bright"),logEffects("FgMagenta"), ...content, logEffects("Reset"));
}

<<<<<<< Updated upstream
function sayAlreadyOn(name){
    for(let c in activeEvents[name]){
        if(activeEvents[name][c].etype == "event"){
            sayInChat(events[name].name+" is cooling down. Time Left: "+Math.abs(Math.floor(uptime-activeEvents[name][c]["timeout"]))+"s");
            break;
        }
    }
}

//We switched to tmi.js but we're reforming the message data to reflect its fork, twitch-js.
//I was going to rewrite the overlays to work with tmi, but I think twitch-js has a better obj structure.
//Why switch to tmi.js? Well, I felt tmi was more stable and better maintained than twitch-js. Not sure if I'm right...but it felt right.
function twitchjsify(channel, tags, txt){
    let message = {
        channel:channel,
        username:tags.username,
        displayName:tags["display-name"],
        tags:tags,
        message:txt
    };

    let emotes = tags.emotes;
    let newEmotes = [];
    for(let e in emotes){
        for(let ei in emotes[e]){
            newEmotes.push({
                id:e,
                start:parseInt(emotes[e][ei].split("-")[0]),
                end: parseInt(emotes[e][ei].split("-")[1])
            });
        }
        
    }
    if(message.tags.badges == null){message.tags.badges = {};}
    message.tags.emotes = newEmotes;
    return message;
}

function processMessage(channel, tags, txt, self){
    let message = twitchjsify(channel, tags, txt);
    message.tags.displayName = message.displayName;
    if(typeof message.message == "undefined"){return;}
    
    if(message.message.startsWith("!")){
        if(modlocks.spamguard == 1){
            if(checkForSpamming(message.username) == true){
                return;
            }
        }
        
        let command = message.message.substr(1).split(" ");

        if(command[0] == "stop" && (chatIsMod(message) || chatIsBroadcaster(message))){
            let cEvent = command[1];
            stopEvent(cEvent);
            return;
        }

        if(command[0] == "mod" && (chatIsMod(message) || chatIsBroadcaster(message))){
            let modCommand = command[1];
            if(modCommand == "spamguard"){
                setSpamGuard(command[2]);
            }else if(modCommand == "lock" || modCommand == "unlock"){
                let eventtarget = command[2];
                let plugin = command[2];
                let target = command.length>=4?command[3]:null;
                if(lockEvent(message.username, modCommand, eventtarget) == true && eventtarget != "all"){return;}
                if(lockPlugin(message.username, modCommand, plugin, target) == true && plugin != "all"){return;}
                if(command[2] == "all"){
                    lockEvent(message.username, modCommand, eventtarget);
                    lockPlugin(message.username, modCommand, plugin, target);
                    sayInChat(message.username+" "+(modCommand=="lock"?"locked":"unlocked")+" all chat commands");
                }
            }else if(modCommand == "blacklist"){
                let modAction = command[2];
                let viewer = command[3];
                if(modAction == "add"){
                    modlocks.blacklist[viewer] == 1;
                    sayInChat(message.username+" blacklisted "+viewer);
                    sendToTCP("/mod/"+message.username+"/blacklist"+viewer, 1);
                }else if(modAction == "remove"){
                    modlocks.blacklist[viewer] == 0;
                    sayInChat(message.username+" unblacklisted "+viewer);
                    sendToTCP("/mod/"+message.username+"/blacklist"+viewer, 0);
                }
                fs.writeFile(backendDir+"/settings/mod-blacklist.json", JSON.stringify(modlocks.blacklist), "utf-8", (err, data)=>{
                    twitchLog("Mod file saved!");
                });
            }else if(modCommand == "trust" && chatIsBroadcaster(message)){
                if(command.length>2){
                    let trustedUser = command[2].startsWith("@")?command[2].substring(1).trim():command[2].trim();
                    modData["trusted_users"][trustedUser] = "m";
                    fs.writeFile(backendDir+"/settings/mod.json", JSON.stringify(modData), "utf-8", (err, data)=>{
                        twitchLog("Mod file saved!");
                        sayInChat(trustedUser+" has been added as a trustworthy user for the Mod UI!");
                    });
                }else{
                    sayInChat("Trust a user to interact with the Mod UI");
                }
            }else if(modCommand == "verify"){
                if(activeMods[message.username]?.startsWith("pending")){
                    activeMods[message.username] = "active";
                    fs.writeFile(backendDir+"/settings/mod.json", JSON.stringify(modData), "utf-8", (err, data)=>{
                        twitchLog("Mod file saved!");
                        sayInChat(message.username+" you're all set! Refresh the Mod UI to gain access.");
                    });
                }else{
                    sayInChat(message.username+" you're not waiting for Mod UI verification. Access the Mod UI to start authorizing your device.")
                }
                
            }
        }

        if(command[0] == "commands"){
            let commandsArray = getChatCommands();
            sayInChat("Here's the chat command list: "+commandsArray.join(", "));
            return;
        }

        if(command[0] == "plugins"){
            if(command.length == 1){
                let pluginList = Object.keys(activePlugins);
                sayInChat("Use this command like !plugins [plugin-name] [plugin-command] to get info on an active plugin. Plugin names are: "+pluginList.join(", "));
                return;
            }else{
                if(command[1] == p && command.length == 2){
                    let commandList = Object.keys(activePlugins[p].commandList);
                    sayInChat("Commands for "+p+" are: "+commandList.join((", ")));
                    return;
                }else if(command[1] == p){
                    if(activePlugins[p].commandList[command[2]] != null){
                        sayInChat(activePlugins[p].commandList[command[2]]);
                        return;
                    }
                }
            }
            
        }
        
        if(command[0] == sconfig.bot.help_command){
            if(command.length>1){
                let commands = [];
                let done = false;

                if(command[1] == "help"){
                    sayInChat("Pass a command type like '!"+sconfig.bot.help_command+" event' to show the commands for that type. You can also pass a command like '!"+sconfig.bot.help_command+" event command' to get a description of what that command does. Active plugins are: ["+stringifyArray(Object.keys(activePlugins))+"]");
                    return;
                }

                
                if(command[1] == "event" || command[1] == "events"){
                    for(let e in events){
                        if(command.length == 2){
                            commands.push(e);
                        }else{
                            if(command[2] == e){
                                sayInChat(events[e].name+" | Chat command: "+
                                (events[e].triggers.chat.enabled?events[e].triggers.chat.command:" No chat command")+
                                " | Reward: "+
                                (events[e].triggers.redemption.enabled?"It has a channel point reward":"No channel point reward")+
                                " | OSC: "+
                                (events[e].triggers.osc.enabled?"Triggered by OSC":"No OSC Trigger")+
                                " | Description: "+
                                events[e].description);
                                done = true;
                            }
                        }
                    }
                }

                if(command[1] == "plugin" || command[1] == "plugins"){
                    for(let p in activePlugins){
                        
                        if(command.length == 2){
                            commands.push(p);
                        }else{
                            if(command[2] == p && command.length == 3){
                                commands = Object.keys(activePlugins[p].commandList);
                            }else if(command[2] == p){
                                if(activePlugins[p].commandList[command[3]] != null){
                                    sayInChat(activePlugins[p].commandList[command[3]]);
                                    done = true;
                                }
                            }
                        }
                    }
                }
                if(commands.length == 0 && done == false){
                    sayInChat("I'm not sure what "+command[1]+" is (^_^;)");
                }else if(done == false){
                    
                    sayInChat(command[1]+" are: "+stringifyArray(commands));
                }
                
            }else{
                sayInChat("Hi, I'm "+sconfig.bot.bot_name+". "+sconfig.bot.introduction);
            }
        }
    }

    for(let e in events){
        if(modlocks.events[e] == 1){continue;}
        if(events[e].triggers.chat.enabled && self == false){
            if(events[e].triggers.chat.search){
                let commandSplit = events[e].triggers.chat.command.split(" ");
                let commandMatch = new Array(commandSplit.length).fill(false);
                let messageSplit = message.message.split(" ");
                let matchIndex = 0;
                for(let m in messageSplit){
                    if(commandSplit[matchIndex] == "*"){commandMatch[matchIndex] = messageSplit[m];}
                    if(commandSplit[matchIndex].includes("|")){
                        let cSplitOR = commandSplit[matchIndex].split("|");
                        for(let c in cSplitOR){
                            if(cSplitOR[c].toLowerCase() == messageSplit[m].toLowerCase()){commandMatch[matchIndex] = messageSplit[m]; break;}
                        }
                    }
                    if(commandSplit[matchIndex].toLowerCase() == messageSplit[m].toLowerCase()){commandMatch[matchIndex] = messageSplit[m];}
                    
                    if(commandMatch[matchIndex] != false){
                        matchIndex++;
                        if(matchIndex == commandMatch.length){
                            twitchLog(commandMatch);
                            break;
                        }
                    }else{
                        matchIndex = 0;
                        commandMatch = new Array(commandSplit.length).fill(false);
                    }
                    
                }
                
                if(matchIndex == commandMatch.length){
                    if(runCommands(message, e, commandMatch) == "alreadyon"){
                        sayAlreadyOn(e);
                    }
                }
            }else{
                if(message.message.toLowerCase().startsWith(events[e].triggers.chat.command)){
                    if(runCommands(message, e) == "alreadyon"){
                        sayAlreadyOn(e);
                    }

                }
            }
        }
    }
    
    for(p in activePlugins){
        if(modlocks.plugins[p] != 1){
            activePlugins[p].onChat(message);
        }
    }
}

function checkForSpamming(viewername){
		
    if(modlocks.blacklist[viewername] == null){
        modlocks.blacklist[viewername] = {
            active:0,
            timeout:null,
            commandCount:1,
            lastCommand:Date.now()
        };
        return false;
    }

    if(modlocks.blacklist[viewername].active == 1){
        if(Date.now() >= modlocks.blacklist[viewername].timeout){
            modlocks.blacklist[viewername].active = 0;
            modlocks.blacklist[viewername].commandCount = 1;
        }else{
            return true;
        }
    }

    if(Date.now()-modlocks.blacklist[viewername].lastCommand <= 2000){
        modlocks.blacklist[viewername].commandCount++;
    }else{
        modlocks.blacklist[viewername].commandCount = 1;
    }
    modlocks.blacklist[viewername].lastCommand = Date.now();
    if(modlocks.blacklist[viewername].commandCount >= 6){
        sayInChat("Hey, cut that out "+viewername+", you're on cooldown for a minute.");
        modlocks.blacklist[viewername].active = 1;
        modlocks.blacklist[viewername].timeout = Date.now()+60000;
        return true;
    }
    
    return false;
}

function processCheer(channel, userstate, message){
    twitchLog("CHEER", userstate);
}

const runChat = async(startCase) => {
    twitchLog("Running chat...");
    if(chat != null){
        if(chat.readyState() == "OPEN" || chat.readyState() == "CONNECTING"){
            await chat.disconnect();
        }
        chat.off("message", processMessage);
        chat.off("cheer", processCheer);
        chat.off("connectFailed", onAuthenticationFailure);
        chat.off("disconnect", restartChat);
    }

    chat = new tmi.Client({
        options:{debug:true},
        identity:{
            username:username,
            password:token
        }
    });
    
    await chat.connect().catch(error=>{console.error(error); onAuthenticationFailure();});
    chat.join(channel).then(()=>{
        if(startCase == "restart"){
            sayInChat("Chat restarted, I'm back :D");
        }else if(startCase == "reconnect"){
            sayInChat("Stream reconnected. I'm okay :)");
        }else if(startCase == "disconnected"){
            sayInChat("Stream disconnected. Hold on a sec...");
        }else if(startCase != null){
            sayInChat(startCase);
        }
    }).catch(error=>{console.error(error)});

    
    chat.on("message", processMessage);
    chat.on("cheer", processCheer);
    chat.on("connectFailed", onAuthenticationFailure);
    chat.on("disconnect", restartChat);
    upInterval = setInterval(runInterval, 1000);
};

function getChatCommands(){
    let commandsArray = [];
    for(let e in events){
        if(events[e].triggers.chat.enabled == true){
            if(events[e].triggers.chat.command.startsWith("!")){
                commandsArray.push(events[e].triggers.chat.command);
            }
        }
    }
    return commandsArray;
}

=======
>>>>>>> Stashed changes
function stringifyArray(a){
    return a.join(", ");
}

class STwitch{
    constructor(router){
        let expressPort = sconfig.network.host_port;
<<<<<<< Updated upstream
        router.get('/handle', async (req,res)=>{
=======
        if(fs.existsSync(backendDir+"/settings/twitch.json")){
            try{
                this.oauth = JSON.parse(fs.readFileSync(backendDir+"/settings/twitch.json"));
            }catch(e){
                twitchLog("FAILED TO READ OAUTH FILE");
                this.oauth = {};
            }
        }
        router.get('/twitch/authorize', async (req,res)=>{
>>>>>>> Stashed changes
            twitchLog("Got code");
            let code = req.query.code;
            var twitchParams = "?client_id="+this.oauth['client-id']+
                "&client_secret="+this.oauth['client-secret']+
                "&grant_type=authorization_code"+
<<<<<<< Updated upstream
                "&code="+token+
                "&redirect_uri=http://localhost:"+expressPort+"/handle"+
=======
                "&code="+code+
                "&redirect_uri=http://localhost:"+expressPort+"/twitch/authorize"+
>>>>>>> Stashed changes
                "&response_type=code";
                
                
            Axios.post('https://id.twitch.tv/oauth2/token'+twitchParams)
            .then((response)=>{
<<<<<<< Updated upstream
                
                username = response.data.login;
=======
                twitchLog("Got token");
                if(typeof response.data.access_token != "undefined"){
                    let token = response.data.access_token;
                    let refreshToken = response.data.refresh_token;
                    this.oauth.token = token;
                    this.oauth.refreshToken = refreshToken;
                    if(this.oauth["broadcaster_token"] == null){
                        this.oauth["broadcaster_token"] = this.oauth.token;
                        this.oauth["broadcaster_refreshToken"] = this.oauth.refreshToken;
                    }
                    fs.writeFile(backendDir+"/settings/twitch.json", JSON.stringify(this.oauth), "utf-8", async (err, data)=>{
                        twitchLog("oauth saved!");
                        await this.autoLogin();
                        res.redirect("http://localhost:"+expressPort+"?twitchauthsuccess=true");
                    });
                }
>>>>>>> Stashed changes
            }).catch(error=>{
                console.error(error);
                res.send({status:"error", error:error});
                return;
            });
            
        });

<<<<<<< Updated upstream
        router.get("/revoke", async(req, res) => {
            let cid = clientId;
=======
        router.get("/twitch/revoke", async(req, res) => {
            let cid = this.oauth['client-id'];
>>>>>>> Stashed changes
            let revokeBroadcaster = req.query.broadcaster == true;
            let revokeToken = this.oauth.token;
            if(revokeBroadcaster){
                revokeToken = this.oauth.broadcaster_token;
            }else{
                revokeToken = this.oauth.token;
            }
            twitchLog("Revoking: "+cid);
            await Axios({
                url: 'https://id.twitch.tv/oauth2/revoke?client_id='+cid+"&token="+revokeToken,
                method: 'POST',
                headers:{
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            })
            .then((response)=>{

                if(this.oauth.broadcaster_token == this.oauth.token){
                    this.oauth.broadcaster_token = "";
                    this.oauth.broadcaster_refreshToken = "";
                    this.oauth.token = "";
                    this.oauth.refreshToken = "";
                    twitchLog("Main token matches broadcaster, both oauth revoked");
                    res.send({status:"Main token matches broadcaster, both oauth revoked"});
                }else{
                    if(revokeBroadcaster){
                        this.oauth.broadcaster_token = "";
                        this.oauth.broadcaster_refreshToken = "";
                        twitchLog("Broadcaster oauth revoked, main token preserved");
                        res.send({status:"Broadcaster oauth revoked, main token preserved"});
                    }else{
                        this.oauth.token = "";
                        this.oauth.refreshToken = "";
                        twitchLog("Broadcaster oauth preserved");
                        res.send({status:"Main token revoked, broadcaster oauth preserved"});
                    }
                    
                }
                
                fs.writeFile(backendDir+"/settings/twitch.json", JSON.stringify(this.oauth), "utf-8", (err, data)=>{
                    twitchLog("oauth saved!");
                });

            }).catch(error=>{
                console.error(error);
                return;
            });
        });

<<<<<<< Updated upstream
        router.get("/save_auth_to_broadcaster", async(req, res) => {
            oauth["broadcaster_token"] = token;
            oauth["broadcaster_refreshToken"] = refreshToken;
            fs.writeFile(backendDir+"/settings/oauth.json", JSON.stringify(oauth), "utf-8", (err, data)=>{
=======
        router.get("/twitch/save_auth_to_broadcaster", async(req, res) => {
            this.oauth["broadcaster_token"] = this.oauth.token;
            this.oauth["broadcaster_refreshToken"] = this.oauth.refreshToken;
            fs.writeFile(backendDir+"/settings/twitch.json", JSON.stringify(this.oauth), "utf-8", (err, data)=>{
>>>>>>> Stashed changes
                twitchLog("oauth saved!");
                res.send({status:"SUCCESS"});
            });
        });

        router.post("/saveEventSubs", async(req, res) => {
            delete req.body.callback_url;
            fs.writeFile(backendDir+"/settings/eventsub.json", JSON.stringify(req.body), "utf-8", (err, data)=>{
                eventsubs = req.body;
                res.send({status:"SAVE SUCCESS"});
            });
        })

        router.get("/eventsubs", async(req, res) => {
            let sendSubs = Object.assign(eventsubs);
            sendSubs.callback_url = sconfig.network.external_http_url;
            sendSubs.spooderevents = Object.keys(events);
            res.send(JSON.stringify(sendSubs));
        });

<<<<<<< Updated upstream
        router.get("/get_eventsub", async(req,res) => {
            await getAppToken();
            if(appToken ==""){
=======
        router.get("/twitch/get_eventsubs", async(req,res) => {
            await this.getAppToken();
            if(this.appToken ==""){
>>>>>>> Stashed changes
                twitchLog("NO APP TOKEN");
                return;
            }
            await Axios({
                url: 'https://api.twitch.tv/helix/eventsub/subscriptions',
                method: 'GET',
                headers:{
                    "Client-Id": this.oauth["client-id"],
                    "Authorization": " Bearer "+this.appToken,
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

<<<<<<< Updated upstream
        router.get("/get_channelpoint_rewards", async(req, res) => {
            if(oauth.broadcaster_token=="" || oauth.broadcaster_token == null){
=======
        router.get("/twitch/get_channelpoint_rewards", async(req, res) => {
            if(this.oauth.broadcaster_token=="" || this.oauth.broadcaster_token == null){
>>>>>>> Stashed changes
                res.send({status:"NO BROADCASTER TOKEN"});
                return;
            }
            
            await this.getBroadcasterID();
            await this.validateBroadcaster();

            if(this.broadcasterUserID == 0){
                res.send({status:"NO BROADCASTER USER ID"});
                return;
            }

            await Axios({
                url: 'https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id='+this.broadcasterUserID,
                method: 'GET',
                headers:{
                    "Client-Id": this.oauth["client-id"],
                    "Authorization": " Bearer "+this.oauth.broadcaster_token,
                    "Content-Type": "application/json"
                }
            })
            .then((response)=>{
                res.send(JSON.stringify(response.data));
            }).catch(error=>{
                console.error(error);
                this.onBroadcasterAuthFailure();
                return;
            });
        });

        router.get("/delete_eventsub", async(req,res) => {
            
            await Axios({
                url: 'https://api.twitch.tv/helix/eventsub/subscriptions?id='+req.query.id,
                method: 'DELETE',
                headers:{
                    "Client-Id": this.oauth["client-id"],
                    "Authorization": " Bearer "+this.appToken,
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

<<<<<<< Updated upstream
        router.get("/init_followsub", async(req,res) => {
            let subStatus = await initEventSub(req.query.type);
=======
        router.get("/twitch/init_eventsub", async(req,res) => {
            
            let subStatus = await this.initEventSub(req.query.type, req.query.user_id);
>>>>>>> Stashed changes
            
            res.send(JSON.stringify({status:subStatus}));
        });

<<<<<<< Updated upstream
        router.get("/chat_channel", async(req,res) => {
=======
        router.get("/twitch/get_eventsubs_by_user", async(req,res) => {
            let twitchid = req.query.twitchid;
            
            if(twitchid == null){
                twitchid = this.broadcasterUserID;
            }
            
            await this.getAppToken();
            if(this.appToken ==""){
                twitchLog("NO APP TOKEN");
                return;
            }
            await Axios({
                url: 'https://api.twitch.tv/helix/eventsub/subscriptions?user_id='+twitchid,
                method: 'GET',
                headers:{
                    "Client-Id": this.oauth["client-id"],
                    "Authorization": " Bearer "+this.appToken,
                    "Content-Type": "application/json"
                }
            })
            .then((response)=>{
                
                res.send(JSON.stringify(response.data));
            }).catch(error=>{
                console.error(error);

                return;
            });
        })

        /*router.get("/twitch/chat_channel", async(req,res) => {
>>>>>>> Stashed changes
            let channel = req.query.channel;
            let leaveMessage = req.query.leavemessage;
            let joinMessage = req.query.joinmessage;
            this.chatSwitchChannels(channel, leaveMessage, joinMessage);
            res.send(JSON.stringify({status:"SUCCESS"}));
        });*/

<<<<<<< Updated upstream
        router.get("/chat_restart", async(req, res) => {
            restartChat("restart");
=======
        router.get("/twitch/chat_restart", async(req, res) => {
            this.restartChat("restart");
>>>>>>> Stashed changes
            res.send(JSON.stringify({status:"SUCCESS"}));
        });

        router.get("/mod/currentviewers", async(req,res) => {
            
            await Axios({
<<<<<<< Updated upstream
                url: "https://tmi.twitch.tv/group/user/"+channel.substr(1)+"/chatters",
=======
                url: "https://tmi.twitch.tv/group/user/"+this.homeChannel.substr(1)+"/chatters",
>>>>>>> Stashed changes
                method: 'get',
            })
            .then((response)=>{
                
                res.send(JSON.stringify(response.data));
                
            }).catch(error=>{
                console.error("ERROR",error);
            });
            
        });

        //HTTPS ROUTER
        router.post("/webhooks/callback", async (req, res) => {
            const messageType = req.header("Twitch-Eventsub-Message-Type");
            if (messageType === "webhook_callback_verification") {
                twitchLog("Verifying Webhook", req.body.subscription.type);
                return res.status(200).send(req.body.challenge);
            }

            const { type } = req.body.subscription;
            const { event } = req.body;

            twitchLog(
                `Receiving ${type} request`,
                event
            );

<<<<<<< Updated upstream
=======
            event.userId = event.user_id;
            event.displayName = event.user_name;

            event.platform = "twitch";
            event.respond = (responseTxt)=>{
                sayInChat(responseTxt, "twitch", this.homeChannel);
            };

            if(event.broadcaster_user_id != this.broadcasterUserID && type != "channel.raid"){
                if(type == "stream.online"){
                    await this.validateChatbot();
                    webUI.setShare(event.broadcaster_user_login, true);
                    if(discord.loggedIn == true){
                        discord.findUser(discord.config.master)
                        .then(user => {
                            let watchButton = discord.makeLinkButton("Watch", "https://twitch.tv/"+event.broadcaster_user_login)
                            user.send({content:event.broadcaster_user_name+" is live. I'm going in!", components:[watchButton]});
                        })
                    }
                    
                }else if(type == "stream.offline"){
                    webUI.setShare(event.broadcaster_user_login, false);
                }
                res.status(200).end();
                return;
            }

>>>>>>> Stashed changes
            if(type == "channel.raid"){
                await this.getBroadcasterID();
                if(event.to_broadcaster_user_id == this.broadcasterUserID){
                    event.raidType = "receive";
                }else if(event.from_broadcaster_user_id == this.broadcasterUserID){
                    event.raidType = "send";
                }
            }

            if(type == "stream.online"){
<<<<<<< Updated upstream
                startReoccuringMessage();
=======
                this.startReoccuringMessage();
                if(eventsubs.events[type].discord?.enabled == true){
                    if(discord.loggedIn == true){
                        let channelInfo = await this.getChannelInfo(this.broadcasterUserID);
                        let onlineMessage = channelInfo[0].broadcaster_name+" is live: "+channelInfo[0].title+"!";
                        let watchButton = discord.makeLinkButton("Watch", "https://twitch.tv/"+this.homeChannel)
                        discord.sendToChannel(eventsubs.events[type].discord.guild, eventsubs.events[type].discord.channel, 
                            {content:onlineMessage, components:[watchButton]})
                    }
                    
                }
>>>>>>> Stashed changes
            }

            if(type == "stream.offline"){
                if(this.streamChatInterval != null){
                    clearInterval(this.streamChatInterval);
                }
            }
            
            if(eventsubs){
                if(eventsubs.events[type]?.chat != null){
                    if(eventsubs.events[type].chat.enabled){

                        try{
							let responseFunct = eval("() => { let event = "+JSON.stringify(event)+"; "+eventsubs.events[type].chat.message.replace(/\n/g, "")+"}");
						
							let response = responseFunct();
							this.sayInChat(response);
						}catch(e){
							twitchLog("Failed to run response script. Check the event settings to verify it.");
						}
                    }
                }

                if(eventsubs.events[type]?.tcp != null){
                    if(eventsubs.events[type].tcp.enabled){
                        
                        if(type == "channel.raid"){
                            await this.getBroadcasterID();
                            
                            if(event.to_broadcaster_user_id == this.broadcasterUserID){
                                event.raidType = "receive";
                            }else if(event.from_broadcaster_user_id == this.broadcasterUserID){
                                event.raidType = "send";
                            }
                            sendToTCP(eventsubs.events[type].tcp.address, JSON.stringify(event));
                        }else{
                            sendToTCP(eventsubs.events[type].tcp.address, JSON.stringify(event));
                        }
                    }
                }

                if(eventsubs.events[type]?.udp != null){
                    if(eventsubs.events[type].udp.enabled){
                        sendToUDP(eventsubs.events[type].udp.dest, eventsubs.events[type].udp.address, eventsubs.events[type].udp.value);
                        setTimeout(()=>{
                            sendToUDP(eventsubs.events[type].udp.dest, eventsubs.events[type].udp.address, eventsubs.events[type].udp.valueoff);
                        }, eventsubs.events[type].udp.duration);
                    }
                }

                if(eventsubs.events[type]?.plugin != null){
                    if(eventsubs.events[type].plugin.enabled){
                        if(activePlugins[eventsubs.events[type].plugin.pluginname] != null){
                            if(typeof activePlugins[eventsubs.events[type].plugin.pluginname].onEvent == "undefined"){
                                twitchLog("NO ONEVENT FUNCTION FOUND ON "+eventsubs.events[type].plugin.pluginname);
                            }else{
                                activePlugins[eventsubs.events[type].plugin.pluginname].onEvent(eventsubs.events[type].plugin.eventname, event);
                            }
                        }
                    }
                }

                if(eventsubs.events[type]?.spooderevent != null){
                    if(eventsubs.events[type].spooderevent.enabled){
                        if(events[eventsubs.events[type].spooderevent.eventname] != null){
                            runCommands(event, eventsubs.events[type].spooderevent.eventname);
                        }
                    }
                }
            }

            if(type == "channel.channel_points_custom_reward_redemption.add"){

                for(let e in events){
                    if(events[e].triggers.redemption.enabled
                        && events[e].triggers.redemption.id == event.reward.id){
                            if(event.status == "fulfilled" || events[e].triggers.redemption.override == true){
                                if(modlocks.events[e] != 1){
                                    runCommands(event, e);
                                }else{
                                    //rejectChannelPointReward(event.reward.id, event.id);
                                    this.sayInChat(event.reward.title+" is locked on my end. Sorry.");
                                    return;
                                }
                            }else if(events[e].triggers.redemption.override == false && modlocks.events[e] == 1){
                                this.sayInChat("MODS! This event is locked on my end. I can't reject it myself because I didn't create it :( please either lift the lock on "+e+" or reject it.")
                            }
                        }
                }

            }else if(type == "channel.channel_points_custom_reward_redemption.update"){

                for(let e in events){
                    if(events[e].triggers.redemption.enabled
                    && events[e].triggers.redemption.id == event.reward.id
                    && events[e].triggers.redemption.override == false){
                        if(event.status == "fulfilled"){
                            if(modlocks.events[e] != 1){
                                runCommands(event, e);
                            }else{
                                //rejectChannelPointReward(event.reward.id, event.id);
                                this.sayInChat(event.reward.title+" is locked on my end. Sorry.");
                                return;
                            }
                        }else{
                            this.sayInChat(event.user_name+" Sorry, the "+event.reward.title+" is a no go.");
                        }
                    }
                }
            }

            res.status(200).end();
        });

<<<<<<< Updated upstream
        isStreamerLive();

        async function isStreamerLive(){
            await getAppToken();

            return new Promise((res, rej) => {
                Axios({
                    url: "https://api.twitch.tv/helix/streams?user_login="+sconfig.broadcaster.username,
                    method: 'GET',
                    headers:{
                        "Authorization": "Bearer "+appToken,
                        "Client-Id":clientId,
                        "user_login":sconfig.broadcaster.username
                    }
                })
                .then((response)=>{
                    twitchLog(response.data.data[0] != null?"STREAMER IS LIVE":"STREAMER IS NOT LIVE");
                    if(response.data.data[0] != null){
                        startReoccuringMessage();
                        res(true);
                    }else{
                        res(false);
                    }
                    
                }).catch(error=>{
                    rej(error);
                });
            })
        }

        function startReoccuringMessage(){
            if(eventsubs.events["stream.online"].chat.enabled && eventsubs.events["stream.online"].chat.reoccuringmessage != "" ){
                let reoccuringInterval = async function(){
                    try{
                        let responseFunct = eval("() => {let count = "+JSON.stringify(reoccuringMessageCount)+"; "+eventsubs.events["stream.online"].chat.reoccuringmessage.replace(/\n/g, "")+"}");
                        let response = await responseFunct();
                        sayInChat(response);
                        reoccuringMessageCount++;
                    }catch(e){
                        sayInChat("Grey, the reoccuring message failed to send :( Check my logs to see what went wrong!");
                        clearInterval(streamChatInterval);
                    }
                    
                };
                let reoccurTime = eventsubs.events["stream.online"].chat.interval;
                if(reoccurTime == null){reoccurTime = 15}

                streamChatInterval = setInterval(reoccuringInterval, reoccurTime*60*1000);
=======
        this.isStreamerLive()
        .then(isLive =>{
            if(isLive == true){
                this.startReoccuringMessage();
>>>>>>> Stashed changes
            }
        });
    }

<<<<<<< Updated upstream
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
                        onAuthenticationFailure();
                    }
                    return;
                });
            }
        }

        async function getAppToken(){
            if(appToken == ""){

                var twitchScopes = [
                    'channel:moderate',
                    'chat:read',
                    'chat:edit', 
                    'whispers:read', 
                    'whispers:edit', 
                    'analytics:read:extensions', 
                    'analytics:read:games', 
                    'bits:read', 
                    'channel:edit:commercial', 
                    'channel:manage:broadcast', 
                    'channel:read:charity', 
                    'channel:manage:extensions', 
                    'channel:manage:moderators', 
                    'channel:manage:polls', 
                    'channel:manage:predictions', 
                    'channel:manage:raids', 
                    'channel:manage:redemptions', 
                    'channel:manage:schedule', 
                    'channel:manage:videos', 
                    'channel:read:editors', 
                    'channel:read:goals', 
                    'channel:read:hype_train', 
                    'channel:read:polls', 
                    'channel:read:predictions', 
                    'channel:read:redemptions', 
                    'channel:read:stream_key', 
                    'channel:read:subscriptions', 
                    'channel:read:vips', 
                    'channel:manage:vips', 
                    'clips:edit', 
                    'moderation:read', 
                    'moderator:manage:announcements', 
                    'moderator:manage:automod',
                    'moderator:read:automod_settings', 
                    'moderator:manage:automod_settings', 
                    'moderator:manage:banned_users', 
                    'moderator:read:blocked_terms',
                    'moderator:manage:chat_messages',
                    'moderator:read:chat_settings',
                    'moderator:manage:chat_settings',
                    'moderator:read:chatters',
                    'moderator:read:shield_mode',
                    'moderator:manage:shield_mode',
                    'user:edit',
                    'user:edit:follows',
                    'user:manage:blocked_users',
                    'user:read:blocked_users',
                    'user:read:broadcast',
                    'user:manage:chat_color',
                    'user:read:email',
                    'user:read:follows',
                    'user:read:subscriptions',
                    'user:manage:whispers'
                   ];
                
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
                twitchLog("No app token found");
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

        this.refreshEventSubs = async() =>{
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

        global.sayInChat = async (message) =>{
            if(message == null || message == ""){
                twitchLog("EMPTY MESSAGE");
                return;
            }
            if(message.length >= 490){
                let limit = 490;
                let totalMessages = Math.ceil(message.length/limit);
                
                for(let stringpos=0; stringpos<message.length; stringpos+=limit){
                    
                    if(stringpos+limit > message.length){
                        await chat.say(channel, "["+totalMessages+"/"+totalMessages+"] "+message.substring(stringpos, message.length));
                    }else{
                        //twitchLog(stringpos, stringpos.limit);
                        await chat.say(channel, "["+(Math.round((stringpos+limit)/limit)+"/"+totalMessages+"] "+message.substring(stringpos, stringpos+limit)));
                    }
                }
            }else{
                await chat.say(channel,message)
                .catch(e=>{
                    twitchLog("CHAT ERROR", e);
                    restartChat(message);
                });
            }
        }
    
        global.chatSwitchChannels = async (newChannel, leaveMessage, joinMessage) => {
            await this.validateChatbot();
            if(leaveMessage != null && leaveMessage != ""){sayInChat(leaveMessage);}
            await chat.disconnect();
            channel = newChannel;
            if(joinMessage != null && joinMessage != ""){
                runChat(joinMessage);
            }else{
                runChat();
            }
=======
    loggedIn = false;

    autoLogin(startChat=true){
        
        return new Promise(async (res, rej)=>{
            if(this.oauth.token == "" || this.oauth.token == null){
                twitchLog("No chat oauth saved. Go into the Web UI, click the top for the navigation menu, then click 'authorize'. You must be on localhost to make auth tokens.");
                rej("notoken");
                return;
            }
            let botStatus = await this.validateChatbot();
>>>>>>> Stashed changes
            
            if(botStatus.status == "newtoken"){
                this.oauth["token"] = botStatus.newtoken;
            }else if(botStatus.status == "error"){
                twitchLog("CHATBOT ERROR", botStatus.error);
                return;
            }
    
<<<<<<< Updated upstream
        global.disconnectChat = () => {
            chat.disconnect();
        }
    
        global.restartChat = async (message) => {
            twitchLog("Restarting Chat");
            await this.validateChatbot();
            runChat(message);
        }
    
        global.chatIsFirstMessage = (message) => {
            return message.tags["first-msg"] == true;
        }
    
        global.chatIsReturningChatter = (message) => {
            return message.tags["returning-chatter"] == true;
        }
    
        global.chatIsMod = (message) => {
            return message.tags.mod == true;
        }
    
        global.chatIsSubscriber = (message) => {
            return message.tags.subscriber == true;
        }
    
        global.chatIsBroadcaster = (message) => {
            return message.tags.badges?.broadcaster == true;
        }
    
        global.getChatters = async (type) => {
            const axios = require("axios");
            let response = await axios.get("https://tmi.twitch.tv/group/user/"+channel.substr(1)+"/chatters");
            let chArray = [];
            if(type == "all"){
                for(let c in response.data.chatters){chArray = chArray.concat(response.data.chatters[c]);}
            }else{
                if(response.data.chatters[type] != null){
                    chArray = response.data.chatters[type];
=======
            if(this.oauth.broadcaster_refreshToken != "" && this.oauth.broadcaster_refreshToken != null){
                let broadcasterStatus = await this.validateBroadcaster();
                if(broadcasterStatus.status == "newtoken"){
                    this.oauth["broadcaster_token"] = broadcasterStatus.newtoken;
                }else if(broadcasterStatus.status == "error"){
                    twitchLog("BROADCASTER ERROR", broadcasterStatus.error);
                    return;
>>>>>>> Stashed changes
                }
            }

            await this.getBotID();
            await this.getBroadcasterID();
            await this.getAppToken();
    
            if(initMode == false){
                this.runChat();
            }
            this.loggedIn = true;
            res("success");
        })
	}

    //BEGIN GLOBAL MIGRATION

    botUsername = "";
    botUserID = 0;
    homeChannel = "";
    broadcasterUserID = 0;

    //For Event Subs
    appToken = "";

    lastMessage = null;
    chat = null;

    sayInChat = async (message, chatChannel) =>{
        if(this.loggedIn == false){return;}
        if(chatChannel == null){chatChannel = this.homeChannel}
        if(message == null || message == ""){
            twitchLog("EMPTY MESSAGE");
            return;
        }
        if(message.length >= 490){
            let limit = 490;
            let totalMessages = Math.ceil(message.length/limit);
            
            for(let stringpos=0; stringpos<message.length; stringpos+=limit){
                
                if(stringpos+limit > message.length){
                    await this.chat.say(chatChannel, "["+totalMessages+"/"+totalMessages+"] "+message.substring(stringpos, message.length));
                }else{
                    //twitchLog(stringpos, stringpos.limit);
                    await this.chat.say(chatChannel, "["+(Math.round((stringpos+limit)/limit)+"/"+totalMessages+"] "+message.substring(stringpos, stringpos+limit)));
                }
            }
        }else{
            await this.chat.say(chatChannel,message)
            .catch(e=>{
                twitchLog("chat ERROR", e);
                this.restartChat(message);
            });
        }
    }

<<<<<<< Updated upstream
=======
    /*chatSwitchChannels = async (newChannel, leaveMessage, joinMessage) => {
        if(this.loggedIn == false){return;}
        await this.validateChatbot();
        if(leaveMessage != null && leaveMessage != ""){this.sayInChat(leaveMessage);}
        await this.chat.disconnect();
        this.homeChannel = newChannel;
        if(joinMessage != null && joinMessage != ""){
            this.runChat(joinMessage);
        }else{
            this.runChat();
        }
    }*/

    disconnectChat = () => {
        if(this.loggedIn == false){return;}
        this.chat.disconnect();
    }

    joinChannel = async (channelname, joinmsg)=>{
        if(this.loggedIn == false){return;}
        await this.chat.join(channelname).catch(e=>{console.log(e)});
        this.sayInChat(joinmsg, channelname);
    }

    leaveChannel = async (channelname, partmsg)=>{
        if(this.loggedIn == false){return;}
        this.sayInChat(partmsg, channelname);
        await this.chat.part(channelname).catch(e=>{console.log(e)})
    }

    restartChat = async (message) => {
        if(this.loggedIn == false){return;}
        twitchLog("Restarting chat");
        await this.validateChatbot();
        this.runChat(message);
    }

    chatIsFirstMessage = (message) => {
        if(this.loggedIn == false){return;}
        return message.tags["first-msg"] == true;
    }

    chatIsReturningChatter = (message) => {
        if(this.loggedIn == false){return;}
        return message.tags["returning-chatter"] == true;
    }

    chatIsMod = (message) => {
        if(this.loggedIn == false){return;}
        return message.tags.mod == true;
    }

    chatIsSubscriber = (message) => {
        if(this.loggedIn == false){return;}
        return message.tags.subscriber == true;
    }

    chatIsBroadcaster = (message) => {
        if(this.loggedIn == false){return;}
        return message.tags.badges?.broadcaster == true;
    }

    chatIsVIP = (message) => {
        if(this.loggedIn == false){return;}
        return message.tags.badges?.vip == true;
    }

    getChatters = async (type) => {
        if(this.loggedIn == false){return;}
        const axios = require("axios");
        let response = await axios.get("https://tmi.twitch.tv/group/user/"+this.homeChannel.substr(1)+"/chatters");
        let chArray = [];
        if(type == "all"){
            for(let c in response.data.chatters){chArray = chArray.concat(response.data.chatters[c]);}
        }else{
            if(response.data.chatters[type] != null){
                chArray = response.data.chatters[type];
            }
        }
        return chArray;
    }

    sayAlreadyOn(name){
        if(this.loggedIn == false){return;}
        for(let c in activeEvents[name]){
            if(activeEvents[name][c].etype == "event"){
                this.sayInChat(events[name].name+" is cooling down. Time Left: "+Math.abs(Math.floor(uptime-activeEvents[name][c]["timeout"]))+"s");
                break;
            }
        }
    }
    
    async getBroadcasterID(){
        if(this.broadcasterUserID==0){
            await Axios({
                url: 'https://api.twitch.tv/helix/users?login='+this.homeChannel,
                method: 'get',
                headers:{
                    "Authorization": "Bearer "+this.oauth.token,
                    "Client-Id":this.oauth['client-id']
                }
            })
            .then((response)=>{
                this.broadcasterUserID = response.data.data[0].id;
            }).catch(error=>{
                console.error(error);
                if(error.response?.status == 401){
                    this.onAuthenticationFailure();
                }
                return;
            });
        }
    }
    
    async getBotID(){
        if(this.botUserID==0){
            await Axios({
                url: 'https://api.twitch.tv/helix/users?login='+this.botUsername,
                method: 'get',
                headers:{
                    "Authorization": "Bearer "+this.oauth.token,
                    "Client-Id":this.oauth['client-id']
                }
            })
            .then((response)=>{
                this.botUserID = response.data.data[0].id;
            }).catch(error=>{
                console.error(error);
                if(error.response?.status == 401){
                    this.onAuthenticationFailure();
                }
                return;
            });
        }
    }
    
    async getAppToken(){
        if(this.appToken == ""){
    
            var twitchScopes = [
                'channel:moderate',
                'chat:read',
                'chat:edit', 
                'whispers:read', 
                'whispers:edit', 
                'analytics:read:extensions', 
                'analytics:read:games', 
                'bits:read', 
                'channel:edit:commercial', 
                'channel:manage:broadcast', 
                'channel:read:charity', 
                'channel:manage:extensions', 
                'channel:manage:moderators', 
                'channel:manage:polls', 
                'channel:manage:predictions', 
                'channel:manage:raids', 
                'channel:manage:redemptions', 
                'channel:manage:schedule', 
                'channel:manage:videos', 
                'channel:read:editors', 
                'channel:read:goals', 
                'channel:read:hype_train', 
                'channel:read:polls', 
                'channel:read:predictions', 
                'channel:read:redemptions', 
                'channel:read:stream_key', 
                'channel:read:subscriptions', 
                'channel:read:vips', 
                'channel:manage:vips', 
                'clips:edit', 
                'moderation:read', 
                'moderator:manage:announcements', 
                'moderator:manage:automod',
                'moderator:read:automod_settings', 
                'moderator:manage:automod_settings', 
                'moderator:manage:banned_users', 
                'moderator:read:blocked_terms',
                'moderator:manage:chat_messages',
                'moderator:read:chat_settings',
                'moderator:manage:chat_settings',
                'moderator:read:chatters',
                'moderator:read:shield_mode',
                'moderator:manage:shield_mode',
                'user:edit',
                'user:edit:follows',
                'user:manage:blocked_users',
                'user:read:blocked_users',
                'user:read:broadcast',
                'user:manage:chat_color',
                'user:read:email',
                'user:read:follows',
                'user:read:subscriptions',
                'user:manage:whispers'
               ];
            
            let scopeString = "";
            for(let t in twitchScopes){
                if(twitchScopes[t] == ""){continue;}
                if(scopeString == ""){
                    scopeString += twitchScopes[t];
                }else{
                    scopeString += "+"+twitchScopes[t];
                }
                
            }
    
            var appParams = "?client_id="+this.oauth["client-id"]+
                "&client_secret="+this.oauth["client-secret"]+
                "&grant_type=client_credentials"+
                "&scope="+scopeString;
            
            await Axios.post('https://id.twitch.tv/oauth2/token'+appParams)
                    .then((response)=>{
                        
                        if(typeof response.data.access_token != "undefined"){
                            this.appToken = response.data.access_token;
                        }
                    }).catch(error=>{
                        console.error(error);
                        return;
                    });
        }
    }
    
    twitchjsify(channel, tags, txt){
        let message = {
            channel:channel.replace("#",""),
            respond:(responseTxt)=>{
                sayInChat(responseTxt, "twitch", channel.replace("#",""));
            },
            username:tags.username,
            botUsername:this.botUsername,
            displayName:tags["display-name"],
            tags:tags,
            message:txt,
            userId: tags["user-id"],
            eventType:"twitch-chat",
            platform:"twitch"
        };
    
        let emotes = tags.emotes;
        let newEmotes = [];
        for(let e in emotes){
            for(let ei in emotes[e]){
                newEmotes.push({
                    id:e,
                    start:parseInt(emotes[e][ei].split("-")[0]),
                    end: parseInt(emotes[e][ei].split("-")[1])
                });
            }
            
        }
        if(message.tags.badges == null){message.tags.badges = {};}
        message.tags.emotes = newEmotes;
        return message;
    }

    /*processDeletedMessage(message){
        for(let p in activePlugins){
            if(modlocks.plugins[p] != 1){
                try{
                    if(message.channel != sconfig.broadcaster.username){
                        if(shares[message.channel]?.plugins.includes(p)){
                            if(activePlugins[p].onEvent != null){
                                activePlugins[p].onEvent(message);
                            }
                        }
                    }else{
                        if(activePlugins[p].onEvent != null){
                            activePlugins[p].onChat(message);
                        }
                    }
                }catch(e){
                    twitchLog(e);
                }
            }
        }
    }*/
    
    processMessage(channel, tags, txt, self){
        
        let message = this.twitchjsify(channel, tags, txt);
        message.tags.displayName = message.displayName;
        if(typeof message.message == "undefined"){return;}
        this.lastMessage = {
            username:message.username,
            channel:message.channel,
            message:message.message
        };
        
        if(message.message.startsWith("!")){
            if(modlocks.spamguard == 1){
                if(this.checkForSpamming(message.username) == true){
                    return;
                }
            }
            
            let command = message.message.substr(1).split(" ");
    
            if(command[0] == "stop" && (this.chatIsMod(message) || this.chatIsBroadcaster(message))){
                let cEvent = command[1];
                let status = stopEvent(cEvent);
                this.sayInChat(status);
                return;
            }
    
            if(command[0] == "mod" && (this.chatIsMod(message) || this.chatIsBroadcaster(message))){
                let modCommand = command[1];
                if(modCommand == "spamguard"){
                    setSpamGuard(command[2]);
                }else if(modCommand == "lock" || modCommand == "unlock"){
                    let eventtarget = command[2];
                    let plugin = command[2];
                    let target = command.length>=4?command[3]:null;
                    if(lockEvent(message.username, modCommand, eventtarget) == true && eventtarget != "all"){return;}
                    if(lockPlugin(message.username, modCommand, plugin, target) == true && plugin != "all"){return;}
                    if(command[2] == "all"){
                        lockEvent(message.username, modCommand, eventtarget);
                        lockPlugin(message.username, modCommand, plugin, target);
                        this.sayInChat(message.username+" "+(modCommand=="lock"?"locked":"unlocked")+" all chat commands");
                    }
                }else if(modCommand == "blacklist"){
                    let modAction = command[2];
                    let viewer = command[3];
                    if(modAction == "add"){
                        modlocks.blacklist[viewer] == 1;
                        this.sayInChat(message.username+" blacklisted "+viewer);
                        sendToTCP("/mod/"+message.username+"/blacklist"+viewer, 1);
                    }else if(modAction == "remove"){
                        modlocks.blacklist[viewer] == 0;
                        this.sayInChat(message.username+" unblacklisted "+viewer);
                        sendToTCP("/mod/"+message.username+"/blacklist"+viewer, 0);
                    }
                    fs.writeFile(backendDir+"/settings/mod-blacklist.json", JSON.stringify(modlocks.blacklist), "utf-8", (err, data)=>{
                        twitchLog("Mod file saved!");
                    });
                }else if(modCommand == "trust" && this.chatIsBroadcaster(message)){
                    if(command.length>2){
                        let trustedUser = command[2].startsWith("@")?command[2].substring(1).trim():command[2].trim();
                        modData["trusted_users"][trustedUser] = "m";
                        fs.writeFile(backendDir+"/settings/mod.json", JSON.stringify(modData), "utf-8", (err, data)=>{
                            twitchLog("Mod file saved!");
                            this.sayInChat(trustedUser+" has been added as a trustworthy user for the Mod UI!");
                        });
                    }else{
                        this.sayInChat("Trust a user to interact with the Mod UI");
                    }
                }else if(modCommand == "verify"){
                    if(activeUsers.pending[message.username].vtype == "twitch" && activeUsers.pending[message.username].verified == false){
                        activeUsers.pending[message.username].verified = true;
                        this.sayInChat(message.username+" You're verified! Now set a username and password for my records.");
                    }
                }
            }
    
            if(command[0] == "commands"){
                let commandsArray = this.getChatCommands(message.channel);
                this.sayInChat("Here's the chat command list: "+commandsArray.join(", "), message.channel);
                return;
            }
    
            if(command[0] == "plugins"){
                if(command.length == 1){
                    let pluginList = Object.keys(activePlugins);
                    this.sayInChat("Use this command like !plugins [plugin-name] [plugin-command] to get info on an active plugin. Plugin names are: "+pluginList.join(", "));
                    return;
                }else{
                    for(let p in activePlugins){
                        if(command[1] == p && command.length == 2){
                            let commandList = Object.keys(activePlugins[p].commandList);
                            this.sayInChat("Commands for "+p+" are: "+commandList.join((", ")));
                            return;
                        }else if(command[1] == p){
                            if(activePlugins[p].commandList[command[2]] != null){
                                this.sayInChat(activePlugins[p].commandList[command[2]]);
                                return;
                            }
                        }
                    }
                }
            }
            
            if(command[0] == sconfig.bot.help_command){
                if(command.length>1){
                    let commands = [];
                    let done = false;
    
                    if(command[1] == "help"){
                        this.sayInChat("Pass a command type like '!"+sconfig.bot.help_command+" event' to show the commands for that type. You can also pass a command like '!"+sconfig.bot.help_command+" event command' to get a description of what that command does. Active plugins are: ["+stringifyArray(Object.keys(activePlugins))+"]");
                        return;
                    }
    
                    
                    if(command[1] == "event" || command[1] == "events"){
                        for(let e in events){
                            if(command.length == 2){
                                commands.push(e);
                            }else{
                                if(command[2] == e){
                                    this.sayInChat(events[e].name+" | chat command: "+
                                    (events[e].triggers.chat.enabled?events[e].triggers.chat.command:" No chat command")+
                                    " | Reward: "+
                                    (events[e].triggers.redemption.enabled?"It has a channel point reward":"No channel point reward")+
                                    " | OSC: "+
                                    (events[e].triggers.osc.enabled?"Triggered by OSC":"No OSC Trigger")+
                                    " | Description: "+
                                    events[e].description);
                                    done = true;
                                }
                            }
                        }
                    }
    
                    if(command[1] == "plugin" || command[1] == "plugins"){
                        for(let p in activePlugins){
                            
                            if(command.length == 2){
                                commands.push(p);
                            }else{
                                if(command[2] == p && command.length == 3){
                                    commands = Object.keys(activePlugins[p].commandList);
                                }else if(command[2] == p){
                                    if(activePlugins[p].commandList[command[3]] != null){
                                        this.sayInChat(activePlugins[p].commandList[command[3]]);
                                        done = true;
                                    }
                                }
                            }
                        }
                    }
                    if(commands.length == 0 && done == false){
                        this.sayInChat("I'm not sure what "+command[1]+" is (^_^;)");
                    }else if(done == false){
                        
                        this.sayInChat(command[1]+" are: "+stringifyArray(commands));
                    }
                    
                }else{
                    this.sayInChat("Hi, I'm "+sconfig.bot.bot_name+". "+sconfig.bot.introduction);
                }
            }
        }
    
        for(let e in events){
            if(message.channel != sconfig.broadcaster.username){
                if(!shares[message.channel]?.commands.includes(e)){
                    continue;
                }
            }
            
            if(modlocks.events[e] == 1){continue;}
            if(events[e].triggers.chat.enabled && self == false){
                if(events[e].triggers.chat.broadcaster == true ||
                    events[e].triggers.chat.mod == true ||
                    events[e].triggers.chat.sub == true ||
                    events[e].triggers.chat.vip == true){
                    let pass = false;
                    if(events[e].triggers.chat.broadcaster == true && this.chatIsBroadcaster(message)){
                        pass = true;
                    }
                    if(events[e].triggers.chat.mod == true && this.chatIsMod(message)){
                        pass = true;
                    }
                    if(events[e].triggers.chat.sub == true && this.chatIsSubscriber(message)){
                        pass = true;
                    }
                    if(events[e].triggers.chat.vip == true && this.chatIsVIP(message)){
                        pass = true;
                    }
                    if(pass == false){
                        continue;
                    }
                }
                
                let check = checkResponseTrigger(events[e], message);
                if(check != null){
                    
                    if(runCommands(check.message, e, check.extra) == "alreadyon"){
                        this.sayAlreadyOn(e);
                    }
                }
            }
        }
        
        for(let p in activePlugins){
            if(modlocks.plugins[p] != 1){
                try{
                    if(message.channel != sconfig.broadcaster.username){
                        if(shares[message.channel]?.plugins.includes(p)){
                            if(activePlugins[p].onChat != null){
                                activePlugins[p].onChat(message);
                            }
                        }
                    }else{
                        if(activePlugins[p].onChat != null){
                            activePlugins[p].onChat(message);
                        }
                    }
                }catch(e){
                    twitchLog(e);
                }
            }
        }
    }
    
    checkForSpamming(viewername){
            
        if(modlocks.blacklist[viewername] == null){
            modlocks.blacklist[viewername] = {
                active:0,
                timeout:null,
                commandCount:1,
                lastCommand:Date.now()
            };
            return false;
        }
    
        if(modlocks.blacklist[viewername].active == 1){
            if(Date.now() >= modlocks.blacklist[viewername].timeout){
                modlocks.blacklist[viewername].active = 0;
                modlocks.blacklist[viewername].commandCount = 1;
            }else{
                return true;
            }
        }
    
        if(Date.now()-modlocks.blacklist[viewername].lastCommand <= 2000){
            modlocks.blacklist[viewername].commandCount++;
        }else{
            modlocks.blacklist[viewername].commandCount = 1;
        }
        modlocks.blacklist[viewername].lastCommand = Date.now();
        if(modlocks.blacklist[viewername].commandCount >= 6){
            this.sayInChat("Hey, cut that out "+viewername+", you're on cooldown for a minute.");
            modlocks.blacklist[viewername].active = 1;
            modlocks.blacklist[viewername].timeout = Date.now()+60000;
            return true;
        }
        
        return false;
    }
    
    processCheer(channel, userstate, message){
        twitchLog("CHEER", userstate);
    }
    
    runChat = async(startCase) => {
        twitchLog("Running chat...");
        if(this.chat != null){
            if(this.chat.readyState() == "OPEN" || this.chat.readyState() == "CONNECTING"){
                await this.chat.disconnect();
            }
            this.chat.off("message", this.processMessage.bind(this));
            this.chat.off("cheer", this.processCheer.bind(this));
            this.chat.off("connectFailed", this.onAuthenticationFailure.bind(this));
            this.chat.off("disconnect", this.restartChat.bind(this));
        }
    
        this.chat = new tmi.Client({
            options:{debug:true},
            identity:{
                username:this.botUsername,
                password:this.oauth.token
            }
        });
        
        await this.chat.connect().catch(error=>{this.onAuthenticationFailure();});
        this.chat.join(this.homeChannel).then(async ()=>{
            if(startCase == "restart"){
                this.sayInChat("chat restarted, I'm back :D");
            }else if(startCase == "reconnect"){
                this.sayInChat("Stream reconnected. I'm okay :)");
            }else if(startCase == "disconnected"){
                this.sayInChat("Stream disconnected. Hold on a sec...");
            }else if(startCase != null){
                this.sayInChat(startCase);
            }

            let subs = await this.getEventSubs();
            let subtype = "";
            
            for(let s in subs.data){
                subtype = subs.data[s].type;
                let bid = subs.data[s].condition.broadcaster_user_id;

                if(subtype == "stream.online" && bid != this.broadcasterUserID){
                    for(let s in shares){
                        if(shares[s].twitchid == bid){
                            this.isStreamerLive(s)
                            .then(isLive=>{
                                if(isLive == true){
                                    webUI.setShare(s, true);
                                }
                            })
                        }
                    }
                }
            }
        }).catch(error=>{console.error(error)});
    
        
        this.chat.on("message", this.processMessage.bind(this));
        //this.chat.on("messagedeleted", this.processDeletedMessage.bind(this));
        this.chat.on("cheer", this.processCheer.bind(this));
        this.chat.on("connectFailed", this.onAuthenticationFailure.bind(this));
        this.chat.on("disconnect", this.restartChat.bind(this));
    };
    
    getChatCommands(shareChannel){
        if(this.loggedIn == false){return;}
        let commandsArray = [];
        
        for(let e in events){
           //console.log("CHECKING ", e);
            if(shareChannel != null && shareChannel != this.homeChannel){
                if(!shares[shareChannel].commands.includes(e)){
                    //console.log("Command skipped", e, shareChannel);
                    continue;
                }
            }
            if(events[e].triggers.chat.enabled == true){
                if(events[e].triggers.chat.command.startsWith("!")){
                    commandsArray.push(events[e].triggers.chat.command);
                }
            }
        }
        return commandsArray;
    }
    
    onAuthenticationFailure(){
        twitchLog("Authentication failed, refreshing...");
        if(this.oauth.refreshToken == "" || this.oauth.refreshToken == null){
            twitchLog("NO REFRESH TOKEN IN twitch.json");
            return;}
        
        return new Promise((res, rej) => {
            
            var refreshParams = "?client_id="+this.oauth['client-id']+
                "&client_secret="+this.oauth['client-secret']+
                "&grant_type=refresh_token"+
                "&refresh_token="+this.oauth.refreshToken;
                
            Axios.post('https://id.twitch.tv/oauth2/token'+refreshParams)
            .then((response)=>{
                
                if(typeof response.data.access_token != "undefined"){
                    this.oauth.token = response.data.access_token;
                    twitchLog("TOKEN REFRESHED");
                    fs.writeFile(backendDir+"/settings/twitch.json", JSON.stringify(this.oauth), "utf-8", (err, data)=>{
                        twitchLog("oauth saved!");
                        res(this.oauth.token);
                    });
                }
            }).catch(error=>{
                rej(error);
            });
        });
    };
    
    onBroadcasterAuthFailure(){
        twitchLog("Broadcaster auth failed, refreshing...");
        if(this.oauth.broadcaster_refreshToken == "" || this.oauth.broadcaster_refreshToken == null){return;}
    
        return new Promise((res, rej)=>{
            var refreshParams = "?client_id="+this.oauth['client-id']+
                "&client_secret="+this.oauth['client-secret']+
                "&grant_type=refresh_token"+
                "&refresh_token="+this.oauth.broadcaster_refreshToken;
    
            Axios.post('https://id.twitch.tv/oauth2/token'+refreshParams)
            .then((response)=>{
                
                if(typeof response.data.access_token != "undefined"){
                    
                    this.oauth.broadcaster_token = response.data.access_token;
                    
                    twitchLog("BROADCASTER TOKEN REFRESHED");
                    fs.writeFile(backendDir+"/settings/twitch.json", JSON.stringify(this.oauth), "utf-8", (err, data)=>{
                        twitchLog("broadcaster oauth saved!");
                        res(this.oauth.broadcaster_token);
                    });
                }
            }).catch(error=>{
                rej(error);
            });
        })
    };

    async isStreamerLive(username){
        if(this.loggedIn == false){return;}
        if(username == null){username = sconfig.broadcaster.username}
        await this.getAppToken();

        return new Promise((res, rej) => {
            Axios({
                url: "https://api.twitch.tv/helix/streams?user_login="+username,
                method: 'GET',
                headers:{
                    "Authorization": "Bearer "+this.appToken,
                    "Client-Id":this.oauth['client-id'],
                    "user_login":username
                }
            })
            .then((response)=>{
                twitchLog(response.data.data[0] != null?username+" IS LIVE":username+" IS NOT LIVE");
                if(response.data.data[0] != null){
                    res(true);
                }else{
                    res(false);
                }
                
            }).catch(error=>{
                rej(error);
            });
        })
    }

    startReoccuringMessage(){
        if(this.loggedIn == false){return;}
        if(eventsubs.events["stream.online"]?.chat.enabled && eventsubs.events["stream.online"]?.chat.reoccuringmessage != "" ){
            let reoccuringInterval = async function(){
                try{
                    let responseFunct = eval("() => {let count = "+JSON.stringify(this.reoccuringMessageCount)+"; "+eventsubs.events["stream.online"].chat.reoccuringmessage.replace(/\n/g, "")+"}");
                    let response = await responseFunct();
                    this.sayInChat(response);
                    this.reoccuringMessageCount++;
                }catch(e){
                    this.sayInChat("The reoccuring message failed to send :( Check my logs to see what went wrong!");
                    clearInterval(this.streamChatInterval);
                }
                
            };
            let reoccurTime = eventsubs.events["stream.online"].chat.interval;
            if(reoccurTime == null){reoccurTime = 15}

            this.streamChatInterval = setInterval(reoccuringInterval.bind(this), reoccurTime*60*1000);
        }
    }

    async getEventSubs(){
        if(this.loggedIn == false){return;}
        await this.getAppToken();
        if(this.appToken ==""){
            twitchLog("No app token found");
            return;
        }
        let response = await Axios({
            url: 'https://api.twitch.tv/helix/eventsub/subscriptions',
            method: 'GET',
            headers:{
                "Client-Id": this.oauth["client-id"],
                "Authorization": " Bearer "+this.appToken,
                "Content-Type": "application/json"
            }
        }).catch(error=>{
            console.error(error);
            return;
        });
        return response.data;
    }

    refreshEventSubs = async() =>{
        if(this.loggedIn == false){return;}
        let subs = await this.getEventSubs();
        for(let s in subs.data){
            
            if(subs.data[s].transport.callback != sconfig.network.external_http_url){
                await this.deleteEventSub(subs.data[s].id)
            }
        }
        let subtype = "";
        for(let s in subs.data){
            subtype = subs.data[s].type;
            let bid = subs.data[s].condition.broadcaster_user_id;
            if(subs.data[s].type == "channel.raid"){
                if(subs.data[s].condition.to_broadcaster_user_id != ""){
                    subtype += "-receive";
                    bid = subs.data[s].condition.to_broadcaster_user_id;
                }else{
                    subtype += "-send";
                    bid = subs.data[s].condition.from_broadcaster_user_id;
                }
            }

            if(subtype == "stream.online" && bid != this.broadcasterUserID){
                for(let s in shares){
                    if(shares[s].twitchid == bid){
                        this.isStreamerLive(s)
                        .then(isLive=>{
                            if(isLive == true){
                                webUI.setShare(s, true);
                            }
                        })
                    }
                }
            }
            
            await this.initEventSub(subtype, bid);
        }
    }

    async deleteEventSub(id){
        if(this.loggedIn == false){return;}
        await Axios({
            url: 'https://api.twitch.tv/helix/eventsub/subscriptions?id='+id,
            method: 'DELETE',
            headers:{
                "Client-Id": this.oauth["client-id"],
                "Authorization": " Bearer "+this.appToken,
                "Content-Type": "application/json"
            }
        }).catch(error=>{
            console.error(error);
            return;
        });
    }
    
    async initEventSub(eventType, bid){
        if(this.loggedIn == false){return;}
        await this.getAppToken();
        
        if(bid == null){
            await this.getBroadcasterID();
            bid = this.broadcasterUserID;
        }
        
        var condition = {};

        if(!eventType.startsWith("channel.raid")){
            condition = {"broadcaster_user_id":bid};
            if(eventType == ("channel.follow") 
            || eventType.startsWith("channel.guest_star") 
            || eventType.startsWith("channel.shield_mode") 
            || eventType.startsWith("channel.shoutout")){
                condition.moderator_user_id = this.botUserID;
            }
        }else{
            if(eventType.split("-")[1] == "receive"){
                condition = {"to_broadcaster_user_id":bid};
            }else{
                condition = {"from_broadcaster_user_id":bid};
            }
            eventType = eventType.split("-")[0];
        }

        let version = "1";
        if(eventType == "channel.update"){
            version = "beta";
        }else if(eventType == "channel.follow"){
            version = "2";
        }else if(eventType.startsWith("channel.guest_star")){
            version = "beta";
        }

        return new Promise((res, rej)=>{
            Axios({
                url: 'https://api.twitch.tv/helix/eventsub/subscriptions',
                method: 'post',
                headers:{
                    "Client-ID":this.oauth["client-id"],
                    "Authorization":"Bearer "+this.appToken,
                    "Content-Type":"application/json"
                },
                data:{
                    "type":eventType,
                    "version": version,
                    "condition":condition,
                    "transport":{
                        "method": "webhook",
                        "callback":sconfig.network.external_http_url+"/webhooks/eventsub",
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
    
    streamChatInterval = null;
    reoccuringMessageCount = Math.round(Math.random()*10);

    //END GLOBAL MIGRATION

    callBotAPI(url){
        if(this.loggedIn == false){return;}
        return new Promise((res, rej)=>{
            Axios({
                url: url,
                method: 'GET',
                headers:{
                    "Client-Id":this.oauth["client-id"],
                    "Authorization":"Bearer "+this.oauth.token,
                    "Content-Type":"application/json"
                }
            })
            .then(data => res(data))
            .catch(error=>{
                console.error(error);
                rej(error);
            });
        })
    }

    callAppAPI(url){
        if(this.loggedIn == false){return;}
        return new Promise((res, rej)=>{
            Axios({
                url: url,
                method: 'GET',
                headers:{
                    "Client-Id":this.oauth["client-id"],
                    "Authorization":"Bearer "+this.appToken,
                    "Content-Type":"application/json"
                }
            })
            .then(data => {
                console.log(data.data);
                res(data.data)}
                )
            .catch(error=>{
                console.error(error);
                rej(error);
            });
        })
    }

    callBroadcasterAPI(url){
        if(this.loggedIn == false){return;}
        return new Promise((res, rej)=>{
            Axios({
                url: url,
                method: 'GET',
                headers:{
                    "Client-Id":this.oauth["client-id"],
                    "Authorization":"Bearer "+this.oauth.broadcaster_token,
                    "Content-Type":"application/json"
                }
            })
            .then(data => res(data))
            .catch(error=>{
                console.error(error);
                rej(error);
            });
        })
    }

>>>>>>> Stashed changes
    twitchSigningSecret = process.env.TWITCH_SIGNING_SECRET;

    verifyTwitchSignature = (req, res, buf, encoding) => {
        const messageId = req.header("Twitch-Eventsub-Message-Id");
        const timestamp = req.header("Twitch-Eventsub-Message-Timestamp");
        const messageSignature = req.header("Twitch-Eventsub-Message-Signature");
        const time = Math.floor(new Date().getTime() / 1000);
        twitchLog(`Message ${messageId} Signature: `, messageSignature);

        if (Math.abs(time - timestamp) > 600) {
            // needs to be < 10 minutes
            twitchLog(`Verification Failed: timestamp > 10 minutes. Message Id: ${messageId}.`);
            throw new Error("Ignore this request.");
        }

        if (!twitchSigningSecret) {
            twitchLog(`Twitch signing secret is empty.`);
            throw new Error("Twitch signing secret is empty.");
        }

        const computedSignature =
            "sha256=" +
            crypto
            .createHmac("sha256", twitchSigningSecret)
            .update(messageId + timestamp + buf)
            .digest("hex");
        twitchLog(`Message ${messageId} Computed Signature: `, computedSignature);

        if (messageSignature !== computedSignature) {
            throw new Error("Invalid signature.");
        } else {
            twitchLog("Verification successful");
        }
    };

<<<<<<< Updated upstream
	autoLogin(){
        return new Promise(async (res, rej)=>{
            if(token == "" || token == null){
                twitchLog("No chat oauth saved. Go into the Web UI, click the top for the navigation menu, then click 'authorize'. You must be on localhost to make auth tokens.");
                rej("notoken");
                return;
            }
            let botStatus = await this.validateChatbot();
            
            if(botStatus.status == "newtoken"){
                oauth["token"] = botStatus.newtoken;
            }else if(botStatus.status == "error"){
                twitchLog("CHATBOT ERROR", botStatus.error);
                return;
            }
    
            if(oauth.broadcaster_refreshToken != "" && oauth.broadcaster_refreshToken != null){
                let broadcasterStatus = await this.validateBroadcaster();
                if(broadcasterStatus.status == "newtoken"){
                    oauth["broadcaster_token"] = broadcasterStatus.newtoken;
                }else if(broadcasterStatus.status == "error"){
                    twitchLog("BROADCASTER ERROR", broadcasterStatus.error);
                    return;
                }
            }
    
            runChat();
            res("success");
        })
        
=======
    async getChannelInfo(){
        if(this.loggedIn == false){return;}
        return new Promise((res, rej) => {
            Axios({
                url: "https://api.twitch.tv/helix/channels?broadcaster_id="+this.broadcasterUserID,
                method: 'GET',
                headers:{
                    "Authorization": "Bearer "+this.appToken,
                    "Client-Id":this.oauth['client-id'],
                }
            })
            .then((response)=>{
                if(response.data.data[0] != null){
                    res(response.data.data);
                }else{
                    res(false);
                }
                
            }).catch(error=>{
                rej(error);
            });
        })
    }

    async getChannels(){
        if(this.loggedIn == false){return;}
        if(this.chat == null){return null;}
        await this.validateChatbot();
        if(this.chat.readyState() == "OPEN"){
            
            return this.chat.getChannels();
        }else{
            return null;
        }
    }

    getUserInfo(user){
        if(this.loggedIn == false){return;}
		return new Promise(async (res, rej)=>{
			fetch("https://api.twitch.tv/helix/users?login="+user, {
				method: 'GET',
				headers:{
					"Client-Id": this.oauth["client-id"],
					"Authorization": " Bearer "+this.appToken,
					"Content-Type": "application/json"
				}
			})
			.then(response => response.json())
			.then(data => {
				
				if(data != null){
					res(data.data);
				}
			});
			
		})
>>>>>>> Stashed changes
	}

	async validateBroadcaster(){
		if(this.oauth.broadcaster_token == "" || this.oauth.broadcaster_token == null){
            twitchLog("No broadcaster auth saved. Authorizing on the Web UI saves your auth tokens for chat. If that's your broadcasting account, then go to the EventSub tab and click 'Save Current Oauth as Broadcaster'. You can have both pairs of tokens be the same. If you want a separate account for chat. Log in to twitch.tv as your bot account and authorize on the Web UI.");
            return;
        }

        return new Promise((res, rej)=>{
            Axios({
                url: 'https://id.twitch.tv/oauth2/validate',
                method: 'get',
                headers:{
                    "Authorization": "Bearer "+this.oauth.broadcaster_token
                }
            })
            .then((response)=>{
                this.homeChannel = response.data.login;
                twitchLog("Validated broadcaster: "+response.data.login+"!");
                res("OK");
            }).catch(async error=>{
                
                if(error.response?.status == 401){
                    this.onBroadcasterAuthFailure().then(async newtoken=>{
                        await this.validateBroadcaster();
                        res({status:"newtoken",newtoken:newtoken});
                    });
                }else{
                    rej({status:"error", error:error});
                }
            });
        })
		
	}

    async validateChatbot(){
        if(this.oauth.refreshToken == "" || this.oauth.refreshToken == null){
            twitchLog("No chat oauth saved. Go into the Web UI, click the top for the navigation menu, then click 'authorize'. You must be on localhost to make auth tokens. If this is a fresh Spooder, you'll want to log in to twitch.tv as the account you use to broadcast first. Then go to the EventSub tab to copy your auth tokens to broadcaster.");
            return;
        }
		return new Promise((res, rej)=>{
            Axios({
                url: 'https://id.twitch.tv/oauth2/validate',
                method: 'get',
                headers:{
                    "Authorization": "Bearer "+this.oauth.token
                }
            })
            .then((response)=>{
<<<<<<< Updated upstream
                username = response.data.login;
=======
                this.botUsername = response.data.login;
>>>>>>> Stashed changes
                twitchLog("Validated Chatbot: "+response.data.login+"!");
                res({status:"OK"});
            }).catch(error=>{
                console.error("ERROR",error);
                if(error.response?.status == 401){
                    this.onAuthenticationFailure().then(async newtoken=>{
                        await this.validateChatbot();
                        res({status:"newtoken",newtoken:newtoken});
                    });
                }else{
                    rej({status:"error", error:error});
                }
            });
        })
	}
}

module.exports = STwitch;