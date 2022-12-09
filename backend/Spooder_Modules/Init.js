const fs = require("fs");

const { networkInterfaces } = require('os');

const nets = networkInterfaces();
const results = Object.create(null); // Or just '{}', an empty object
var suggestedNet = null;

for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
        // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
        // 'IPv4' is in Node <= 17, from 18 it's a number 4 or 6
        const familyV4Value = typeof net.family === 'string' ? 'IPv4' : 4
        if (net.family === familyV4Value && !net.internal) {
            if (!results[name]) {
                results[name] = [];
            }
            results[name].push(net.address);
            if(net.address.startsWith("192")){
                suggestedNet = net.address;
            }
        }
    }
}

class Initializer{

    constructor(){
        this.beginInit();
    }

    beginInit(){
        const readline = require("readline").createInterface({
            input: process.stdin,
            output: process.stdout
        });
        let artStr = String.raw`
        / / _ \ \
        \_\(_)/_/
         _//"\\_ 
          /   \
        `;
        console.log("Hi there!\n"+artStr+"\n"+"Let's get your Spooder set up!\n");
        var initData = {};
    
        console.log("We'll need some app credentials for the Twitch API. You'll need to set up your developer console at dev.twitch.tv to make app access credentials. Once that's done, enter them here. If you want to run Spooder without Twitch features, or fill them in later, you can leave these blank. Initializing overwrites most of the settings files.");
        
        readline.question("Client ID: ", cid => {
            initData.clientId = cid;
            
            readline.question("Client Secret: ", cs => {
                initData.clientSecret = cs;
                console.log("Here are the network interfaces found on this device", results);
                console.log("I suggest using this one: ", suggestedNet);
                readline.question("IP Address for OSC/Web hosting (Usually 192.168.*.*): ", ip => {
                    initData.hostIP = ip;
    
                    readline.question("What's your Spooder's name?: ", name => {
                        
                        initData.sName = name;
                        
                        readline.question(`What should the help command be? Could be !${initData.sName} or just !help: `, helpCmd => {
                            if(helpCmd.startsWith("!")){
                                initData.helpCmd = helpCmd.substring(1);
                            }else{
                                initData.helpCmd = helpCmd;
                            }
    
                            readline.question("What's your broadcaster username?: ", name => {
                                initData.bName = name;
                                var newAuth = {
                                    "client-id":initData.clientId,
                                    "client-secret":initData.clientSecret
                                };
                                
                                var newConfig = {
                                    "bot":{
                                        "sectionname":"Bot Settings",
                                        "bot_name":initData.sName,
                                        "help_command":initData.helpCmd,
                                        "introduction":"I'm a Spooder connected to the stream ^_^"
                                    },
                                    "broadcaster":{
                                        "sectionname":"Broadcaster",
                                        "username":initData.bName
                                    },"network":{
                                        "sectionname":"Network",
                                        "host":initData.hostIP,
                                        "host_port":3000,
                                        "externalhandle":"ngrok",
                                        "ngrokauthtoken":"",
                                        "external_http_url":"",
                                        "external_tcp_url":"",
                                        "udp_clients":{},
                                        "osc_udp_port":9000,
                                        "osc_tcp_port":3333
                                    }
                                };

                                var newMod = {
                                    "trusted_users": {},
                                    "trusted_users_pw": {}
                                }

                                var newThemes = {
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
                                }
                                
                                fs.writeFile(backendDir+"/settings/oauth.json", JSON.stringify(newAuth), "utf-8", (err, data)=>{
                                    fs.writeFile(backendDir+"/settings/config.json", JSON.stringify(newConfig), "utf-8", (err, data)=>{
                                        fs.writeFile(backendDir+"/settings/osc-tunnels.json", "{}", "utf-8", (err, data)=>{
                                            fs.writeFile(backendDir+"/settings/mod-blacklist.json", "{}", "utf-8", (err, data)=>{
                                                fs.writeFile(backendDir+"/settings/eventsub.json", "{}", "utf-8", (err, data)=>{
                                                    fs.writeFile(backendDir+"/settings/commands.json", "{}", "utf-8", (err, data)=>{
                                                        fs.writeFile(backendDir+"/settings/mod.json", JSON.stringify(newMod), "utf-8", (err, data)=>{
                                                            fs.writeFile(backendDir+"/settings/themes.json", JSON.stringify(newThemes), "utf-8", (err, data)=>{
                                                        
                                                            });
                                                        });
                                                    });
                                                });
                                            });
                                        });
                                    });
                                });
                                
                                readline.question("\nGreat! That's all the config essentials. Just one more thing. Close this process and call \n'npm run start' to start your Spooder. Then go to localhost:"+initData.hostIP+" in your browser. Click on the nav bar up top and authorize your Twitch account for chat. Then go to the EventSub tab to save your oauth as broadcaster to link channel point rewards to events.", name => {readline.close();});
                            });
                        });
                    });
                });
            });
        });
    }
}

module.exports = Initializer;