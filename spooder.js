const Initializer = require("./backend/Spooder_Modules/Init.js");
const WebUI = require("./backend/Spooder_Modules/WebUI.js");
const SOSC = require("./backend/Spooder_Modules/OSC.js");

global.newVersionAvailable = false;
global.devMode = process.argv.length>2?process.argv[2] == "-d":false;
global.initMode = process.argv.length>2?process.argv[2] == "-i":false;
global.safeMode = process.argv.length>2?process.argv[2] == "-e":false;
var noAutoLogin = process.argv.length>2?process.argv[2] == "-a":false;

var spooderLog = (...content) => {
    console.log(logEffects("Bright"),logEffects("FgYellow"), ...content, logEffects("Reset"));
}

global.maintainenceMode = process.argv.length>2?process.argv[2] == "-e":false;

global.rootDir = __dirname;
global.backendDir = __dirname+"/backend";
global.frontendDir = __dirname+"/webui";

const fs = require('fs-extra');
const path = require('path');

let logDir = path.join(backendDir, "log");

if(!fs.existsSync(logDir)){
	fs.mkdirSync(logDir);
}


let errorLogPath = path.join(logDir, "error.json");
let errorLog = fs.existsSync(errorLogPath)?JSON.parse(fs.readFileSync(errorLogPath, {encoding:"utf-8"})):{
	crashed:false,
	log:null
};

global.twitch = null;
global.discord = null;
global.youtube = null;

process.on('uncaughtException', function(err){
	let lastTwitch = null;
	let lastDiscord = null;
	if(twitch != null){
		lastTwitch = twitch.lastMesage;
	}
	if(discord != null){
		lastDiscord = discord.lastMessage;
	}
	errorLog.log = {
		time:Date.now(),
		stack:err.stack,
		lastTwitch:lastTwitch,
		lastDiscord:lastDiscord
	}
	console.error(err);
	process.exit(1);
})

process.on('exit', function(){
	if(process.exitCode == 1){
		errorLog.crashed = true;
		fs.writeFileSync(errorLogPath, JSON.stringify(errorLog));
	}
})

let settingsDir = path.join(backendDir, "settings");

if(!fs.existsSync(settingsDir)){
	fs.mkdirSync(settingsDir);
}

global.sconfig = {};
global.osctunnels = {};
global.eventsubs = {};
global.events = {};
global.eventGroups = ["Default"];
global.users = {};
global.modlocks = {
	lockdown:0,
	spamguard:0,
	events:{},
	plugins:{},
	blacklist:{}
};
global.themes = {
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
};
global.eventstorage = {};
global.shares = {};

global.refreshFiles = () => {

	let settingsFiles = {
		"sconfig":"config.json",
		"events":"commands.json",
		"osctunnels":"osc-tunnels.json",
		"themes":"themes.json",
		"eventstorage":"eventstorage.json",
		"plugins":"plugins.json",
		"shares":"shares.json",
		"users":"users.json"
	};

	for(let s in settingsFiles){
		try{
			var settingFile = fs.readFileSync(backendDir+"/settings/"+settingsFiles[s],{encoding:'utf8'});
			switch(s){
				case "events":
					let eventsObj = JSON.parse(settingFile);
					events = eventsObj.events;
					eventGroups = eventsObj.groups;
				break;
				default:
					global[s] = JSON.parse(settingFile);
			}
			
			spooderLog("Got "+settingsFiles[s]);
			
		}catch(e){
			
			if(e.code == "ENOENT"){
				let newFile = {};
				if(s == "events"){
					newFile = {events:{}, groups:["Default"]};
				}else if(s == "users"){
					newFile = {
						"trusted_users": {},
						"trusted_users_pw": {}
					};
				}else if(s == "themes"){
					newFile = {
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
					};
				}

				let newFileString = JSON.stringify(newFile);
				if(newFileString == ""){
					newFileString = "{}";
				}

				fs.writeFile(backendDir+"/settings/"+settingsFiles[s], newFileString, "utf-8", 
				(err, data)=>{
					spooderLog(settingsFiles[s]+" not found. New file created.");
				});
			}else{
				console.error(e);
				console.error("There's a problem with the "+s+" file.");
			}
		}
	}

	try{
		var modBLFile = fs.readFileSync(backendDir+"/settings/mod-blacklist.json", {encoding:'utf8'});
		let modBLObj = JSON.parse(modBLFile);
		modlocks.blacklist = modBLObj;
		spooderLog("Got Mod Blacklist");
	}catch(e){
		//console.error(e);
		if(e.code == "ENOENT"){
			fs.writeFile(backendDir+"/settings/mod-blacklist.json", JSON.stringify({}), "utf-8", 
			(err, data)=>{
				//spooderLog("commands.json not found. New file created.");
			});
		}else{
			console.error(e);
			
		}
	}
}

global.saveEventStorage = () => {
	fs.writeFileSync(backendDir+"/settings/eventstorage.json", JSON.stringify(eventstorage), "utf-8");
}

global.logEffects = (effect) => {
	let effects = {
		Reset:"\x1b[0m",
		Bright:"\x1b[1m",
		Dim:"\x1b[2m",
		Underscore:"\x1b[4m",
		Blink:"\x1b[5m",
		Reverse:"\x1b[7m",
		Hidden:"\x1b[8m",

		FgBlack:"\x1b[30m",
		FgRed:"\x1b[31m",
		FgGreen:"\x1b[32m",
		FgYellow:"\x1b[33m",
		FgBlue:"\x1b[34m",
		FgMagenta:"\x1b[35m",
		FgCyan:"\x1b[36m",
		FgWhite:"\x1b[37m",
		FgGray:"\x1b[90m",

		BgBlack:"\x1b[40m",
		BgRed:"\x1b[41m",
		BgGreen:"\x1b[42m",
		BgYellow:"\x1b[43m",
		BgBlue:"\x1b[44m",
		BgMagenta:"\x1b[45m",
		BgCyan:"\x1b[46m",
		BgWhite:"\x1b[47m",
		BgGray:"\x1b[100m"
	};
	if(effects[effect] != null){
		return effects[effect];
	}else{
		return "";
	}
}

if(!initMode){
	refreshFiles();
}

if(initMode){
	new Initializer();
}else{

	global.uptime = 0;
	
	activeEvents = {};

	global.activeUsers = {
		pending:{}
	};

	global.activePlatforms = {};

	global.udpClients = sconfig.network["udp_clients"];
	global.activePlugins = {};

	const Discord = require("./backend/Spooder_Modules/Discord");
	const Twitch = require("./backend/Spooder_Modules/Twitch");
	const YouTube = require("./backend/Spooder_Modules/YouTube");
	const OBS = require("./backend/Spooder_Modules/OBSOSC");

	global.webUI = new WebUI();
	
	webUI.startServer(devMode);
	global.twitch = new Twitch(webUI.router, webUI.publicRouter);
	global.youtube = new YouTube(webUI.router, webUI.publicRouter);
	global.discord = new Discord(webUI.router);
	global.obs = new OBS(webUI.router);
	webUI.onNgrokStart = function(){
		twitch.refreshEventSubs();
		
		if(discord.loggedIn && discord.config?.autosendngrok.enabled){
			spooderLog("SENDING NGROK TO MODS");
			discord.sendToChannel(discord.config.autosendngrok.destguild, discord.config.autosendngrok.destchannel, sconfig.network.external_http_url+"/mod");
		}
	}

	
	startServices();
	async function startServices(){
		global.sosc = new SOSC();
		global.sendToTCP = (address, oscValue, log)=>{sosc.sendToTCP(address, oscValue, log)};
		global.sendToUDP = (dest, address, oscValue)=>{sosc.sendToUDP(dest, address, oscValue)};
		if(!noAutoLogin){
			twitch.autoLogin()
			.then(status => {
				if(status == "success"){
					activePlatforms["twitch"] = twitch;
				}
			})
			.catch(e=>{});

			/*youtube.autoLogin()
			.then(status => {
				if(status == "success"){
					activePlatforms["youtube"] = youtube;
				}
			})
			.catch(e=>{});*/
			
        	obs.autoLogin().catch(e=>{});
			await discord.autoLogin().catch(e=>{});

			if(discord.loggedIn == true){
				console.log("SET ON PLUGINS LOADED");
				webUI.onPluginsLoaded = ()=>{discord.getCommands();}
			
				if(errorLog.crashed == true){
					discord.sendDM(discord.config.master, "I died, this is what happened: \n"
					+errorLog.log.stack
					+"\n Last Twitch Message: "+errorLog.log.lastTwitch?.username+": "+errorLog.log.lastTwitch?.message
					+"\n Last Discord Message: "+errorLog.log.lastDiscord?.author.username+": "+errorLog.log.lastDiscord?.content);
					errorLog.crashed = false;
					fs.writeFileSync(errorLogPath, JSON.stringify(errorLog));
				}
			}
		}
		
		if(sconfig.network.externalhandle == "ngrok" && sconfig.network.ngrokauthtoken != ""){
			webUI.startNgrok();
		}
		if(safeMode == false){
			webUI.getPlugins();
		}
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

	global.isEventLocked = (target) => {
		return modlocks.events[target] == 1;
	}

	global.isPluginLocked = (target) => {
		return modlocks.plugins[target] == 1;
	}

	global.lockEvent = (modCommand, target) =>{
		if(typeof modCommand == "number"){
			modCommand = modCommand == 1?"lock":"unlock";
		}else if(typeof modCommand == "boolean"){
			modCommand = modCommand == true?"lock":"unlock";
		}
		let eventLocked = false;
		for(let e in events){
			if(target == "all"){
				modlocks.events[e] = modCommand=="lock"?1:0;
				sendToTCP("/mod/local/"+modCommand+"/event/"+e, modCommand=="lock"?1:0);
				eventLocked = true;
			}else if(e==target){
				modlocks.events[e] = modCommand=="lock"?1:0;
				sendToTCP("/mod/local/"+modCommand+"/event/"+e, modCommand=="lock"?1:0);
				eventLocked = true;
				break;
			}
		}
		return eventLocked;
	}

	global.lockPlugin = (modCommand, plugin, target)=>{
		if(typeof modCommand == "number"){
			modCommand = modCommand == 1?"lock":"unlock";
		}else if(typeof modCommand == "boolean"){
			modCommand = modCommand == true?"lock":"unlock";
		}
		let pluginLocked = false;
		for(let p in activePlugins){
			if(plugin == "all"){
				
				modlocks.plugins[p] = modCommand=="lock"?1:0;
				sendToTCP("/mod/local/"+modCommand+"/plugin/"+p, modCommand=="lock"?1:0);
				pluginLocked = true;
			}else if(p == plugin){
				if(modlocks.plugins[p] == null){modlocks.plugins[p] = {}}
				if(target == null){
					modlocks.plugins[p] = modCommand=="lock"?1:0;
					sendToTCP("/mod/local/"+modCommand+"/plugin/"+p, modCommand=="lock"?1:0);
					pluginLocked = true;
					break;
				}else{
					if(activePlugins[p].modmap){
						if(activePlugins[p].modmap.locks){
							activePlugins[p].modmap.locks[target] = modCommand=="lock"?1:0;
							sendToTCP("/mod/local/"+modCommand+"/plugin/"+p+"/"+target, modCommand=="lock"?1:0);
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

			return eventCount+" events have been stopped!";
		}else if(typeof activeEvents[cEvent] != "undefined"){
			for(e in activeEvents[cEvent]){
				if(activeEvents[cEvent][e] != "event"){
					clearTimeout(activeEvents[cEvent][e].timeoutEvent);
					activeEvents[cEvent][e]["function"]();
				}
			}
			delete activeEvents[cEvent];
			
			return events[cEvent].name+" has been stopped!";
		}else{
			return "I can't stop "+cEvent+"!";
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
			return "Spam guard is ON";
		}else{
			return "Spam guard is OFF";
		}
	}

	/*global.runCommercial = (howLong) => {
		chat.commercial(channel,howLong);
	}*/

	global.callOBS = async (command, data) => {
		if(obs.connected == false){
			spooderLog("OBS NOT CONNECTED");
			return;
		}

		return obs.call(command,data);
	}

	global.chatIsBroadcaster = (message) => {
		if(message.platform == "twitch"){
			return twitch.chatIsBroadcaster(message);
		}else if(message.platform == "youtube"){
			return youtube.chatIsBroadcaster(message);
		}
	}

	global.chatIsFirstMessage = (message) => {
        if(message.platform == "twitch"){
			return twitch.chatIsBroadcaster(message);
		}else if(message.platform == "youtube"){
			return false;
		}
    }

    global.chatIsReturningChatter = (message) => {
        if(message.platform == "twitch"){
			return twitch.chatIsBroadcaster(message);
		}else if(message.platform == "youtube"){
			return false;
		}
    }

    global.chatIsMod = (message) => {
        if(message.platform == "twitch"){
			return twitch.chatIsMod(message);
		}else if(message.platform == "youtube"){
			return youtube.chatIsMod(message);
		}
    }

    global.chatIsSubscriber = (message) => {
        if(message.platform == "twitch"){
			return twitch.chatIsSubscriber(message);
		}else if(message.platform == "youtube"){
			return youtube.chatIsSubscriber(message);
		}
    }

    global.chatIsVIP = (message) => {
        if(message.platform == "twitch"){
			return twitch.chatIsVIP(message);
		}else if(message.platform == "youtube"){
			return false;
		}
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

	function matchConditions(a, b){
				
		if(a.includes("|")){
			let cSplitOR = a.split("|");
			//console.log(cSplitOR);
			for(let c in cSplitOR){
				if(cSplitOR[c].startsWith(">")){
			
					if(b.startsWith(cSplitOR[c].replace(">", ""))){
						return b;
					}
				}else if(cSplitOR[c].startsWith("<")){
					if(b.endsWith(cSplitOR[c].replace("<", ""))){
						return b;
					}
				}else if(cSplitOR[c].toLowerCase() == b.toLowerCase()){
					return b;
				}
			}
			return false;
		}else if(a.startsWith(">")){
			
			if(b.startsWith(a.replace(">", ""))){
				return b;
			}else{
				return false;
			}
		}else if(a.startsWith("<")){
			if(b.endsWith(a.replace("<", ""))){
				return b;
			}else{
				return false;
			}
		}else if(a.toLowerCase() == b.toLowerCase()){return b;}
		else{
			return false;
		}
	}

	global.checkResponseTrigger = (eventData, message) => {
		let searchMode = eventData.triggers.chat.search?true:eventData.triggers.osc.handletype=="search"?true:false;
		let command = null;
			if(message.eventType == "osc"){
				command = eventData.triggers.osc.value.toLowerCase();
			}else{
				command = eventData.triggers.chat.command.toLowerCase();
			}
		if(searchMode == true){
			
			let commandSplit = command.split(" ");
			let commandMatch = new Array(commandSplit.length).fill(false);
			let messageSplit = message.message.toLowerCase().replaceAll(/[\p{P}\p{S}]/gu, "").split(" ");
			let matchIndex = 0;
			let startInd = 0;
			for(let m=0; m<messageSplit.length; m++){
				if(commandSplit[matchIndex] == "*"){commandMatch[matchIndex] = messageSplit[m];}
				else if(commandSplit[matchIndex].startsWith("*")){
					
					for(let n=m; n<messageSplit.length; n++){
						if(matchConditions(commandSplit[matchIndex].substr(1), messageSplit[n]) != false){
							commandMatch[matchIndex] = messageSplit[n];
							
							m = n;
							break;
						}
					}
				}else{
					commandMatch[matchIndex] = matchConditions(commandSplit[matchIndex], messageSplit[m]);
				}
				
				if(commandMatch[matchIndex] != false){
					if(matchIndex == 0){startInd = m;}
					matchIndex++;
					
					if(matchIndex == commandMatch.length){
						console.log("FINISH",commandMatch);
						break;
					}
				}else{
					//console.log(commandMatch, m, startInd);
					if(matchIndex > 0){
						m = startInd;
					}
					
					matchIndex = 0;
					commandMatch = new Array(commandSplit.length).fill(false);
				}
				
			}
			
			if(matchIndex == commandMatch.length){
				return {
					message:message,
					extra:commandMatch
				};
			}
		}else{
			
			if(message.message.toLowerCase().startsWith(command)){
				return {
					message:message,
					extra:null
				};
			}
		}
		return null;
	}

	global.verifyResponseScript = async (eventName, message, extra, script) => {
		message.eventType = "chat";
		try{
			let responseScript = "async () => { let event = "+JSON.stringify(message)
			+"; let extra = "+JSON.stringify(extra)
			+"; function say(txt){sayInChat(txt,"+JSON.stringify(message.platform)+","+JSON.stringify(message.channel)+");}"
			+"; let toUser = "+JSON.stringify(message.message.split(" ")[1])+""
			+"; let command = "+JSON.stringify(message.message.toLowerCase().split(" "))+""
			+"; function getVar(key,defaultVal=0){return eventstorage["+JSON.stringify(eventName)+"]?.[key]??defaultVal;}"
			+"; function setVar(key, value, save=true){eventstorage["+JSON.stringify(eventName)+"]??={}; eventstorage[eventname][key] = value;}"
			+"; function getSharedVar(eventname, key,defaultVal=0){return eventstorage[eventname]?.[key]??defaultVal;}"
			+"; function setSharedVar(eventname, key, value, save=true){eventstorage[eventname]??={}; eventstorage[eventname][key] = value;}"
			+"; function chooseRandom(...randArray){return randArray[Math.floor(Math.random()*randArray.length)];}"
			+"; function chooseRandom(randArray){return randArray[Math.floor(Math.random()*randArray.length)];}"
			+"; function sanitize(text){return text.replace(/[`!@#$%^&*()_+\\-=\\[\\]{};':\"\\\\|,.<>\\/?~]/,\"\",'');}"
			+"; function runEvent(eName){runCommands(event, eName)}"
			+"let eventstorage = "+JSON.stringify(eventstorage)+"; "
			+script.replace(/\n/g, "")+"}";
			let responseFunct = await eval(responseScript);
			let response = await responseFunct();
			return {
				status:"ok",
				response:response
			};
		}catch(e){
			console.log(e);
			return {
				status:"error",
				response:typeof e == "object" ? e.stack:e
			}
		}
	}

	global.sayInChat = (message, platform, channel) => {
		if(platform == "twitch"){
			if(channel == null){
				channel = twitch.homeChannel;
			}
			twitch.sayInChat(message, channel);
		}else if(platform == "youtube"){
			if(channel == null){
				channel = youtube.chatId;
			}
			youtube.sayInChat(message, channel);
		}else{
			for(let p in activePlatforms){
				activePlatforms[p].sayInChat(message, activePlatforms[p].homeChannel);
			}
		}
	}

	global.runCommands = (eventData, eventName, extra) => {
		extra ??= {};
		//console.log("RUNNING COMMANDS", eventData);
		let isChat = eventData.eventType.includes("chat");
		let isReward = eventData.eventType.includes("redeem") || eventData.eventType.includes("twitch-event");
		let isOSC = eventData.eventType.includes("osc");
		if(isReward){
			eventData.username = eventData.user_name.toLowerCase();
			eventData.displayName = eventData.user_name;
			if(eventData.message == null){
				eventData.message = eventData.user_input != null ? eventData.user_input : "";
			}
		}else if(isOSC){
			eventData.username = twitch.botUsername;
			eventData.displayName = twitch.botUsername;
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
					return "alreadyon";
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
			sayInChat(eventData.displayName+" has activated "+event.name+"!", eventData.platform, eventData.channel);
			sendToTCP("/events/start/"+eventName, eventData.username+" has activated "+event.name+"!");
			if(event.cooldown != 0){
				createTimeout(eventName, null, "event", function(){
					sayInChat(event.name+" has been deactivated!", eventData.platform, eventData.channel);
					sendToTCP("/events/end/"+eventName, event.name+" has been deactivated!");
				}, event.cooldown);
			}
		}else if(isChat || isOSC){
			if(event.cooldown != 0){
				createTimeout(eventName, null, "event", function(){
				}, event.cooldown);
			}
		}

		for(let c in event.commands){
			let eCommand = event.commands[c];
			let commandDuration = parseFloat(eCommand.duration);
			
			let thisCommand = null;
			switch(eCommand.type){
				case 'response':
					thisCommand = async () =>{
						try{
							if(eventstorage[eventName] == null){
								eventstorage[eventName] = {};
							}
							
							let responseFunct = await eval("async () => { let event = "+JSON.stringify(eventData)
							+"; let extra = "+JSON.stringify(extra)
							+"; function say(txt){sayInChat(txt,"+JSON.stringify(eventData.platform)+","+JSON.stringify(eventData.channel)+");}"
							+"; let toUser = "+JSON.stringify(eventData.message.split(" ")[1])+""
							+"; let command = "+JSON.stringify(eventData.message.toLowerCase().split(" "))+""
							+"; function getVar(key,defaultVal=0){return eventstorage["+JSON.stringify(eventName)+"]?.[key]??defaultVal;}"
							+"; function setVar(key, value, save=true){eventstorage["+JSON.stringify(eventName)+"]??={}; eventstorage["+JSON.stringify(eventName)+"][key] = value; if(save==true){saveEventStorage();}}"
							+"; function getSharedVar(eventname, key,defaultVal=0){return eventstorage[eventname]?.[key]??defaultVal;}"
							+"; function setSharedVar(eventname, key, value, save=true){eventstorage[eventname]??={}; eventstorage[eventname][key] = value; if(save==true){saveEventStorage();}}"
							+"; function chooseRandom(...randArray){return randArray[Math.floor(Math.random()*randArray.length)];}"
							+"; function chooseRandom(randArray){return randArray[Math.floor(Math.random()*randArray.length)];}"
							+"; function sanitize(text){return text.replace(/[`!@#$%^&*()_+\\-=\\[\\]{};':\"\\\\|,.<>\\/?~]/,\"\",'');}"
							+"; function runEvent(eName){runCommands(event, eName)}"
							+"; "
							+eCommand.message.replace(/\n/g, "")+"}"
							);
							let response = await responseFunct();
							sayInChat(response, eventData.platform, eventData.channel);
							
						}catch(e){
							spooderLog("Failed to run response script. Check the event settings to verify it.", e)
						}
						
					}
					if(eCommand.delay == 0){
						thisCommand();
					}else{
						setTimeout(thisCommand, eCommand.delay);
					}
					
				break;
				case 'plugin':
					thisCommand = () => {
						if(activePlugins[eCommand.pluginname] != null){
							if(typeof activePlugins[eCommand.pluginname].onEvent == "undefined"){
								spooderLog(activePlugins[eCommand.pluginname], "onEvent() NOT FOUND");
								return;
							}
						}
						eventData.eventInfo = event;
						if(activePlugins[eCommand.pluginname]?.onEvent != null){
							if(eCommand.stop_eventname){
								createTimeout(eventName, eCommand, "timed", function(){
									activePlugins[eCommand.pluginname].onEvent(eCommand.stop_eventname, eventData);
								}, commandDuration);
							}
							activePlugins[eCommand.pluginname].onEvent(eCommand.eventname, eventData);
						}
					};

					if(eCommand.delay == 0){
						thisCommand();
					}else{
						setTimeout(thisCommand, eCommand.delay);
					}
					
				break;
				case 'software':
					
					thisCommand = () => {
						if(eCommand.etype == "timed"){
							
							let commandArgs = null;
							if(isChat && chatIsBroadcaster(eventData)){
								commandArgs = eventData.message.split(" ");
								if(commandArgs[1] != null){
									if(commandArgs[1].toLowerCase() == "on"){
										commandDuration = -1;
									}
								}
							}else if(isOSC){
								if(event.triggers.osc.handletype == "toggle"){
									commandDuration = -1;
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
								
							}, commandDuration);
								
						}else if(eCommand.etype == "button-press"){
							sendToUDP(eCommand.dest_udp, eCommand.address, eCommand.valueOn);
							setTimeout(function(){
								sendToUDP(eCommand.dest_udp, eCommand.address, eCommand.valueOff);
							}, 500);
						}else if(eCommand.etype == "oneshot"){
							sendToUDP(eCommand.dest_udp, eCommand.address, eCommand.valueOn);
						}
					};

					if(eCommand.delay == 0){
						thisCommand();
					}else{
						setTimeout(thisCommand, eCommand.delay);
					}
					
				break;
				case "obs":
					if(obs.connected == false){
						spooderLog("OBS NOT CONNECTED");
						break;
					}
					
					thisCommand = ()=>{
						if(eCommand.function == "setinputmute"){
							if(eCommand.etype == "timed"){
								
								callOBS("SetInputMute", {inputName:eCommand.item, inputMuted:eCommand.valueOn==1});
								createTimeout(eventName, eCommand, eCommand.type, function(){
									
									callOBS("SetInputMute", {inputName:eCommand.item, inputMuted:eCommand.valueOff==1});
								},commandDuration);
							}else{
								callOBS("SetInputMute", {inputName:eCommand.item, inputMuted:eCommand.valueOn==1});
							}
						}else if(eCommand.function == "switchscenes"){
							if(eCommand.etype == "timed"){
								
								callOBS("SetCurrentProgramScene", {sceneName:eCommand.itemOn});
								createTimeout(eventName, eCommand, eCommand.type, function(){
									callOBS("SetCurrentProgramScene", {sceneName:eCommand.itemOff});
								},commandDuration);
							}else{
								callOBS("SetCurrentProgramScene", {sceneName:eCommand.itemOn});
							}
						}else if(eCommand.function == "enablesceneitem"){
							if(eCommand.etype == "timed"){
								
								callOBS("SetSceneItemEnabled", {sceneName:eCommand.scene, sceneItemId:parseInt(eCommand.item), sceneItemEnabled:eCommand.valueOn==1});
								createTimeout(eventName, eCommand, eCommand.type, function(){
									callOBS("SetSceneItemEnabled", {sceneName:eCommand.scene, sceneItemId:parseInt(eCommand.item), sceneItemEnabled:eCommand.valueOff==1});
								},commandDuration);
							}else{
								callOBS("SetSceneItemEnabled", {sceneName:eCommand.scene, sceneItemId:parseInt(eCommand.item), sceneItemEnabled:eCommand.valueOn==1});
							}
						}
					};

					if(eCommand.delay == 0){
						thisCommand();
					}else{
						setTimeout(thisCommand, eCommand.delay);
					}
				break;
				case "mod":
					thisCommand = ()=>{
						if(eCommand.function == "lock"){
							if(eCommand.targettype == "all"){
								
								if(eCommand.etype == "toggle"){
									modlocks.lockdown = modlocks.lockdown==1?0:1;
									lockEvent(modlocks.lockdown==1?"unlock":"lock", "all");
									lockPlugin(modlocks.lockdown==1?"unlock":"lock", "all");
									sayInChat(modlocks.lockdown==0?"Lockdown initiated! All commands are blocked.":"Lockdown lifted!", eventData.platform, eventData.channel);
								}else if(eCommand.etype == "timed"){
									modlocks.lockdown = 1;
									lockEvent("lock", "all");
									lockPlugin("lock", "all");
									sayInChat("Lockdown initiated for "+convertDuration(commandDuration)+"! All commands are blocked until then.", eventData.platform, eventData.channel);
									createTimeout(eventName, eCommand, eCommand.type, function(){
										lockEvent("unlock", "all");
										lockPlugin("unlock", "all");
										sayInChat("Lockdown lifted!", eventData.platform, eventData.channel);
									}, commandDuration);
								}
								
							}else if(eCommand.targettype == "event"){
								
								if(eCommand.etype == "toggle"){
									lockEvent(isEventLocked(eCommand.target)?"unlock":"lock", eCommand.target);
								}else if(eCommand.etype == "timed"){
									lockEvent("lock", eCommand.target);
									createTimeout(eventName, eCommand, eCommand.type, function(){
										lockEvent("unlock", eCommand.target)
									}, commandDuration)
									
								}
								extra[eCommand.target] = isEventLocked(eCommand.target);
							}else if(eCommand.targettype == "plugin"){
								
								if(eCommand.etype == "toggle"){
									lockPlugin(isPluginLocked(eCommand.target)?"unlock":"lock", eCommand.target);
								}else if(eCommand.etype == "timed"){
									lockPlugin("lock", eCommand.target);
									
									createTimeout(eventName, eCommand, eCommand.type, function(){
										lockPlugin("unlock", eCommand.target)
									}, commandDuration)
								}
								extra[eCommand.target] = isPluginLocked(eCommand.target);
							}
						}else if(eCommand.function == "spamguard"){
							sayInChat(setSpamGuard(modlocks.spamguard==1?"off":"on"), eventData.platform, eventData.channel);
							extra["_spamguard"] = modlocks.spamguard==1;
						}else if(eCommand.function == "stop"){
							if(eCommand.targettype == "all"){
								sayInChat(stopEvent(eCommand.targettype), eventData.platform, eventData.channel)
							}else{
								sayInChat(stopEvent(eCommand.target), eventData.platform, eventData.channel);
							}
							
						}
					};
					if(eCommand.delay == 0){
						thisCommand();
					}else{
						setTimeout(thisCommand, eCommand.delay);
					}
				break;
			}
		}
	}
	
	runInterval = () => {
		uptime = Math.floor(Date.now()/1000);
		//console.log(activeEvents);
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

	const upInterval = setInterval(runInterval, 1000);

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