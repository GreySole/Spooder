const {default: OBSWebSocket, EventSubscription} = require("obs-websocket-js");
const obsClient = new OBSWebSocket();
const fs = require("fs");

class OBSOSC{

    constructor(router){

        router.get("/obs/get_output_settings", (req, res) => {
            res.send(this.settings);
        })

        router.post("/obs/save_output_settings", (req, res) => {
            let newSettings = req.body;
            this.settings.recordRename = newSettings.recordRename;
            this.settings.frameDropAlert = newSettings.frameDropAlert;
            this.settings.disconnectAlert = newSettings.disconnectAlert;
            fs.writeFileSync(backendDir+"/settings/obs.json", JSON.stringify(this.settings), "utf-8");
            
            res.send({status:"ok"});
        });

        router.get("/obs/get_scenes", async (req, res) => {
            if(this.connected == false){
                res.send({"status":"notconnected"});
            }else{
                let obsReturn = {};
                let obsScenes = await this.call("GetSceneList");
                if(obsScenes == null){
                    res.send({});
                    return;
                }
                obsReturn.scenes = {};
                for(let s in obsScenes.scenes){
                    obsReturn.scenes[obsScenes.scenes[s].sceneIndex] = obsScenes.scenes[s];
                }
                obsReturn.sceneItems = {};
                
                for(let s in obsReturn.scenes){
                    let sceneItems = await this.call("GetSceneItemList", {sceneName:obsReturn.scenes[s].sceneName}).then(data=>data.sceneItems);
                    obsReturn.sceneItems[s] = {};
                    for(let si in sceneItems){
                        obsReturn.sceneItems[s][sceneItems[si].sceneItemId] = sceneItems[si];
                    }
                }

                let obsInputs = await this.call("GetInputList");
                
                obsReturn.inputs = obsInputs.inputs;
                

                obsReturn.status = "ok";
                res.send(obsReturn);
            }
        })

        
        if(fs.existsSync(backendDir+"/settings/obs.json")){
            try{
                this.settings = JSON.parse(fs.readFileSync(backendDir+"/settings/obs.json",{encoding:"utf-8"}));
            }catch(e){
                console.log("Somethings wrong with obs login file. Try entering it again.");
                this.settings = {};
            }
        }
    }

    settings = {};

    autoLogin(){
        return new Promise(async (res, rej)=>{
            if(this.settings.url != null){
                
                await this.connect(this.settings.url, this.settings.port, this.settings.password);
                res("success");
            }
        })
        
    }

    saveLogin(url, port, password){
        this.settings.url = url;
        this.settings.port = port;
        this.settings.password = password;
        fs.writeFileSync(backendDir+"/settings/obs.json", JSON.stringify(this.settings), "utf-8");
        console.log("OBS Login Saved!");
    }

    connected = false;
    statusInterval = null;
    deckClients = {};
    streamReconnecting = false;
    streamBleeding = false;
    streamBleedCount = 0;
    skippedFrames = 0;
    
    async connect(url, port, password){
        console.log("CONNECTING TO OBS...");
        try{
            await obsClient.connect("ws://"+url+":"+port, password, {
                eventSubscriptions: EventSubscription.All | EventSubscription.InputVolumeMeters | EventSubscription.Ui
            });
            
            this.connected = true;
            sendToTCP("/obs/status/connection", 1);
            
            obsClient.on("StreamStateChanged", (data)=>{
                sendToTCP("/obs/event/StreamStateChanged", JSON.stringify(data));
            });
            obsClient.on("RecordStateChanged", (data)=>{
                sendToTCP("/obs/event/RecordStateChanged", JSON.stringify(data));
            });
            obsClient.on("ReplayBufferStateChanged", (data)=>{
                sendToTCP("/obs/event/ReplayBufferStateChanged", JSON.stringify(data));
            });
            obsClient.on("VirtualcamStateChanged", (data)=>{
                sendToTCP("/obs/event/VirtualcamStateChanged", JSON.stringify(data));
            });
            obsClient.on("StudioModeStateChanged", (data)=>{
                console.log("STUDIO MODE CHANGED")
                sendToTCP("/obs/event/StudioModeStateChanged", data.studioModeEnabled);
            });
            obsClient.on("CurrentProgramSceneChanged", (data)=>{
                sendToTCP("/obs/event/CurrentProgramSceneChanged", data.sceneName);
            });
            obsClient.on("CurrentPreviewSceneChanged", (data)=>{
                sendToTCP("/obs/event/CurrentPreviewSceneChanged", data.sceneName);
            });
            obsClient.on("InputMuteStateChanged", (data)=>{
                sendToTCP("/obs/event/InputMuteStateChanged", JSON.stringify(data));
            });
            obsClient.on("InputVolumeChanged", (data)=>{
                sendToTCP("/obs/event/InputVolumeChanged", JSON.stringify(data));
            })
            obsClient.on("SceneItemEnableStateChanged", (data) => {
                sendToTCP("/obs/event/SceneItemEnableStateChanged", JSON.stringify(data));
            })
            obsClient.on("ExitStarted", () => {
                obs.disconnect();
                this.connected = false;
                sendToTCP("/obs/status/shutdown", "OBS has shutdown");
            })
            console.log("OBS CONNECT SUCCESS");

        }catch(error){
            console.log("OBS ERROR", error.message);
        }
        
    }

    setRecordingNameToStream(){
        return new Promise(async (res, rej)=>{
            let defaultFileName = await obsClient.call("GetProfileParameter",{parameterCategory:"Output",parameterName:"FilenameFormatting"});

            let channelInfo = await twitch.getChannelInfo();
            //console.log(channelInfo);
            if(channelInfo == false){console.log("COULDN'T GET CHANNEL INFO"); return;}
            let title = channelInfo[0].title;
            let splitTitle = title;
            if(title.includes("|")){
                splitTitle = title.split("|")[0];
            }

            splitTitle = splitTitle.replaceAll(/[`!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/g,"");
            
            let recordingTitle = defaultFileName.defaultParameterValue.split(" ")[0] + "_" + splitTitle;
            
            if(channelInfo){
                await obsClient.call("SetProfileParameter",{parameterCategory:"Output",parameterName:"FilenameFormatting", parameterValue:recordingTitle});
                res(recordingTitle);
            }
        });
    }

    setRecordingNameToDefault(){
        return new Promise(async (res, rej) => {
            let defaultFileName = await obsClient.call("GetProfileParameter",{parameterCategory:"Output",parameterName:"FilenameFormatting"});
            await obsClient.call("SetProfileParameter",{parameterCategory:"Output",parameterName:"FilenameFormatting", parameterValue:defaultFileName.defaultParameterValue});
            res(defaultFileName.defaultParameterValue);
        })
        
    }

    async getInputList(){
        return new Promise((res, rej) => {
            obsClient.call("GetInputList")
            .then(data=>{
                res(data.inputs);
            }).catch(e=>rej(e));
        })
    }

    setInputMute(iName, iMute){
        
        obsClient.call("SetInputMute", {inputName:iName, inputMuted:iMute});
    }

    async call(name, data){
        if(obsClient.socket == null || obsClient.socket?.readyState==0){
            console.log("OBS Not connected for ", name);
            return;
        }
        return new Promise((res, rej) => {
            if(data){
                obsClient.call(name, data).then(obsData=>{res(obsData)}).catch(e=>rej(e));
            }else{
                obsClient.call(name).then(obsData=>{res(obsData)}).catch(e=>rej(e));
            }
        })
        
    }

    //Receiving OSC
    async onOSC(message){
        let address = message.address.split("/");

        if(message.address == "/obs/get/obslogininfo"){
            let obsLoginInfo = fs.existsSync(backendDir+"/settings/obs.json")?fs.readFileSync(backendDir+"/settings/obs.json",{encoding:"utf-8"}):null;
            if(obsLoginInfo != null){
                sendToTCP("/obs/get/obslogininfo", obsLoginInfo);
            }
            if(obsClient.socket == null || obsClient.socket?.readyState==0){
                sendToTCP("/obs/status/connection", 0);
            }else{
                sendToTCP("/obs/status/connection", 1);
            }
            return;
        }

        if(message.address == "/obs/connectSocket"){
            let connectObj = JSON.parse(message.args[0]);
            
            this.connect(connectObj.url, connectObj.port, connectObj.password);
            if(connectObj.remember == true){
                this.saveLogin(connectObj.url, connectObj.port, connectObj.password);
            }
        }

        if(obsClient.socket == null || obsClient.socket?.readyState==0){
            sendToTCP("/obs/status/connection", 0);
            return;
        }

        if(address[1] == "obs"){
            if(address[2] == "stream"){
                if(message.args[0] == "start"){
                    obsClient.call("StartStream");
                }else if(message.args[0] == "stop"){
                    obsClient.call("StopStream");
                }else if(message.args[0] == "toggle"){
                    obsClient.call("ToggleStream");
                }
            }else if(address[2] == "record"){
                if(message.args[0] == "start"){
                    if(this.settings.recordRename){
                        await this.setRecordingNameToStream();
                    }
                    
                    obsClient.call("StartRecord");
                }else if(message.args[0] == "stop"){
                    if(this.settings.recordRename){
                        await this.setRecordingNameToDefault();
                    }
                    obsClient.call("StopRecord");
                }else if(message.args[0] == "pause"){
                    obsClient.call("PauseRecord");
                }else if(message.args[0] == "resume"){
                    obsClient.call("ResumeRecord");
                }else if(message.args[0] == "toggle"){
                    if(this.settings.recordRename){
                        let recordStatus = await obsClient.call("GetRecordStatus");
                        if(!recordStatus.outputActive){
                            await this.setRecordingNameToStream();
                        }else{
                            await this.setRecordingNameToDefault();
                        }
                    }
                    obsClient.call("ToggleRecord");
                }
            }else if(address[2] == "transition"){
                if(address[3] == "Trigger"){
                    obsClient.call("TriggerStudioModeTransition");
                }else if(address[3] == "SetTBar"){
                    obsClient.call("SetTBarPosition", message.args[0]);
                }
            }else if(address[2] == "event"){
                if(address[3] == "InputVolumeMeters"){
                    if(message.args[0] == 1){
                        obsClient.on("InputVolumeMeters", (data)=>{
                            sendToTCP("/obs/sound/InputVolumeMeters", JSON.stringify(data), false);
                        });
                    }else{
                        obsClient.off("InputVolumeMeters");
                        sendToTCP("/obs/event/InputVolumeMeters", 1, false);
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
                                        finalStatusObj[objects[o]] = await obsClient.call("GetStreamStatus");
                                        if(finalStatusObj[objects[o]].outputReconnecting == true && this.streamReconnecting == false){
                                            twitch.restartChat(this.settings.disconnectAlert?"disconnected":null);
                                            this.streamReconnecting = true;
                                            this.streamBleeding = false;
                                            this.skippedFrames = 0;
                                        }else if(finalStatusObj[objects[o]].outputReconnecting == false && this.streamReconnecting == true){
                                            this.streamReconnecting = false;
                                            twitch.restartChat(this.settings.disconnectAlert?"reconnect":null);
                                        }

                                        if(this.settings.frameDropAlert){
                                            if(this.streamReconnecting == false){
                                                if(finalStatusObj[objects[o]].outputSkippedFrames > this.skippedFrames){
                                                    this.skippedFrames = finalStatusObj[objects[o]].outputSkippedFrames;
                                                    if(this.streamBleeding == false){
                                                        this.streamBleedCount++;
                                                        if(this.streamBleedCount >= 10){
                                                            this.streamBleedCount = 0;
                                                            this.streamBleeding = true;
                                                            sayInChat("Looks like the stream is bleeding frames :( I'll let you know when it stops.");
                                                        }
                                                    }
                                                }else{
                                                    if(this.streamBleeding == true){
                                                        this.streamBleedCount++;
                                                        if(this.streamBleedCount >= 10){
                                                            this.streamBleedCount = 0;
                                                            this.streamBleeding = false;
                                                            sayInChat("I think the bleeding stopped. Refresh your browser to catch up :D");
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        
                                    }else if(objects[o] == "record"){
                                        finalStatusObj[objects[o]] = await obsClient.call("GetRecordStatus");
                                    }else if(objects[o] == "obs"){
                                        finalStatusObj[objects[o]] = await obsClient.call("GetStats");
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
                        sendToTCP("/obs/status/interval", 1, false);
                    }
                }
            }else if(address[2] == "get"){
                if(address[3] == "input"){
                    if(address[4] == "mute"){
                        obsClient.call("GetInputMute", {inputName:message.args[0]})
                        .then(data=>{
                            data.inputName = message.args[0];
                            sendToTCP("/obs/get/input/mute", JSON.stringify(data));
                        }).catch(e=>{});
                    }else if(address[4] == "volume"){
                        obsClient.call("GetInputVolume", {inputName:message.args[0]})
                        .then(data=>{
                            data.inputName = message.args[0];
                            sendToTCP("/obs/get/input/volume", JSON.stringify(data));
                        }).catch(e=>{});
                    }else if(address[4] == "list"){
                        obsClient.call("GetInputList")
                        .then(data=>{
                            sendToTCP("/obs/get/input/list", JSON.stringify(data));
                        })
                    }else if(address[4] == "volumelist"){
                        let finalInputList = {
                            items:{},
                            groups:{}
                        };
    
                        obsClient.call("GetCurrentProgramScene")
                        .then(programScene=>{
                            finalInputList.currentProgramSceneName = programScene.currentProgramSceneName;
                            obsClient.call("GetSceneItemList", {sceneName:programScene.currentProgramSceneName})
                            .then(async sceneItemListRaw=>{
                                
                                let sceneItemList = sceneItemListRaw.sceneItems;
                                
                                for(let item in sceneItemList){
                                    
                                    finalInputList.items[sceneItemList[item].sceneItemId] = {
                                        name:sceneItemList[item].sourceName,
                                        id:sceneItemList[item].sceneItemId,
                                        enabled:sceneItemList[item].sceneItemEnabled,
                                    }

                                    let volumeData = await obsClient.call("GetInputVolume", {inputName:sceneItemList[item].sourceName}).catch(e=>{});
                                    let volumeMuteData = await obsClient.call("GetInputMute", {inputName:sceneItemList[item].sourceName}).catch(e=>{});
                                    if(volumeData != null){
                                        
                                        finalInputList.items[sceneItemList[item].sceneItemId].volumeData = volumeData;
                                        finalInputList.items[sceneItemList[item].sceneItemId].volumeMuteData = volumeMuteData;
                                    }

                                    if(sceneItemList[item].isGroup == true){
                                        let thisGroupItems = await obsClient.call("GetGroupSceneItemList", {sceneName:sceneItemList[item].sourceName})
                                        .then(groupItemData=>groupItemData.sceneItems);
                                        finalInputList.groups[sceneItemList[item].sourceName] = thisGroupItems;
                                        for(let gi in thisGroupItems){
                                            let thisVolumeData = await obsClient.call("GetInputVolume", {inputName:thisGroupItems[gi].sourceName}).catch(e=>{});
                                            let thisVolumeMuteData = await obsClient.call("GetInputMute", {inputName:thisGroupItems[gi].sourceName}).catch(e=>{});
                                            finalInputList.items[gi+thisGroupItems[gi].sceneItemId] = {
                                                name:thisGroupItems[gi].sourceName,
                                                id:thisGroupItems[gi].sceneItemId,
                                                enabled:thisGroupItems[gi].sceneItemEnabled,
                                                volumeData:thisVolumeData,
                                                volumeMuteData:thisVolumeMuteData
                                            }
                                        }
                                        
                                    }
                                }
                                sendToTCP("/obs/get/input/volumelist", JSON.stringify(finalInputList));
                                
                            });
                        });
                    }
                }else if(address[3] == "status"){
                    let objects = message.args[0].split("|");
                    let finalStatusObj = {};
                    for(let o in objects){
                        if(objects[o] == "stream"){
                            finalStatusObj[objects[o]] = await obsClient.call("GetStreamStatus");
                        }else if(objects[o] == "record"){
                            finalStatusObj[objects[o]] = await obsClient.call("GetRecordStatus");
                        }else if(objects[o] == "obs"){
                            finalStatusObj[objects[o]] = await obsClient.call("GetStats");
                        }
                    }
                    sendToTCP("/obs/get/status", JSON.stringify(finalStatusObj));
                }else if(address[3] == "scene"){
                    if(address[4] == "list"){
                        obsClient.call("GetSceneList")
                        .then(sceneData=>{
                            sendToTCP("/obs/get/scene/list", JSON.stringify(sceneData));
                        });
                    }else if(address[4] == "itemlist"){

                        let finalInputList = {
                            items:{},
                            groups:{}
                        };
    
                        obsClient.call("GetCurrentProgramScene")
                        .then(programScene=>{
                            finalInputList.currentProgramSceneName = programScene.currentProgramSceneName;
                            obsClient.call("GetSceneItemList", {sceneName:programScene.currentProgramSceneName})
                            .then(async sceneItemListRaw=>{
                                
                                let sceneItemList = sceneItemListRaw.sceneItems;
                                for(let item in sceneItemList){
                                    finalInputList.items[sceneItemList[item].sceneItemIndex] = {
                                        name:sceneItemList[item].sourceName,
                                        id:sceneItemList[item].sceneItemId,
                                        enabled:sceneItemList[item].sceneItemEnabled,
                                        locked:sceneItemList[item].sceneItemLocked,
                                    }
                                    if(sceneItemList[item].isGroup == true){
                                        finalInputList.groups[sceneItemList[item].sourceName] = await obsClient.call("GetGroupSceneItemList", {sceneName:sceneItemList[item].sourceName})
                                    .then(groupItemData=>groupItemData.sceneItems);
                                    }
                                }
                                sendToTCP("/obs/get/scene/itemlist", JSON.stringify(finalInputList));
                                
                            });
                        });
                    }else if(address[4] == "preview"){
                        obsClient.call("GetCurrentPreviewScene")
                        .then(sceneData=>{
                            sendToTCP("/obs/get/scene/preview", JSON.stringify(sceneData));
                        });
                    }else if(address[4] == "program"){
                        obsClient.call("GetCurrentProgramScene")
                        .then(sceneData=>{
                            sendToTCP("/obs/get/scene/program", JSON.stringify(sceneData));
                        });
                    }
                }else if(address[3] == "studiomode"){
                    obsClient.call("GetStudioModeEnabled")
                    .then(studioData=>{
                        sendToTCP("/obs/get/studiomode", studioData.studioModeEnabled)
                    })
                }else if(address[3] == "group"){
                    if(address[4] == "list"){
                        obsClient.call("GetGroupList")
                        .then(sceneData=>{
                            sendToTCP("/obs/get/group/list", JSON.stringify(sceneData));
                        });
                    }else if(address[4] == "sceneitems"){
                        obsClient.call("GetGroupSceneItemList", {sceneName:message.args[0]})
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
                        obsClient.call("SetInputMute", {inputName:vObj.inputName, inputMuted:vObj.inputMuted});
                    }else if(address[4] == "volume"){
                        let vObj = JSON.parse(message.args[0]);
                        obsClient.call("SetInputVolume", {inputName:vObj.inputName, inputVolumeMul:vObj.value});
                    }
                }else if(address[3] == "scene"){
                    if(address[4] == "preview"){
                        obsClient.call("SetCurrentPreviewScene", {sceneName:message.args[0]})
                    }else if(address[4] == "program"){
                        obsClient.call("SetCurrentProgramScene", {sceneName:message.args[0]})
                    }
                }else if(address[3] == "studiomode"){
                    obsClient.call("SetStudioModeEnabled", {studioModeEnabled:message.args[0]});
                }else if(address[3] == "source"){
                    if(address[4] == "enabled"){
                        let eObj = JSON.parse(message.args[0]);
                        obsClient.call("SetSceneItemEnabled", {sceneName:eObj.sceneName, sceneItemId:eObj.sceneItemId, sceneItemEnabled:eObj.sceneItemEnabled});
                    }
                }
            }
        }
    }
}

module.exports = OBSOSC;