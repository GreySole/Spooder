# @spooder/plugin-sdk

Shared TypeScript types and a base class (`PluginBase`) for building [Spooder](https://github.com/GreySole/Spooder) plugins.

Extend `PluginBase` to get sensible defaults for every hook and piece of injected plugin state, and override only what your plugin needs:

```ts
import { PluginBase, OSCMessage, StreamMessage } from '@spooder/plugin-sdk';

export default class MyPlugin extends PluginBase {
  onLoad() {}
  onChat(message: StreamMessage) {}
  onOSC(message: OSCMessage) {}
  onEvent(type: string, event: any) {}
  onCommunityChat(type: string, event: any) {}
}
```

See the [Plugin Dev Guide](https://github.com/GreySole/Spooder/wiki/Plugin-Dev-Guide) for the full plugin API.

This package ships as raw TypeScript (no compiled `.js`/`.d.ts` output) - Spooder builds plugins with `@vercel/ncc`, which compiles this source as part of bundling your plugin, so no separate build step is needed here.
