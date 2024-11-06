import Axios, { AxiosError, AxiosResponse } from 'axios';
import { Request, Response } from 'express';
import fs from 'fs';
import crypto from 'crypto';
import { scopes } from './TwitchConstants.ts';
import ModuleService from '../../core/service/ModuleService.ts';
import { KeyedObject, userDir } from '../../Types.ts';
import STwitch, { twitchLog } from './main.ts';

export default class TwitchApi {
  appToken = '';
  homeChannel = '';
  botUsername = '';
  botUserID = '';
  broadcasterUserID = '';

  getModule = () => {
    return ModuleService.getStreamModule('twitch') as STwitch;
  };

  validateBroadcaster = async (): Promise<KeyedObject> => {
    const oauth = this.getModule().oauth;
    if (oauth.broadcaster_token == '' || oauth.broadcaster_token == null) {
      twitchLog(
        "No broadcaster auth saved. Authorizing on the Web UI saves your auth tokens for chat. If that's your broadcasting account, then go to the EventSub tab and click 'Save Current Oauth as Broadcaster'. You can have both pairs of tokens be the same. If you want a separate account for chat. Log in to twitch.tv as your bot account and authorize on the Web UI.",
      );
      return {};
    }

    return new Promise((res, rej) => {
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

  getBroadcasterID = async () => {
    const oauth = this.getModule().oauth;
    if (this.broadcasterUserID == '') {
      await Axios({
        url: 'https://api.twitch.tv/helix/users?login=' + this.homeChannel,
        method: 'get',
        headers: {
          Authorization: 'Bearer ' + oauth.token,
          'Client-Id': oauth['client-id'],
        },
      })
        .then((response: AxiosResponse) => {
          this.broadcasterUserID = response.data.data[0].id;
        })
        .catch((error: AxiosError) => {
          twitchLog('Broadcaster auth error: ', error.message);
          if (error.response?.status == 401) {
            this.onAuthenticationFailure();
          }
          return;
        });
    }
  };

  getBotID = async () => {
    const oauth = this.getModule().oauth;
    if (this.botUserID == '') {
      await Axios({
        url: 'https://api.twitch.tv/helix/users?login=' + this.botUsername,
        method: 'get',
        headers: {
          Authorization: 'Bearer ' + oauth.token,
          'Client-Id': oauth['client-id'],
        },
      })
        .then((response: AxiosResponse) => {
          this.botUserID = response.data.data[0].id;
        })
        .catch((error: AxiosError) => {
          twitchLog('Bot auth error: ', error.message);
          if (error.response?.status == 401) {
            this.onAuthenticationFailure();
          }
          return;
        });
    }
  };

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

  isStreamerLive = async (username: string) => {
    const oauth = this.getModule().oauth;
    const loggedIn = this.getModule().loggedIn;
    if (loggedIn == false) {
      return;
    }
    if (username == null) {
      username = this.homeChannel;
    }
    await this.getAppToken();

    return new Promise((res, rej) => {
      Axios({
        url: 'https://api.twitch.tv/helix/streams?user_login=' + username,
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + this.appToken,
          'Client-Id': oauth['client-id'],
          user_login: username,
        },
      })
        .then((response: AxiosResponse) => {
          twitchLog(
            response.data.data[0] != null ? username + ' IS LIVE' : username + ' IS NOT LIVE',
          );
          if (response.data.data[0] != null) {
            res(true);
          } else {
            res(false);
          }
        })
        .catch((error: AxiosError) => {
          twitchLog('isStreamerLive fail', error.message);
        });
    });
  };

  callBotAPI = (url: string, postBody: KeyedObject, method: string) => {
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
          rej(error);
        });
    });
  };

  callAppAPI = (url: string, postBody?: KeyedObject, method?: string) => {
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
          Authorization: 'Bearer ' + this.appToken,
          'Content-Type': 'application/json',
        },
        data: postBody,
      })
        .then((data: AxiosResponse) => res(data.data))
        .catch((error: AxiosError) => {
          twitchLog('App API use error: ', error.message);
          rej(error);
        });
    });
  };

  callBroadcasterAPI = (url: string, postBody: KeyedObject, method: string) => {
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
          rej(error);
        });
    });
  };

  twitchSigningSecret = process.env.TWITCH_SIGNING_SECRET;

  verifyTwitchSignature = (req: Request, res: Response, buf: Buffer) => {
    const messageId = req.header('Twitch-Eventsub-Message-Id');
    const timestamp = req.header('Twitch-Eventsub-Message-Timestamp');
    const messageSignature = req.header('Twitch-Eventsub-Message-Signature');
    const time = Math.floor(new Date().getTime() / 1000);
    twitchLog(`Message ${messageId} Signature: `, messageSignature);

    if (!messageId || !timestamp) {
      twitchLog('Verification Failed: Headers not set properly', messageId, timestamp);
      return;
    }

    if (Math.abs(time - parseInt(timestamp)) > 600) {
      // needs to be < 10 minutes
      twitchLog(`Verification Failed: timestamp > 10 minutes. Message Id: ${messageId}.`);
      throw new Error('Ignore this request.');
    }

    if (!this.twitchSigningSecret) {
      twitchLog(`Twitch signing secret is empty.`);
      throw new Error('Twitch signing secret is empty.');
    }

    const computedSignature =
      'sha256=' +
      crypto
        .createHmac('sha256', this.twitchSigningSecret)
        .update(messageId + timestamp + buf)
        .digest('hex');
    twitchLog(`Message ${messageId} Computed Signature: `, computedSignature);

    if (messageSignature !== computedSignature) {
      throw new Error('Invalid signature.');
    } else {
      twitchLog('Verification successful');
    }
  };

  getChannelInfo = async (channel?: string | undefined): Promise<KeyedObject> => {
    const oauth = this.getModule().oauth;
    const loggedIn = this.getModule().loggedIn;
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
          Authorization: 'Bearer ' + this.appToken,
          'Client-Id': oauth['client-id'],
        },
      })
        .then((response: AxiosResponse) => {
          if (response.data.data[0] != null) {
            res(response.data.data);
          } else {
            res({ error: 'getChannelInfo error: No data' });
          }
        })
        .catch((error: AxiosError) => {
          rej(error);
        });
    });
  };

  getUserInfo = (user?: string | undefined): Promise<KeyedObject> => {
    const oauth = this.getModule().oauth;
    const loggedIn = this.getModule().loggedIn;
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
          Authorization: ' Bearer ' + this.appToken,
          'Content-Type': 'application/json',
        },
      })
        .then((data: AxiosResponse) => {
          if (data != null) {
            res(data.data);
          } else {
            res({ error: 'getUserInfo error: No data' });
          }
        })
        .catch((error: AxiosError) => {
          rej(error);
        });
    });
  };

  getChannels = async () => {
    const loggedIn = this.getModule().loggedIn;
    const chat = this.getModule().chat;
    if (loggedIn == false || chat == null) {
      return [];
    }
    await this.validateChatbot();
    if (chat.chat?.readyState() == 'OPEN') {
      return chat.chat.getChannels();
    } else {
      return [];
    }
  };
}
