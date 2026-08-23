import Axios, { AxiosError, AxiosResponse } from 'axios';
import fs from 'fs';
import ModuleService from '../../core/service/ModuleService';
import ShareService from '../../core/service/ShareService';
import { KeyedObject, userDir } from '../../Types';
import Twitch, { twitchLog } from './twitch';
import { scopes } from './TwitchConstants';

export default class TwitchApi {
  appToken = '';
  homeChannel = '';
  botUsername = '';
  botUserID = '';
  broadcasterUserID = '';
  private shoutoutQueue: {
    username: string;
    resolve: (value: KeyedObject) => void;
    reject: (reason?: any) => void;
  }[] = [];
  private shoutoutQueueRunning = false;
  private shoutoutAvailableAt = 0;

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

  queueShoutout = (username: string): Promise<KeyedObject> => {
    return new Promise((resolve, reject) => {
      this.shoutoutQueue.push({ username, resolve, reject });
      this.processShoutoutQueue();
    });
  };

  private processShoutoutQueue = async () => {
    if (this.shoutoutQueueRunning || this.shoutoutQueue.length === 0) {
      return;
    }
    this.shoutoutQueueRunning = true;
    const waitMs = Math.max(0, this.shoutoutAvailableAt - Date.now());
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    const request = this.shoutoutQueue.shift()!;
    try {
      if (this.broadcasterUserID === '') {
        await this.getBroadcasterId();
      }
      const targetUserId = await this.getUserId(request.username);
      const response = await this.callBroadcasterApi(
        'https://api.twitch.tv/helix/moderator/shoutouts?from_broadcaster_id=' +
          this.broadcasterUserID +
          '&to_broadcaster_id=' +
          targetUserId +
          '&moderator_id=' +
          this.broadcasterUserID,
        undefined,
        'POST',
      );
      this.shoutoutAvailableAt = Date.now() + 120000;
      request.resolve({ username: request.username, userId: targetUserId, response });
    } catch (error) {
      request.reject(error);
    } finally {
      this.shoutoutQueueRunning = false;
      this.processShoutoutQueue();
    }
  };

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

  getAppToken = async (): Promise<string> => {
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

      const appParams =
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
          throw error;
        });
    }
    return this.appToken;
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

  // Channel point custom rewards. All four go through callBroadcasterApi rather than Axios
  // directly, so a stale broadcaster token is refreshed and the call retried once instead of
  // surfacing as a 401 in the UI.
  //
  // Twitch splits these into two populations: rewards this client created (`only_manageable`),
  // which it may edit and delete, and every other reward on the channel, which it may only
  // read and match redemptions against. The redeem node's picker needs both - a graph can
  // trigger off any reward - so the caller says which set it wants.
  private rewardsUrl = async (query: KeyedObject = {}) => {
    if (this.broadcasterUserID == '') {
      await this.getBroadcasterId();
    }
    const params = new URLSearchParams({ broadcaster_id: this.broadcasterUserID });
    for (const key in query) {
      params.set(key, String(query[key]));
    }
    return `https://api.twitch.tv/helix/channel_points/custom_rewards?${params.toString()}`;
  };

  getCustomRewards = async (onlyManageable = false): Promise<KeyedObject[]> => {
    const url = await this.rewardsUrl(onlyManageable ? { only_manageable_rewards: 'true' } : {});
    const response = (await this.callBroadcasterApi(url)) as KeyedObject;
    return response?.data ?? [];
  };

  createCustomReward = async (reward: KeyedObject): Promise<KeyedObject | undefined> => {
    const url = await this.rewardsUrl();
    const response = (await this.callBroadcasterApi(url, reward, 'POST')) as KeyedObject;
    return response?.data?.[0];
  };

  updateCustomReward = async (
    id: string,
    reward: KeyedObject,
  ): Promise<KeyedObject | undefined> => {
    const url = await this.rewardsUrl({ id });
    const response = (await this.callBroadcasterApi(url, reward, 'PATCH')) as KeyedObject;
    return response?.data?.[0];
  };

  deleteCustomReward = async (id: string): Promise<void> => {
    // DELETE takes its id on the query string; a body here is ignored, and passing one would
    // only make callBroadcasterApi guess POST.
    const url = await this.rewardsUrl({ id });
    await this.callBroadcasterApi(url, undefined, 'DELETE');
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

  // What a viewer thinks of as "the last stream" is split across two endpoints. /videos carries
  // the archive itself - title, duration, view count - but no game, tags or classification
  // labels; those live on /channels, and only as they stand right now rather than as they were
  // during that broadcast. Twitch exposes no per-VOD equivalent, so the channel's current values
  // are both the closest available and what a shoutout actually wants to read out.
  getLastStreamInfo = async (username: string): Promise<KeyedObject> => {
    const userInfo = await this.getUserInfo(username);
    // Optional chaining rather than a plain property read: an unknown login comes back from
    // getUserInfo as undefined (Twitch answers with an empty data array, which it indexes into).
    if (!userInfo?.id) {
      return { error: userInfo?.error || `No Twitch user found for ${username}` };
    }

    const [channelInfo, response] = await Promise.all([
      // Swallowed rather than awaited alongside: the archive is the point of this call, and
      // losing it because the channel lookup failed would be the worse trade.
      this.getChannelInfo(userInfo.id).catch((): KeyedObject => ({})),
      this.callBroadcasterApi(
        'https://api.twitch.tv/helix/videos?user_id=' + userInfo.id + '&type=archive&first=1',
      ),
    ]);
    const lastStream = (response as KeyedObject | undefined)?.data?.[0] ?? {
      error: `No archived streams found for ${username}`,
    };

    return { userInfo, channelInfo, lastStream };
  };

  // Cheermotes change on the order of months (Twitch adds a global set now and then; a channel
  // adds one when it unlocks a new tier), but a cheer needs them synchronously to render, so
  // they're fetched once and held. Keyed by broadcaster because the endpoint returns global
  // cheermotes *plus* that channel's own - a shared channel's cheer must not be drawn with the
  // home channel's custom set.
  cheermoteCache: { [broadcasterId: string]: { fetchedAt: number; data: KeyedObject[] } } = {};

  // Long enough that a normal stream fetches once, short enough that adding a cheermote
  // mid-stream shows up without a restart.
  static CHEERMOTE_CACHE_MS = 60 * 60 * 1000;

  // Global + channel cheermotes for a broadcaster, as helix's `data` array (see
  // parseCheermotes for the shape consumed out of it). Get Cheermotes needs no scope beyond a
  // valid token, so this asks for nothing existing users haven't already granted.
  //
  // Failure resolves to [] rather than rejecting: the caller is event dispatch, where the cost
  // of no cheermote list is a cheer rendered as plain text, and the cost of a rejection is a
  // dropped event.
  getCheermotes = async (broadcasterId?: string): Promise<KeyedObject[]> => {
    const id = broadcasterId || this.broadcasterUserID;
    if (!id || this.getModule().loggedIn == false) {
      return [];
    }

    const cached = this.cheermoteCache[id];
    if (cached && Date.now() - cached.fetchedAt < TwitchApi.CHEERMOTE_CACHE_MS) {
      return cached.data;
    }

    try {
      const response = (await this.callBroadcasterApi(
        'https://api.twitch.tv/helix/bits/cheermotes?broadcaster_id=' + id,
      )) as KeyedObject | undefined;
      const data = Array.isArray(response?.data) ? (response!.data as KeyedObject[]) : [];
      // A successful-but-empty response is still cached: it means this channel genuinely has
      // none, and re-asking on every cheer would be a request per cheer.
      this.cheermoteCache[id] = { fetchedAt: Date.now(), data };
      return data;
    } catch (e) {
      twitchLog('getCheermotes error: ', e);
      // Deliberately not cached - a network blip shouldn't cost the overlay its cheermotes for
      // the next hour. The stale set is better than nothing if there is one.
      return cached?.data ?? [];
    }
  };

  // The synchronous read, for callers that can't await one - tmi's chat events are dispatched
  // from a plain synchronous handler (see processTwitchEvent), and turning that async to fetch
  // a rarely-changing list would reorder plugin dispatch for every event on the chat path.
  // Returns whatever is cached (stale included, which is nearly always right for a list that
  // changes monthly) and kicks off a refresh in the background when it isn't fresh, so a cold
  // start self-heals by the next cheer instead of staying empty.
  getCachedCheermotes = (broadcasterId?: string): KeyedObject[] => {
    const id = broadcasterId || this.broadcasterUserID;
    if (!id) {
      return [];
    }
    const cached = this.cheermoteCache[id];
    if (!cached || Date.now() - cached.fetchedAt >= TwitchApi.CHEERMOTE_CACHE_MS) {
      this.getCheermotes(id).catch(() => {});
    }
    return cached?.data ?? [];
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
