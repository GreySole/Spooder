import {
  joinVoiceChannel,
  VoiceConnectionStatus,
  createAudioPlayer,
  NoSubscriberBehavior,
  createAudioResource,
  AudioPlayer,
  VoiceConnection,
} from '@discordjs/voice';
import Discord, { discordLog } from './main';
import ModuleService from 'src/core/service/ModuleService';

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

    discordModule.api.callPlugins('voice', {
      event: 'join',
      guildId: guildId,
      channelId: channelId,
      members: discordModule.api.getChannel(channelId, guildId)?.members,
    });

    this.voiceChannel.receiver.speaking.on('start', (userId) => {
      discordModule.api.callPlugins('voice', { event: 'speaking-start', userId: userId });
    });

    this.voiceChannel.receiver.speaking.on('end', (userId) => {
      discordModule.api.callPlugins('voice', { event: 'speaking-end', userId: userId });
    });

    this.voiceChannel.on('stateChange', (oldstate, newstate) => {
      if (
        oldstate.status === VoiceConnectionStatus.Ready &&
        newstate.status === VoiceConnectionStatus.Connecting
      ) {
        this.voiceChannel?.configureNetworking();
      }
    });

    this.voiceChannel.on('error', (e) => {
      console.log(e);
    });

    discordModule.client?.on('voiceStateUpdate', (oldstate, newstate) => {
      discordModule.api.callPlugins('voice', {
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
      discordModule.api.callPlugins('audio', { event: 'play', resource: resource });
    }
  }

  pauseAudio() {
    const discordModule = this.getModule();
    if (this.audioPlayer != null) {
      this.audioPlayer.pause();
      discordModule.api.callPlugins('audio', { event: 'pause' });
    }
  }

  leaveVoiceChannel() {
    const discordModule = this.getModule();
    if (this.voiceChannel == null) {
      discordLog("the bot isn't in a voice channel");
      return;
    }
    discordModule.api.callPlugins('voice', { event: 'leave' });
    discordModule.client?.removeAllListeners('voiceStateUpdate');
    //leave
    this.audioPlayer?.stop();
    this.audioPlayer = undefined;
    this.voiceChannel.destroy();
    this.voiceChannel = undefined;
  }
}
