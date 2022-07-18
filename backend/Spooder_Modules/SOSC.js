const fs = require("fs");
const OSC = require('osc-js');
const OBSOSC = require("./OBSOSC.js");

class SOSC {
    osc = null;
    oscTCP = null;
    obs = null;
    udpClients = sconfig.network.udp_clients
    monitorLogs = {
        logs:[],
        liveLogging:0
    };

    constructor(){
        this.initializeOSC();
    }

    sendToMonitor = (proto, direction, data) => {
        this.monitorLogs.logs.push({protocol:proto, direction:direction, data:data});
        if(this.monitorLogs.logs.length > 200){
            this.monitorLogs.logs.shift();
        }
        if(this.monitorLogs.liveLogging == 1){
            this.oscTCP.send(new OSC.Message("/frontend/monitor", JSON.stringify({protocol:proto, direction:direction, data:data})));
        }
    }

    sendToTCP = (address, oscValue, log) => {
        if(log==null){log=true;}
        let newMessage = null;
        if(oscValue instanceof Array == false){
            newMessage = new OSC.Message(address, oscValue);
        }else{
            newMessage = new OSC.Message(address, oscValue[0], oscValue[1]);
        }
    
        if(log == true){
            this.sendToMonitor("tcp", "send", {types:newMessage.types, address:address, data:oscValue});
        }
        
        this.oscTCP.send(newMessage);
    }
    
    sendToUDP = (dest, address, oscValue) => {
        var udpClients = this.udpClients;
        
        let valueType = "int";
        if(!isNaN(oscValue)){
            if(typeof oscValue == "string"){
                if(oscValue.includes(".")){
                    valueType = "f";
                    oscValue = parseFloat(oscValue);
                }else{
                    valueType = "i";
                    oscValue = parseInt(oscValue);
                }
            }
        }
        else if(!isNaN(oscValue.split(",")[0])){valueType = "ii"}
        else{valueType = "s"}
        this.sendToMonitor("udp", "send", {dest:dest, types:valueType, address:address, data:oscValue});
        if(dest == -1){return;}
        else if(dest == -2){
            let allMessage = new OSC.Message(address, oscValue);
            if(valueType == "ii"){
                oscValue = oscValue.split(",");
                allMessage = new OSC.Message(address, parseInt(oscValue[0]), parseFloat(oscValue[1]));
            }
            for(let u in udpClients){
                this.osc.send(allMessage, {host: udpClients[u].ip, port: udpClients[u].port});
            }
        }else{
            let message = new OSC.Message(address, oscValue);
            //console.log("UDP MESSAGE", message);
            if(valueType == "ii"){
                oscValue = oscValue.split(",");
                message = new OSC.Message(address, parseInt(oscValue[0]), parseFloat(oscValue[1]));
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
                    switch(osctunnels[o]["handlerTo"]){
                        case "tcp":
                            sendToTCP(osctunnels[o]["addressTo"], message.args[0]);
                        break;
                        case "udp":
                            sendToUDP(-2,osctunnels[o]["addressTo"], message.args.join(","));
                        break;
                        default:
                            sendToUDP(osctunnels[o]["handlerTo"], osctunnels[o]["addressTo"], message.args.join(","));
                    }
                });
            }else{
                
                osc.on(osctunnels[o]["addressFrom"], message => {
                    
                    switch(osctunnels[o]["handlerTo"]){
                        case "tcp":
                            sendToTCP(osctunnels[o]["addressTo"], message.args[0]);
                        break;
                        case "udp":
                            sendToUDP(-2,osctunnels[o]["addressTo"], message.args.join(","));
                        break;
                        default:
                            sendToUDP(-2, osctunnels[o]["addressTo"], message.args.join(","));
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
            for(let p in activePlugins){
                if(activePlugins[p].onOSC != null){
                    activePlugins[p].onOSC(message);
                }
            }
        });
        osc.on("open", () =>{
            console.log("OSC UDP OPEN");
        });
        osc.open();

        this.oscTCP = new OSC({plugin: new OSC.WebsocketServerPlugin({host:"0.0.0.0",port:sconfig.network.osc_tcp_port})});
        var oscTCP = this.oscTCP;

        oscTCP.on("open", () =>{
            console.log("OSC TCP OPEN");
            
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
                if(address[1] == p){
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
                        }
                    }
                }
            }

            if(address[1] == "mod"){
                if(address[3] == "lock"){
                    if(address[4] == "event"){
                        modlocks.events[address[5]] = message.args[0];
                        sayInChat(address[2]+(message.args[0]==1?" locked ":" unlocked ")+address[5]);
                        
                    }else if(address[4] == "plugin"){
                        if(modlocks.plugins[address[5]] == null){modlocks.plugins[address[5]] = {}}
                        if(address[6] == null){
                            modlocks.plugins[address[5]] = message.args[0];
                            sayInChat(address[2]+(message.args[0]==1?" locked ":" unlocked ")+address[5]+" chat commands");
                        }else{
                            activePlugins[address[5]].modmap.locks[address[6]] = message.args[0];
                            sayInChat(address[2]+(message.args[0]==1?" locked ":" unlocked ")+address[6]+" in "+address[5]);
                        }
                        
                    }
                }else if(address[3] == "blacklist"){
                    modlocks.blacklist[address[4]] = message.args[0];
                    fs.writeFile(backendDir+"/settings/mod-blacklist.json", JSON.stringify(modlocks.blacklist), "utf-8", (err, data)=>{
                        console.log("Blacklist saved!");
                    });
                    sayInChat(address[2]+(message.args[0]==1?" blacklisted ":" unblacklisted ")+address[4]);
                }else if(address[3] == "get"){
                    if(address[4] == "all"){
                        sendToTCP("/mod/"+address[2]+"/get", 
                        JSON.stringify({
                            _events:Object.keys(events),
                            _plugins:Object.keys(activePlugins),
                            _modlocks:modlocks
                        }));
                    }
                }else if(address[3] == "sync"){
                    if(address[4] == "theme"){
                        sendToTCP("/mod/"+address[2]+"/sync/theme", message.args[0]);
                    }
                }
                sendToTCP(message.address, message.args[0]);
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
                if(this.obs != null){
                    this.obs.onOSC(message);
                }
            }
            
        });

        oscTCP.open();

        this.updateOSCListeners();

        this.obs = new OBSOSC();
        this.obs.autoLogin();
    }
}

module.exports = SOSC;