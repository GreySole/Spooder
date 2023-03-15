const Initializer = require("./backend/Spooder_Modules/Init.js");
const WebUI = require("./backend/Spooder_Modules/WebUI.js");
const SOSC = require("./backend/Spooder_Modules/OSC.js");

global.devMode = process.argv.length>2?process.argv[2] == "-d":false;
var initMode = process.argv.length>2?process.argv[2] == "-i":false;
var noAutoLogin = process.argv.length>2?process.argv[2] == "-a":false;

var spooderLog = (...content) => {
    console.log(logEffects("Bright"),logEffects("FgYellow"), ...content, logEffects("Reset"));
}

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
		"oauth":"oauth.json",
		"sconfig":"config.json",
		"events":"commands.json",
		"eventsubs":"eventsub.json",
		"modData":"mod.json",
		"osctunnels":"osc-tunnels.json",
		"themes":"themes.json",
		"eventstorage":"eventstorage.json",
		"shares":"shares.json"
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
				}else if(s == "modData"){
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
				fs.writeFile(backendDir+"/settings/"+settingsFiles[s], JSON.stringify(newFile), "utf-8", 
				(err, data)=>{
					spooderLog(settingsFiles[s]+" not found. New file created.");
				});
			}else{
				console.error(e);
				console.error("There's a problem with the "+s+" file.");
			}
		}

		if(oauth['client-id'] == "editme" || oauth['client-secret'] == "editme" ||
			oauth['client-id'] == "" || oauth['client-secret'] == "" ||
			oauth['client-id'] == null || oauth['client-secret'] == null){
				console.error("No Twitch authentication credentials found. \n\
				Create an app on dev.twitch.tv and run 'npm run init' to fill in your client id and secret.");
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

	global.activeMods = {};

	global.udpClients = sconfig.network["udp_clients"];
	global.activePlugins = {};

	const Discord = require("./backend/Spooder_Modules/Discord");
	const Twitch = require("./backend/Spooder_Modules/Twitch");
	const OBS = require("./backend/Spooder_Modules/OBSOSC");

	global.webUI = new WebUI();
	
	let webRouter = webUI.startServer(devMode);
	global.twitch = new Twitch(webRouter);
	global.discord = new Discord(webRouter);
	global.obs = new OBS(webRouter);
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
			twitch.autoLogin().catch(e=>{});
			
        	obs.autoLogin().catch(e=>{});
			await discord.autoLogin().catch(e=>{});
		}
		
		if(sconfig.network.externalhandle == "ngrok" && sconfig.network.ngrokauthtoken != ""){
			webUI.startNgrok();
		}

		webUI.getPlugins();
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
			if(plugin == "all"){
				
				modlocks.plugins[p] = modCommand=="lock"?1:0;
				sendToTCP("/mod/"+moduser+"/"+modCommand+"/plugin/"+p, modCommand=="lock"?1:0);
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
			eventData.username = botUsername;
			eventData.displayName = botUsername;
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
			sayInChat(eventData.username+" has activated "+event.name+"!", eventData.channel);
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
			let commandDuration = parseFloat(eCommand.duration);
			
			switch(eCommand.type){
				case 'response':
					
					setTimeout(async () =>{
						try{
							let responseFunct = await eval("async () => { let event = "+JSON.stringify(eventData)+"; let extra = "+JSON.stringify(extra)+"; "+eCommand.message.replace(/\n/g, "")+"}");
							let response = await responseFunct();
							sayInChat(response, eventData.channel);
						}catch(e){
							spooderLog("Failed to run response script. Check the event settings to verify it.", e)
						}
						
					}, eCommand.delay);
				break;
				case 'plugin':
					setTimeout(() => {
						if(activePlugins[eCommand.pluginname] != null){
							if(typeof activePlugins[eCommand.pluginname].onEvent == "undefined"){
								spooderLog(activePlugins[eCommand.pluginname], "onEvent() NOT FOUND");
								return;
							}
						}
						eventData.eventInfo = event;
						if(activePlugins[eCommand.pluginname].onPreEvent){
							activePlugins[eCommand.pluginname].onPreEvent(eCommand.eventname, eventData);
						}else{
							activePlugins[eCommand.pluginname].onEvent(eCommand.eventname, eventData);
						}
						
					}, eCommand.delay);
					
				break;
				case 'software':
					setTimeout(() => {
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
					}, eCommand.delay);
					
				break;
				case "obs":
					if(obs.connected == false){
						spooderLog("OBS NOT CONNECTED");
						break;
					}
					setTimeout(()=>{
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
					}, eCommand.delay);
				break;
				case "mod":
					setTimeout(()=>{
						if(eCommand.function == "lock"){
							if(eCommand.targettype == "all"){
								
								if(eCommand.etype == "toggle"){
									modlocks.lockdown = modlocks.lockdown==1?0:1;
									lockEvent(botUsername, modlocks.lockdown==1?"unlock":"lock", "all");
									lockPlugin(botUsername, modlocks.lockdown==1?"unlock":"lock", "all");
									sayInChat(modlocks.lockdown==0?"Lockdown initiated! All commands are blocked.":"Lockdown lifted!", eventData.channel);
								}else if(eCommand.etype == "timed"){
									modlocks.lockdown = 1;
									lockEvent(botUsername, "lock", "all");
									lockPlugin(botUsername, "lock", "all");
									sayInChat("Lockdown initiated for "+convertDuration(commandDuration)+"! All commands are blocked until then.", eventData.channel);
									createTimeout(eventName, eCommand, eCommand.type, function(){
										lockEvent(botUsername, "unlock", "all");
										lockPlugin(botUsername, "unlock", "all");
										sayInChat("Lockdown lifted!");
									}, commandDuration);
								}
								
							}else if(eCommand.targettype == "event"){
								
								if(eCommand.etype == "toggle"){
									lockEvent(botUsername, modlocks.events[eCommand.target]==1?"unlock":"lock", eCommand.target);
								}else if(eCommand.etype == "timed"){
									lockEvent(botUsername, "lock", eCommand.target);
									createTimeout(eventName, eCommand, eCommand.type, function(){
										lockEvent(botUsername, "unlock", eCommand.target)
									}, commandDuration)
									
								}
							}else if(eCommand.targettype == "plugin"){
								
								if(eCommand.etype == "toggle"){
									lockPlugin(botUsername, modlocks.plugins[eCommand.target]==1?"unlock":"lock", eCommand.target);
								}else if(eCommand.etype == "timed"){
									lockPlugin(botUsername, "lock", eCommand.target);
									
									createTimeout(eventName, eCommand, eCommand.type, function(){
										lockPlugin(botUsername, "unlock", eCommand.target)
									}, commandDuration)
								}
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