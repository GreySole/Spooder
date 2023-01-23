###### Table of Contents<br>
<a href="#getting-started">Getting Started</a><br>
<a href="#user-authentication">User Authentication</a><br>
<a href="#udp-clients">UDP Clients</a><br>
<a href="#creating-events">Creating Events</a><br>
<a href="#helping-commands">Helping Commands</a><br>
<a href="#toggling-events">Toggling Events</a><br>
<a href="#moderating-spooder">Moderating Spooder</a><br>
<a href="#the-mod-ui">The Mod UI</a><br>
<a href="#authenticating-mods">Authenticating Mods</a><br>
<a href="#creatingmanaging-plugins">Creating/Managing Plugins</a><br>
<a href="#osc-tunnels">OSC Tunnels</a><br>
<a href="#accessing-externally">Accessing Externally</a><br>
<a href="#eventsubs">EventSubs</a><br>
<a href="#connecting-to-obs">Connecting to OBS</a><br>
<a href="#connecting-to-discord-wip">Connecting to Discord</a><br>
<a href="#developing-web-ui-and-mod-ui">Developing Web UI and Mod UI</a><br>
<a href="#have-questions">Have Questions?</a><br>

# Getting Started

Requires Node v16.9.0 and up.

Use `npm install` to install Spooder's dependencies.

Then use `npm run init` to initialize your Spooder's configuration.
Note: You will need app access credentials from dev.twitch.tv. Fill in the client ID and secret to authenticate.

Finally use `npm run start` to start Spooder's web and OSC services.

Open Spooder's Web UI in your browser either by localhost:3000 or your local network address at port 3000.

Setup Walkthrough: https://www.youtube.com/watch?v=qSu1XhV0848

# User Authentication
Authentication will only work on localhost, the machine Spooder is running.

Log into Twitch.tv as the broadcaster and click the bar at the top to open the navigation menu. You can authorize your Twitch account for the chat bot (only works on localhost, not local IP) Once done, Spooder will store your user access token and log you in to chat automatically unless you start Spooder with `npm run start-noautologin`.

Go to the EventSub tab and click "Save Current Oauth as Broadcaster." The broadcaster Oauth is used for pulling channel point custom rewards. Once done, you may log out of Twitch.tv and back in as a bot account. Then click authorize to store and use your bot's Oauth for chat if you wish.

# UDP Clients
One last necessity is the UDP clients. Those are machines with software listening for OSC like Resolume, Max, Ableton, and now VRChat. Define the IP and port of the server, add to the clients list, and save your config. They should show up in the events tab for configuring software type commands.

# Creating Events
Events have three triggers. A chat command, channel point reward, and OSC. Make sure to save your broadcaster oauth to link channel point rewards.

Commands:

Response - Write a script to build your bot's response to the trigger and return a string. Use the Verify Script button to ensure the script works. The chat message going through will be "Test Message" unless you put something in the input field. The resulting response will appear with a green border indicating it works. If not, the error will appear with a red border. Think of response commands as micro plugins. They can call any global function within Spooder (list in the Sample Plugin Repository). Responses also work asynchronously, so you can make API calls using fetch() to build your response.

Response Search and Match (WIP) - Trigger the response with each space separated word as the command. You can use wildcard * to match with any word and use OR | between words without a space between them. So a command like "* my *" will first match any word, then "my", and then any word in sequence. Then the matched words go into the response script as extra[]. So with this command you could say "boop my nose" and the response could be "I shall boop thy nose!" You could also make a command that matches pronouns like "boop him|her|them".

Plugin - Choose a plugin and event name to send the event data to. This will go through the plugin's onEvent function.

Software - Make sure you set up your udp machines in the Config tab. This command will send an OSC command to the specified address to the specified machine. "Timed" events send the OSC at valueOn until the set duration, then send the OSC at valueOff. "One Shot" events send valueOn and then valueOff immediately with the duration used as a cooldown instead.

OBS - You must connect OBS in Deck Mode to configure these commands. Right now, you can set the mute on your audio inputs, switch scenes, and toggle scene items. More functions to come. This works a lot like software commands with timed and one-shot events.

Moderation - As moderation chat commands are built into Spooder, making events for moderation is handy for custom OSC triggers. Toggle spamguard, lockdown, or a kill switch for all active events.

# Helping Commands
The help command is set in the config. It's prefixed with ! in the backend so no need to prefix it on Config. It works like '!help type command'. The types are event and plugin. To see a full list of events, call `!help event`. Then with the listed commands, call `!help event command` to see the command's description. This also works with plugins if they're set in the commandList object. By itself, the help command introduces your Spooder to new viewers. The introduction is also set on Config.
You can also call !commands to list all chat commands from events with a chat command enabled. You can also list a plugin's chat commands through the !plugins command.

# Toggling Events
Toggling events is specific to software (UDP) commands. This will ignore the set times of commands and run them until triggered again. You can trigger a toggle by saying "on" or "off" after an event's chat command. You can also do this with the OSC trigger and setting it to "toggle."

# Moderating Spooder
Spooder comes with two big chat commands for moderation. !stop will stop any event currently running. You can use it like '!stop eventname' to stop a certain event (The event name is the initial name set when the event was created). You can also use '!stop all' to stop all running events. !mod is the base command for you and your mods to lock/unlock events and plugins or adding and removing names from the user blacklist. The 'all' argument works for lock and unlock as well. So you can use '!mod lock all' to lockdown Spooder entirely and use '!mod unlock all' to lift all Spooder's locks. Knowing all the event names and the consistant changes to the events and plugins that may be. I recommend using the new Mod UI.

# The Mod UI
If you've set up both external tunnels in the Config, you can share the web tunnel link to your mods as it is with '/mod' at the end of it. While there are built-in chat commands for Spooder moderation, there's a lot to moderate, and a lot of ways setups can change. The Mod UI is a graphical interface that can lock events, blacklist users from using Spooder, lockdown plugins entirely, or lock specific events in plugins (depends whether the plugin dev implemented them). Mods can also access plugin utility pages, but they cannot access your Web UI. The interface is also themable and themes are saved in your themes.json file.

# Authenticating Mods
Don't worry, it's not that easy for just anyone to use the Mod UI. First the broadcaster must trust their users using '!mod trust username' which will store the username in mod.json with trust level "m" for Mod. Then mods log into the Mod UI using their Twitch username and any password they want. They are matching their username with what you have on file and creating a password to log into your Spooder. Finally, mods verify their identity by calling '!mod verify' in the broadcaster's chat to save their password and they can then access the Mod UI with their new credentials. Passwords are encrypted and stored in mod.json. This way your Ngrok link can change and all mods need to do is login with their credentials.

# Creating/Managing Plugins
Plugins take in the same data Spooder's events do and how they work is entirely up to you. Check out the sample plugin repository to get started with making plugins. The Plugins tab in Spooder's Web UI can install plugins by uploading the plugin as a zip file. Once installed, you can configure the plugin's settings, upload assets to the plugin, and export the plugin. Note: Exported plugins will not include its assets folder.
Sample Plugin: https://github.com/GreySole/Spooder-Sample-Plugin

# OSC Tunnels
These tunnels simply listen for OSC from overlays or software and repeat them to another address. So that software like TouchOSC can control other devices or overlays.

# Accessing Externally
Some of Spooder's features require an https url to access through the internet. EventSubs, Channel Point Rewards, and the Mod UI need this. One way to do this is to set up a free ngrok.io account. Ngrok is integrated within Spooder. So just paste your auth key in the Config tab and the tunnels are all set.
For a manual implementation, you will need two tunnels. One with the web server's hosting port and one with the TCP OSC port. Be sure to set both of them as http tunnels as the TCP tunnel is by websocket. Once both tunnels are running, save them to your config on external_http_url and external_tcp_url.
Note: Spooder's Web-UI is blocked from the external link. Only you can see Spooder's config and deck on your local network.

# EventSubs
With the broadcaster username set in config and broadcaster oauth saved, you can subscribe to events with that broadcaster. 
Each subscription can be handled in any combination of ways like events. The only difference is being able to send event data straight to an overlay like an alertbox.
You can also verify whether the callback on your EventSubs match whats on your config file. If they don't match, click Refresh EventSubs to delete and replace your current subscriptions. EventSub settings are all preserved.
channel.channel_points_custom_reward_redemption.add and update are needed to link custom rewards to Spooder events. That won't need any handler enabled on the EventSub tab.

# Connecting to OBS
Check out Deck Mode in the Web UI and you'll find the OBS Remote. Enter your OBS machine's info to connect. Spooder connects to OBS on the backend with a custom OSC front to control it. The OBS Remote has all the essentials to run your stream. Stream/Record buttons, source toggles, scene switcher with studio mode support, and volume control. Groups are supported for both source and volume controls. Volume meters are grouped in a unified meter and have a group mute button. Changing volume also allows you to confirm your change or revert back to its previous level.

# Connecting to Discord (WIP)
There isn't event/eventsub support yet, but you can now make plugins for a Discord bot! It currently receives any message in your server(s) and sends them to plugins with the onDiscord(type, data) function. Add your bot token in the Config tab under Discord Settings. You can also automatically send your mod link from Ngrok to a private channel so your mods get the new link instantly when Spooder starts. (You'll need to save and restart Spooder after adding the token to get your channels)

# Developing Web UI and Mod UI
Use `npm run dev` to run Spooder in development mode. This sets the web UI's hosting port to 3001. In another shell, use `npm run start-front` to run the web UI's development server which will run your configured port like usual. Use `npm run build-front` to create an optimized build for the web UI. When built, Spooder can be started up normally with your changes to the web UI. You could also just set the proxy on either UI's package.json file to be your configured port. Then the dev server will run on a different port.

# Have Questions?
Join my Discord at https://discord.gg/CPpcxHpDpe and I'll help you with your setup :)
