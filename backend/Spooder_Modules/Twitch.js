const Axios = require("axios");
const fs = require("fs");

const clientId = oauth['client-id'];
const clientSecret = oauth['client-secret'];

global.botUsername = "";
global.homeChannel = sconfig.broadcaster.username;
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

const tmi = require("tmi.js");
global.chat = null;

var twitchLog = (...content) => {
    console.log(logEffects("Bright"),logEffects("FgMagenta"), ...content, logEffects("Reset"));
}

function sayAlreadyOn(name){
    for(let c in activeEvents[name]){
        if(activeEvents[name][c].etype == "event"){
            sayInChat(events[name].name+" is cooling down. Time Left: "+Math.abs(Math.floor(uptime-activeEvents[name][c]["timeout"]))+"s");
            break;
        }
    }
}

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

//We switched to tmi.js but we're reforming the message data to reflect its fork, twitch-js.
//I was going to rewrite the overlays to work with tmi, but I think twitch-js has a better obj structure.
//Why switch to tmi.js? Well, I felt tmi was more stable and better maintained than twitch-js. Not sure if I'm right...but it felt right.
function twitchjsify(channel, tags, txt){
    let message = {
        channel:channel.replace("#",""),
        respond:(responseTxt)=>{
            sayInChat(responseTxt, channel.replace("#",""));
        },
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

        if(command[0] == "share"){
            
            if(command[1] == null){
                sayInChat("Join another channel on the side with certain plugins and commands enabled!");
            }else{
                let shareUser = command[1];
                if(command[2] == null){
                    if(shares[shareUser] == null){sayInChat("Share with that user isn't available");}
                }else{
                    if(shares[shareUser] == null){shares[shareUser] = {
                        enabled:false,
                        commands:[],
                        plugins:[]
                    }};
                    if(command[2] == "join"){
                        
                        let joinmsg = message.message.substring(("!share "+shareUser+" join").length);
                        joinChannel(shareUser, joinmsg);
                    }else if(command[2] == "leave"){
                        
                        let partmsg = message.message.substring(("!share "+shareUser+" leave").length);
                        leaveChannel(shareUser, partmsg);
                    }else if(command[2] == "set"){
                        if(command[3] == "commands"){
                            let setCommands = message.message.substring(("!share "+shareUser+" set commands").length).replaceAll(" ","").split(",");
                            shares[shareUser].commands = setCommands;
                            sayInChat("Commands set for "+shareUser);
                        }else if(command[3] == "plugins"){
                            let setPlugins = message.message.substring(("!share "+shareUser+" set plugins").length).replaceAll(" ","").split(",");
                            shares[shareUser].plugins = setPlugins;
                            sayInChat("Plugins set for "+shareUser);
                        }
                    }else{
                        sayInChat(shareUser+" will have these commands shared: "+shares[shareUser].commands.join(", ")+" and these plugins: "+shares[shareUser].plugins.join(", "));
                    }

                    fs.writeFileSync(backendDir+"/settings/share.json", JSON.stringify(shares));
                }
            }
        }

        if(command[0] == "commands"){
            let commandsArray = getChatCommands(message.channel);
            sayInChat("Here's the chat command list: "+commandsArray.join(", "), message.channel);
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
        if(message.channel != sconfig.broadcaster.username){
            if(!shares[message.channel]?.commands.includes(e)){
                continue;
            }
        }
        
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
                    }else if(commandSplit[matchIndex].startsWith(">")){
                        
                        if(messageSplit[m].startsWith(commandSplit[matchIndex].replace(">", ""))){
                            commandMatch[matchIndex] = messageSplit[m];
                        }
                    }else if(commandSplit[matchIndex].startsWith("<")){
                        if(messageSplit[m].endsWith(commandSplit[matchIndex].replace("<", ""))){
                            commandMatch[matchIndex] = messageSplit[m];
                        }
                    }else if(commandSplit[matchIndex].toLowerCase() == messageSplit[m].toLowerCase()){commandMatch[matchIndex] = messageSplit[m];}
                    
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
            try{
                if(message.channel != sconfig.broadcaster.username){
                    if(shares[message.channel]?.plugins.includes(p)){
                        activePlugins[p].onChat(message);
                    }
                }else{
                    activePlugins[p].onChat(message);
                }
            }catch(e){
                twitchLog(e);
            }
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
            username:botUsername,
            password:token
        }
    });
    
    await chat.connect().catch(error=>{console.error(error); onAuthenticationFailure();});
    chat.join(homeChannel).then(()=>{
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

function getChatCommands(shareChannel){

    let commandsArray = [];
    
    for(let e in events){
       //console.log("CHECKING ", e);
        if(shareChannel != null && shareChannel != sconfig.broadcaster.username && shares[shareChannel]?.enabled == true){
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

function stringifyArray(a){
    return a.join(", ");
}

function onAuthenticationFailure(){
    twitchLog("Authentication failed, refreshing...");
    if(refreshToken == "" || refreshToken == null){
        twitchLog("NO REFRESH TOKEN IN OAUTH.JSON");
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
                twitchLog("TOKEN REFRESHED");
                fs.writeFile(backendDir+"/settings/oauth.json", JSON.stringify(oauth), "utf-8", (err, data)=>{
                    twitchLog("oauth saved!");
                    res(token);
                });
            }
        }).catch(error=>{
            rej(error);
        });
    });
};

function onBroadcasterAuthFailure(){
    twitchLog("Broadcaster auth failed, refreshing...");
    if(oauth.broadcaster_refreshToken == "" || oauth.broadcaster_refreshToken == null){return;}

    return new Promise((res, rej)=>{
        let clientId = oauth["client-id"]
        let clientSecret = oauth["client-secret"];
        var refreshParams = "?client_id="+clientId+
            "&client_secret="+clientSecret+
            "&grant_type=refresh_token"+
            "&refresh_token="+oauth.broadcaster_refreshToken;

        Axios.post('https://id.twitch.tv/oauth2/token'+refreshParams)
        .then((response)=>{
            
            if(typeof response.data.access_token != "undefined"){
                
                oauth.broadcaster_token = response.data.access_token;
                
                twitchLog("BROADCASTER TOKEN REFRESHED");
                fs.writeFile(backendDir+"/settings/oauth.json", JSON.stringify(oauth), "utf-8", (err, data)=>{
                    twitchLog("broadcaster oauth saved!");
                    res(oauth.broadcaster_token);
                });
            }
        }).catch(error=>{
            rej(error);
        });
    })
};

var streamChatInterval = null;
var reoccuringMessageCount = Math.round(Math.random()*10);

class STwitch{
    constructor(router){
        let expressPort = sconfig.network.host_port;
        router.get('/twitch/authorize', async (req,res)=>{
            twitchLog("Got code");
            token = req.query.code;
            var twitchParams = "?client_id="+clientId+
                "&client_secret="+clientSecret+
                "&grant_type=authorization_code"+
                "&code="+token+
                "&redirect_uri=http://localhost:"+expressPort+"/twitch/authorize"+
                "&response_type=code";
                
                
            await Axios.post('https://id.twitch.tv/oauth2/token'+twitchParams)
                    .then((response)=>{
                        
                        if(typeof response.data.access_token != "undefined"){
                            token = response.data.access_token;
                            refreshToken = response.data.refresh_token;
                            oauth.token = token;
                            oauth.refreshToken = refreshToken;
                            fs.writeFile(backendDir+"/settings/oauth.json", JSON.stringify(oauth), "utf-8", (err, data)=>{
                                twitchLog("oauth saved!");
                            });

                        }
                    }).catch(error=>{
                        console.error(error);
                        return;
                    });
            twitchLog("Got token");
            
            await Axios({
                url: 'https://id.twitch.tv/oauth2/validate',
                method: 'get',
                headers:{
                    "Authorization": "Bearer "+token
                }
            })
            .then((response)=>{
                
                botUsername = response.data.login;
            }).catch(error=>{
                console.error(error);
                return;
            });
            this.autoLogin();
            res.redirect("http://localhost:"+(expressPort));
        });

        router.get("/twitch/revoke", async(req, res) => {
            let cid = clientId;
            let revokeBroadcaster = req.query.broadcaster == true;
            let revokeToken = token;
            if(revokeBroadcaster){
                revokeToken = oauth.broadcaster_token;
            }else{
                revokeToken = token;
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

                if(oauth.broadcaster_token == token){
                    oauth.broadcaster_token = "";
                    oauth.broadcaster_refreshToken = "";
                    token = "";
                    refreshToken = "";
                    oauth.token = token;
                    oauth.refreshToken = refreshToken;
                    twitchLog("Main token matches broadcaster, both oauth revoked");
                    res.send({status:"Main token matches broadcaster, both oauth revoked"});
                }else{
                    if(revokeBroadcaster){
                        oauth.broadcaster_token = "";
                        oauth.broadcaster_refreshToken = "";
                        twitchLog("Broadcaster oauth revoked, main token preserved");
                        res.send({status:"Broadcaster oauth revoked, main token preserved"});
                    }else{
                        token = "";
                        refreshToken = "";
                        oauth.token = token;
                        oauth.refreshToken = refreshToken;
                        twitchLog("Broadcaster oauth preserved");
                        res.send({status:"Main token revoked, broadcaster oauth preserved"});
                    }
                    
                }
                
                fs.writeFile(backendDir+"/settings/oauth.json", JSON.stringify(oauth), "utf-8", (err, data)=>{
                    twitchLog("oauth saved!");
                });

            }).catch(error=>{
                console.error(error);
                return;
            });
        });

        router.get("/twitch/save_auth_to_broadcaster", async(req, res) => {
            oauth["broadcaster_token"] = token;
            oauth["broadcaster_refreshToken"] = refreshToken;
            fs.writeFile(backendDir+"/settings/oauth.json", JSON.stringify(oauth), "utf-8", (err, data)=>{
                twitchLog("oauth saved!");
                res.send({status:"SUCCESS"});
            });
        });

        router.post("/twitch/saveEventSubs", async(req, res) => {
            delete req.body.callback_url;
            fs.writeFile(backendDir+"/settings/eventsub.json", JSON.stringify(req.body), "utf-8", (err, data)=>{
                eventsubs = req.body;
                res.send({status:"SAVE SUCCESS"});
            });
        })

        router.get("/twitch/eventsubs", async(req, res) => {
            let sendSubs = Object.assign(eventsubs);
            sendSubs.callback_url = sconfig.network.external_http_url;
            sendSubs.spooderevents = Object.keys(events);
            res.send(JSON.stringify(sendSubs));
        });

        router.get("/twitch/get_eventsubs", async(req,res) => {
            await getAppToken();
            if(appToken ==""){
                twitchLog("NO APP TOKEN");
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

        router.get("/twitch/get_channelpoint_rewards", async(req, res) => {
            if(oauth.broadcaster_token=="" || oauth.broadcaster_token == null){
                res.send({status:"NO BROADCASTER TOKEN"});
                return;
            }
            
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
                
                onBroadcasterAuthFailure();
                return;
            });
        });

        router.get("/twitch/delete_eventsub", async(req,res) => {
            
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

        router.get("/twitch/refresh_eventsubs", async(req,res)=>{
            await this.refreshEventSubs();
            res.send({status:"SUCCESS"});
        })

        router.get("/twitch/init_eventsub", async(req,res) => {
            
            let subStatus = await initEventSub(req.query.type, req.query.user_id);
            
            res.send(JSON.stringify({status:subStatus}));
        });

        router.get("/twitch/get_eventsubs_by_user", async(req,res) => {
            let twitchid = req.query.twitchid;
            
            if(twitchid == null){
                twitchid = broadcasterUserID;
            }
            
            await getAppToken();
            if(appToken ==""){
                twitchLog("NO APP TOKEN");
                return;
            }
            await Axios({
                url: 'https://api.twitch.tv/helix/eventsub/subscriptions?user_id='+twitchid,
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
        })

        router.get("/twitch/chat_channel", async(req,res) => {
            let channel = req.query.channel;
            let leaveMessage = req.query.leavemessage;
            let joinMessage = req.query.joinmessage;
            chatSwitchChannels(channel, leaveMessage, joinMessage);
            res.send(JSON.stringify({status:"SUCCESS"}));
        });

        router.get("/twitch/chat_restart", async(req, res) => {
            restartChat("restart");
            res.send(JSON.stringify({status:"SUCCESS"}));
        });

        router.get("/mod/currentviewers", async(req,res) => {
            
            await Axios({
                url: "https://tmi.twitch.tv/group/user/"+homeChannel.substr(1)+"/chatters",
                method: 'get',
            })
            .then((response)=>{
                
                res.send(JSON.stringify(response.data));
                
            }).catch(error=>{
                console.error("ERROR",error);
            });
            
        });

        //HTTPS ROUTER
        router.post("/webhooks/eventsub", async (req, res) => {
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

            if(event.broadcaster_user_id != broadcasterUserID){
                if(type == "stream.online"){
                    webUI.setShare(event.broadcaster_user_login, true);
                }else if(type == "stream.offline"){
                    webUI.setShare(event.broadcaster_user_login, false);
                }
                res.status(200).end();
                return;
            }

            if(type == "channel.raid"){
                await getBroadcasterID();
                if(event.to_broadcaster_user_id == broadcasterUserID){
                    event.raidType = "receive";
                }else if(event.from_broadcaster_user_id == broadcasterUserID){
                    event.raidType = "send";
                }
            }

            if(type == "stream.online"){
                startReoccuringMessage();
            }

            if(type == "stream.offline"){
                if(streamChatInterval != null){
                    clearInterval(streamChatInterval);
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
							twitchLog("Failed to run response script. Check the event settings to verify it.");
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
                        let plugin = eventsubs.events[type].plugin;
                        if(activePlugins[plugin.pluginname] != null){
                            if(typeof activePlugins[plugin.pluginname].onEvent != null){
                                try{
                                    activePlugins[plugin.pluginname].onEvent(plugin.eventname, event);
                                }catch(e){
                                    twitchLog(e);
                                }
                            }
                        }
                    }
                }

                if(eventsubs.events[type].spooderevent != null){
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
                                    sayInChat(event.reward.title+" is locked on my end. Sorry.");
                                    return;
                                }
                            }else if(events[e].triggers.redemption.override == false && modlocks.events[e] == 1){
                                sayInChat("MODS! This event is locked on my end. I can't reject it myself because I didn't create it :( please either lift the lock on "+e+" or reject it.")
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
                                sayInChat(event.reward.title+" is locked on my end. Sorry.");
                                return;
                            }
                        }else{
                            sayInChat(event.user_name+" Sorry, the "+event.reward.title+" is a no go.");
                        }
                    }
                }
            }

            res.status(200).end();
        });

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
                
                await initEventSub(subtype, bid);
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
        
        async function initEventSub(eventType, bid){
            await getAppToken();
            
            if(bid == null){
                await getBroadcasterID();
                bid = broadcasterUserID;
            }
            
            var condition = {};

            if(!eventType.startsWith("channel.raid")){
                condition = {"broadcaster_user_id":bid};
            }else{
                if(eventType.split("-")[1] == "receive"){
                    condition = {"to_broadcaster_user_id":bid};
                }else{
                    condition = {"from_broadcaster_user_id":bid};
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

        global.sayInChat = async (message, chatChannel) =>{
            if(chatChannel == null){chatChannel = homeChannel}
            if(message == null || message == ""){
                twitchLog("EMPTY MESSAGE");
                return;
            }
            if(message.length >= 490){
                let limit = 490;
                let totalMessages = Math.ceil(message.length/limit);
                
                for(let stringpos=0; stringpos<message.length; stringpos+=limit){
                    
                    if(stringpos+limit > message.length){
                        await chat.say(homeChannel, "["+totalMessages+"/"+totalMessages+"] "+message.substring(stringpos, message.length));
                    }else{
                        //twitchLog(stringpos, stringpos.limit);
                        await chat.say(homeChannel, "["+(Math.round((stringpos+limit)/limit)+"/"+totalMessages+"] "+message.substring(stringpos, stringpos+limit)));
                    }
                }
            }else{
                await chat.say(chatChannel,message)
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
            homeChannel = newChannel;
            if(joinMessage != null && joinMessage != ""){
                runChat(joinMessage);
            }else{
                runChat();
            }
            
        }
    
        global.disconnectChat = () => {
            chat.disconnect();
        }

        global.joinChannel = async (channelname, joinmsg)=>{
            await chat.join(channelname);
            sayInChat(joinmsg, channelname);
        }

        global.leaveChannel = async (channelname, partmsg)=>{
            sayInChat(partmsg, channelname);
            await chat.part(channelname);
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
            let response = await axios.get("https://tmi.twitch.tv/group/user/"+homeChannel.substr(1)+"/chatters");
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
    }

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

            await getBroadcasterID();
            await getAppToken();
    
            runChat();
            res("success");
        })
        
	}

    async getChannelInfo(){
        return new Promise((res, rej) => {
            Axios({
                url: "https://api.twitch.tv/helix/channels?broadcaster_id="+broadcasterUserID,
                method: 'GET',
                headers:{
                    "Authorization": "Bearer "+appToken,
                    "Client-Id":clientId,
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

    getChannels(){
        if(chat == null){return null;}
        if(chat.readyState() == "OPEN"){
            return chat.getChannels();
        }else{
            return null;
        }
    }

    getUserInfo(user){

		return new Promise(async (res, rej)=>{
			fetch("https://api.twitch.tv/helix/users?login="+user, {
				method: 'GET',
				headers:{
					"Client-Id": oauth["client-id"],
					"Authorization": " Bearer "+appToken,
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
	}

	async validateBroadcaster(){
		if(oauth.broadcaster_token == "" || oauth.broadcaster_token == null){
            twitchLog("No broadcaster auth saved. Authorizing on the Web UI saves your auth tokens for chat. If that's your broadcasting account, then go to the EventSub tab and click 'Save Current Oauth as Broadcaster'. You can have both pairs of tokens be the same. If you want a separate account for chat. Log in to twitch.tv as your bot account and authorize on the Web UI.");
            return;
        }

        return new Promise((res, rej)=>{
            Axios({
                url: 'https://id.twitch.tv/oauth2/validate',
                method: 'get',
                headers:{
                    "Authorization": "Bearer "+oauth.broadcaster_token
                }
            })
            .then((response)=>{
                
                twitchLog("Validated broadcaster: "+response.data.login+"!");
                res("OK");
            }).catch(async error=>{
                
                if(error.response?.status == 401){
                    onBroadcasterAuthFailure().then(async newtoken=>{
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
        if(oauth.refreshToken == "" || oauth.refreshToken == null){
            twitchLog("No chat oauth saved. Go into the Web UI, click the top for the navigation menu, then click 'authorize'. You must be on localhost to make auth tokens. If this is a fresh Spooder, you'll want to log in to twitch.tv as the account you use to broadcast first. Then go to the EventSub tab to copy your auth tokens to broadcaster.");
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
                botUsername = response.data.login;
                twitchLog("Validated Chatbot: "+response.data.login+"!");
                res({status:"OK"});
            }).catch(error=>{
                console.error("ERROR",error);
                if(error.response?.status == 401){
                    onAuthenticationFailure().then(async newtoken=>{
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