import { Router } from 'express';
import { KeyedObject, userDir } from '../../Types';
import { ControlModuleInterface } from '../interface/ControlModuleInterface';
import fs from 'fs';

export default class StreamDeck implements ControlModuleInterface {
  connected: boolean = false;
  private handlers: KeyedObject = {};
  private pluginFunctions: KeyedObject = {};
  private routers: { baseUrl: string; router?: Router; publicRouter?: Router } = {
    baseUrl: '/stream_deck',
  };
  private settings: KeyedObject = {};

  constructor() {
    if (fs.existsSync(userDir + '/settings/stream_deck.json')) {
      try {
        this.settings = JSON.parse(
          fs.readFileSync(userDir + '/settings/stream_deck.json', { encoding: 'utf-8' }),
        );
      } catch (e) {
        console.log('Somethings wrong with stream deck login file. Try entering it again.');
        this.settings = {};
      }
    }
  }

  async autoLogin(): Promise<boolean> {
    // Simulate auto-login logic
    this.connected = true;
    return this.connected;
  }

  getResponseHandlers(): KeyedObject {
    // Return registered response handlers
    return this.handlers;
  }

  call(command: string, data: KeyedObject): void {
    // Handle command execution
    if (this.handlers[command]) {
      this.handlers[command](data);
    }
  }

  getPluginFunctions(): KeyedObject {
    // Return available plugin functions
    return this.pluginFunctions;
  }

  onPluginsLoaded(): void {
    // Logic to execute when plugins are loaded
    // For example, register plugin functions
  }

  getRouters(): { baseUrl: string; router?: Router; publicRouter?: Router } {
    // Return routers for integration with Express
    return this.routers;
  }

  onOSC(message: any): void {
    // Handle incoming OSC messages
    // Example: log or process the message
  }
}
