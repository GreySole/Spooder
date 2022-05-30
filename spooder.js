const Initializer = require("./backend/Spooder_Modules/Init.js");
const WebUI = require("./backend/Spooder_Modules/WebUI.js");
const SOSC = require("./backend/Spooder_Modules/SOSC.js");

var devMode = process.argv.length>2?process.argv[2] == "-d":false;
var initMode = process.argv.length>2?process.argv[2] == "-i":false;
var noAutoLogin = process.argv.length>2?process.argv[2] == "-a":false;

global.backendDir = __dirname+"/backend";
global.frontendDir = __dirname+"/build";

const fs = require('fs-extra');
const path = require('path');

let settingsDir = path.join(backendDir, "settings");

if(!fs.existsSync(settingsDir)){
	fs.mkdirSync(settingsDir);
}

global.oauth = {};
global.config = {};
global.osctunnels = {};
global.eventsubs = {};
global.events = {};
global.eventGroups = ["Default"];

global.refreshFiles = () => {

	try{
		var oauthFile = fs.readFileSync(backendDir+"/settings/oauth.json",{encoding:'utf8'});
		oauth = JSON.parse(oauthFile);
		console.log("Got OAuth Settings");
		if(oauth['client-id'] == "editme" || oauth['client-secret'] == "editme" ||
		oauth['client-id'] == "" || oauth['client-secret'] == ""){
			console.error("No Twitch authentication credentials found. \n\
			Create an app on dev.twitch.tv and run 'npm run init' to fill in your client id and secret.");
		}
	}catch(e){
		console.error(e);
		console.error("There's a problem with the oauth file. We'll keep running, but you won't be able to connect to chat.");
	}
	try{
		var configFile = fs.readFileSync(backendDir+"/settings/config.json",{encoding:'utf8'});
		config = JSON.parse(configFile);
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
	}catch(e){
		//console.error(e);
		if(e.code == "ENOENT"){
			fs.writeFile(backendDir+"/settings/eventsub.json", JSON.stringify(events), "utf-8", (err, data)=>{
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
	
	activeEvents = {};
	chatEvents = [];

	global.udpClients = config.network["udp_clients"];
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
	global.sendToTCP = (address, oscValue)=>{sosc.sendToTCP(address, oscValue)};
	global.sendToUDP = (dest, address, oscValue)=>{sosc.sendToUDP(dest, address, oscValue)};

	global.webUI = new WebUI(devMode);

	const {Chat} = require("twitch-js");

	function onAuthenticationFailure(){
		webUI.onAuthenticationFailure();
	}

	const run = async() => {

		chat = new Chat({
			"username":username,
			"token":token,
			"onAuthenticationFailure":onAuthenticationFailure,
			"connectionTimeout":60000,
			"joinTimeout":60000
		});
		
		await chat.connect().catch(error=>{console.error(error)});
		await chat.join(channel).catch(error=>{console.error(error)});
		
		chat.on("*", (message) =>{

			if(typeof message.message == "undefined"){return;}
			
			if(message.message.startsWith("!")){

				let command = message.message.substr(1).split(" ");

				if(command[0] == "stop" && (message.tags.mod == 1 || message.tags.badges.broadcaster == true)){
					let cEvent = command[1];
					if(typeof activeEvents[cEvent] != "undefined"){
						for(e in activeEvents[cEvent]){
							if(activeEvents[cEvent][e] != "event"){
								activeEvents[cEvent][e]["function"]();
							}
						}
						delete activeEvents[cEvent];
						sayInChat(events[cEvent].name+" has been stopped!");
					}else{
						sayInChat("I can't stop "+cEvent+"!");
					}
					
				}

				for(let e in events){
					if(events[e].triggers.chat.enabled
						&& events[e].triggers.chat.command == message.message){
							runCommands(message, e);
					}
				}
				
				if(command[0] == config.bot.help_command){
					if(command.length>1){
						let commands = [];
						let done = false;

						if(command[1] == "help"){
							sayInChat("Pass a command type like '!"+config.bot.help_command+" event' to show the commands for that type. You can also pass a command like '!"+config.bot.help_command+" event command' to get a description of what that command does. Active plugins are: ["+stringifyArray(Object.keys(activePlugins))+"]");
							return;
						}

						for(let e in events){
							if(events[e].type == command[1] && command.length==2){
								commands.push("!"+e);
							}else if(events[e].type == command[1] && command.length > 2){
								if(e.toUpperCase() == command[2].toUpperCase()){
									sayInChat(events[e].description);
									done = true;
								}
							}
						}
						for(let p in activePlugins){
							if(p.toUpperCase() == command[1].toUpperCase() && command.length==2){
								commands = Object.keys(activePlugins[p].commandList);
							}else if(command.length > 2){
								if(activePlugins[p].commandList[command[2]] != null){
									sayInChat(activePlugins[p].commandList[command[2]]);
									done = true;
								}
							}
							
						}
						if(commands.length == 0 && done == false){
							sayInChat("I'm not sure what "+command[1]+" is (^_^;)");
						}else if(done == false){
							sayInChat("Commands for "+command[1]+" are: "+stringifyArray(commands));
						}
						
					}else{
						
						sayInChat("Hi, I'm "+config.bot.bot_name+". "+config.bot.introduction);
					}
				}
			}
			
			for(p in activePlugins){
				activePlugins[p].onChat(message);
			}

		});
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

	function sayAlreadyOn(name){
		for(let c in activeEvents[name]){
			console.log(activeEvents[name][c].etype);
			if(activeEvents[name][c].etype == "event"){
				sayInChat(events[name].name+" is cooling down. Time Left: "+Math.abs(Math.floor(uptime-activeEvents[name][c]["timeout"]))+"s");
				break;
			}
		}
	}

	function stringifyArray(a){
		return a.join(", ");
	}

	global.sayInChat = (message) =>{
		chat.once("USERSTATE", (uState)=>{
			uState.message = message;
		})
		chat.say(channel,message);
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

	global.runCommands = (eventData, eventName) => {
		
		if(eventData.username){
			eventData.username = eventData.tags.displayName;
		}else{
			eventData.username = eventData.user_name;
		}

		let event = events[eventName];

		if(activeEvents[eventName] != null){
			if(event.chatnotification == true){
				sayAlreadyOn(eventName);
			}
			return;
		}

		

		if(event.chatnotification == true){
			sayInChat(eventData.username+" has activated "+event.name+"!");
			sendToTCP("/events/start/"+eventName, eventData.username+" has activated "+event.name+"!");
			createTimeout(eventName, "event", function(){
				sayInChat(event.name+" has been deactivated!");
				sendToTCP("/events/end/"+eventName, event.name+" has been deactivated!");
			}, event.cooldown);
		}

		for(let c in event.commands){
			let eCommand = event.commands[c];
			
			switch(eCommand.type){
				case 'response':
					
					setTimeout(() =>{
						try{
							let responseFunct = eval("() => { let event = "+JSON.stringify(eventData)+"; "+eCommand.message.replace(/\n/g, "")+"}");
						
							let response = responseFunct();
							sayInChat(response);
						}catch(e){
							console.log("Failed to run response script. Check the event settings to verify it.")
						}
						
					}, eCommand.delay);
				break;
				case 'plugin':
					setTimeout(() => {
						if(typeof activePlugins[eCommand.pluginname].onEvent == "undefined"){
							console.log(activePlugins[eCommand.pluginname], "onEvent() NOT FOUND");
							return;
						}
						
						activePlugins[eCommand.pluginname].onEvent(eCommand.eventname, eventData);
					}, eCommand.delay);
					
				break;
				case 'software':
					
					setTimeout(() => {
						if(eCommand.etype == "timed"){
							let eventDuration = parseInt(eCommand.duration);

							sendToUDP(eCommand.dest_udp, eCommand.address, eCommand.valueOn);

							createTimeout(eventName, eCommand.etype, function(){
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
			}
		}
	}

	runInterval = () => {
		uptime = Math.floor(Date.now()/1000);
		for(let e in activeEvents){
			
			//Loop 1 for action
			for(let command in activeEvents[e]){
				sosc.sendToTCP("/events/time/"+e+"/"+activeEvents[e][command]["etype"], uptime-activeEvents[e][command]["timeout"]);
				if(uptime >= activeEvents[e][command]["timeout"]){
					
					activeEvents[e][command]["function"]();
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

	function createTimeout(name, etype, funct, seconds){
		if(activeEvents[name] == null){
			activeEvents[name] = [];
		}
		activeEvents[name].push({
			"function": funct,
			"timeout": uptime+seconds,
			"etype": etype
		});
	}
}