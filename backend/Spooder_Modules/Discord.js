var voice = null;
const fs = require("fs");

var discordLog = (...content) => {
    console.log(logEffects("Bright"),logEffects("FgCyan"), ...content, logEffects("Reset"));
}

class SDiscord{

    constructor(router){
        router.post("/saveDiscordConfig", async(req, res) => {
            fs.writeFile(backendDir+"/settings/discord.json", JSON.stringify(req.body), "utf-8", (err, data)=>{
                if(this.loggedIn == false && req.body.token != null && req.body.token != ""){
                    this.autoLogin();
                    res.send({status:"SAVED! Logging into Discord..."});
                }else{
                    res.send({status:"SAVE SUCCESS"});
                }
                
            });
        });
        
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
        
        const {SlashCommandBuilder, Collection} = require("discord.js");
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
            }else{
                let defaultCommand = {
                    data:new SlashCommandBuilder()
                            .setName("ping")
                            .setDescription("Replies with pong"),
                    async execute(interaction){
                        await interaction.reply("Pong!");
                    }
                };
                this.commands.set(defaultCommand.data.name, defaultCommand);
                discordLog("Default command set!", defaultCommand);
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
                const convertArrayToObject = (array, key) => {
                    const initialValue = {};
                    return array.reduce((obj, item) => {
                      return {
                        ...obj,
                        [item[key]]: item,
                      };
                    }, initialValue);
                  };
                let guildCache = client.guilds.cache;
                this.guilds = convertArrayToObject(guildCache.map(g => {
                    
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
    
                
                res("success");
                //discordLog("GUILDS", this.guilds);
            });
            client.on(Events.InteractionCreate, async interaction => {
                discordLog("DISCORD INTERACTION", interaction);
                if(!interaction.isChatInputCommand()){return;}
    
                let command = interaction.client.commands.get(interaction.commandName);
    
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
    
                for(let a in activePlugins){
                    if(typeof activePlugins[a].onDiscord != "undefined"){
                        activePlugins[a].onDiscord("message", message);
                    }
                }
                
                if(message.guildId == null){
                    discordLog("Discord PM", message.author.username, message.content);
                    
                }else{
                    discordLog("Discord", this.guilds[message.guildId].name, message.author.username, message.content);
                    
                    if(message.content.toLowerCase() == "join" || message.content.toLowerCase() == "come here"){
                        discordLog(message.guildId, message.channelId);
                        this.joinVoiceChannel(message.guildId, message.channelId);
                        return;
                    }
                    if(message.content.toLowerCase() == "leave"){
                        this.leaveVoiceChannel();
                        return;
                    }
                }
            })
            client.login(token);
        })
        
    }

    joinVoiceChannel(guildId, channelId){
        voice = require('@discordjs/voice');
        let targetServer = this.client.guilds.cache.get(guildId);
        this.voiceChannel = voice.joinVoiceChannel({
            channelId: channelId, //the id of the channel to join (we're using the author voice channel)
            guildId: guildId, //guild id (using the guild where the message has been sent)
            adapterCreator: targetServer.voiceAdapterCreator //voice adapter creator
        })
        this.voiceChannel.receiver.speaking.on('start', (userId) => {
            //actions here
            //onDiscord(type, data);
            for(let a in activePlugins){
                if(typeof activePlugins[a].onDiscord != "undefined"){
                    activePlugins[a].onDiscord("voice", {event:"start", userId:userId})
                }
            }
            discordLog("Speaking", userId);
        });

        this.voiceChannel.receiver.speaking.on('end', (userId) => {
            for(let a in activePlugins){
                if(typeof activePlugins[a].onDiscord != "undefined"){
                    activePlugins[a].onDiscord("voice", {event:"end", userId:userId})
                }
            }
            discordLog("Stopped", userId);
        });

        this.client.on('voiceStateUpdate', (oldstate, newstate)=>{
            for(let a in activePlugins){
                if(typeof activePlugins[a].onDiscord != "undefined"){
                    activePlugins[a].onDiscord("voice", {event:"stateupdate", oldstate:oldstate, newstate:newstate});
                }
            }
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
            for(let a in activePlugins){
                if(typeof activePlugins[a].onDiscord != "undefined"){
                    activePlugins[a].onDiscord("audio", {event:"play", resource:resource});
                }
            }
        }
    }

    pauseAudio(){
        if(this.audioPlayer != null){
            this.audioPlayer.pause();
            for(let a in activePlugins){
                if(typeof activePlugins[a].onDiscord != "undefined"){
                    activePlugins[a].onDiscord("audio", {event:"pause"});
                }
            }
        }
        
    }

    leaveVoiceChannel(){
        if(this.voiceChannel == null) {return message.channel.send('the bot isn\'t in a voice channel')}
        //leave
        this.audioPlayer.stop();
        this.audioPlayer = null;
        this.voiceChannel.destroy()
        this.voiceChannel = null;
    }

    getServerByName(servername){
        let guilds = this.guilds;
        //discordLog("GUILDS", servername, guilds);
        for(let g in guilds){
            
            if(guilds[g].name == servername){
                //discordLog("SERVER FOUND", guilds[g].id, guilds[g].name);
                return guilds[g].id;
            }
        }
    }

    getChannelByName(servername, channelname){
        let serverId = this.getServerByName(servername);
        //discordLog("GOT SERVER", serverId, this.guilds[serverId]);
        let channels = this.guilds[serverId].channels;
        //discordLog("CHANNELS", channels);
        for(let c in channels){
            //discordLog("CHANNEL SEARCH",channels[c].name, channelname);
            if(channels[c].name == channelname){
                return {server:serverId, channel:channels[c].id};
            }
        }
    }

    getServerName(serverId){
        return this.guilds[serverId].name;
    }

    getChannelName(serverId, channelId){
        return this.guilds[serverId].channels[channelId].name;
    }

    getUser(userId){
        return this.client.users.cache.get(userId);
    }

    getUserName(userId){
        return this.client.users.cache.get(userId).username;
    }

    sendToChannel(server, channel, message){
        let client = this.client;
        let targetServer = client.guilds.cache.get(server);
        let targetChannel = targetServer.channels.cache.get(channel);
        targetChannel.send(message);
    }
}

module.exports = SDiscord;