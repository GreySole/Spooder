import Axios, { AxiosResponse } from 'axios';
import fs from 'fs';
import { userDir } from '../../Types';
import { twitchLog } from '../twitch/main';
import Joystick from './main';

export interface JoystickTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface JoystickOAuthConfig {
  client_id: string;
  client_secret: string;
  token?: string;
  refresh_token?: string;
  expires_in?: number;
}

export default class JoystickApi {
  private context: Joystick;
  constructor(context: Joystick) {
    this.context = context;
  }

  async getAccessToken(
    code: string,
    redirectUri: string,
    oauth: JoystickOAuthConfig,
  ): Promise<JoystickTokenResponse> {
    twitchLog('Getting access token with code');

    const joystickParams = `?grant_type=authorization_code&code=${code}&redirect_uri=${redirectUri}`;

    twitchLog(joystickParams);

    try {
      const response: AxiosResponse = await Axios.post(
        'https://joystick.tv/api/oauth/token' + joystickParams,
        {},
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization:
              'Basic ' +
              Buffer.from(oauth.client_id + ':' + oauth.client_secret).toString('base64'),
            Accept: 'application/json',
          },
        },
      );

      twitchLog('Got token');

      if (typeof response.data.access_token !== 'undefined') {
        const tokenData: JoystickTokenResponse = {
          access_token: response.data.access_token,
          refresh_token: response.data.refresh_token,
          expires_in: response.data.expires_in,
        };

        // Update oauth object
        oauth.token = tokenData.access_token;
        oauth.refresh_token = tokenData.refresh_token;
        oauth.expires_in = tokenData.expires_in;

        // Save to file
        await this.saveOAuthConfig(oauth);

        return tokenData;
      } else {
        throw new Error('No access token in response');
      }
    } catch (error: any) {
      twitchLog('Joystick auth error: ', error.message);
      throw error;
    }
  }

  async refreshToken(oauth: JoystickOAuthConfig) {
    const joystickParams = `?grant_type=refresh_token&refresh_token=${oauth.refresh_token}`;
    const response: AxiosResponse = await Axios.post(
      'https://joystick.tv/api/oauth/token' + joystickParams,
      {},
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' + Buffer.from(oauth.client_id + ':' + oauth.client_secret).toString('base64'),
          Accept: 'application/json',
        },
      },
    );

    if (typeof response.data.access_token !== 'undefined') {
      const tokenData: JoystickTokenResponse = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
      };

      // Update oauth object
      oauth.token = tokenData.access_token;
      oauth.refresh_token = tokenData.refresh_token;
      oauth.expires_in = tokenData.expires_in;

      // Save to file
      await this.saveOAuthConfig(oauth);

      return tokenData;
    } else {
      throw new Error('No access token in response');
    }
  }

  private async saveOAuthConfig(oauth: JoystickOAuthConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.writeFile(userDir + '/settings/joystick.json', JSON.stringify(oauth), 'utf-8', (err) => {
        if (err) {
          twitchLog('Error saving oauth config: ', err.message);
          reject(err);
        } else {
          twitchLog('oauth saved!');
          resolve();
        }
      });
    });
  }

  public async testApiCall(event: string, data: string) {
    twitchLog(`Test API Call: Event - ${event}, Data - ${data}`);
    const oauth = this.context.oauth;
    const response: AxiosResponse = await Axios.post(
      'https://joystick.tv/echo',
      {
        sample: {
          event: event,
          data: data,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization:
            'Basic ' + Buffer.from(oauth.client_id + ':' + oauth.client_secret).toString('base64'),
          Accept: 'application/json',
        },
      },
    );
  }
}
