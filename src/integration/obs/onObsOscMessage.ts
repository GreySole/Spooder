import { sayInChat } from 'src/core/service/EventService.ts';
import ModuleService from 'src/core/service/ModuleService.ts';
import { userDir, KeyedObject } from 'src/Types.ts';
import STwitch from '../twitch/main.ts';
import OSCService from 'src/core/service/OSCService.ts';
import fs from 'fs';
import OBS from './main.ts';

export default async function onObsOscMessage(message: any) {
  const sendToTCP = OSCService.sendToTCP;
  const obsModule = ModuleService.getControlModule('obs') as OBS;
  const obsWebsocket = obsModule.websocket;

  let address = message.address.split('/');

  if (message.address == '/obs/get/obslogininfo') {
    let obsLoginInfo = fs.existsSync(userDir + '/settings/obs.json')
      ? fs.readFileSync(userDir + '/settings/obs.json', { encoding: 'utf-8' })
      : null;
    if (obsLoginInfo != null) {
      sendToTCP('/obs/get/obslogininfo', obsLoginInfo);
    }
    if (obsModule.websocket.connected == false) {
      sendToTCP('/obs/status/connection', 0);
    } else {
      sendToTCP('/obs/status/connection', 1);
    }
    return;
  }

  if (obsModule.websocket.connected == false) {
    sendToTCP('/obs/status/connection', 0);
    return;
  }

  if (address[1] == 'obs') {
    if (address[2] == 'stream') {
      if (message.args[0] == 'start') {
        obsWebsocket.call('StartStream');
      } else if (message.args[0] == 'stop') {
        obsWebsocket.call('StopStream');
      } else if (message.args[0] == 'toggle') {
        obsWebsocket.call('ToggleStream');
      }
    } else if (address[2] == 'record') {
      if (message.args[0] == 'start') {
        if (obsModule.settings.recordRename) {
          await obsWebsocket.setRecordingNameToStream();
        }

        obsWebsocket.call('StartRecord');
      } else if (message.args[0] == 'stop') {
        if (obsModule.settings.recordRename) {
          await obsWebsocket.setRecordingNameToDefault();
        }
        obsWebsocket.call('StopRecord');
      } else if (message.args[0] == 'pause') {
        obsWebsocket.call('PauseRecord');
      } else if (message.args[0] == 'resume') {
        obsWebsocket.call('ResumeRecord');
      } else if (message.args[0] == 'toggle') {
        if (obsModule.settings.recordRename) {
          let recordStatus = (await obsWebsocket.call('GetRecordStatus')) as KeyedObject;
          if (!recordStatus.outputActive) {
            await obsWebsocket.setRecordingNameToStream();
          } else {
            await obsWebsocket.setRecordingNameToDefault();
          }
        }
        obsWebsocket.call('ToggleRecord');
      }
    } else if (address[2] == 'transition') {
      if (address[3] == 'Trigger') {
        obsWebsocket.call('TriggerStudioModeTransition');
      } else if (address[3] == 'SetTBar') {
        obsWebsocket.call('SetTBarPosition', message.args[0]);
      }
    } else if (address[2] == 'event') {
      if (address[3] == 'InputVolumeMeters') {
        if (message.args[0] == 1) {
          obsWebsocket.obsClient.on('InputVolumeMeters', (data: any) => {
            sendToTCP('/obs/sound/InputVolumeMeters', JSON.stringify(data), false);
          });
        } else {
          obsWebsocket.obsClient.off('InputVolumeMeters');
          sendToTCP('/obs/event/InputVolumeMeters', 1, false);
        }
      }
    } else if (address[2] == 'status') {
      if (address[3] == 'interval') {
        if (message.args[0] == 1) {
          if (obsModule.statusInterval == undefined) {
            obsModule.statusInterval = setInterval(async () => {
              let objects = ['stream', 'record'];
              let finalStatusObj: KeyedObject = {};
              const twitch = ModuleService.getStreamModule('twitch') as STwitch;
              for (let o in objects) {
                if (objects[o] == 'stream') {
                  finalStatusObj[objects[o]] = await obsWebsocket.call('GetStreamStatus');
                  if (
                    finalStatusObj[objects[o]].outputReconnecting == true &&
                    obsModule.streamReconnecting == false
                  ) {
                    twitch.chat.restartChat(
                      obsModule.settings.disconnectAlert ? 'disconnected' : '',
                    );
                    obsModule.streamReconnecting = true;
                    obsModule.streamBleeding = false;
                    obsModule.skippedFrames = 0;
                  } else if (
                    finalStatusObj[objects[o]].outputReconnecting == false &&
                    obsModule.streamReconnecting == true
                  ) {
                    obsModule.streamReconnecting = false;
                    twitch.chat.restartChat(obsModule.settings.disconnectAlert ? 'reconnect' : '');
                  }

                  if (obsModule.settings.frameDropAlert) {
                    if (obsModule.streamReconnecting == false) {
                      if (
                        finalStatusObj[objects[o]].outputSkippedFrames > obsModule.skippedFrames
                      ) {
                        obsModule.skippedFrames = finalStatusObj[objects[o]].outputSkippedFrames;
                        if (obsModule.streamBleeding == false) {
                          obsModule.streamBleedCount++;
                          if (obsModule.streamBleedCount >= 10) {
                            obsModule.streamBleedCount = 0;
                            obsModule.streamBleeding = true;
                            sayInChat(
                              "Looks like the stream is bleeding frames :( I'll let you know when it stops.",
                            );
                          }
                        }
                      } else {
                        if (obsModule.streamBleeding == true) {
                          obsModule.streamBleedCount++;
                          if (obsModule.streamBleedCount >= 10) {
                            obsModule.streamBleedCount = 0;
                            obsModule.streamBleeding = false;
                            sayInChat(
                              'I think the bleeding stopped. Refresh your browser to catch up :D',
                            );
                          }
                        }
                      }
                    }
                  }
                } else if (objects[o] == 'record') {
                  finalStatusObj[objects[o]] = await obsWebsocket.call('GetRecordStatus');
                } else if (objects[o] == 'obs') {
                  finalStatusObj[objects[o]] = await obsWebsocket.call('GetStats');
                }
              }
              if (
                finalStatusObj['stream'].outputActive == false &&
                finalStatusObj['record'].outputActive == false
              ) {
                clearInterval(obsModule.statusInterval);
                obsModule.statusInterval = undefined;
              }
              sendToTCP('/obs/get/status', JSON.stringify(finalStatusObj), false);
            }, 1000);
          }
        } else {
          clearInterval(obsModule.statusInterval);
          obsModule.statusInterval = undefined;
          sendToTCP('/obs/status/interval', 1, false);
        }
      }
    } else if (address[2] == 'get') {
      if (address[3] == 'input') {
        if (address[4] == 'mute') {
          obsWebsocket
            .call('GetInputMute', { inputName: message.args[0] })
            .then((data: any) => {
              data.inputName = message.args[0];
              sendToTCP('/obs/get/input/mute', JSON.stringify(data));
            })
            .catch((e) => {});
        } else if (address[4] == 'volume') {
          obsWebsocket
            .call('GetInputVolume', { inputName: message.args[0] })
            .then((data: any) => {
              data.inputName = message.args[0];
              sendToTCP('/obs/get/input/volume', JSON.stringify(data));
            })
            .catch((e) => {});
        } else if (address[4] == 'list') {
          obsWebsocket.call('GetInputList').then((data) => {
            sendToTCP('/obs/get/input/list', JSON.stringify(data));
          });
        } else if (address[4] == 'volumelist') {
          let finalInputList = {
            items: {},
            groups: {},
          } as KeyedObject;

          obsWebsocket.call('GetCurrentProgramScene').then((programScene: any) => {
            finalInputList.currentProgramSceneName = programScene.currentProgramSceneName;
            obsWebsocket
              .call('GetSceneItemList', {
                sceneName: programScene.currentProgramSceneName,
              })
              .then(async (sceneItemListRaw: any) => {
                let sceneItemList = sceneItemListRaw.sceneItems;

                for (let item in sceneItemList) {
                  finalInputList.items[sceneItemList[item].sceneItemId] = {
                    name: sceneItemList[item].sourceName,
                    id: sceneItemList[item].sceneItemId,
                    enabled: sceneItemList[item].sceneItemEnabled,
                  };

                  let volumeData = await obsWebsocket
                    .call('GetInputVolume', {
                      inputName: sceneItemList[item].sourceName,
                    })
                    .catch((e) => {});
                  let volumeMuteData = await obsWebsocket
                    .call('GetInputMute', {
                      inputName: sceneItemList[item].sourceName,
                    })
                    .catch((e) => {});
                  if (volumeData != null) {
                    finalInputList.items[sceneItemList[item].sceneItemId].volumeData = volumeData;
                    finalInputList.items[sceneItemList[item].sceneItemId].volumeMuteData =
                      volumeMuteData;
                  }

                  if (sceneItemList[item].isGroup == true) {
                    let thisGroupItems = await obsWebsocket
                      .call('GetGroupSceneItemList', {
                        sceneName: sceneItemList[item].sourceName,
                      })
                      .then((groupItemData: any) => groupItemData.sceneItems);
                    finalInputList.groups[sceneItemList[item].sourceName] = thisGroupItems;
                    for (let gi in thisGroupItems) {
                      let thisVolumeData = await obsWebsocket
                        .call('GetInputVolume', {
                          inputName: thisGroupItems[gi].sourceName,
                        })
                        .catch((e) => {});
                      let thisVolumeMuteData = await obsWebsocket
                        .call('GetInputMute', {
                          inputName: thisGroupItems[gi].sourceName,
                        })
                        .catch((e) => {});
                      finalInputList.items[gi + thisGroupItems[gi].sceneItemId] = {
                        name: thisGroupItems[gi].sourceName,
                        id: thisGroupItems[gi].sceneItemId,
                        enabled: thisGroupItems[gi].sceneItemEnabled,
                        volumeData: thisVolumeData,
                        volumeMuteData: thisVolumeMuteData,
                      };
                    }
                  }
                }
                sendToTCP('/obs/get/input/volumelist', JSON.stringify(finalInputList));
              });
          });
        }
      } else if (address[3] == 'status') {
        let objects = message.args[0].split('|');
        let finalStatusObj: KeyedObject = {};
        for (let o in objects) {
          if (objects[o] == 'stream') {
            finalStatusObj[objects[o]] = await obsWebsocket.call('GetStreamStatus');
          } else if (objects[o] == 'record') {
            finalStatusObj[objects[o]] = await obsWebsocket.call('GetRecordStatus');
          } else if (objects[o] == 'obs') {
            finalStatusObj[objects[o]] = await obsWebsocket.call('GetStats');
          }
        }
        sendToTCP('/obs/get/status', JSON.stringify(finalStatusObj));
      } else if (address[3] == 'scene') {
        if (address[4] == 'list') {
          obsWebsocket.call('GetSceneList').then((sceneData) => {
            sendToTCP('/obs/get/scene/list', JSON.stringify(sceneData));
          });
        } else if (address[4] == 'itemlist') {
          let finalInputList: KeyedObject = {
            items: {},
            groups: {},
          };

          obsWebsocket.call('GetCurrentProgramScene').then((programScene: any) => {
            finalInputList.currentProgramSceneName = programScene.currentProgramSceneName;
            obsWebsocket
              .call('GetSceneItemList', {
                sceneName: programScene.currentProgramSceneName,
              })
              .then(async (sceneItemListRaw: any) => {
                let sceneItemList = sceneItemListRaw.sceneItems;
                for (let item in sceneItemList) {
                  finalInputList.items[sceneItemList[item].sceneItemIndex] = {
                    name: sceneItemList[item].sourceName,
                    id: sceneItemList[item].sceneItemId,
                    enabled: sceneItemList[item].sceneItemEnabled,
                    locked: sceneItemList[item].sceneItemLocked,
                  };
                  if (sceneItemList[item].isGroup == true) {
                    finalInputList.groups[sceneItemList[item].sourceName] = await obsWebsocket
                      .call('GetGroupSceneItemList', { sceneName: sceneItemList[item].sourceName })
                      .then((groupItemData: any) => groupItemData.sceneItems);
                  }
                }
                sendToTCP('/obs/get/scene/itemlist', JSON.stringify(finalInputList));
              });
          });
        } else if (address[4] == 'preview') {
          obsWebsocket.call('GetCurrentPreviewScene').then((sceneData) => {
            sendToTCP('/obs/get/scene/preview', JSON.stringify(sceneData));
          });
        } else if (address[4] == 'program') {
          obsWebsocket.call('GetCurrentProgramScene').then((sceneData) => {
            sendToTCP('/obs/get/scene/program', JSON.stringify(sceneData));
          });
        }
      } else if (address[3] == 'studiomode') {
        obsWebsocket.call('GetStudioModeEnabled').then((studioData: any) => {
          sendToTCP('/obs/get/studiomode', studioData.studioModeEnabled);
        });
      } else if (address[3] == 'group') {
        if (address[4] == 'list') {
          obsWebsocket.call('GetGroupList').then((sceneData) => {
            sendToTCP('/obs/get/group/list', JSON.stringify(sceneData));
          });
        } else if (address[4] == 'sceneitems') {
          obsWebsocket
            .call('GetGroupSceneItemList', { sceneName: message.args[0] })
            .then((sceneData: any) => {
              sceneData.groupName = message.args[0];
              sendToTCP('/obs/get/group/sceneitems', JSON.stringify(sceneData));
            });
        }
      }
    } else if (address[2] == 'set') {
      if (address[3] == 'input') {
        if (address[4] == 'mute') {
          let vObj = JSON.parse(message.args[0]);
          obsWebsocket.call('SetInputMute', {
            inputName: vObj.inputName,
            inputMuted: vObj.inputMuted,
          });
        } else if (address[4] == 'volume') {
          let vObj = JSON.parse(message.args[0]);
          obsWebsocket.call('SetInputVolume', {
            inputName: vObj.inputName,
            inputVolumeMul: vObj.value,
          });
        }
      } else if (address[3] == 'scene') {
        if (address[4] == 'preview') {
          obsWebsocket.call('SetCurrentPreviewScene', { sceneName: message.args[0] });
        } else if (address[4] == 'program') {
          obsWebsocket.call('SetCurrentProgramScene', { sceneName: message.args[0] });
        }
      } else if (address[3] == 'studiomode') {
        obsWebsocket.call('SetStudioModeEnabled', { studioModeEnabled: message.args[0] });
      } else if (address[3] == 'source') {
        if (address[4] == 'enabled') {
          let eObj = JSON.parse(message.args[0]);
          obsWebsocket.call('SetSceneItemEnabled', {
            sceneName: eObj.sceneName,
            sceneItemId: eObj.sceneItemId,
            sceneItemEnabled: eObj.sceneItemEnabled,
          });
        }
      }
    }
  }
}
