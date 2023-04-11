var voice = null;
const fs = require("fs");

var discordLog = (...content) => {
    console.log(logEffects("Bright"),logEffects("FgCyan"), ...content, logEffects("Reset"));
}

class SDiscord{

    constructor(router){
        router.post("/discord/saveDiscordConfig", async(req, res) => {
            fs.writeFile(backendDir+"/settings/discord.json", JSON.stringify(req.body), "utf-8", (err, data)=>{
                if(this.loggedIn == false && req.body.token != null && req.body.token != ""){
                    this.autoLogin();
                    res.send({status:"SAVED! Logging into Discord..."});
                }else{
                    res.send({status:"SAVE SUCCESS"});
                }
                
            });
        });

        router.get("/discord/get_channels", async(req, res) => {
            let guilds = this.getGuilds();
            res.send(guilds);
        });

        router.get("/discord/config", async(req, res) => {
            let guilds = this.getGuilds();
            res.send({config:this.config, guilds:guilds});
        });
        
        router.get("/discord/user", async (req, res)=>{
            let user = await this.client.users.fetch(req.query.userid);
            if(user != null){
                res.send({userInfo:user});
            }
        })
        this.config = fs.existsSync(backendDir+"/settings/discord.json")?JSON.parse(fs.readFileSync(backendDir+"/settings/discord.json",{encoding:"utf-8"})):null;
    }
    config = null;
    client = null;
    guilds = null;
    loggedIn = false;
    voiceChannel = null;
    audioPlayer = null;
    audioReceiver = null;
    commands = null;

    autoLogin(){
        
        const {SlashCommandBuilder, Collection, REST, Routes} = require("discord.js");
        this.commands = new Collection();
        
        return new Promise(async (res, rej) => {

            let discordInfo = this.config;
            if(discordInfo == null){
                discordLog("No Discord token. You can set this in the Config tab.");
                rej("notoken");
                return;
            }
        
            if(discordInfo.commands){
                let dCommands = discordInfo.commands;
                for(let d in dCommands){
                    this.commands.set(dCommands[d].data.name, dCommands[d]);
                }
                console.log(`Started refreshing ${commands.length} application (/) commands.`);
                const rest = new REST({version:"10"}).setToken(discordInfo.token);
                const data = await rest.put(Routes.applicationCommands(discordInfo.clientId), {body:commands});

                discordLog(`Successfully reloaded ${data.length} application (/) commands.`);
            }else{
                

                /*let defaultCommand = {
                    data:new SlashCommandBuilder()
                            .setName("time")
                            .setDescription("Replies with provided time for each user's locale")
                            .addStringOption(option=>option.setName("inputtime")
                                .setDescription("The time in your locale to make dynamic")
                                .setRequired(true))
                            .addStringOption(option=>option.setName("inputdate")
                                .setDescription("The date to make dynamic"))
                            .addBooleanOption(option=>option.setName("relative")
                                .setDescription("Tell how long ago or in the future the time will be"))
                            .addBooleanOption(option=>option.setName("code")
                                .setDescription("Get the raw code to append to your message")),
                    async execute(interaction){
                        let time = new Date();
                        
                        let inputTime = interaction.options.get("inputtime").value.toLowerCase();
                        let inputDate = interaction.options.get("inputdate")?.value;
                        let isRelative = interaction.options.get("relative")?.value;
                        let isCode = interaction.options.get("code")?.value;
                        let pmOffset = inputTime.toLowerCase().includes("pm")?12:0;
                        inputTime.replace("pm","");
                        inputTime.replace("am","");
                        let splitTime = inputTime.split(":");
                        for(let s in splitTime){splitTime[s] = parseInt(splitTime[s])}
                        //console.log(splitTime, pmOffset);
                        let dynamicCode = "t";
                        if(splitTime.length == 1){
                            time.setHours(splitTime[0]+pmOffset);
                            time.setMinutes(0);
                        }
                        if(splitTime.length == 2){
                            time.setHours(splitTime[0]+pmOffset);
                            time.setMinutes(splitTime[1]);
                            time.setSeconds(0);
                            dynamicCode = "t";
                        }else if(splitTime.length == 3){
                            time.setHours(splitTime[0]+pmOffset);
                            time.setMinutes(splitTime[1]);
                            time.setSeconds(splitTime[2]);
                            dynamicCode = "T";
                        }

                        if(inputDate != null){
                            console.log("Date",inputDate);
                            dynamicCode = "f";
                            let dateSeperator = "/";
                            if(inputDate.includes("/")){
                                dateSeperator = "/"
                            }else if(inputDate.includes("-")){
                                dateSeperator = "-";
                            }

                            let splitDate = inputDate.split(dateSeperator);

                            if(splitDate.length == 2){
                                time.setDate(splitDate[0]);
                                time.setMonth(splitDate[1]);
                            }else if(splitDate.length == 3){
                                let year = splitDate[2].length==2?"20"+splitDate[2]:splitDate[2];
                                time.setFullYear(year);
                            }
                        }
                        //console.log(time.getDate(), time.getMonth(), time.getFullYear());
                        if(isRelative == true){dynamicCode="R";}
                        let timeCode = "<t:"+Math.floor(time.getTime()/1000)+":"+dynamicCode+">";
                        if(isCode == true){timeCode = "```"+timeCode+"```";}
                        //console.log(timeCode);
                        await interaction.reply(timeCode);
                    }
                };*/
                
            }
            if(discordInfo.token != "" && discordInfo.token != null){
                discordLog("STARTING DISCORD CLIENT");
                await this.startClient(discordInfo.token).catch(e=>{rej(e)});
                res("success");
            }
        })
        
    }

    startClient(token){
        const {Client, Events, GatewayIntentBits, Partials} = require("discord.js");
        return new Promise((res, rej) => {
            this.client = new Client({
                intents: [GatewayIntentBits.Guilds,
                    GatewayIntentBits.DirectMessages,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.GuildIntegrations,
                    GatewayIntentBits.MessageContent,
                    GatewayIntentBits.GuildVoiceStates
                ],
                partials: [Partials.Channel]
            })
                
            var client = this.client;
            client.once(Events.ClientReady, c => {
                this.loggedIn = true;
                discordLog("Discord Ready! Logged in as "+c.user.tag, c.user);
                
                res("success");
            });
            client.on(Events.InteractionCreate, async interaction => {
                discordLog("DISCORD INTERACTION", interaction);
                if(!interaction.isChatInputCommand()){return;}
    
                let command = this.commands.get(interaction.commandName);
    
                if(!command){
                    console.error("Not a valid command");
                    return;
                }
    
                try{
                    await command.execute(interaction);
                }catch(error){
                    console.error(error);
                    await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
                }
            });
            client.on(Events.MessageCreate, async message=>{
                if(message.author.id == client.user.id){return;}
    
                this.callPlugins("message", message);
                
                if(message.guildId == null){
                    discordLog("Discord PM", message.author.username, message.content, message.attachments);
                    
                }else{
                    discordLog("Discord", this.getGuild(message.guildId).name, message.author.username, message.content);
                    
                    if(message.content.toLowerCase() == "!join"){
                        discordLog(message.guildId, message.channelId);
                        this.joinVoiceChannel(message.guildId, message.channelId);
                        return;
                    }
                    if(message.content.toLowerCase() == "!leave"){
                        this.leaveVoiceChannel();
                        return;
                    }
                }
            })
            client.login(token);
        })
        
    }

    callPlugins(type, data){
        for(let a in activePlugins){
            if(typeof activePlugins[a].onDiscord != "undefined"){
                try{
                    activePlugins[a].onDiscord(type, data);
                }catch(e){
                    discordLog(e);
                }
                
            }
        }
    }

    joinVoiceChannel(guildId, channelId){
        voice = require('@discordjs/voice');
        const {VoiceConnectionStatus, entersState} = require('@discordjs/voice');
        let targetServer = this.client.guilds.cache.get(guildId);
        this.voiceChannel = voice.joinVoiceChannel({
            channelId: channelId, //the id of the channel to join (we're using the author voice channel)
            guildId: guildId, //guild id (using the guild where the message has been sent)
            adapterCreator: targetServer.voiceAdapterCreator //voice adapter creator
        });
        
        this.callPlugins("voice", {event:"join", members:this.getChannel(channelId, guildId).members});

        this.voiceChannel.receiver.speaking.on('start', (userId) => {
            //actions here
            //onDiscord(type, data);
            this.callPlugins("voice", {event:"speaking-start", userId:userId})
            //discordLog("Speaking", userId);
        });

        this.voiceChannel.receiver.speaking.on('end', (userId) => {
            this.callPlugins("voice", {event:"speaking-end", userId:userId});
            //discordLog("Stopped", userId);
        });

        this.voiceChannel.on("stateChange", (oldstate, newstate) => {
            discordLog('join', 'Connection state change from', oldstate.status, 'to', newstate.status)
            if (oldstate.status === voice.VoiceConnectionStatus.Ready && newstate.status === voice.VoiceConnectionStatus.Connecting) {
                this.voiceChannel.configureNetworking();
            }
        });

        this.voiceChannel.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
            
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
                // Seems to be reconnecting to a new channel - ignore disconnect
            } catch (error) {
                // Seems to be a real disconnect which SHOULDN'T be recovered from
                connection.destroy();
            }
        });

        this.voiceChannel.on("error", (e)=>{
            console.log(e);
        })

        this.client.on('voiceStateUpdate', (oldstate, newstate)=>{
            //console.log(this.voiceChannel, this.voiceChannel.receiver);
            this.callPlugins("voice", {event:"state-update", oldstate:oldstate, newstate:newstate});
        });

        this.audioPlayer = voice.createAudioPlayer({
            behaviors: {
                noSubscriber: voice.NoSubscriberBehavior.Pause,
            },
        });
    }

    playAudio(url){
        if(this.audioPlayer != null){
            let resource = voice.createAudioResource(url);
            this.audioPlayer.play(resource);
            this.callPlugins("audio", {event:"play", resource:resource})
        }
    }

    pauseAudio(){
        if(this.audioPlayer != null){
            this.audioPlayer.pause();
            this.callPlugins("audio", {event:"pause"});
        }
    }

    leaveVoiceChannel(){
        if(this.voiceChannel == null) {
            discordLog('the bot isn\'t in a voice channel');
            return;
        }
        this.callPlugins("voice", {event:"leave"});
        this.client.removeAllListeners("voiceStateUpdate");
        //leave
        this.audioPlayer.stop();
        this.audioPlayer = null;
        this.voiceChannel.destroy()
        this.voiceChannel = null;
    }

    getServerByName(servername){
        if(!this.loggedIn){return null;}
        let guilds = this.getGuilds();
        //discordLog("GUILDS", servername, guilds);
        for(let g in guilds){
            
            if(guilds[g].name == servername){
                //discordLog("SERVER FOUND", guilds[g].id, guilds[g].name);
                return guilds[g].id;
            }
        }
    }

    getChannelByName(servername, channelname){
        if(!this.loggedIn){return null;}
        let serverId = this.getServerByName(servername);
        let channels = this.getGuild(serverId).channels;
        //discordLog("CHANNELS", channels);
        for(let c in channels){
            //discordLog("CHANNEL SEARCH",channels[c].name, channelname);
            if(channels[c].name == channelname){
                return {server:serverId, channel:channels[c].id};
            }
        }
    }

    getServerName(serverId){
        if(!this.loggedIn){return null;}
        return this.getGuild(serverId).name;
    }

    getChannelName(serverId, channelId){
        if(!this.loggedIn){return null;}
        return this.getGuild(serverId).channels[channelId].name;
    }

    getUser(userId){
        if(!this.loggedIn){return null;}
        return this.client.users.cache.get(userId);
    }

    findUser(userId){
        if(!this.loggedIn){return null;}
        return this.client.users.fetch(userId);
    }

    getUserName(userId){
        if(!this.loggedIn){return null;}
        return this.client.users.cache.get(userId).username;
    }

    getGuilds(){
        if(!this.loggedIn){return null;}
        const convertArrayToObject = (array, key) => {
            const initialValue = {};
            return array.reduce((obj, item) => {
              return {
                ...obj,
                [item[key]]: item,
              };
            }, initialValue);
          };
        let guildCache = this.client.guilds.cache;
        let guilds = convertArrayToObject(guildCache.map(g => {
            
            let channels = g.channels.cache.map(c=>{
                return{
                    id:c.id,
                    name:c.name,
                    type:c.type
                }
            });
            return{
                id:g.id,
                name:g.name,
                channels:convertArrayToObject(channels, "id")
            }
        }) || "None", "id");
        return guilds;
    }

    getGuild(guildId){
        return this.client.guilds.cache.get(guildId);
    }

    getChannel(channelId, guildId){
        return this.client.guilds.cache.get(guildId).channels.cache.get(channelId);
    }

    getAvatar(userId, avatarId){
        fetch("https://cdn.discordapp.com/avatars/"+userId+"/"+avatarId+".png");
    }

    sendToChannel(server, channel, message){
        let client = this.client;
        let targetServer = client.guilds.cache.get(server);
        let targetChannel = targetServer.channels.cache.get(channel);
        targetChannel.send(message);
    }
}

module.exports = SDiscord;