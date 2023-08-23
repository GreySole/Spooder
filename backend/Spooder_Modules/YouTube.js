const fs = require("fs");
const Axios = require("axios");

var youtubeLog = (...content) => {
    console.log(logEffects("Bright"),logEffects("FgRed"), ...content, logEffects("Reset"));
}

class SYouTube{
    constructor(router, publicRouter){
        router.get('/youtube/authorize', async (req,res)=>{
            console.log("Got code");
            const {tokens} = await this.oauth2Client.getToken(req.query);
            this.oauth2Client.setCredentials(tokens);
            this.oauth.refresh_token = tokens.refresh_token;
            this.oauth.token = tokens.access_token;
            fs.writeFileSync(backendDir+"/settings/youtube.json", JSON.stringify(this.oauth));
            res.redirect("/?youtubeauthsuccess");
        });
        this.oauth = fs.existsSync(backendDir+"/settings/youtube.json")?JSON.parse(fs.readFileSync(backendDir+"/settings/youtube.json",{encoding:"utf-8"})):null;
    }

    

    autoLogin(){
        return new Promise((res, rej) => {
            if(fs.existsSync(backendDir+"/settings/youtube.json")){
                let expressPort = sconfig.network.host_port;
                try{
                    this.oauth = fs.existsSync(backendDir+"/settings/youtube.json")?JSON.parse(fs.readFileSync(backendDir+"/settings/youtube.json",{encoding:"utf-8"})):null;
                    const {google} = require('googleapis');
                    this.oauth2Client = new google.auth.OAuth2(
                        this.oauth["client-id"],
                        this.oauth["client-secret"],
                        "http://localhost:"+expressPort+"/youtube/authorize"
                    );
                    if(this.oauth.token != null){
                        this.oauth2Client.setCredentials({
                            access_token:this.oauth.token,
                            refresh_token:this.oauth.refresh_token
                        })
                    }else{
                        console.log("YouTube auth URL", this.getAuthURL());
                    }
                    this.youtube = google.youtube({
                        version:'v3',
                        auth: this.oauth.api
                    });
                    this.loggedIn = true;
                    this.runChat();
                }catch(e){
                    rej("FAILED TO READ YOUTUBE OAUTH FILE");
                }
                res("success");
            }else{
                this.oauth = {};
                return;
            }
        })
        
    }

    viewerCache = {};

    getAuthURL(){
        if(this.oauth["client-id"] != null){

            const scopes = [
                "https://www.googleapis.com/auth/youtube",
                "https://www.googleapis.com/auth/youtube.channel-memberships.creator",
                "https://www.googleapis.com/auth/youtube.force-ssl",
                "https://www.googleapis.com/auth/youtube.readonly",
                "https://www.googleapis.com/auth/youtube.upload"
            ]

            let url = this.oauth2Client.generateAuthUrl({
                access_type: "offline",
                scope:scopes
            });
            this.oauth2Client.on('tokens', (tokens) => {
                this.oauth.refresh_token = tokens.refresh_token;
                this.oauth.token = tokens.access_token;
            })
            return url;
        }else{
            return null;
        }
    }

    async findActiveChat(){
        const response = await this.youtube.liveBroadcasts.list({
            auth: this.oauth2Client,
            part: 'snippet',
            mine: 'true'
        });

        const latestChat = response.data.items[0];
        youtubeLog(latestChat);
        this.chatId = latestChat.snippet.liveChatId;
        this.nextPageToken = response.data.nextPageToken;
        youtubeLog("SET CHAT ID", this.chatId, latestChat.snippet);
    }

    async runChat(){
        if(this.loggedIn){
            await this.findActiveChat();
            
            if(this.chatId != null){
                this.chatInterval = setInterval(this.processMessages.bind(this), 5000);
            }
        }
    }

    chatIsBroadcaster(message){
        return message.tags.isChatOwner?true:false;
    }

    chatIsMod(message){
        return message.tags.isChatModerator?true:false;
    }

    chatIsSubscriber(message){
        return false;
    }

    chatIsVIP(message){
        return false;
    }
    async processMessages(){
        
        const response = await this.youtube.liveChatMessages.list({
            auth: this.oauth2Client,
            part: ['snippet', 'authorDetails'],
            liveChatId:this.chatId,
            pageToken:this.nextPageToken
        });
        const {data} = response;
        this.nextPageToken = data.nextPageToken;
        const newMessages = data.items;
        for(let m in newMessages){
            let message = {
                id:newMessages[m].authorDetails.channelId,
                channel:this.chatId,
                username:newMessages[m].authorDetails.displayName,
                displayName:newMessages[m].authorDetails.displayName,
                message:newMessages[m].snippet.displayMessage,
                tags:{
                    isVerified:newMessages[m].authorDetails.isVerified,
                    isChatOwner:newMessages[m].authorDetails.isChatOwner,
                    isChatSponsor:newMessages[m].authorDetails.isChatSponsor,
                    isChatModerator:newMessages[m].authorDetails.isChatModerator
                },
                eventType:"youtube-chat",
                platform:"youtube",
                respond:(responseTxt)=>{
                    sayInChat(responseTxt, "youtube", this.chatId);
                },
            };
            for(let e in events){
                if(modlocks.events[e] == 1){continue;}
                if(events[e].triggers.chat.enabled){
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
        }
        //youtubeLog(newMessages);
    }

    sayInChat(messageText, chatId){
        console.log(chatId);
        this.youtube.liveChatMessages.insert({
            auth:this.oauth2Client,
            part: 'snippet',
            resource:{
                snippet:{
                    type: 'textMessageEvent',
                    liveChatId:chatId,
                    textMessageDetails:{
                        messageText
                    }
                }
            }
        })
    }

    getUserName(id){
        return new Promise((res, rej) => {
            fetch("https://youtube.googleapis.com/youtube/v3/channels?part=snippet&id="+id+"&key="+this.oauth.api, {
				method: 'GET',
				headers:{
					"Authorization": " Bearer "+this.oauth.token,
					"Content-Type": "application/json"
				}
			})
			.then(response => response.json())
			.then(data => {
				console.log(data);
				if(data != null){
					res(data.items[0].snippet.title);
				}
			})
            .catch(e=>{rej(e)});
        })
        
    }
}

module.exports = SYouTube;