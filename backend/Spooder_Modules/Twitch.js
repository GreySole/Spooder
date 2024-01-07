const Axios = require("axios");
const fs = require("fs");
const tmi = require("tmi.js");

var twitchLog = (...content) => {
    console.log(logEffects("Bright"),logEffects("FgMagenta"), ...content, logEffects("Reset"));
}

function stringifyArray(a){
    return a.join(", ");
}

class STwitch{
    oauth = {};
    constructor(router, publicRouter){
        let expressPort = sconfig.network.host_port;
        if(fs.existsSync(backendDir+"/settings/eventsub.json")){
            twitchLog("Obsolete Eventsub.json detected. Twitch eventsubs are now integrated with Spooder's event system. Go to the Twitch tab in the WebUI to convert your eventsubs!")
        }
        if(fs.existsSync(backendDir+"/settings/twitch.json")){
            try{
                this.oauth = JSON.parse(fs.readFileSync(backendDir+"/settings/twitch.json"));
                if(this.oauth.events != null){
                    twitchLog("Obsolete events property in twitch.json detected. Twitch eventsubs are now integrated with Spooder's event system. Go to the Twitch tab in the WebUI to convert your eventsubs!")
                }
            }catch(e){
                
                if(fs.existsSync(backendDir+"/settings/oauth.json")){
                    try{
                        this.oauth = JSON.parse(fs.readFileSync(backendDir+"/settings/oauth.json"));
                        fs.writeFileSync(backendDir+"/settings/twitch.json", JSON.stringify(this.oauth), "utf-8");
                        fs.rmSync(backend+"/settings/oauth.json");
                        twitchLog("Obsolete oauth.json is now twitch.json!");
                    }catch(e){
                        twitchLog("FAILED TO READ OAUTH FILE");
                        this.oauth = {};
                    }
                }else{
                    twitchLog("FAILED TO READ TWITCH FILE");
                    this.oauth = {};
                }
            }
        }
        router.get('/twitch/authorize', async (req,res)=>{
            twitchLog("Got code");
            let code = req.query.code;
            var twitchParams = "?client_id="+this.oauth['client-id']+
                "&client_secret="+this.oauth['client-secret']+
                "&grant_type=authorization_code"+
                "&code="+code+
                "&redirect_uri=http://localhost:"+expressPort+"/twitch/authorize"+
                "&response_type=code";
                
                
            Axios.post('https://id.twitch.tv/oauth2/token'+twitchParams)
            .then((response)=>{
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
            }).catch(error=>{
                console.error(error);
                res.send({status:"error", error:error});
                return;
            });
            
        });

        router.get("/twitch/revoke", async(req, res) => {
            let cid = this.oauth['client-id'];
            
            if(revokeToken == this.oauth.broadcaster_token){
                await Axios({
                    url: 'https://id.twitch.tv/oauth2/revoke?client_id='+cid+"&token="+this.oauth.broadcaster_token,
                    method: 'POST',
                    headers:{
                        "Content-Type": "application/x-www-form-urlencoded"
                    }
                }).then((response) => {
                    
                })
            }
            twitchLog("Revoking: "+cid);
            await Axios({
                url: 'https://id.twitch.tv/oauth2/revoke?client_id='+cid+"&token="+this.oauth.token,
                method: 'POST',
                headers:{
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            })
            .then((response)=>{

                this.oauth.broadcaster_token = "";
                this.oauth.broadcaster_refreshToken = "";
                this.oauth.token = "";
                this.oauth.refreshToken = "";
                twitchLog("Both oauth revoked");
                res.send({status:"Both oauth revoked"});
                
                fs.writeFile(backendDir+"/settings/twitch.json", JSON.stringify(this.oauth), "utf-8", (err, data)=>{
                    twitchLog("oauth saved!");
                });

            }).catch(error=>{
                console.error(error);
                return;
            });
        });

        router.get("/twitch/save_auth_to_broadcaster", async(req, res) => {
            this.oauth["broadcaster_token"] = this.oauth.token;
            this.oauth["broadcaster_refreshToken"] = this.oauth.refreshToken;
            fs.writeFile(backendDir+"/settings/twitch.json", JSON.stringify(this.oauth), "utf-8", (err, data)=>{
                twitchLog("oauth saved!");
                res.send({status:"SUCCESS"});
            });
        });

        router.post("/twitch/saveEventSubs", async(req, res) => {
            delete req.body.callback_url;
            fs.writeFile(backendDir+"/settings/twitch.json", JSON.stringify(req.body), "utf-8", (err, data)=>{
                eventsubs = req.body;
                res.send({status:"SAVE SUCCESS"});
            });
        })

        router.get("/convertEventsubToSpooder", (req, res) => {
            let oldEvents = null;
            if(twitch.oauth.events != null){
                oldEvents = twitch.oauth.events;
            }else if(fs.existsSync(backendDir+"/settings/eventsub.json")){
                oldEvents = JSON.parse(fs.readFileSync(backendDir+"/settings/eventsub.json"));
            }

            if(oldEvents == null){
                res.send({status:"No legacy eventsub events found."});
                return;
            }

            eventGroups.push("Twitch Events");
            for(let e in oldEvents){
                let newEventName = e.replaceAll(".", "_");
                events[newEventName] = {
                    "name":newEventName,
                    "description":"",
                    "group":"Twitch Events",
                    "cooldown":0,
                    "chatnotification":false,
                    "cooldownnotification":false,
                    "triggers":{
                        "chat":{"enabled":false, "command":"!"},
                        "twitch":{"enabled":true, type:e, reward:{ "id":"", override:false}},
                        "osc":{"enabled":false, "address":"/", "type":"single","condition":"==", "value":0, "condition2":"==", "value2":0}
                    },
                    "commands":[]
                };
                if(oldEvents[e].chat.enabled == true){
                    if(e == "stream.online"){
                        events[newEventName].commands.push(
                            {
                                type:"response",
                                search:false,
                                message:oldEvents[e].chat.message,
                                delay:0,
                            }
                        )
                        events[newEventName].special = {
                            discord: Object.assign({}, oldEvents[e].chat.discord),
                            reoccuringmessage:{
                                message: oldEvents[e].chat.reoccuringmessage,
                                interval: oldEvents[e].chat.interval
                            }
                        }
                    }else{
                        events[newEventName].commands.push(
                            {
                                type:"response",
                                message:oldEvents[e].chat.message,
                                search:false,
                                delay:0
                            }
                        )
                    }
                    
                }

                if(oldEvents[e].plugin.enabled == true){
                    events[newEventName].commands.push(
                        {
                            type:"plugin",
                            pluginname:oldEvents[e].plugin.pluginname,
                            eventname:oldEvents[e].plugin.eventname,
                            etype:"oneshot",
                            stop_eventname:"",
                            duration:60,
                            delay:0
                        }
                    )
                }

                if(oldEvents[e].udp.enabled == true){
                    events[newEventName].commands.push(
                        {
                            "type": "software",
                            "etype": "timed",
                            "dest_udp": oldEvents[e].udp.dest,
                            "address": oldEvents[e].udp.address,
                            "valueOn": oldEvents[e].udp.value,
                            "valueOff": oldEvents[e].udp.valueoff,
                            "duration": parseInt(oldEvents[e].udp.duration)/1000,
                            "delay": 0,
                            "priority": 0
                        }
                    )
                }
            }
            fs.writeFileSync(backendDir+"/settings/commands.json", JSON.stringify({events:events, groups:eventGroups}), "utf-8");
            res.send({status:"ok"});
        })

        router.get("/twitch/cleanupOldEventsubs", (req, res) => {
            if(fs.existsSync(backendDir+"/settings/oauth.json")){
                fs.rmSync(backendDir+"/settings/oauth.json");
            }
            if(fs.existsSync(backendDir+"/settings/eventsub.json")){
                fs.rmSync(backendDir+"/settings/eventsub.json");
            }
            
            res.send({status:"ok"});
        })

        router.get("/twitch/eventsubs", async(req, res) => {
            let sendSubs = Object.assign(eventsubs);
            sendSubs.callback_url = sconfig.network.external_http_url;
            sendSubs.spooderevents = Object.keys(events);
            res.send(JSON.stringify(sendSubs));
        });

        router.get("/twitch/config", async(req, res) => {
            let sendSubs = Object.assign(this.oauth);
            let twitchBotUser = await this.getUserInfo(this.botUsername);
            let twitchBroadcasterUser = await this.getUserInfo(this.homeChannel);
            sendSubs.botUser = twitchBotUser;
            sendSubs.broadcasterUser = twitchBroadcasterUser;
            sendSubs.host_port = sconfig.network.host_port;
            sendSubs.callback_url = sconfig.network.external_http_url;
            sendSubs.spooderevents = Object.keys(events);
            res.send(sendSubs);
        });

        router.get("/twitch/get_eventsubs", async(req,res) => {
            await this.getAppToken();
            if(this.appToken ==""){
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

        router.get("/twitch/get_channelpoint_rewards", async(req, res) => {
            if(this.oauth.broadcaster_token=="" || this.oauth.broadcaster_token == null){
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

        router.get("/twitch/delete_eventsub", async(req,res) => {
            
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

        router.get("/twitch/refresh_eventsubs", async(req,res)=>{
            await this.refreshEventSubs();
            res.send({status:"SUCCESS"});
        })

        router.get("/twitch/init_eventsub", async(req,res) => {
            
            let subStatus = await this.initEventSub(req.query.type, req.query.user_id);
            
            res.send(JSON.stringify({status:subStatus}));
        });

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

        router.get("/twitch/chat_restart", async(req, res) => {
            this.restartChat("restart");
            res.send(JSON.stringify({status:"SUCCESS"}));
        });

        router.get("/mod/currentviewers", async(req,res) => {
            
            await Axios({
                url: "https://tmi.twitch.tv/group/user/"+this.homeChannel.substr(1)+"/chatters",
                method: 'get',
            })
            .then((response)=>{
                
                res.send(JSON.stringify(response.data));
                
            }).catch(error=>{
                console.error("ERROR",error);
            });
            
        });

        //HTTPS ROUTER
        publicRouter.post("/webhooks/eventsub", async (req, res) => {
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

            res.status(200).end();

            event.eventsubType = type;

            event.message = "";
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

            if(type == "channel.raid"){
                await this.getBroadcasterID();
                if(event.to_broadcaster_user_id == this.broadcasterUserID){
                    event.raidType = "receive";
                    event.username = event.from_broadcaster_user_login;
                    event.displayName = event.from_broadcaster_user_name;
                }else if(event.from_broadcaster_user_id == this.broadcasterUserID){
                    event.raidType = "send";
                    event.username = event.to_broadcaster_user_login;
                    event.displayName = event.to_broadcaster_user_name;
                }
            }

            

            if(type == "stream.online"){
                this.startReoccuringMessage();
                let onlineEvent = this.getStreamOnlineEvent();
                if(onlineEvent != null){
                    if(onlineEvent.special?.discord?.enabled == true){
                        if(discord.loggedIn == true){
                            let channelInfo = await this.getChannelInfo(this.broadcasterUserID);
                            let onlineMessage = "@everyone "+channelInfo[0].broadcaster_name+" is live: "+channelInfo[0].title+"!";
                            let watchButton = discord.makeLinkButton("Watch", "https://twitch.tv/"+this.homeChannel)
                            discord.sendToChannel(onlineEvent.special.discord.guild, onlineEvent.special.discord.channel, 
                                {content:onlineMessage, components:[watchButton]})
                        }
                    }
                }
            }

            if(type == "stream.offline"){
                if(this.streamChatInterval != null){
                    clearInterval(this.streamChatInterval);
                }
            }

            if(type == "channel.channel_points_custom_reward_redemption.add"){
                event.userId = event.user_id;
                event.username = event.user_login;
                event.displayName = event.user_name;
                event.message = event.user_input;
                for(let e in events){
                    if(events[e].triggers.twitch == null){return}
                    if(events[e].triggers.twitch.enabled
                        && events[e].triggers.twitch.reward.id == event.reward.id){
                            if(event.status == "fulfilled" || events[e].triggers.twitch.reward.override == true){
                                if(modlocks.events[e] != 1){
                                    event.eventType = "twitch-redeem";
                                    runCommands(event, e);
                                }else{
                                    //rejectChannelPointReward(event.reward.id, event.id);
                                    this.sayInChat(event.reward.title+" is locked on my end. Sorry.");
                                    return;
                                }
                            }else if(events[e].triggers.twitch.reward.override == false && modlocks.events[e] == 1){
                                this.sayInChat("MODS! This event is locked on my end. I can't reject it myself because I didn't create it :( please either lift the lock on "+e+" or reject it.")
                            }
                        }
                }

            }else if(type == "channel.channel_points_custom_reward_redemption.update"){
                event.userId = event.user_id;
                event.username = event.user_login;
                event.displayName = event.user_name;
                event.message = event.user_input;
                for(let e in events){
                    if(events[e].triggers.twitch == null){return}
                    if(events[e].triggers.twitch.enabled
                    && events[e].triggers.twitch.reward.id == event.reward.id
                    && events[e].triggers.twitch.reward.override == false){
                        if(event.status == "fulfilled"){
                            if(modlocks.events[e] != 1){
                                event.eventType = "twitch-redeem";
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
            }else{
                if(type != "channel.raid"){
                    event.userId = event.user_id ?? event.broadcaster_user_id;
                    event.username = event.user_login ?? event.broadcaster_user_login;
                    event.displayName = event.user_name ?? event.broadcaster_user_name;
                }
                for(let e in events){
                    if(events[e].triggers.twitch == null){return}
                    if(events[e].triggers.twitch?.enabled == true){
                        if(events[e].triggers.twitch.type == type){
                            event.eventType = "twitch-event";
                            runCommands(event, e);
                        }
                    }
                }
            }
        });

        this.isStreamerLive()
        .then(isLive =>{
            if(isLive == true){
                this.startReoccuringMessage();
            }
        });
    }

    getStreamOnlineEvent(){
        for(let e in events){
            if(events[e].triggers.twitch.type == "stream.online"){
                return events[e];
            }
        }
    }

    eventsubs = {
        "channel.update": "Channel Update",
        "channel.follow": "Follow",
        "channel.subscribe": "Subscribe",
        "channel.subscription.end": "Subscription End",
        "channel.subscription.gift": "Subscription Gift",
        "channel.subscription.message": "Subscription Message",
        "channel.cheer": "Cheer",
        "channel.raid": "Raid",
        "channel.ban": "Ban",
        "channel.unban": "Unban",
        "channel.moderator.add": "Mod Add",
        "channel.moderator.remove": "Mod Remove",
        "channel.channel_points_custom_reward.add": "Channel Points Custom Reward Add",
        "channel.channel_points_custom_reward.update": "Channel Points Custom Reward Update",
        "channel.channel_points_custom_reward.remove": "Channel Points Custom Reward Remove",
        "channel.channel_points_custom_reward_redemption.add": "Channel Points Custom Reward Redemption Add",
        "channel.channel_points_custom_reward_redemption.update": "Channel Points Custom Reward Redemption Update",
        "channel.poll.begin": "Poll Begin",
        "channel.poll.progress": "Poll Progress",
        "channel.poll.end": "Poll End",
        "channel.prediction.begin": "Prediction Begin",
        "channel.prediction.progress": "Prediction Progress",
        "channel.prediction.lock": "Prediction Lock",
        "channel.prediction.end": "Prediction End",
        "channel.charity_campaign.donate":"Charity Donate",
        "channel.charity_campaign.start":"Charity Start",
        "channel.charity_campaign.progress":"Charity Progress",
        "channel.charity_campaign.stop":"Charity Stop",
        "drop.entitlement.grant": "Drop Entitlement Grant",
        "extension.bits_transaction.create": "Extension Bits Transaction Create",
        "channel.goal.begin": "Goal Begin",
        "channel.goal.progress": "Goal Progress",
        "channel.goal.end": "Goal End",
        "channel.hype_train.begin": "Hype Train Begin",
        "channel.hype_train.progress": "Hype Train Progress",
        "channel.hype_train.end": "Hype Train End",
        "channel.shield_mode.begin":"Shield Mode Begin",
        "channel.shield_mode.end":"Shield Mode End",
        "channel.shoutout.create":"Shoutout Create",
        "channel.shoutout.receive":"Shoutout Receive",
        "stream.online": "Stream Online",
        "stream.offline": "Stream Offline",
        "user.authorization.grant": "User Authorization Grant",
        "user.authorization.revoke": "User Authorization Revoke",
        "user.update": "User Update"
    }

    async onEventFileSaved(){
        let subs = await this.getEventSubs();
        let usedEventsubs = [];
        let redeemSet = false;
        for(let e in events){
            if(this.eventsubs[events[e].triggers.twitch.type] != null || events[e].triggers.twitch.type == "redeem"){
                let subtype = events[e].triggers.twitch.type;
                let bid = this.brodcasterUserID;
                if(subtype == "redeem"){
                    usedEventsubs.push("channel.channel_points_custom_reward_redemption.add");
                    usedEventsubs.push("channel.channel_points_custom_reward_redemption.update");
                }else{
                    usedEventsubs.push(subtype);
                }
                
                let needsRefresh = true;

                if(subtype == "redeem"){
                    
                    for(let s in subs.data){
                        if(subs.data[s].type == "channel.channel_points_custom_reward_redemption.add"
                            || subs.data[s].type == "channel.channel_points_custom_reward_redemption.update"){
                            if(subs.data[s].transport.callback == sconfig.network.external_http_url+"/webhooks/eventsub"){
                                needsRefresh = false;
                            }else{
                                twitchLog("Refreshing "+subs.data[s].type);
                                await this.deleteEventSub(subs.data[s].id);
                            }
                        }
                    }

                    if(needsRefresh == true && redeemSet == false){
                        twitchLog("Setting up redeems");
                        await this.initEventSub("channel.channel_points_custom_reward_redemption.add", bid);
                        await this.initEventSub("channel.channel_points_custom_reward_redemption.update", bid);
                        redeemSet = true;
                    }

                }else{
                    for(let s in subs.data){
                        if(subs.data[s].type == subtype){
                            if(subs.data[s].transport.callback == sconfig.network.external_http_url+"/webhooks/eventsub"){
                                needsRefresh = false;
                            }else{
                                twitchLog("Refreshing "+subs.data[s].type);
                                await this.deleteEventSub(subs.data[s].id);
                            }
                        }
                    }
    
                    if(needsRefresh == true){
                        if(subtype == "channel.raid"){
                            await this.initEventSub(subtype+"-send", bid);
                            await this.initEventSub(subtype+"-receive", bid);
                        }else{
                            await this.initEventSub(subtype, bid);
                        }
                    }
                }                
            }
        }

        for(let s in subs.data){
            if(subs.data[s].condition.broadcaster_user_id == this.broadcasterUserID
                || subs.data[s].condition.to_broadcaster_user_id == this.broadcasterUserID
                || subs.data[s].condition.from_broadcaster_user_id == this.broadcasterUserID){
                    if(!usedEventsubs.includes(subs.data[s].type)){
                        twitchLog("Deleting sub no longer used: "+subs.data[s].type);
                        await this.deleteEventSub(subs.data[s].id);
                    }
                }
        }
    }

    loggedIn = false;

    autoLogin(startChat=true){
        
        return new Promise(async (res, rej)=>{
            if(this.oauth.token == "" || this.oauth.token == null){
                twitchLog("No chat oauth saved. Go into the Web UI, click the top for the navigation menu, then click 'authorize'. You must be on localhost to make auth tokens.");
                rej("notoken");
                return;
            }
            let botStatus = await this.validateChatbot();
            
            if(botStatus.status == "newtoken"){
                this.oauth["token"] = botStatus.newtoken;
            }else if(botStatus.status == "error"){
                twitchLog("CHATBOT ERROR", botStatus.error);
                return;
            }
    
            if(this.oauth.broadcaster_refreshToken != "" && this.oauth.broadcaster_refreshToken != null){
                let broadcasterStatus = await this.validateBroadcaster();
                if(broadcasterStatus.status == "newtoken"){
                    this.oauth["broadcaster_token"] = broadcasterStatus.newtoken;
                }else if(broadcasterStatus.status == "error"){
                    twitchLog("BROADCASTER ERROR", broadcasterStatus.error);
                    return;
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
                'moderator:read:shoutouts',
                'moderator:manage:shoutouts',
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

    processDeletedMessage(channel, username, deletedMessage, userstate){
        let message = {
            channel:channel.replace("#",""),
            platform:"twitch",
            username:username,
            deletedMessage:deletedMessage,
            userstate:userstate
        };
        
        for(let p in activePlugins){
            try{
                if(message.channel != this.homeChannel){
                    if(shares[message.channel]?.plugins.includes(p)){
                        if(activePlugins[p].onEvent != null){
                            activePlugins[p].onEvent("messagedeleted",message);
                        }
                    }
                }else{
                    if(activePlugins[p].onEvent != null){
                        activePlugins[p].onEvent("messagedeleted",message);
                    }
                }
            }catch(e){
                twitchLog(e);
            }
        }
    }
    
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
                }
            }

            if(command[0] == "verify"){
                if(activeUsers.pending[message.username].vtype == "twitch" && activeUsers.pending[message.username].verified == false){
                    activeUsers.pending[message.username].verified = true;
                    this.sayInChat(message.username+" You're verified! Now set a username and password for my records.");
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
            if(message.channel != this.homeChannel){
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
                    if(message.channel != this.homeChannel){
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
        this.chat.on("messagedeleted", this.processDeletedMessage.bind(this));
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
        if(username == null){username = this.homeChannel}
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
        let onlineEvent = this.getStreamOnlineEvent();
        if(onlineEvent == null){twitchLog("No stream.online event for reoccuring mesage found."); return;}
        if(onlineEvent.special.reoccuringmessage.message != "" ){
            let reoccuringInterval = async function(){
                try{
                    let responseFunct = eval("() => {let count = "+JSON.stringify(this.reoccuringMessageCount)+"; "+onlineEvent.special.reoccuringmessage.message.replace(/\n/g, "")+"}");
                    let response = await responseFunct();
                    this.sayInChat(response);
                    this.reoccuringMessageCount++;
                }catch(e){
                    this.sayInChat("The reoccuring message failed to send :( Check my logs to see what went wrong!");
                    clearInterval(this.streamChatInterval);
                }
                
            };
            let reoccurTime = onlineEvent.special.reoccuringmessage.interval;
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
                await this.deleteEventSub(subs.data[s].id);
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
        if(eventType == "channel.follow" || eventType == "channel.update"){
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

    callBotAPI(url, postBody){
        let method = postBody==null?"GET":"POST";
        if(postBody == "DELETE"){method = "DELETE"}
        if(postBody == "PATCH"){method = "PATCH"}
        if(this.loggedIn == false){return;}
        return new Promise((res, rej)=>{
            Axios({
                url: url,
                method: method,
                headers:{
                    "Client-Id":this.oauth["client-id"],
                    "Authorization":"Bearer "+this.oauth.token,
                    "Content-Type":"application/json"
                },
                body:postBody
            })
            .then(data => res(data))
            .catch(error=>{
                console.error(error);
                rej(error);
            });
        })
    }

    callAppAPI(url, postBody){
        let method = postBody==null?"GET":"POST";
        if(postBody == "DELETE"){method = "DELETE"}
        if(postBody == "PATCH"){method = "PATCH"}
        if(this.loggedIn == false){return;}
        return new Promise((res, rej)=>{
            Axios({
                url: url,
                method: method,
                headers:{
                    "Client-Id":this.oauth["client-id"],
                    "Authorization":"Bearer "+this.appToken,
                    "Content-Type":"application/json"
                },
                body:postBody
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

    callBroadcasterAPI(url, postBody){
        let method = postBody==null?"GET":"POST";
        if(postBody == "DELETE"){method = "DELETE"}
        if(postBody == "PATCH"){method = "PATCH"}
        if(this.loggedIn == false){return;}
        return new Promise((res, rej)=>{
            Axios({
                url: url,
                method: method,
                headers:{
                    "Client-Id":this.oauth["client-id"],
                    "Authorization":"Bearer "+this.oauth.broadcaster_token,
                    "Content-Type":"application/json"
                },
                body:postBody
            })
            .then(data => res(data))
            .catch(error=>{
                console.error(error);
                rej(error);
            });
        })
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
                this.botUsername = response.data.login;
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