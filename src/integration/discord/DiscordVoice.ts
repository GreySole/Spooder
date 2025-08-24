import {
  joinVoiceChannel,
  VoiceConnectionStatus,
  createAudioPlayer,
  NoSubscriberBehavior,
  createAudioResource,
  AudioPlayer,
  VoiceConnection,
  EndBehaviorType,
  AudioPlayerStatus,
} from '@discordjs/voice';
import Discord, { discordLog } from './main';
import ModuleService from '../../core/service/ModuleService';
import { url } from 'inspector';

export default class DiscordVoice {
  voiceChannel: VoiceConnection | undefined = undefined;
  audioPlayer: AudioPlayer | undefined = undefined;
  audioReceiver = null;
  isListening: boolean = false;

  constructor() {
    // Check if bot is already in a voice channel after client is ready
    // We use a timeout to ensure the Discord module is fully initialized
    setTimeout(() => {
      this.checkAndRejoinVoiceChannel();
    }, 2000); // Wait 2 seconds for client to be fully ready and guilds to be cached
  }

  getModule = () => {
    return ModuleService.getCommunityModule('discord') as Discord;
  };

  checkAndRejoinVoiceChannel() {
    const discordModule = this.getModule();

    if (!discordModule.client || !discordModule.loggedIn) {
      discordLog('Discord client not ready, skipping voice channel check');
      return;
    }

    // Check if we're already connected to a voice channel
    if (this.voiceChannel) {
      discordLog('Already connected to a voice channel, skipping rejoin check');
      return;
    }

    // Check if bot is already in a voice channel in any guild
    const botUser = discordModule.client.user;
    if (!botUser) {
      discordLog('Bot user not available');
      return;
    }

    let foundChannel = false;

    discordModule.client.guilds.cache.forEach((guild) => {
      if (foundChannel) return; // Skip if we already found and rejoined a channel

      const botMember = guild.members.cache.get(botUser.id);
      if (botMember && botMember.voice.channel) {
        discordLog(
          `Found bot in voice channel: ${botMember.voice.channel.name} (${botMember.voice.channel.id}) in guild: ${guild.name}`,
        );

        try {
          // Rejoin the voice channel
          this.joinVoiceChannel(guild.id, botMember.voice.channel.id);
          discordLog(`Successfully rejoined voice channel: ${botMember.voice.channel.name}`);
          foundChannel = true;
        } catch (error) {
          discordLog(`Failed to rejoin voice channel: ${error}`);
        }
      }
    });

    if (!foundChannel) {
      //discordLog('Bot is not in any voice channels');
    }
  }

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
      if (!oldstate.channel && newstate.channel) {
        discordModule.api.callPlugins('voice', {
          event: 'user-join',
          userId: newstate.id,
          channelId: newstate.channelId,
          guildId: newstate.guild.id,
          user: newstate.member?.user,
        });
        return;
      }

      if (oldstate.channel && !newstate.channel) {
        discordModule.api.callPlugins('voice', {
          event: 'user-leave',
          userId: newstate.id,
          channelId: oldstate.channelId,
          guildId: oldstate.guild.id,
          user: oldstate.member?.user,
        });
        return;
      }

      if (oldstate.channel && newstate.channel && oldstate.channelId !== newstate.channelId) {
        discordModule.api.callPlugins('voice', {
          event: 'user-switch',
          userId: newstate.id,
          fromChannelId: oldstate.channelId,
          toChannelId: newstate.channelId,
          guildId: newstate.guild.id,
          user: newstate.member?.user,
        });
        return;
      }

      //Don't return on deafen because it can also be mute
      if (oldstate.selfDeaf !== newstate.selfDeaf) {
        discordModule.api.callPlugins('voice', {
          event: newstate.selfDeaf ? 'user-deafen' : 'user-undeafen',
          userId: newstate.id,
          channelId: newstate.channelId,
          guildId: newstate.guild.id,
          user: newstate.member?.user,
          isDeafened: newstate.selfDeaf,
          isSelfDeaf: true,
        });
      }

      if (oldstate.serverDeaf !== newstate.serverDeaf) {
        discordModule.api.callPlugins('voice', {
          event: newstate.serverDeaf ? 'user-server-deafen' : 'user-server-undeafen',
          userId: newstate.id,
          channelId: newstate.channelId,
          guildId: newstate.guild.id,
          user: newstate.member?.user,
          isDeafened: newstate.serverDeaf,
          isSelfDeaf: false,
        });
      }

      if (oldstate.selfMute !== newstate.selfMute) {
        discordModule.api.callPlugins('voice', {
          event: newstate.selfMute ? 'user-mute' : 'user-unmute',
          userId: newstate.id,
          channelId: newstate.channelId,
          guildId: newstate.guild.id,
          user: newstate.member?.user,
          isMuted: newstate.selfMute,
          isSelfMute: true,
        });
        return;
      }

      if (oldstate.serverMute !== newstate.serverMute) {
        discordModule.api.callPlugins('voice', {
          event: newstate.serverMute ? 'user-server-mute' : 'user-server-unmute',
          userId: newstate.id,
          channelId: newstate.channelId,
          guildId: newstate.guild.id,
          user: newstate.member?.user,
          isMuted: newstate.serverMute,
          isSelfMute: false,
        });
        return;
      }

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

      // Set up event listeners for audio events
      this.audioPlayer.on('stateChange', (oldState, newState) => {
        if (
          newState.status === AudioPlayerStatus.Playing &&
          oldState.status !== AudioPlayerStatus.Playing
        ) {
          // Audio started playing
          discordModule.api.callPlugins('audio', {
            event: 'play',
            resource: resource,
            url: url,
          });
        } else if (
          newState.status === AudioPlayerStatus.Idle &&
          oldState.status === AudioPlayerStatus.Playing
        ) {
          // Audio finished playing
          discordModule.api.callPlugins('audio', {
            event: 'ended',
            resource: resource,
            url: url,
          });
        }
      });

      this.audioPlayer.play(resource);
    }
  }

  pauseAudio() {
    const discordModule = this.getModule();
    if (this.audioPlayer != null) {
      this.audioPlayer.pause();
      discordModule.api.callPlugins('audio', { event: 'pause' });
    }
  }

  muteBot() {
    const discordModule = this.getModule();
    if (!this.voiceChannel) {
      discordLog('No voice connection available for muting');
      return;
    }

    // Get the guild and bot's voice state
    const guild = discordModule.client?.guilds.cache.get(this.voiceChannel.joinConfig.guildId);
    const botMember = guild?.members.cache.get(discordModule.client?.user?.id || '');

    if (botMember?.voice.channel) {
      // Self-mute the bot in the voice channel
      botMember.voice
        .setMute(true)
        .then(() => {
          discordModule.api.callPlugins('voice', { event: 'mute' });
          discordLog('Bot muted in voice channel');
        })
        .catch((error) => {
          discordLog(`Failed to mute bot: ${error.message}`);
        });
    } else {
      discordLog('Bot is not in a voice channel');
    }
  }

  unmuteBot() {
    const discordModule = this.getModule();
    if (!this.voiceChannel) {
      discordLog('No voice connection available for unmuting');
      return;
    }

    // Get the guild and bot's voice state
    const guild = discordModule.client?.guilds.cache.get(this.voiceChannel.joinConfig.guildId);
    const botMember = guild?.members.cache.get(discordModule.client?.user?.id || '');

    if (botMember?.voice.channel) {
      // Self-unmute the bot in the voice channel
      botMember.voice
        .setMute(false)
        .then(() => {
          discordModule.api.callPlugins('voice', { event: 'unmute' });
          discordLog('Bot unmuted in voice channel');
        })
        .catch((error) => {
          discordLog(`Failed to unmute bot: ${error.message}`);
        });
    } else {
      discordLog('Bot is not in a voice channel');
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
    this.isListening = false;
  }

  startListening() {
    if (!this.voiceChannel) {
      discordLog('No voice connection available for listening');
      return;
    }

    if (this.isListening) {
      discordLog('Already listening for audio streams');
      return;
    }

    const discordModule = this.getModule();

    // Listen for when users start speaking
    this.voiceChannel.receiver.speaking.on('start', (userId) => {
      // Create an audio stream for this specific user
      const audioStream = this.voiceChannel?.receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.AfterSilence,
          duration: 100, // Stop recording after 100ms of silence
        },
      });
      if (audioStream) {
        discordLog(`Started receiving audio from user: ${userId}`);

        // You can process the audio stream here
        const audioChunks: Buffer[] = [];

        audioStream.on('data', (chunk: Buffer) => {
          audioChunks.push(chunk);
        });

        audioStream.on('end', () => {
          // Combine all audio chunks
          const fullAudio = Buffer.concat(audioChunks);
          discordLog(
            `Finished receiving audio from user: ${userId}, size: ${fullAudio.length} bytes`,
          );

          // Call plugins with the audio data
          discordModule.api.callPlugins('voice', {
            event: 'audio-received',
            userId: userId,
            audioData: fullAudio,
            duration: audioChunks.length * 20, // Rough duration estimate (20ms per chunk)
          });
        });

        audioStream.on('error', (error) => {
          discordLog(`Audio stream error for user ${userId}: ${error.message}`);
        });
      }
    });

    this.isListening = true;
    discordLog('Started listening for individual audio streams');
  }

  stopListening() {
    if (!this.voiceChannel) {
      discordLog('No voice connection available');
      return;
    }

    if (!this.isListening) {
      discordLog('Not currently listening for audio streams');
      return;
    }

    // Remove all speaking event listeners
    this.voiceChannel.receiver.speaking.removeAllListeners('start');
    this.isListening = false;
    discordLog('Stopped listening for individual audio streams');
  }
}
