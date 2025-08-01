import ModuleService from '../../core/service/ModuleService';
import Twitch from './main';
import { KeyedObject } from '../../Types';

export default function getResponseHandlers() {
  const twitchModule = ModuleService.getStreamModule('twitch') as Twitch;

  async function getChannelInfo(channelName: string) {
    const userId = await twitchModule.api.getUserId(channelName);
    return await twitchModule.api.getChannelInfo(userId);
  }

  async function getStreamInfo(channelName: string) {
    return await twitchModule.api.getStreamInfo(channelName);
  }

  async function getUserInfo(username: string) {
    return await twitchModule.api.getUserInfo(username);
  }

  async function callApi(url: string, postBody?: KeyedObject, method?: string) {
    return await twitchModule.api.callBroadcasterApi(url, postBody, method);
  }

  return {
    descriptions: [
      'Twitch API calls will need the keyword "await" before the function call to ensure the data is returned before the next line of code is executed. (Ex. const channelInfo = await getChannelInfo("YourChannelName"))',
      'getChannelInfo(channelName:string): Get channel info by user/channel name',
      'getStreamInfo(channelName:string): Get stream info by user/channel name',
      'getUserInfo(username:string): Get user info by username',
      'callApi(url:string, postBody?:KeyedObject, method?:string): Generic Twitch API call using broadcaster oauth token',
    ],
    functions: { getChannelInfo, getStreamInfo, getUserInfo, callApi },
  };
}
