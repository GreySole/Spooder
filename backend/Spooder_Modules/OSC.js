const fs = require("fs");
const OSC = require('osc-js');

var oscLog = (...content) => {
    console.log(logEffects("Bright"),logEffects("FgGreen"), ...content, logEffects("Reset"));
}

class SOSC {
    osc = null;
    oscTCP = null;
    udpClients = sconfig.network.udp_clients
    monitorLogs = {
        logs:[],
        pluginlogs:[],
        liveLogging:0
    };

    constructor(){
        this.initializeOSC();
    }

    sendToMonitor = (proto, direction, data) => {
        let timestamp = Date.now();
        this.monitorLogs.logs.push({timestamp:timestamp, type:"osc", protocol:proto, direction:direction, data:data});
        if(this.monitorLogs.logs.length > 1000){
            this.monitorLogs.logs.shift();
        }
        if(this.monitorLogs.liveLogging == 1){
            this.oscTCP.send(new OSC.Message("/frontend/monitor/osc", JSON.stringify({timestamp:timestamp, type:"osc", protocol:proto, direction:direction, data:data})));
        }
    }

    pluginError = (pluginName, type, message) => {
        let timestamp = Date.now();
        this.monitorLogs.pluginlogs.push({timestamp:timestamp, type:"plugin", name:pluginName, type:type, message:message});
        if(this.monitorLogs.pluginlogs.length > 1000){
            this.monitorLogs.pluginlogs.shift();
        }

        if(this.monitorLogs.liveLogging == 1){
            this.oscTCP.send(new OSC.Message("/frontend/monitor/plugin", JSON.stringify({timestamp:timestamp, type:"plugin", name:pluginName, type:type, message:message})));
        }
    }

    sendToTCP = (address, oscValue, log) => {
        if(log==null){log=true;}
        if(typeof oscValue == "object" && !Array.isArray(oscValue)){
            oscValue = JSON.stringify(oscValue);
        }
        let newMessage = null;
        if(oscValue instanceof Array == false){
            newMessage = new OSC.Message(address, oscValue);
        }else{
            newMessage = new OSC.Message(address, ...oscValue);
        }
    
        if(log == true){
            this.sendToMonitor("tcp", "send", {types:newMessage.types, address:address, data:oscValue});
        }
        
        this.oscTCP.send(newMessage);
    }
    
    sendToUDP = (dest, address, oscValue) => {
        var udpClients = this.udpClients;
        
        let valueType = "i";
        if(typeof oscValue == "string"){
            if(oscValue.includes(",")){
                valueType = "array";
                oscValue = oscValue.split(",");
                for(let o in oscValue){
                    if(!isNaN(oscValue[o])){
                        if(oscValue[o].includes(".")){
                            oscValue[o] = parseFloat(oscValue[o]);
                        }else{
                            oscValue[o] = parseInt(oscValue[o]);
                        }
                    }else{
                        if(oscValue[o].toLowerCase() == "true"){
                            oscValue[o] = true;
                        }else if(oscValue[o].toLowerCase() == "false"){
                            oscValue[o] = false;
                        }
                    }
                }
            }else{
                if(!isNaN(oscValue)){
                    if(oscValue.includes(".")){
                        valueType = "f";
                        oscValue = parseFloat(oscValue);
                    }else{
                        valueType = "i";
                        oscValue = parseInt(oscValue);
                    }
                }else{
                    if(oscValue.toLowerCase() == "true"){
                        valueType = "b";
                        oscValue = true;
                    }else if(oscValue.toLowerCase() == "false"){
                        valueType = "b";
                        oscValue = false;
                    }
                }
            }
        }else if(Array.isArray(oscValue)){
            valueType = "array";
        }
        
        this.sendToMonitor("udp", "send", {dest:dest, types:valueType, address:address, data:oscValue});
        if(dest == -1){return;}
        else if(dest == -2){
            let allMessage = null;
            if(valueType.length > 1){
                allMessage = new OSC.Message(address, ...oscValue);
            }else{
                allMessage = new OSC.Message(address, oscValue);
            }
            for(let u in udpClients){
                this.osc.send(allMessage, {host: udpClients[u].ip, port: udpClients[u].port});
            }
        }else{
            let message = null;
            if(valueType.length > 1){
                message = new OSC.Message(address, ...oscValue);
            }else{
                message = new OSC.Message(address, oscValue);
            }
            this.osc.send(message, {host:udpClients[dest].ip, port:udpClients[dest].port});
        }
    }

    updateOSCListeners(){

        var osc = this.osc;
        var oscTCP = this.oscTCP;

        for(let o in osctunnels){
            var oscTCP = this.oscTCP;
            if(o=="sectionname"){continue;}
            if(osctunnels[o]["handlerFrom"] == "tcp"){
                oscTCP.on(osctunnels[o]["addressFrom"], message => {
                    let address = null;
                    if(osctunnels[o]["addressFrom"].endsWith("*")){
                        address = message.address.replace(osctunnels[o]["addressFrom"].replace("*",""), osctunnels[o]["addressTo"].replace("*",""))
                    }else{
                        address = osctunnels[o]["addressTo"];
                    }
                    switch(osctunnels[o]["handlerTo"]){
                        case "tcp":
                            sendToTCP(address, ...message.args);
                        break;
                        case "udp":
                            if(udpClients[osctunnels[o]["clientTo"]] != null){
                                sendToUDP(osctunnels[o]["clientTo"],address, message.args.join(","));
                            }else{ 
                                sendToUDP(-2,address, message.args.join(","));
                            }
                        break;
                        case "plugin":
                            if(activePlugins[osctunnels[o]["clientTo"]]?.onOSC != null){
                                activePlugins[osctunnels[o]["clientTo"]].onOSC(message);
                            }
                        break;
                        default:
                            sendToUDP(osctunnels[o]["clientTo"], address, message.args.join(","));
                    }
                });
            }else if(osctunnels[o]["handlerFrom"] == "udp"){
                
                osc.on(osctunnels[o]["addressFrom"], message => {
                    
                    let address = null;
                    if(osctunnels[o]["addressFrom"].endsWith("*")){
                        address = message.address.replace(osctunnels[o]["addressFrom"].replace("*",""), osctunnels[o]["addressTo"].replace("*",""))
                    }else{
                        address = osctunnels[o]["addressTo"];
                    }
                    switch(osctunnels[o]["handlerTo"]){
                        case "tcp":
                            sendToTCP(address, ...message.args);
                        break;
                        case "udp":
                            if(udpClients[osctunnels[o]["clientTo"]] != null){
                                sendToUDP(osctunnels[o]["clientTo"],address, message.args.join(","));
                            }else{ 
                                sendToUDP(-2,address, message.args.join(","));
                            }
                            
                        break;
                        case "plugin":
                            if(activePlugins[osctunnels[o]["clientTo"]]?.onOSC != null){
                                console.log("PLUGIN");
                                activePlugins[osctunnels[o]["clientTo"]].onOSC(message);
                            }
                        break;
                        default:
                            sendToUDP(osctunnels[o]["clientTo"], address, message.args.join(","));
                    }
                });
            }
        }
    }

    initializeOSC(){
        
        var udpConfig = {
            type:'udp4',
            open: {
                host: sconfig.network.host,
                port: sconfig.network.osc_udp_port,
                exclusive: false
            },
            send:{
                port: sconfig.network.osc_udp_port
            }
        };

        this.osc = new OSC({plugin: new OSC.DatagramPlugin(udpConfig)});
        var osc = this.osc;

        osc.on("*", message =>{
            this.sendToMonitor("udp", "receive", {types:message.types, address:message.address, data:message.args});

            for(let e in events){
                if(events[e].triggers.osc?.enabled == true){
                    message.eventType = "osc";
                    if(events[e].triggers.osc.handletype == "search"){
                        
                        if(message.address == events[e].triggers.osc.address){
                            message.message = message.args[0];
                            
                            let check = checkResponseTrigger(events[e], message);
                            
                            if(check != null){
                                if(runCommands(check.message, e, check.extra) == "alreadyon"){
                                    twitch.sayAlreadyOn(e);
                                }
                            }
                        }
                        
                    }else if(message.address == events[e].triggers.osc.address){
                        if(events[e].triggers.osc.type != "double"){
                            if(eval(message.args[0]+events[e].triggers.osc.condition+events[e].triggers.osc.value)){
                            
                                runCommands(message, e);
                            }
                        }else if(events[e].triggers.osc.type == "single"){
                            if(eval(message.args[0]+events[e].triggers.osc.condition+events[e].triggers.osc.value
                                +" && "+message.args[1]+events[e].triggers.osc.condition2+events[e].triggers.osc.value2)){
                            
                                runCommands(message, e);
                            }
                        }
                    }
                }
            }
            
            for(let p in activePlugins){
                if(activePlugins[p].onOSC != null){
                    activePlugins[p].onOSC(message);
                }
            }
        });
        osc.on("open", () =>{
            oscLog("OSC UDP OPEN");
        });
        osc.open();

        this.oscTCP = new OSC({plugin: new OSC.WebsocketServerPlugin({host:"0.0.0.0",port:sconfig.network.osc_tcp_port})});
        var oscTCP = this.oscTCP;

        oscTCP.on("open", () =>{
            oscLog("OSC TCP OPEN");
            
        });

        oscTCP.on("*", message => {
            if(!message.address.startsWith("/frontend/monitor")){
                this.sendToMonitor("tcp", "receive", {types:message.types, address:message.address, data:message.args});
            }
            
            let address = message.address.split("/");

            for(let p in activePlugins){

                //Alert box plugins need to listen for any connect messages from other plugins
                if(activePlugins[p].isAlertBox != null){
                    activePlugins[p].onOSC(message);
                    continue;
                }

                //Only the plugin with its name in the beginning of the address
                //will call its onOSC
                if(p.startsWith(address[1])){
                    if(activePlugins[p].onOSC != null){
                        activePlugins[p].onOSC(message);
                    }
                }
            }

            if(address[1] == "frontend"){
                if(address[2] == "monitor"){
                    if(address[3] == "logging"){
                        this.monitorLogs.liveLogging = message.args[0];
                    }else if(address[3] == "get"){
                        if(message.args[0] == "all"){
                            this.sendToTCP("/frontend/monitor/get/all", JSON.stringify(this.monitorLogs), false);
                            return;
                        }
                    }
                }
            }

            if(address[1] == "spooder"){
                if(address[2] == "plugin"){
                    if(address[3] == "error"){
                        
                        let errorObj = JSON.parse(message.args[0]);
                        //oscLog("GOT PLUGIN ERROR", errorObj);
                        this.pluginError(errorObj.name, errorObj.type, errorObj.message);
                        return;
                    }
                }
            }

            if(address[1] == "mod"){
                if(activeUsers[message.args[0]] != "local"){
                    if(activeUsers[message.args[0]] == null 
                        || activeUsers[message.args[0]] != address[2]
                        || (!users.trusted_users.permissions[activeUsers[message.args[0]]]?.includes("m")
                        && !users.trusted_users.permissions[activeUsers[message.args[0]]]?.includes("a"))){
                        console.log("Unauthorized mod OSC!", address[2], message.args[0]);
                        return;
                    }
                }
                if(address[3] == "lock"){
                    if(address[4] == "event"){
                        lockEvent(message.args[1], address[5]);
                        sayInChat(address[2]+ " "+message.args[1]+"ed "+address[5]);
                    }else if(address[4] == "plugin"){
                        
                        if(address[6] == null){
                            lockPlugin(message.args[1], address[5])
                            sayInChat(address[2]+ " "+message.args[1]+"ed "+address[5]);
                        }else{
                            lockPlugin(message.args[1], address[5], address[6]);
                            sayInChat(address[2]+ " "+message.args[1]+"ed "+address[6]+" in "+address[5]);
                        }
                        
                    }
                }else if(address[3] == "blacklist"){
                    blacklistUser(address[4]);
                    fs.writeFile(backendDir+"/settings/mod-blacklist.json", JSON.stringify(modlocks.blacklist), "utf-8", (err, data)=>{
						oscLog("Mod file saved!");
					});
                    sayInChat(address[2]+(message.args[1]==1?" blacklisted ":" unblacklisted ")+address[4]);
                }else if(address[3] == "spamguard"){
                    setSpamGuard(address[4]);
                    
                    sayInChat(address[2]+" turned "+(message.args[1]==1?" on ":" off ")+"Spam Guard");
                }else if(address[3] == "get"){
                    if(address[4] == "all"){
                        sendToTCP("/mod/"+address[2]+"/get", 
                        JSON.stringify({
                            _events:Object.keys(events),
                            _plugins:Object.keys(activePlugins),
                            _modlocks:modlocks
                        }));
                    }
                }else if(address[3] == "save"){
                    if(address[4] == "theme"){
                        if(themes.modui[address[2]] == null){themes.modui[address[2]] = {}}
                        themes.modui[address[2]] = JSON.parse(message.args[1]);
                        fs.writeFile(backendDir+"/settings/themes.json", JSON.stringify(themes), "utf-8", (err, data)=>{
                            oscLog("Themes saved!");
                        });
                        sendToTCP("/mod/"+address[2]+"/save/theme", message.args[1]);
                    }
                }
                sendToTCP(message.address, message.args[1]);
                return;
            }

            //Tell the overlay it's connected
            if(message.address.endsWith("/connect")){
                oscTCP.send(new OSC.Message(message.address.split("/")[1]+'/connect/success', 1.0));
                return;
            }
            
            //Legacy block to get plugin settings. They're set when they're loaded now
            //but this can be used for on the fly updates
            if(message.address.startsWith("/settings")){
                let addressSplit = message.address.split("/");
                let pluginName = addressSplit[addressSplit.length-1];
                let settingsJSON = this.fs.readFileSync(backendDir+"/plugins/"+pluginName+"/settings.json",{encoding:'utf8'});
                oscTCP.send(new OSC.Message("/"+pluginName+"/settings", settingsJSON));
                return;
            }

            if(message.address.startsWith("/obs")){
                if(obs != null){
                    obs.onOSC(message);
                }
                return;
            }
            
        });

        oscTCP.open();

        this.updateOSCListeners();
    }
}

module.exports = SOSC;