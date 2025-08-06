# Getting Started

## Windows

Get the Manager app on <a href="https://github.com/GreySole/SpooderInstallerSharp/releases/latest">Windows!</a> It has Node.js built in and will take care of installation for you. (Other platforms will be supported later. Linux is next.)

## Manual (Command line)

Requires Node v16.9.0 and up.

Use `npm install` to install Spooder's dependencies.

Finally use `npm run start` to start Spooder's web and OSC services.

Open Spooder's Web UI in your browser either by localhost:3000 or your local network address at port 3000.

### PM2 Recommended for running Spooder 24/7

Personally, I keep my Spooder running on my OrangePi with PM2. It can start Spooder at startup and auto restart when it crashes.
It's really easy to set up. Learn more at <a href="https://pm2.keymetrics.io/">PM2's Website</a>

# A Platform For Indie Stream Bots

If you ever thought about making your own custom bot. You can start here! This is a skeleton with the tools and building blocks to create your own stream features, and fast!

## Level 1

Spooder's Event system currently supports input from Twitch chat/events, OSC messages, and more to come. These can output to OSC, Discord, OBS, and Twitch chat.
Originally, this project was made to hook Twitch chat commands to OSC messages. You can set up multiple OSC servers to send on trigger. Control music/video software, VRChat parameters, anything that supports OSC can be made interactable this way.

## Level 2

Response scripts in the Event system can build responses and output them to Twitch chat. However, these scripts can do much more. They can store data, set timers, call APIs, and trigger other events. A cheat sheet is available above the code window on Response Commands.

## Level 3

You can go full on developer and create your own Node.js module that contains its own dependencies, register custom API endpoints, and serve 3 kinds of web pages. Overlay pages for your stream software, utility pages to interface with your plugin, and public pages for viewers to interact with. These plugins are exportable and installable to other Spooders.
As the owner of the plugin, you are free to distribute it however you wish. For free, for commission, or for storefronts. Sample plugin skeleton code is available and can be used to create plugins right in Spooder's WebUI.

# Host Publicly (WIP)

Public hosting isn't required to run Spooder, but it enables some cool features. The ModUI allows your moderators to lock events and plugins. They can even create chat commands themselves. The ShareUI allows your share clients to enable/disable commands you've shared with them. They can also create their own settings for plugins that support sharing. Public interfaces for plugins give you platform independent interactivity for your streams!

Access control secures each way to access Spooder publicly as follows:

- ModUI: Username and password
- ShareUI: Share key in URL
- PublicUI: Scopeless Twitch user token

Free public hosting through Ngrok is supported. The catch is that the URL is random each time you run Spooder. If you have a Discord app registered, you can make it auto post the new link to a channel of your choice. You can also set up your own reverse proxy and manually set it for your own domain. I have a reverse proxy service called Motherwolf that is not open to the public yet, but will provide an affordable, consistent subdomain to host with.

# Future Features

Spooder's integrations are modular on the backend and have 3 types of modules. Stream modules like Twitch, Community modules like Discord, and Control modules like OBS.
The big stuff I want to bring in next is a module for YouTube (Stream) and Telegram (Community). Perhaps xSplit can be an alternative Control module.

# Contributions Welcome!

Feel free to contribute by code, feedback, or support!

# Have Questions?

Join my Discord at https://discord.gg/CPpcxHpDpe and I'll help you with your setup :)
