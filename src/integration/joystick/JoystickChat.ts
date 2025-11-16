import console from 'console';
import ModuleService from 'src/core/service/ModuleService';
import WebSocket from 'ws';
import Joystick from './main';
import { processStreamMessage } from 'src/core/util/ChatUtil';
import { JoystickWebSocketMessage, KeyedObject, StreamMessage } from 'src/Types';
import { processTwitchEvent } from '../twitch/functions/processTwitchMessage';
import { twitchLog } from '../twitch/main';
import { EventService, sayInChat } from 'src/core/service/EventService';
import { type } from 'os';
import { triggerExistsAndEnabled } from 'src/core/util/EventTriggerUtil';

interface JoystickEmote {
  code: string;
  signedUrl: string;
  signedThumbnailUrl: string;
}

export default class JoystickChat {
  websocket: WebSocket | null = null;
  homeChannel: string = '';
  lastMessage: KeyedObject = {};
  constructor(context: Joystick) {
    this.homeChannel = context.oauth.home_channel;
  }

  startWebSocket(token: string) {
    console.log('Starting Joystick WebSocket');
    this.websocket = new WebSocket(`wss://joystick.tv/cable?token=${token}`, 'actioncable-v1-json');
    this.websocket.onopen = () => {
      console.log('Joystick WebSocket connected');

      const subscribeMsg = {
        command: 'subscribe',
        identifier: JSON.stringify({
          channel: 'GatewayChannel',
        }),
      };

      this.websocket?.send(JSON.stringify(subscribeMsg));
      console.log('Send subscribe message to GatewayChannel');
    };

    this.websocket.onmessage = (event) => {
      const data = JSON.parse(event.data.toString());
      console.log('Received Joystick WebSocket message:', data);
      if (data.type === 'ping' || data.type === 'welcome') {
        return;
      }
      if (data.type === 'confirm_subscription') {
        console.log('Joystick WebSocket subscription confirmed');
        return;
      }
      if (data.type === 'reject_subscription') {
        console.error('Joystick WebSocket subscription rejected');
        return;
      }
      if (data.message?.type === 'new_message') {
        this.processMessage(data.message);
      } else if (data.message?.event === 'StreamEvent') {
        this.processStreamEvent(data.message);
      }
    };

    this.websocket.onerror = (error) => {
      console.error('Joystick WebSocket error:', error);
    };
  }

  sayInChat(message: string, channel: string) {
    console.log(
      'Sending message to Joystick:',
      message,
      channel,
      this.websocket && this.websocket.readyState === WebSocket.OPEN,
    );
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      const chatMsg = {
        command: 'message',
        identifier: JSON.stringify({ channel: 'GatewayChannel' }),
        data: JSON.stringify({
          action: 'send_message',
          text: message,
          channelId: channel,
        }),
      };
      this.websocket.send(JSON.stringify(chatMsg));
      console.log('Sent message to Joystick chat:', message);
    }
  }

  twitchjsify = (channel: string, tags: KeyedObject, txt: string): StreamMessage => {
    const emotes = tags.emotes as JoystickEmote[];

    const newEmotes = [];

    // Find emote codes in the text string and mark their positions
    if (emotes && Array.isArray(emotes)) {
      for (const emote of emotes) {
        const emoteCode = emote.code;
        let searchIndex = 0;

        // Find all occurrences of this emote code in the text
        while (searchIndex < txt.length) {
          const foundIndex = txt.indexOf(emoteCode, searchIndex);
          if (foundIndex === -1) break;

          newEmotes.push({
            id: emoteCode,
            start: foundIndex,
            end: foundIndex + emoteCode.length - 1,
          });

          searchIndex = foundIndex + emoteCode.length;
        }
      }
    }

    twitchLog('Emotes:', newEmotes);

    if (tags.badges == null) {
      tags.badges = {};
    }

    tags.emotes = newEmotes;

    const channelName = channel.replace('#', '');

    const message = {
      channel: channelName,
      respond: ((responseTxt: string) => {
        this.sayInChat(responseTxt, channelName);
      }).bind(this),
      username: tags.author.slug,
      displayName: tags.author.username,
      tags: tags.author,
      message: txt,
      messageType: 'joystick-chat',
      userId: tags.author.slug,
      platform: 'joystick',
      emotes: newEmotes,
      isFirstMessage: false,
      isReturningChatter: false,
      isBroadcaster: tags.author.isStreamer == true,
      isMod: tags.author.isModerator == true,
      isSubscriber: tags.author.isSubscriber == true,
      isVIP: false,
    } as StreamMessage;

    return message;
  };

  processMessage = (message: JoystickWebSocketMessage) => {
    const streamMessage = this.twitchjsify(
      message.channelId,
      { author: message.author, emotes: message.emotesUsed },
      message.text,
    );

    //let shareId = undefined;

    const channelName = streamMessage.channel.replace('#', '');

    if (channelName !== this.homeChannel) {
      //shareId = this.shareUsers[streamMessage.channel];
      //streamMessage.shareId = shareId;
    }

    processStreamMessage(streamMessage);

    this.lastMessage = {
      username: streamMessage.username,
      channel: streamMessage.channel,
      message: streamMessage.message,
    };
  };

  //Started
  //Tipped
  //WheelSpinClaimed
  //Followed
  //DeviceConnected
  //StreamEnding
  //Ended
  //StreamResuming

  processStreamEvent = (eventData: KeyedObject) => {
    const streamMessage = {
      userId: '',
      username: 'lanathedeaver',
      displayName: 'LanaTheDeaver',
      platform: 'joystick',
      channel: eventData.channelId,
      message: eventData.text,
      messageType: `joystick-event`,
      respond: (responseTxt: string) => {
        sayInChat(responseTxt, 'joystick', eventData.channelId);
      },
      emotes: [],
      tags: {},
      isBroadcaster: false,
      isMod: false,
      isSubscriber: false,
      isVIP: false,
      isFirstMessage: false,
      isReturningChatter: false,
      platformEventData: {
        type: eventData.type,
        ...eventData,
      },
    } as StreamMessage;

    const events = EventService.getEvents();
    for (let e in events) {
      if (!triggerExistsAndEnabled(events[e].triggers, 'joystick')) {
        continue;
      }

      if (events[e].triggers.joystick.type == eventData.type) {
        EventService.runCommands(streamMessage, e, 'event');
      }
    }
  };
}
