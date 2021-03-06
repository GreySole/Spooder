const {default: OBSWebSocket, EventSubscription} = require("obs-websocket-js");
const obs = new OBSWebSocket();
const fs = require("fs");

class OBSOSC{

    autoLogin(){

        let obsLoginInfo = fs.existsSync(backendDir+"/settings/obs.json")?fs.readFileSync(backendDir+"/settings/obs.json",{encoding:"utf-8"}):null;
        if(obsLoginInfo != null){
            try{
                obsLoginInfo = JSON.parse(obsLoginInfo);
            }catch(e){
                console.log("Somethings wrong with obs login file. Try entering it again.");
                obsLoginInfo = {};
            }

            if(obsLoginInfo.url != null){
                console.log("OBS LOGIN INFO FOUND");
                this.connect(obsLoginInfo.url, obsLoginInfo.port, obsLoginInfo.password);
            }
        }
    }

    saveLogin(url, port, password){
        let obsLoginInfo = {
            url:url,
            port:port,
            password:password
        };
        fs.writeFile(backendDir+"/settings/obs.json", JSON.stringify(obsLoginInfo), "utf-8", (err, data)=>{
            console.log("OBS Login Saved!");
        });
    }

    statusInterval = null;
    
    async connect(url, port, password){
        console.log("CONNECTING TO OBS...");
        try{
            await obs.connect("ws://"+url+":"+port, password, {
                eventSubscriptions: EventSubscription.All | EventSubscription.InputVolumeMeters | EventSubscription.Ui
            });
            sendToTCP("/obs/status/connection", 1);
            obs.on("StreamStateChanged", (data)=>{
                sendToTCP("/obs/event/StreamStateChanged", JSON.stringify(data));
            });
            obs.on("RecordStateChanged", (data)=>{
                sendToTCP("/obs/event/RecordStateChanged", JSON.stringify(data));
            });
            obs.on("ReplayBufferStateChanged", (data)=>{
                sendToTCP("/obs/event/ReplayBufferStateChanged", JSON.stringify(data));
            });
            obs.on("VirtualcamStateChanged", (data)=>{
                sendToTCP("/obs/event/VirtualcamStateChanged", JSON.stringify(data));
            });
            obs.on("StudioModeStateChanged", (data)=>{
                console.log("STUDIO MODE CHANGED")
                sendToTCP("/obs/event/StudioModeStateChanged", data.studioModeEnabled);
            });
            obs.on("CurrentProgramSceneChanged", (data)=>{
                sendToTCP("/obs/event/CurrentProgramSceneChanged", data.sceneName);
            });
            obs.on("CurrentPreviewSceneChanged", (data)=>{
                sendToTCP("/obs/event/CurrentPreviewSceneChanged", data.sceneName);
            });
            obs.on("InputMuteStateChanged", (data)=>{
                sendToTCP("/obs/event/InputMuteStateChanged", JSON.stringify(data));
            });
            obs.on("ExitStarted", () => {
                obs.disconnect();
                sendToTCP("/obs/status/shutdown", "OBS has shutdown");
            })
            console.log("OBS CONNECT SUCCESS");

        }catch(error){
            console.log("OBS ERROR", error.message, obs);
        }
        
    }

    //Receiving OSC
    async onOSC(message){
        let address = message.address.split("/");

        if(message.address == "/obs/get/obslogininfo"){
            let obsLoginInfo = fs.existsSync(backendDir+"/settings/obs.json")?fs.readFileSync(backendDir+"/settings/obs.json",{encoding:"utf-8"}):null;
            if(obsLoginInfo != null){
                sendToTCP("/obs/get/obslogininfo", obsLoginInfo);
            }
            if(obs.socket == null || obs.socket?.readyState==0){
                sendToTCP("/obs/status/connection", 0);
            }else{
                sendToTCP("/obs/status/connection", 1);
            }
            return;
        }

        if(message.address == "/obs/connectSocket"){
            let connectObj = JSON.parse(message.args[0]);
            console.log("Connecting", connectObj);
            this.connect(connectObj.url, connectObj.port, connectObj.password);
            if(connectObj.remember == true){
                this.saveLogin(connectObj.url, connectObj.port, connectObj.password);
            }
        }

        if(obs.socket == null || obs.socket?.readyState==0){
            sendToTCP("/obs/status/connection", 0);
            return;
        }

        if(address[1] == "obs"){
            if(address[2] == "stream"){
                if(message.args[0] == "start"){
                    obs.call("StartStream");
                }else if(message.args[0] == "stop"){
                    obs.call("StopStream");
                }else if(message.args[0] == "toggle"){
                    obs.call("ToggleStream");
                }
            }else if(address[2] == "record"){
                if(message.args[0] == "start"){
                    obs.call("StartRecord");
                }else if(message.args[0] == "stop"){
                    obs.call("StopRecord");
                }else if(message.args[0] == "pause"){
                    obs.call("PauseRecord");
                }else if(message.args[0] == "resume"){
                    obs.call("ResumeRecord");
                }else if(message.args[0] == "toggle"){
                    obs.call("ToggleRecord");
                }
            }else if(address[2] == "transition"){
                if(address[3] == "Trigger"){
                    obs.call("TriggerStudioModeTransition");
                }else if(address[3] == "SetTBar"){
                    obs.call("SetTBarPosition", message.args[0]);
                }
            }else if(address[2] == "event"){
                if(address[3] == "InputVolumeMeters"){
                    if(message.args[0] == 1){
                        obs.on("InputVolumeMeters", (data)=>{
                            sendToTCP("/obs/sound/InputVolumeMeters", JSON.stringify(data), false);
                        });
                    }else{
                        obs.off("InputVolumeMeters");
                    }
                }
            }else if(address[2] == "status"){
                if(address[3] == "interval"){
                    if(message.args[0] == 1){
                        if(this.statusInterval == null){
                            this.statusInterval = setInterval(async()=>{
                                let objects = ["stream","record"];
                                let finalStatusObj = {};
                                for(let o in objects){
                                    if(objects[o] == "stream"){
                                        finalStatusObj[objects[o]] = await obs.call("GetStreamStatus");
                                    }else if(objects[o] == "record"){
                                        finalStatusObj[objects[o]] = await obs.call("GetRecordStatus");
                                    }else if(objects[o] == "obs"){
                                        finalStatusObj[objects[o]] = await obs.call("GetStats");
                                    }
                                }
                                if(finalStatusObj["stream"].outputActive == false && finalStatusObj["record"].outputActive == false){
                                    clearInterval(this.statusInterval);
                                    this.statusInterval = null;
                                }
                                sendToTCP("/obs/get/status", JSON.stringify(finalStatusObj), false);
                            },1000);
                        }
                    }else{
                        clearInterval(this.statusInterval);
                        this.statusInterval = null;
                    }
                }
            }else if(address[2] == "get"){
                if(address[3] == "input"){
                    if(address[4] == "mute"){
                        obs.call("GetInputMute", {inputName:message.args[0]})
                        .then(data=>{
                            data.inputName = message.args[0];
                            sendToTCP("/obs/get/input/mute", JSON.stringify(data));
                        }).catch(e=>{});
                    }else if(address[4] == "volume"){
                        obs.call("GetInputVolume", {inputName:message.args[0]})
                        .then(data=>{
                            data.inputName = message.args[0];
                            sendToTCP("/obs/get/input/volume", JSON.stringify(data));
                        }).catch(e=>{});
                    }else if(address[4] == "list"){
                        obs.call("GetInputList")
                        .then(data=>{
                            sendToTCP("/obs/get/input/list", JSON.stringify(data));
                        })
                    }else if(address[4] == "volumelist"){
                        obs.call("GetInputList")
                        .then(async data=>{
                            let finalVolumeData = {};
                            for(let i in data.inputs){
                                if(data.inputs[i].inputName.includes("???")){
                                    console.log("There is a ??? on "+data.inputs[i].inputName+". JSON won't like this, so deck mode might crash :(");
                                }
                                let volumeData = await obs.call("GetInputVolume", {inputName:data.inputs[i].inputName}).catch(e=>{});
                                let volumeMuteData = await obs.call("GetInputMute", {inputName:data.inputs[i].inputName}).catch(e=>{});
                                if(volumeData != null){
                                    finalVolumeData[data.inputs[i].inputName] = {
                                        volumeData:volumeData,
                                        volumeMuteData:volumeMuteData
                                    }
                                }
                            }
                            sendToTCP("/obs/get/input/volumelist", JSON.stringify(finalVolumeData));
                        })
                    }
                }else if(address[3] == "status"){
                    let objects = message.args[0].split("|");
                    let finalStatusObj = {};
                    for(let o in objects){
                        if(objects[o] == "stream"){
                            finalStatusObj[objects[o]] = await obs.call("GetStreamStatus");
                        }else if(objects[o] == "record"){
                            finalStatusObj[objects[o]] = await obs.call("GetRecordStatus");
                        }else if(objects[o] == "obs"){
                            finalStatusObj[objects[o]] = await obs.call("GetStats");
                        }
                    }
                    sendToTCP("/obs/get/status", JSON.stringify(finalStatusObj));
                }else if(address[3] == "scene"){
                    if(address[4] == "list"){
                        obs.call("GetSceneList")
                        .then(sceneData=>{
                            sendToTCP("/obs/get/scene/list", JSON.stringify(sceneData));
                        });
                    }else if(address[4] == "preview"){
                        obs.call("GetCurrentPreviewScene")
                        .then(sceneData=>{
                            sendToTCP("/obs/get/scene/preview", JSON.stringify(sceneData));
                        });
                    }else if(address[4] == "program"){
                        obs.call("GetCurrentProgramScene")
                        .then(sceneData=>{
                            sendToTCP("/obs/get/scene/program", JSON.stringify(sceneData));
                        });
                    }
                }else if(address[3] == "studiomode"){
                    obs.call("GetStudioModeEnabled")
                    .then(studioData=>{
                        sendToTCP("/obs/get/studiomode", studioData.studioModeEnabled)
                    })
                }else if(address[3] == "group"){
                    if(address[4] == "list"){
                        obs.call("GetGroupList")
                        .then(sceneData=>{
                            sendToTCP("/obs/get/group/list", JSON.stringify(sceneData));
                        });
                    }else if(address[4] == "sceneitems"){
                        obs.call("GetGroupSceneItemList", {sceneName:message.args[0]})
                        .then(sceneData=>{
                            sceneData.groupName = message.args[0];
                            sendToTCP("/obs/get/group/sceneitems", JSON.stringify(sceneData));
                        });
                    }
                }

            }else if(address[2] == "set"){
                if(address[3] == "input"){
                    if(address[4] == "mute"){
                        let vObj = JSON.parse(message.args[0]);
                        obs.call("SetInputMute", {inputName:vObj.inputName, inputMuted:vObj.inputMuted});
                    }else if(address[4] == "volume"){
                        let vObj = JSON.parse(message.args[0]);
                        obs.call("SetInputVolume", {inputName:vObj.inputName, inputVolumeMul:vObj.value});
                    }
                }else if(address[3] == "scene"){
                    if(address[4] == "preview"){
                        obs.call("SetCurrentPreviewScene", {sceneName:message.args[0]})
                    }else if(address[4] == "program"){
                        obs.call("SetCurrentProgramScene", {sceneName:message.args[0]})
                    }
                }else if(address[3] == "studiomode"){
                    obs.call("SetStudioModeEnabled", {studioModeEnabled:message.args[0]});
                }
            }
        }
    }
}

module.exports = OBSOSC;