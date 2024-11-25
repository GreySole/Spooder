import {
  joinVoiceChannel,
  VoiceConnectionStatus,
  createAudioPlayer,
  NoSubscriberBehavior,
  createAudioResource,
  AudioPlayer,
  VoiceConnection,
} from '@discordjs/voice';
import Discord, { discordLog } from './main.ts';
import ModuleService from 'src/core/service/ModuleService.ts';

export default class DiscordVoice {
  voiceChannel: VoiceConnection | undefined = undefined;
  audioPlayer: AudioPlayer | undefined = undefined;
  audioReceiver = null;

  getModule = () => {
    return ModuleService.getCommunityModule('discord') as Discord;
  };

  joinVoiceChannel(guildId: string, channelId: string) {
    const discordModule = this.getModule();
    let targetServer = discordModule.client?.guilds.cache.get(guildId);
    if (!targetServer?.voiceAdapterCreator) {
      return;
    }
    this.voiceChannel = joinVoiceChannel({
      channelId: channelId, //the id of the channel to join (we're using the author voice channel)
      guildId: guildId, //guild id (using the guild where the message has been sent)
      adapterCreator: targetServer.voiceAdapterCreator, //voice adapter creator
    });

    discordModule.callPlugins('voice', {
      event: 'join',
      guildId: guildId,
      channelId: channelId,
      members: discordModule.getChannel(channelId, guildId)?.members,
    });

    this.voiceChannel.receiver.speaking.on('start', (userId) => {
      //actions here
      //onDiscord(type, data);
      discordModule.callPlugins('voice', { event: 'speaking-start', userId: userId });
      //discordLog("Speaking", userId);
    });

    this.voiceChannel.receiver.speaking.on('end', (userId) => {
      discordModule.callPlugins('voice', { event: 'speaking-end', userId: userId });
      //discordLog("Stopped", userId);
    });

    this.voiceChannel.on('stateChange', (oldstate, newstate) => {
      //discordLog('join', 'Connection state change from', oldstate.status, 'to', newstate.status)
      if (
        oldstate.status === VoiceConnectionStatus.Ready &&
        newstate.status === VoiceConnectionStatus.Connecting
      ) {
        this.voiceChannel?.configureNetworking();
      }
    });

    /*discordModule.voiceChannel.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
          try {
            await Promise.race([
              entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
              entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
            // Seems to be reconnecting to a new channel - ignore disconnect
          } catch (error) {
            // Seems to be a real disconnect which SHOULDN'T be recovered from
            connection.destroy();
          }
        });*/

    this.voiceChannel.on('error', (e) => {
      console.log(e);
    });

    discordModule.client?.on('voiceStateUpdate', (oldstate, newstate) => {
      discordModule.callPlugins('voice', {
        event: 'state-update',
        oldstate: oldstate,
        newstate: newstate,
      });
    });

    this.audioPlayer = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause,
      },
    });
  }

  playAudio(url: string) {
    const discordModule = this.getModule();
    if (this.audioPlayer != null) {
      let resource = createAudioResource(url);
      this.audioPlayer.play(resource);
      discordModule.callPlugins('audio', { event: 'play', resource: resource });
    }
  }

  pauseAudio() {
    const discordModule = this.getModule();
    if (this.audioPlayer != null) {
      this.audioPlayer.pause();
      discordModule.callPlugins('audio', { event: 'pause' });
    }
  }

  leaveVoiceChannel() {
    const discordModule = this.getModule();
    if (this.voiceChannel == null) {
      discordLog("the bot isn't in a voice channel");
      return;
    }
    discordModule.callPlugins('voice', { event: 'leave' });
    discordModule.client?.removeAllListeners('voiceStateUpdate');
    //leave
    this.audioPlayer?.stop();
    this.audioPlayer = undefined;
    this.voiceChannel.destroy();
    this.voiceChannel = undefined;
  }
}
