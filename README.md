# Getting Started
Use `npm install` to install Spooder's dependencies.

Then use `npm run init` to initialize your Spooder's configuration.
Note: You will need app access credentials from dev.twitch.tv. Fill in the client ID and secret to authenticate.

Finally use `npm run start` to start Spooder's web and OSC services.

# User Authentication
Open Spooder's Web UI in your browser either by localhost:3000 or your local network address at port 3000.

Log into Twitch.tv as the broadcaster and click Authorize at the top right. Once done, Spooder will store your user access token and log you in to chat automatically unless you start Spooder with `npm run start-noautologin`.

Go to the EventSub tab and click "Save Current Oauth as Broadcaster." The broadcaster Oauth is used for pulling channel point custom rewards. Once done, you may log out of Twitch.tv and back in as a bot account. Then click authorize to store and use your bot's Oauth for chat if you wish.

# UDP Clients
One last necessity is the UDP clients. Those are machines with software listening for OSC like Resolume, Max, and Ableton. Define the IP and port of the machine, add to the clients list, and save your config. They should show up in the events tab for configuring software type commands.

# Creating Events
Events have two triggers. A chat command and channel point reward. Make sure to save your broadcaster oauth to link channel point rewards.

Commands:
Response - Write a script to build your bot's response to the trigger and return a string. Use the Verify Script button to ensure the script works. Red border means there's an error which will show in the console.

Plugin - Choose a plugin and event name to send the event data to. This will go through the plugin's onEvent function.

Software - Make sure you set up your udp machines in the Config tab. This command will send an OSC command to the specified address to the specified machine. "Timed" events send the OSC at valueOn until the set duration, then send the OSC at valueOff. "One Shot" events send valueOn and then valueOff immediately with the duration used as a cooldown instead.

# Creating/Managing Plugins
Plugins take in the same data Spooder's events do and how they work is entirely up to you. Check out the sample plugin repository to get started with making plugins. The Plugins tab in Spooder's Web UI can install plugins by uploading the plugin as a zip file. Once installed, you can configure the plugin's settings, upload assets to the plugin, and export the plugin. Note: Exported plugins will not include its assets folder.
Sample Plugin: https://github.com/GreySole/Spooder-Sample-Plugin

# OSC Tunnels
These tunnels simply listen for OSC from overlays or software and repeat them to another address. So that software like TouchOSC can control other devices or overlays.

# EventSubs
EventSubs require an https url to send events through. Enter it in the callback_url field and save before adding subscriptions. As Spooder is a LAN based application, you'll need a secure tunneling service like ngrok for a proper callback_url.

With the broadcaster username set in config and broadcaster oauth saved, you can subscribe to events with that broadcaster. 
Each subscription can be handled in any combination of ways like events. The only difference is being able to send event data straight to an overlay like an alertbox. Send to plugin doesn't have a field for event name as it is already named as the event subscribed (e.g. channel.follow).

channel.channel_points_custom_reward_redemption.add and update are needed to link custom rewards to Spooder events. That won't need any handler enabled on the EventSub tab.

# Developing Web UI
Use `npm run dev` to run Spooder in development mode. This sets the web UI's hosting port to 3001. In another shell, use `npm run start-front` to run the web UI's development server which will run on port 3000 like usual. Use `npm run build-front` to create an optimized build for the web UI. When built, Spooder can be started up normally with your changes to the web UI.

# Support The Project
If you find this tool useful, please consider supporting me and the project on KoFi. You'll get access to the latest dev updates and my personal plugins like the fox launcher :3
https://ko-fi.com/greyfursole
