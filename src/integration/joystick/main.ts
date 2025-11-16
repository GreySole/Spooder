import { KeyedObject, userDir } from '../../Types';
import { StreamModuleInterface } from '../interface/StreamModuleInterface';
import { Router } from 'express';
import fs from 'fs';
import getJoystickRouters from './JoystickRouter';
import JoystickChat from './JoystickChat';

export default class Joystick implements StreamModuleInterface {
  shareUsers: KeyedObject = {};
  lastMessage: KeyedObject = {};
  homeChannel: string = '';
  oauth: KeyedObject = {};
  chat: JoystickChat;

  constructor() {
    console.log('Initializing Joystick module');
    if (fs.existsSync(userDir + '/settings/joystick.json')) {
      this.oauth = JSON.parse(
        fs.readFileSync(userDir + '/settings/joystick.json', { encoding: 'utf-8' }),
      );
    }
    this.chat = new JoystickChat(this);
  }
  getRouters() {
    const { router } = getJoystickRouters();
    return {
      baseUrl: '/joystick',
      router,
    };
  }
  async autoLogin() {
    if (this.oauth.token) {
      this.chat.startWebSocket(
        Buffer.from(this.oauth.client_id + ':' + this.oauth.client_secret).toString('base64'),
      );
      return true;
    }
    return false;
  }
  sayInChat(message: string, channel?: string) {
    this.chat.sayInChat(message, channel || this.homeChannel);
  }
  onEventFileSaved() {}
  async getChannelInfo(channel?: string) {
    return {};
  }
  async getActiveShares() {
    return {};
  }
  async getUserInfo(user?: string) {
    return {};
  }
  async verifyShareTarget(target: string) {
    return {};
  }
  getPluginFunctions() {
    return {};
  }
  async joinChannel(channelname: string, joinmsg: string | undefined) {}
  async leaveChannel(channelname: string, leavemsg: string | undefined) {}
  async refreshShareUserInfo(id: string) {
    return {};
  }
  onExternalNetworkChanged() {}
  onPluginsLoaded() {}
  onSharesChanged() {}
  getResponseHandlers() {
    return {};
  }
}
