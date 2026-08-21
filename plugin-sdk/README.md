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

## Distributing your plugin from a Git repo

Spooder can install and update a plugin straight from its repository. Lay the repo out the
same way Spooder's **Export Plugin** zips it — the plugin itself in `plugin/`, and whatever
web pages and assets it ships alongside it:

```
your-plugin-repo/
  plugin/          # package.json, your source, and build/ if you ship a build
  overlay/         # optional OBS overlay page
  utility/         # optional utility page
  public/          # optional public page
  settings/        # optional custom settings page
  assets/          # optional bundled assets
  icon.png         # optional plugin icon
```

Users can then install it two ways:

- **Release** (the default). Tag a release on GitHub and attach the zip produced by
  Export Plugin. Spooder downloads that asset and runs the prebuilt `build/`, so the user
  needs no toolchain and no Git install. If a release has no zip attached, Spooder falls
  back to the tag's source zipball, so tagging alone is enough to publish. Bump the
  version in your tag (`v1.2.0`) — that's what update checks compare.
- **Source**. Spooder clones the repo with the system Git CLI and runs your plugin from
  source in dev mode, tracking the branch it cloned. Updates fetch and hard-reset to that
  branch's HEAD, so keep the branch you point users at buildable.

Do not commit `plugin/settings.json` or `plugin/_share/` — those hold each user's own
configuration. Spooder skips them on install and update so a user's settings survive, but
leaving them out of the repo keeps things unambiguous.

This package ships as raw TypeScript (no compiled `.js`/`.d.ts` output) - Spooder builds plugins with `@vercel/ncc`, which compiles this source as part of bundling your plugin, so no separate build step is needed here.
