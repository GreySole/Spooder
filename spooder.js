const Initializer = require("./backend/Spooder_Modules/Init.js");
const WebUI = require("./backend/Spooder_Modules/WebUI.js");
const SOSC = require("./backend/Spooder_Modules/SOSC.js");

var devMode = process.argv.length>2?process.argv[2] == "-d":false;
var initMode = process.argv.length>2?process.argv[2] == "-i":false;
var noAutoLogin = process.argv.length>2?process.argv[2] == "-a":false;

global.maintainenceMode = process.argv.length>2?process.argv[2] == "-e":false;

global.backendDir = __dirname+"/backend";
global.frontendDir = __dirname+"/webui";

const fs = require('fs-extra');
const path = require('path');

let settingsDir = path.join(backendDir, "settings");

if(!fs.existsSync(settingsDir)){
	fs.mkdirSync(settingsDir);
}

global.oauth = {};
global.sconfig = {};
global.osctunnels = {};
global.eventsubs = {};
global.events = {};
global.eventGroups = ["Default"];
global.modData = {};
global.modlocks = {
	lockdown:0,
	spamguard:0,
	events:{},
	plugins:{},
	blacklist:{}
};
global.themes = {};

global.refreshFiles = () => {

	try{
		var oauthFile = fs.readFileSync(backendDir+"/settings/oauth.json",{encoding:'utf8'});
		oauth = JSON.parse(oauthFile);
		console.log("Got OAuth Settings");
		if(oauth['client-id'] == "editme" || oauth['client-secret'] == "editme" ||
		oauth['client-id'] == "" || oauth['client-secret'] == "" ||
		oauth['client-id'] == null || oauth['client-secret'] == null){
			console.error("No Twitch authentication credentials found. \n\
			Create an app on dev.twitch.tv and run 'npm run init' to fill in your client id and secret.");
		}
	}catch(e){
		console.error(e);
		console.error("There's a problem with the oauth file. We'll keep running, but you won't be able to connect to chat.");
	}
	
	try{
		var configFile = fs.readFileSync(backendDir+"/settings/config.json",{encoding:'utf8'});
		sconfig = JSON.parse(configFile);
		console.log("Got Config");
	}catch(e){
		console.error(e);
		console.error("There's a problem with the config file. Switching to init mode.");
		initMode = true;
	}
	
	try{
		var oscTunnelFile = fs.readFileSync(backendDir+"/settings/osc-tunnels.json",{encoding:'utf8'});
		osctunnels = JSON.parse(oscTunnelFile);
		console.log("Got OSC Tunnels");
	}catch(e){
		
		if(e.code == "ENOENT"){
			fs.writeFile(backendDir+"/settings/osc-tunnels.json", JSON.stringify(osctunnels), "utf-8", (err, data)=>{
                //console.log("osc-tunnels.json not found. New file created.");
            });
		}else{
			console.error(e);
			console.log("Something's wrong with the OSC Tunnels. You can rebuild this in the web UI.");
		}
		
	}
	
	try{
		var eventSubFile = fs.readFileSync(backendDir+"/settings/eventsub.json",{encoding:'utf8'});
		eventsubs = JSON.parse(eventSubFile);
		console.log("Got EventSub Settings");
	}catch(e){
		if(e.code == "ENOENT"){
			let newEventSubFile = {enabled:false, callback_url:"", events:{}};
			fs.writeFile(backendDir+"/settings/eventsub.json", JSON.stringify(newEventSubFile), "utf-8", (err, data)=>{
                //console.log("eventsub.json not found. New file created.");
				eventsubs = newEventSubFile;
            });
		}else{
			console.error(e);
			console.log("Something's wrong with the Eventsubs file. You can rebuild this in the web UI.");
		}
	}

	try{
		var commandFile = fs.readFileSync(backendDir+"/settings/commands.json", {encoding:'utf8'});
		let eventsObj = JSON.parse(commandFile);
		events = eventsObj.events;
		eventGroups = eventsObj.groups;
		console.log("Got Events");
	}catch(e){
		//console.error(e);
		if(e.code == "ENOENT"){
			fs.writeFile(backendDir+"/settings/commands.json", JSON.stringify(events), "utf-8", (err, data)=>{
                //console.log("commands.json not found. New file created.");
            });
		}else{
			console.error(e);
			console.log("Something's wrong with the command file. You can rebuild this in the web UI.");
		}
		
	}

	try{
		var modFile = fs.readFileSync(backendDir+"/settings/mod.json", {encoding:'utf8'});
		let modObj = JSON.parse(modFile);
		modData = modObj;
		console.log("Got Mod Data");
	}catch(e){
		//console.error(e);
		if(e.code == "ENOENT"){
			fs.writeFile(backendDir+"/settings/mod.json", JSON.stringify({"trusted_users_pw":{},"trusted_users":{}}), "utf-8", 
			(err, data)=>{
                //console.log("commands.json not found. New file created.");
            });
		}else{
			console.error(e);
			
		}
		
	}

	try{
		var modBLFile = fs.readFileSync(backendDir+"/settings/mod-blacklist.json", {encoding:'utf8'});
		let modBLObj = JSON.parse(modBLFile);
		modlocks.blacklist = modBLObj;
		console.log("Got Mod Blacklist");
	}catch(e){
		//console.error(e);
		if(e.code == "ENOENT"){
			fs.writeFile(backendDir+"/settings/mod-blacklist.json", JSON.stringify({}), "utf-8", 
			(err, data)=>{
                //console.log("commands.json not found. New file created.");
            });
		}else{
			console.error(e);
			
		}
		
	}

	try{
		var themeFile = fs.readFileSync(backendDir+"/settings/themes.json", {encoding:'utf8'});
		let themeObj = JSON.parse(themeFile);
		themes = themeObj;
		console.log("Got Themes");
	}catch(e){
		//console.error(e);
		if(e.code == "ENOENT"){
			fs.writeFile(backendDir+"/settings/commands.json", JSON.stringify(events), "utf-8", (err, data)=>{
                //console.log("commands.json not found. New file created.");
            });
		}else{
			console.error(e);
			console.log("Something's wrong with the command file. You can rebuild this in the web UI.");
		}
		
	}
}

if(!initMode){
	refreshFiles();
}

if(initMode){
	new Initializer();
}else{

	global.uptime = 0;
	global.chatDisconnected = false;
	
	activeEvents = {};
	chatEvents = [];

	global.activeMods = {};

	global.udpClients = sconfig.network["udp_clients"];
	global.activePlugins = {};

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

	global.sosc = new SOSC();
	global.sendToTCP = (address, oscValue, log)=>{sosc.sendToTCP(address, oscValue, log)};
	global.sendToUDP = (dest, address, oscValue)=>{sosc.sendToUDP(dest, address, oscValue)};

	global.webUI = new WebUI(devMode);

	const tmi = require("tmi.js");
	global.chat = null;
	
	checkForSpamming = (viewername) => {
		
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

	const run = async(startCase) => {
		console.log("Running chat...");
		if(chat != null){
			if(chat.readyState() == "OPEN" || chat.readyState() == "CONNECTING"){
				await chat.disconnect();
			}
			chat.off("message", processMessage);
			chat.off("connectFailed", webUI.onAuthenticationFailure);
			chat.off("disconnect", restartChat);
		}

		chat = new tmi.Client({
			options:{debug:true},
			identity:{
				username:username,
				password:token
			}
		});
		
		await chat.connect().catch(error=>{console.error(error); webUI.onAuthenticationFailure();});
		chat.join(channel).then(()=>{
			if(startCase == "restart"){
				sayInChat("Chat restarted, I'm back :D");
			}else if(startCase == "switch"){
				sayInChat("Hi there! I'm "+sconfig.bot.bot_name+", a Spooder bot! I'm with "+sconfig.broadcaster.username);
			}else if(startCase == "reconnect"){
				sayInChat("Stream reconnected. I'm okay :)");
			}else if(startCase == "disconnected"){
				sayInChat("Stream disconnected. Hold on a sec...");
			}else if(startCase != null){
				sayInChat(startCase);
			}
		}).catch(error=>{console.error(error)});

		
		chat.on("message", processMessage);
		chat.on("connectFailed", webUI.onAuthenticationFailure);
		chat.on("disconnect", restartChat);
		upInterval = setInterval(runInterval, 1000);
	};

	webUI.onLogin = run;

	if(token != "" && noAutoLogin == false){
		console.log("Token found! Validating...");
		webUI.autoLogin();
	}

	if(oauth.broadcaster_token != null
		&& oauth.broadcaster_token != ""
		&& oauth.token != oauth.broadcaster_token){
			webUI.validateBroadcaster();
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
						sayInChat(moduser+" "+(modCommand=="lock"?"locked":"unlocked")+" all chat commands");
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
						console.log("Mod file saved!");
					});
				}else if(modCommand == "trust" && chatIsBroadcaster(message)){
					if(command.length>2){
						let trustedUser = command[2].startsWith("@")?command[2].substring(1).trim():command[2].trim();
						modData["trusted_users"][trustedUser] = "m";
						fs.writeFile(backendDir+"/settings/mod.json", JSON.stringify(modData), "utf-8", (err, data)=>{
							console.log("Mod file saved!");
							sayInChat(trustedUser+" has been added as a trustworthy user for the Mod UI!");
						});
					}else{
						sayInChat("Trust a user to interact with the Mod UI");
					}
				}else if(modCommand == "verify"){
					if(activeMods[message.username]?.startsWith("pending")){
						activeMods[message.username] = "active";
						fs.writeFile(backendDir+"/settings/mod.json", JSON.stringify(modData), "utf-8", (err, data)=>{
							console.log("Mod file saved!");
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
								console.log(commandMatch);
								break;
							}
						}else{
							matchIndex = 0;
							commandMatch = new Array(commandSplit.length).fill(false);
						}
						
					}
					
					if(matchIndex == commandMatch.length){
						runCommands(message, e, commandMatch);
					}
				}else{
					if(message.message.toLowerCase().startsWith(events[e].triggers.chat.command) || message.message.substring(1).toLowerCase().startsWith(events[e].triggers.chat.command)){
						runCommands(message, e);
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

	function sayAlreadyOn(name){
		for(let c in activeEvents[name]){
			if(activeEvents[name][c].etype == "event"){
				sayInChat(events[name].name+" is cooling down. Time Left: "+Math.abs(Math.floor(uptime-activeEvents[name][c]["timeout"]))+"s");
				break;
			}
		}
	}

	function getChatCommands(){
		let commandsArray = [];
		for(let e in events){
			if(events[e].triggers.chat.enabled == true){
				commandsArray.push(events[e].triggers.chat.command);
			}
		}
		return commandsArray;
	}

	function stringifyArray(a){
		return a.join(", ");
	}

	global.sayInChat = async (message) =>{
		if(message == null || message == ""){
			console.log("EMPTY MESSAGE");
			return;
		}
		if(message.length >= 490){
			let limit = 490;
			let totalMessages = Math.ceil(message.length/limit);
			
			for(let stringpos=0; stringpos<message.length; stringpos+=limit){
				
				if(stringpos+limit > message.length){
					await chat.say(channel, "["+totalMessages+"/"+totalMessages+"] "+message.substring(stringpos, message.length));
				}else{
					//console.log(stringpos, stringpos.limit);
					await chat.say(channel, "["+(Math.round((stringpos+limit)/limit)+"/"+totalMessages+"] "+message.substring(stringpos, stringpos+limit)));
				}
			}
		}else{
			await chat.say(channel,message)
			.catch(e=>{
				console.log("CHAT ERROR", e);
				restartChat(message);
			});
		}
		
	}

	global.chatSwitchChannels = async (newChannel) => {
		await webUI.validateChatbot();
		await chat.disconnect();
		channel = newChannel;
		run("switch");
	}

	global.disconnectChat = () => {
		chat.disconnect();
	}

	global.restartChat = async (message) => {
		console.log("Restarting Chat");
		await webUI.validateChatbot();
		run(message);
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
			}
		}
		return chArray;
	}

	global.blacklistUser = (viewername, duration) => {
		if(modlocks.blacklist[viewername] == null){
			modlocks.blacklist[viewername] = {};
		}
		modlocks.blacklist[viewername].active = 1;
		if(duration != null){
			modlocks.blacklist[viewername].timeout = setTimeout(()=>{
				modlocks.blacklist[viewername].active = 0;
			}, duration);
		}
	}

	global.lockEvent = (moduser, modCommand, target) =>{
		if(typeof modCommand == "number"){
			modCommand = modCommand == 1?"lock":"unlock";
		}else if(typeof modCommand == "boolean"){
			modCommand = modCommand == true?"lock":"unlock";
		}
		let eventLocked = false;
		for(let e in events){
			if(target == "all"){
				modlocks.events[e] = modCommand=="lock"?1:0;
				sendToTCP("/mod/"+moduser+"/"+modCommand+"/event/"+e, modCommand=="lock"?1:0);
				eventLocked = true;
			}else if(e==target){
				modlocks.events[e] = modCommand=="lock"?1:0;
				sendToTCP("/mod/"+moduser+"/"+modCommand+"/event/"+e, modCommand=="lock"?1:0);
				sayInChat(moduser+" "+(modCommand=="lock"?"locked":"unlocked")+" "+target);
				eventLocked = true;
				break;
			}
		}
		return eventLocked;
	}

	global.lockPlugin = (moduser, modCommand, plugin, target)=>{
		if(typeof modCommand == "number"){
			modCommand = modCommand == 1?"lock":"unlock";
		}else if(typeof modCommand == "boolean"){
			modCommand = modCommand == true?"lock":"unlock";
		}
		let pluginLocked = false;
		for(let p in activePlugins){
			if(target == "all"){
				modlocks.plugins[p] = modCommand=="lock"?1:0;
				sayInChat(moduser+" "+(modCommand=="lock"?"locked":"unlocked")+" all plugin chat commands");
				pluginLocked = true;
			}else if(p == plugin){
				if(modlocks.plugins[p] == null){modlocks.plugins[p] = {}}
				if(target == null){
					modlocks.plugins[p] = modCommand=="lock"?1:0;
					sendToTCP("/mod/"+moduser+"/"+modCommand+"/plugin/"+p, modCommand=="lock"?1:0);
					sayInChat(moduser+" "+(modCommand=="lock"?"locked":"unlocked")+" "+plugin);
					pluginLocked = true;
					break;
				}else{
					if(activePlugins[p].modmap){
						if(activePlugins[p].modmap.locks){
							activePlugins[p].modmap.locks[target] = modCommand=="lock"?1:0;
							sendToTCP("/mod/"+moduser+"/"+modCommand+"/plugin/"+p+"/"+target, modCommand=="lock"?1:0);
							sayInChat(moduser+" "+(modCommand=="lock"?"locked":"unlocked")+" "+target+" in "+plugin);
							pluginLocked = true;
							break;
						}
					}
				}
			}
		}
		return pluginLocked;
	}

	global.stopEvent = (cEvent) => {
		if(cEvent == "all"){
			let eventCount = 0;
			for(let a in activeEvents){
				for(let e in activeEvents[a]){
					if(activeEvents[a][e] != "event"){
						clearTimeout(activeEvents[a][e].timeoutEvent);
						activeEvents[a][e]["function"]();
					}
				}
				delete activeEvents[a];
				eventCount++;
			}

			sayInChat(eventCount+" events have been stopped!");
		}else if(typeof activeEvents[cEvent] != "undefined"){
			for(e in activeEvents[cEvent]){
				if(activeEvents[cEvent][e] != "event"){
					clearTimeout(activeEvents[cEvent][e].timeoutEvent);
					activeEvents[cEvent][e]["function"]();
				}
			}
			delete activeEvents[cEvent];
			sayInChat(events[cEvent].name+" has been stopped!");
		}else{
			sayInChat("I can't stop "+cEvent+"!");
		}
	}

	global.setSpamGuard = (isOn) =>{
		if(isOn != null){
			if(isOn == "on"){
				modlocks.spamguard = 1;
			}else if(isOn == "off"){
				modlocks.spamguard = 0;
			}
		}else{
			modlocks.spamguard = modlocks.spamguard==1?0:1;
		}
		if(modlocks.spamguard==1){
			sayInChat("Spam Guard is on! Command spammers will be locked out for a short time.")
		}else{
			sayInChat("Spam Guard is off!");
		}
		return;
	}

	global.callOBS = async (command, data) => {
		if(sosc.obs.connected == false){
			console.log("OBS NOT CONNECTED");
			return;
		}

		return sosc.obs.call(command,data);
	}

	function convertDuration(numSeconds){
		let timeTerm = "seconds";
		let timeAmount = numSeconds;
		
		if(numSeconds/60 == 1){
			timeTerm = "minute";
			timeAmount = numSeconds/60;
		}else if(numSeconds/60 > 1){
			timeTerm = "minutes";
			timeAmount = numSeconds/60;
		}
		return timeAmount+" "+timeTerm;
	}

	global.runCommands = (eventData, eventName, extra) => {
		
		let isChat = eventData.message!=null;
		let isReward = eventData.user_name!=null;
		let isOSC = eventData.address!=null;
		if(isReward){
			eventData.username = eventData.user_name.toLowerCase();
			eventData.displayName = eventData.user_name;
		}else if(isOSC){
			eventData.username = username;
			eventData.displayName = username;
		}

		eventData.user_name = eventData.username;

		let event = events[eventName];

		if(isChat){
			if(activeEvents[eventName] != null){
				if(chatIsBroadcaster(eventData)){
					commandArgs = eventData.message.split(" ");
					if(commandArgs[1] != null){
						if(commandArgs[1].toLowerCase() == "off"){
							for(e in activeEvents[eventName]){
								if(activeEvents[eventName][e] != "event"){
									activeEvents[eventName][e]["function"]();
								}
							}
							delete activeEvents[eventName];
							return;
						}
					}
				}
				if(event.cooldownnotification == true){
					sayAlreadyOn(eventName);
				}
				
				return;
			}
		}else if(isOSC){
			if(event.triggers.osc.handletype == "toggle" && activeEvents[eventName] != null){
				for(e in activeEvents[eventName]){
					if(activeEvents[eventName][e] != "event"){
						activeEvents[eventName][e]["function"]();
					}
				}
				delete activeEvents[eventName];
				return;
			}
		}
		
		if(isChat && event.chatnotification == true){
			sayInChat(eventData.username+" has activated "+event.name+"!");
			sendToTCP("/events/start/"+eventName, eventData.username+" has activated "+event.name+"!");
			createTimeout(eventName, null, "event", function(){
				sayInChat(event.name+" has been deactivated!");
				sendToTCP("/events/end/"+eventName, event.name+" has been deactivated!");
			}, event.cooldown);
		}else if(isChat){
			createTimeout(eventName, null, "event", function(){
			}, event.cooldown);
		}

		for(let c in event.commands){
			let eCommand = event.commands[c];
			
			switch(eCommand.type){
				case 'response':
					
					setTimeout(async () =>{
						try{
							let responseFunct = await eval("async () => { let event = "+JSON.stringify(eventData)+"; let extra = "+JSON.stringify(extra)+"; "+eCommand.message.replace(/\n/g, "")+"}");
							let response = await responseFunct();
							sayInChat(response);
						}catch(e){
							console.log("Failed to run response script. Check the event settings to verify it.", e)
						}
						
					}, eCommand.delay);
				break;
				case 'plugin':
					setTimeout(() => {
						if(activePlugins[eCommand.pluginname] != null){
							if(typeof activePlugins[eCommand.pluginname].onEvent == "undefined"){
								console.log(activePlugins[eCommand.pluginname], "onEvent() NOT FOUND");
								return;
							}
						}
						eventData.eventInfo = event;
						activePlugins[eCommand.pluginname].onEvent(eCommand.eventname, eventData);
					}, eCommand.delay);
					
				break;
				case 'software':
					setTimeout(() => {
						if(eCommand.etype == "timed"){
							let eventDuration = parseFloat(eCommand.duration);
							let commandArgs = null;
							if(isChat && chatIsBroadcaster(eventData)){
								commandArgs = eventData.message.split(" ");
								if(commandArgs[1] != null){
									if(commandArgs[1].toLowerCase() == "on"){
										eventDuration = -1;
									}
								}
							}else if(isOSC){
								if(event.triggers.osc.handletype == "toggle"){
									eventDuration = -1;
								}
							}
							//Checking Active Events for commands using the same address.
							let commandUsed = false;
							for(let ae in activeEvents){
								if(ae==eventName){continue;}
								for(let command in activeEvents[ae]){
									if(activeEvents[ae][command].etype=="event"){continue;}
									if(activeEvents[ae][command].event.address == eCommand.address){
										if(activeEvents[ae][command].event.valueOn.includes(",")){
											let valueID = activeEvents[ae][command].event.valueOn.split(",");
											if(eCommand.valueOn.includes(",")){
												let valueID2 = eCommand.valueOn.split(",");
												if(valueID[0].trim() == valueID2[0].trim() && eCommand.priority < activeEvents[ae][command].event.priority){
													commandUsed = true;
												}
											}
										}else if(eCommand.priority < activeEvents[ae][command].event.priority){
											commandUsed = true;
										}
										
										continue;
									}
								}
							}
							if(!commandUsed){
								sendToUDP(eCommand.dest_udp, eCommand.address, eCommand.valueOn);
							}
							
							createTimeout(eventName, eCommand, eCommand.etype, function(){
								for(let ae in activeEvents){
									if(ae==eventName){continue;}
									for(let command in activeEvents[ae]){
										if(activeEvents[ae][command].etype=="event"){continue;}
										if(activeEvents[ae][command].event.address == eCommand.address){
											if(activeEvents[ae][command].event.valueOn.includes(",")){
												let valueID = activeEvents[ae][command].event.valueOn.split(",");
												if(eCommand.valueOn.includes(",")){
													let valueID2 = eCommand.valueOn.split(",");
													if(valueID[0].trim() == valueID2[0].trim()){
														sendToUDP(eCommand.dest_udp, activeEvents[ae][command].event.address, activeEvents[ae][command].event.valueOn);
													}else{
														continue;
													}
												}
											}else{
												sendToUDP(eCommand.dest_udp, activeEvents[ae][command].event.address, activeEvents[ae][command].event.valueOn);
											}
											
											return;
										}
									}
								}
								sendToUDP(eCommand.dest_udp, eCommand.address, eCommand.valueOff);
								
							}, eventDuration);
								
						}else if(eCommand.etype == "oneshot"){
							sendToUDP(eCommand.dest_udp, eCommand.address, eCommand.valueOn);
							setTimeout(function(){
								sendToUDP(eCommand.dest_udp, eCommand.address, eCommand.valueOff);
							}, 500);
						}
					}, eCommand.delay);
					
				break;
				case "obs":
					if(sosc.obs.connected == false){
						console.log("OBS NOT CONNECTED");
						break;
					}
					setTimeout(()=>{
						if(eCommand.function == "setinputmute"){
							if(eCommand.etype == "timed"){
								let eventDuration = parseFloat(eCommand.duration);
								callOBS("SetInputMute", {inputName:eCommand.item, inputMuted:eCommand.valueOn==1});
								createTimeout(eventName, eCommand, eCommand.type, function(){
									
									callOBS("SetInputMute", {inputName:eCommand.item, inputMuted:eCommand.valueOff==1});
								},eventDuration);
							}else{
								callOBS("SetInputMute", {inputName:eCommand.item, inputMuted:eCommand.valueOn==1});
							}
						}else if(eCommand.function == "switchscenes"){
							if(eCommand.etype == "timed"){
								let eventDuration = parseFloat(eCommand.duration);
								callOBS("SetCurrentProgramScene", {sceneName:eCommand.itemOn});
								createTimeout(eventName, eCommand, eCommand.type, function(){
									callOBS("SetCurrentProgramScene", {sceneName:eCommand.itemOff});
								},eventDuration);
							}else{
								callOBS("SetCurrentProgramScene", {sceneName:eCommand.itemOn});
							}
						}else if(eCommand.function == "enablesceneitem"){
							if(eCommand.etype == "timed"){
								let eventDuration = parseFloat(eCommand.duration);
								callOBS("SetSceneItemEnabled", {sceneName:eCommand.scene, sceneItemId:parseInt(eCommand.item), sceneItemEnabled:eCommand.valueOn==1});
								createTimeout(eventName, eCommand, eCommand.type, function(){
									callOBS("SetSceneItemEnabled", {sceneName:eCommand.scene, sceneItemId:parseInt(eCommand.item), sceneItemEnabled:eCommand.valueOff==1});
								},eventDuration);
							}else{
								callOBS("SetSceneItemEnabled", {sceneName:eCommand.scene, sceneItemId:parseInt(eCommand.item), sceneItemEnabled:eCommand.valueOn==1});
							}
						}
					}, eCommand.delay);
				break;
				case "mod":
					setTimeout(()=>{
						if(eCommand.function == "lock"){
							if(eCommand.targettype == "all"){
								modlocks.lockdown = modlocks.lockdown==1?0:1;
								lockEvent(username, modlocks.lockdown==true?"lock":"unlock", "all");
								lockPlugin(username, modlocks.lockdown==true?"lock":"unlock", "all");
							}else if(eCommand.targettype == "event"){
								lockEvent(username, !modlocks.event[eCommand.target]==1?"lock":"unlock", eCommand.target);
							}else if(eCommand.targettype == "plugin"){
								lockPlugin(username,!modlocks.event[eCommand.target]==1?"lock":"unlock", eCommand.target);
							}
						}else if(eCommand.function == "spamguard"){
							setSpamGuard(modlocks.spamguard==1?"off":"on");
						}else if(eCommand.function == "stop"){
							if(eCommand.targettype == "all"){
								stopEvent(eCommand.targettype);
							}else{
								stopEvent(eCommand.target);
							}
							
						}
					}, eCommand.delay);
				break;
			}
		}
	}

	runInterval = () => {
		uptime = Math.floor(Date.now()/1000);
		for(let e in activeEvents){
			
			//Loop 1 for action
			for(let command in activeEvents[e]){
				if(activeEvents[e][command]["timeout"]!= -1){
					sosc.sendToTCP("/events/time/"+e+"/"+activeEvents[e][command]["etype"], uptime-activeEvents[e][command]["timeout"]);
				}
				
				if(activeEvents[e][command]["timeout"]!= -1 && uptime >= activeEvents[e][command]["timeout"]){
					
					//activeEvents[e][command]["function"]();
					activeEvents[e][command].finished = true;
					sosc.sendToTCP("/events/end/"+e+"/"+command, e+"-"+command+" is now deactivated!");
				}
			}

			//Loop 2 for cleanup
			for(command in activeEvents[e]){
				if(activeEvents[e][command].finished == true){
					activeEvents[e].splice(command,1);
				}
			}

			if(activeEvents[e].length == 0){
				delete activeEvents[e];
			}
		}
	};

	function createTimeout(name, command, etype, funct, seconds){
		if(activeEvents[name] == null){
			activeEvents[name] = [];
		}
		
		let timeout = seconds>-1?uptime+seconds:-1;
		activeEvents[name].push({
			"function": funct,
			"event": command,
			"timeout": Math.ceil(timeout),
			"timeoutEvent":seconds!=-1?setTimeout(funct, seconds*1000):null,
			"etype": etype
		});
	}
}