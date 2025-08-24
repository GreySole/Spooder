import Axios, { AxiosError, AxiosResponse } from 'axios';
import fs from 'fs';
import { scopes } from './TwitchConstants';
import ModuleService from '../../core/service/ModuleService';
import { KeyedObject, userDir } from '../../Types';
import Twitch, { twitchLog } from './main';
import ShareService from '../../core/service/ShareService';

export default class TwitchApi {
  appToken = '';
  homeChannel = '';
  botUsername = '';
  botUserID = '';
  broadcasterUserID = '';

  getModule = () => {
    return ModuleService.getStreamModule('twitch') as Twitch;
  };

  validateBroadcaster = async (): Promise<KeyedObject> => {
    return new Promise((res, rej) => {
      const oauth = this.getModule().oauth;
      if (oauth.broadcaster_token == '' || oauth.broadcaster_token == null) {
        return { status: 'nologin', error: 'No broadcaster token saved. Please authorize.' };
      }
      Axios({
        url: 'https://id.twitch.tv/oauth2/validate',
        method: 'get',
        headers: {
          Authorization: 'Bearer ' + oauth.broadcaster_token,
        },
      })
        .then((response: AxiosResponse) => {
          this.homeChannel = response.data.login;
          twitchLog('Validated broadcaster: ' + response.data.login + '!');
          res({ status: 'OK' });
        })
        .catch(async (error: AxiosError) => {
          twitchLog('Braodcaster validate error: ', error.message);
          if (error.response?.status == 401) {
            this.onBroadcasterAuthFailure()
              .then(async (newtoken) => {
                await this.validateBroadcaster();
                res({ status: 'newtoken', newtoken: newtoken });
              })
              .catch((error: AxiosError) => twitchLog(error.message));
          } else {
            rej({ status: 'error', error: error });
          }
        });
    });
  };

  validateChatbot = async (): Promise<KeyedObject> => {
    const oauth = this.getModule().oauth;
    return new Promise((res, rej) => {
      if (oauth.refreshToken == '' || oauth.refreshToken == null) {
        twitchLog(
          "No chat oauth saved. Go into the Web UI, click the top for the navigation menu, then click 'authorize'. You must be on localhost to make auth tokens. If this is a fresh Spooder, you'll want to log in to twitch.tv as the account you use to broadcast first. Then go to the EventSub tab to copy your auth tokens to broadcaster.",
        );
        return;
      }
      Axios({
        url: 'https://id.twitch.tv/oauth2/validate',
        method: 'get',
        headers: {
          Authorization: 'Bearer ' + oauth.token,
        },
      })
        .then((response: AxiosResponse) => {
          this.botUsername = response.data.login;
          twitchLog('Validated Chatbot: ' + response.data.login + '!');
          res({ status: 'OK' });
        })
        .catch((error: AxiosError) => {
          twitchLog('Bot validate error: ', error.message);
          if (error.response?.status == 401) {
            this.onAuthenticationFailure()
              .then(async (newtoken: any) => {
                await this.validateChatbot();
                res({ status: 'newtoken', newtoken: newtoken });
              })
              .catch((error: AxiosError) => twitchLog(error.message));
          } else {
            rej({ status: 'error', error: error });
          }
        });
    });
  };

  validateViewer = async (token: string): Promise<KeyedObject> => {
    return new Promise((res, rej) => {
      Axios({
        url: 'https://id.twitch.tv/oauth2/validate',
        method: 'get',
        headers: {
          Authorization: 'Bearer ' + token,
        },
      })
        .then((response: AxiosResponse) => {
          twitchLog('Validated Viewer: ' + response.data.login + '!');
          res({ status: 'ok', data: response.data });
        })
        .catch((error: AxiosError) => {
          twitchLog('Viewer validate error: ', error);
        });
    });
  };

  async getUserId(channelName: string) {
    const oauth = this.getModule().oauth;

    return new Promise<string>((res, rej) => {
      if (!channelName) {
        rej('No channel name provided');
        return;
      }
      Axios({
        url: 'https://api.twitch.tv/helix/users?login=' + channelName,
        method: 'get',
        headers: {
          Authorization: 'Bearer ' + oauth.token,
          'Client-Id': oauth['client-id'],
        },
      })
        .then((response: AxiosResponse) => {
          res(response.data.data[0].id);
        })
        .catch(async (error: AxiosError) => {
          twitchLog('Broadcaster auth error: ', error);
          if (error.response?.status == 401) {
            this.onAuthenticationFailure()
              .then(() => {
                res(this.getUserId(channelName));
              })
              .catch((error: AxiosError) => {
                twitchLog('getUserId authentication failed: ', error.message);
                rej('getUserId authentication failed: ' + error.message);
              });
          } else {
            rej(error);
          }
          return;
        });
    });
  }

  getBroadcasterId() {
    return new Promise<string>((res, rej) => {
      console.log('getBroadcasterId');
      this.getUserId(this.homeChannel)
        .then((id) => {
          this.broadcasterUserID = id;
          res(id);
        })
        .catch((error) => {
          console.log('getBroadcasterId error', error);
          rej('No broadcaster id found');
        });
    });
  }

  getBotId() {
    return new Promise<string>((res, rej) => {
      this.getUserId(this.botUsername)
        .then((id) => {
          res(id);
        })
        .catch((error) => {
          console.log('getBotId error', error);
          rej(error);
        });
    });
  }

  getAppToken = async () => {
    const oauth = this.getModule().oauth;
    if (this.appToken == '') {
      const twitchScopes = scopes;

      let scopeString = '';
      for (let t in twitchScopes) {
        if (twitchScopes[t] == '') {
          continue;
        }
        if (scopeString == '') {
          scopeString += twitchScopes[t];
        } else {
          scopeString += '+' + twitchScopes[t];
        }
      }

      var appParams =
        '?client_id=' +
        oauth['client-id'] +
        '&client_secret=' +
        oauth['client-secret'] +
        '&grant_type=client_credentials' +
        '&scope=' +
        scopeString;

      await Axios.post('https://id.twitch.tv/oauth2/token' + appParams)
        .then((response: AxiosResponse) => {
          if (typeof response.data.access_token != 'undefined') {
            this.appToken = response.data.access_token;
          }
        })
        .catch((error: Error) => {
          twitchLog('App token get error: ', error.message);
          return;
        });
    }
  };

  onAuthenticationFailure = () => {
    twitchLog('Authentication failed, refreshing...');

    return new Promise((res, rej) => {
      const oauth = this.getModule().oauth;
      if (oauth.refreshToken == '' || oauth.refreshToken == null) {
        twitchLog('NO REFRESH TOKEN IN twitch.json');
        rej('NO REFRESH TOKEN IN twitch.json');
      }
      var refreshParams =
        '?client_id=' +
        oauth['client-id'] +
        '&client_secret=' +
        oauth['client-secret'] +
        '&grant_type=refresh_token' +
        '&refresh_token=' +
        oauth.refreshToken;

      Axios.post('https://id.twitch.tv/oauth2/token' + refreshParams)
        .then((response: AxiosResponse) => {
          if (typeof response.data.access_token != 'undefined') {
            oauth.token = response.data.access_token;
            twitchLog('TOKEN REFRESHED');
            fs.writeFile(userDir + '/settings/twitch.json', JSON.stringify(oauth), 'utf-8', () => {
              twitchLog('oauth saved!');
              res(oauth.token);
            });
          }
        })
        .catch((error: AxiosError) => {
          rej(error);
        });
    });
  };

  onBroadcasterAuthFailure = () => {
    twitchLog('Broadcaster auth failed, refreshing...');

    return new Promise((res, rej) => {
      const oauth = this.getModule().oauth;
      if (oauth.broadcaster_refreshToken == '' || oauth.broadcaster_refreshToken == null) {
        rej('Broadcaster refresh error: No broadcaster refresh token');
      }

      var refreshParams =
        '?client_id=' +
        oauth['client-id'] +
        '&client_secret=' +
        oauth['client-secret'] +
        '&grant_type=refresh_token' +
        '&refresh_token=' +
        oauth.broadcaster_refreshToken;

      Axios.post('https://id.twitch.tv/oauth2/token' + refreshParams)
        .then((response: AxiosResponse) => {
          if (typeof response.data.access_token != 'undefined') {
            oauth.broadcaster_token = response.data.access_token;

            twitchLog('BROADCASTER TOKEN REFRESHED');
            fs.writeFile(userDir + '/settings/twitch.json', JSON.stringify(oauth), 'utf-8', () => {
              twitchLog('broadcaster oauth saved!');
              res(oauth.broadcaster_token);
            });
          }
        })
        .catch((error: AxiosError) => {
          rej(error);
        });
    });
  };

  async getStreamInfo(username: string) {
    const oauth = this.getModule().oauth;
    const loggedIn = this.getModule().loggedIn;
    const broadcasterToken = oauth.broadcaster_token;
    if (loggedIn == false) {
      return;
    }
    return new Promise<KeyedObject>((res, rej) => {
      Axios({
        url: 'https://api.twitch.tv/helix/streams?user_login=' + username,
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + broadcasterToken,
          'Client-Id': oauth['client-id'],
          user_login: username,
        },
      })
        .then((response: AxiosResponse) => {
          if (response.data.data?.[0]) {
            res(response.data.data[0]);
          } else {
            res({ error: `No data for ${username}. They is not live.` });
          }
        })
        .catch(async (error: AxiosError) => {
          twitchLog('isStreamerLive fail', error.message);
          if (error.response?.status == 401) {
            this.onBroadcasterAuthFailure()
              .then(() => {
                res(this.getStreamInfo(username));
              })
              .catch((err: AxiosError) => {
                twitchLog('getStreamInfo Broadcaster authentication failed: ', err.message);
                rej('getStreamInfo Broadcaster authentication failed: ' + err.message);
              });
          } else {
            rej(error);
          }
        });
    });
  }

  isStreamerLive = async (username: string) => {
    const loggedIn = this.getModule().loggedIn;
    if (loggedIn == false) {
      return;
    }
    if (username == null) {
      username = this.homeChannel;
    }

    const streamInfo = await this.getStreamInfo(username);
    return streamInfo?.error ? false : true;
  };

  callBotApi = async (url: string, postBody?: KeyedObject, method?: string) => {
    const oauth = this.getModule().oauth;
    const loggedIn = this.getModule().loggedIn;
    method = method == null ? (postBody == null ? 'GET' : 'POST') : method;
    if (loggedIn == false) {
      return;
    }
    return new Promise((res, rej) => {
      Axios({
        url: url,
        method: method,
        headers: {
          'Client-Id': oauth['client-id'],
          Authorization: 'Bearer ' + oauth.token,
          'Content-Type': 'application/json',
        },
        data: postBody,
      })
        .then((data: AxiosResponse) => res(data.data))
        .catch((error: AxiosError) => {
          twitchLog('Bot API use error: ', error.message);
          if (error.response?.status == 401) {
            this.onAuthenticationFailure()
              .then(() => {
                res(this.callBotApi(url, postBody, method));
              })
              .catch((err: AxiosError) => {
                twitchLog('callBotApi authentication failed: ', err.message);
                rej('callBotApi authentication failed: ' + err.message);
              });
          } else {
            rej(error);
          }
        });
    });
  };

  callBroadcasterApi = async (url: string, postBody?: KeyedObject, method?: string) => {
    const oauth = this.getModule().oauth;
    const loggedIn = this.getModule().loggedIn;
    method = method == null ? (postBody == null ? 'GET' : 'POST') : method;

    if (loggedIn == false) {
      return;
    }
    return new Promise((res, rej) => {
      Axios({
        url: url,
        method: method,
        headers: {
          'Client-Id': oauth['client-id'],
          Authorization: 'Bearer ' + oauth.broadcaster_token,
          'Content-Type': 'application/json',
        },
        data: postBody,
      })
        .then((data: AxiosResponse) => res(data.data))
        .catch((error: AxiosError) => {
          twitchLog('Broadcaster API use error: ', error.message);
          if (error.response?.status == 401) {
            this.onBroadcasterAuthFailure()
              .then(() => {
                res(this.callBroadcasterApi(url, postBody, method));
              })
              .catch((err: AxiosError) => {
                twitchLog('callBroadcasterApi Broadcaster authentication failed: ', err.message);
                rej('callBroadcasterApi Broadcaster authentication failed: ' + err.message);
              });
          } else {
            rej(error);
          }
        });
    });
  };

  getChannelInfo = async (channel?: string | undefined): Promise<KeyedObject> => {
    const oauth = this.getModule().oauth;
    const loggedIn = this.getModule().loggedIn;
    const broadcasterToken = oauth.broadcaster_token;
    return new Promise((res, rej) => {
      if (loggedIn == false) {
        rej({ error: 'Not logged in' });
        return;
      }

      if (channel === undefined) {
        channel = this.broadcasterUserID;
      }

      Axios({
        url: 'https://api.twitch.tv/helix/channels?broadcaster_id=' + channel,
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + broadcasterToken,
          'Client-Id': oauth['client-id'],
        },
      })
        .then((response: AxiosResponse) => {
          if (response.data.data?.[0]) {
            res(response.data.data[0]);
          } else {
            res({ error: 'getChannelInfo error: No data' });
          }
        })
        .catch((error: AxiosError) => {
          if (error.response?.status == 401) {
            this.onBroadcasterAuthFailure()
              .then(() => {
                res(this.getChannelInfo(channel));
              })
              .catch((err: AxiosError) => {
                twitchLog('getChannelInfo Broadcaster authentication failed: ', err.message);
                rej('getChannelInfo Broadcaster authentication failed: ' + err.message);
              });
          } else {
            rej(error);
          }
        });
    });
  };

  getUserInfoById = async (id: string): Promise<KeyedObject> => {
    const oauth = this.getModule().oauth;
    const loggedIn = this.getModule().loggedIn;
    const broadcasterToken = oauth.broadcaster_token;
    return new Promise(async (res, rej) => {
      if (loggedIn == false) {
        rej({ message: 'Not logged in' });
        return;
      }
      if (id === undefined) {
        rej({ message: 'getUserInfoById error: No id' });
      }
      Axios('https://api.twitch.tv/helix/users?id=' + id, {
        method: 'GET',
        headers: {
          'Client-Id': oauth['client-id'],
          Authorization: ' Bearer ' + broadcasterToken,
          'Content-Type': 'application/json',
        },
      })
        .then((response: AxiosResponse) => {
          if (response.data.data?.[0]) {
            //twitchLog('Got user info', response.data.data[0]);
            res(response.data.data[0]);
          } else {
            res({ error: 'getUserInfo error: No data' });
          }
        })
        .catch((error: AxiosError) => {
          if (error.response?.status == 401) {
            this.onBroadcasterAuthFailure()
              .then(() => {
                res(this.getUserInfoById(id));
              })
              .catch((err: AxiosError) => {
                twitchLog('getUserInfoById Broadcaster authentication failed: ', err.message);
                rej('getUserInfoById Broadcaster authentication failed: ' + err.message);
              });
          } else {
            rej(error);
          }
        });
    });
  };

  getUserInfo = async (user?: string | undefined): Promise<KeyedObject> => {
    const oauth = this.getModule().oauth;
    const loggedIn = this.getModule().loggedIn;
    const broadcasterToken = oauth.broadcaster_token;
    return new Promise(async (res, rej) => {
      if (loggedIn == false) {
        rej({ error: 'Not logged in' });
        return;
      }
      if (user === undefined) {
        user = this.homeChannel;
      }
      Axios('https://api.twitch.tv/helix/users?login=' + user, {
        method: 'GET',
        headers: {
          'Client-Id': oauth['client-id'],
          Authorization: ' Bearer ' + broadcasterToken,
          'Content-Type': 'application/json',
        },
      })
        .then((response: AxiosResponse) => {
          if (response.data.data) {
            //twitchLog('Got user info', response.data.data[0]);
            res(response.data.data[0]);
          } else {
            res({ error: 'getUserInfo error: No data' });
          }
        })
        .catch((error: AxiosError) => {
          if (error.response?.status == 401) {
            this.onBroadcasterAuthFailure()
              .then(() => {
                res(this.getUserInfo(user));
              })
              .catch((err: AxiosError) => {
                twitchLog('getUserInfo Broadcaster authentication failed: ', err.message);
                rej('getUserInfo Broadcaster authentication failed: ' + err.message);
              });
          } else {
            res({ error: 'getUserInfo error: ' + error.message });
          }
        });
    });
  };

  getSharedChannels = async () => {
    const loggedIn = this.getModule().loggedIn;
    const chat = this.getModule().chat;
    if (loggedIn == false || chat == null) {
      return [];
    }
    if (chat.chat?.readyState() == 'OPEN') {
      const channels = chat.activeChannels;
      if (channels.includes('#' + this.homeChannel)) {
        channels.splice(channels.indexOf('#' + this.homeChannel), 1);
      }
      channels.forEach((channel, index) => {
        if (channel.startsWith('#')) {
          channels[index] = channel.substring(1);
        }
      });
      return channels;
    } else {
      return [];
    }
  };

  getActiveShares = async () => {
    const shares = ShareService.getShares();
    const channels = await this.getSharedChannels();

    const activeShares = {} as KeyedObject;

    for (let c in channels) {
      const channel = channels[c];

      for (let s in shares) {
        if (shares[s].streamPlatforms.twitch.username == channel) {
          activeShares[s] = {
            platform: 'twitch',
            username: shares[s].streamPlatforms.twitch.username,
            displayName: shares[s].streamPlatforms.twitch.displayName,
            userId: shares[s].streamPlatforms.twitch.userId,
          };
        }
      }
    }

    return activeShares;
  };

  verifyShareTarget = (target: string) => {
    return new Promise<KeyedObject>((res, rej) => {
      this.getUserInfo(target)
        .then((userInfo) => {
          if (userInfo.error) {
            rej(userInfo.error);
            return;
          }
          res({
            username: userInfo.login,
            userId: userInfo.id,
            displayName: userInfo.display_name,
            profilePic: userInfo.profile_image_url,
          });
        })
        .catch((error) => {
          rej(error);
        });
    });
  };
}
