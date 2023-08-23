import { Component } from 'react';
import './App.css';
import * as THREE from 'three';
import * as model from './assets/model.json';
import TwitchIcon from './icons/twitch-icon.svg';
import DiscordIcon from './icons/discord-icon.svg';
import DashedCircle from './icons/DashedCircle.svg';


class App extends Component {

	constructor(props){
		super(props);
		let urlParams = new URLSearchParams(window.location.search);

		this.state = {
			page:urlParams.get("twitchauthsuccess")!=null?"twitchmanage":"intro",
			prevPage:null,
			initialDataGet:false,
			config:{
				"bot": {
					"owner_name": "",
					"bot_name": "",
					"help_command": "",
					"introduction": ""
				},
				"network": {
					"host": "",
					"host_port": 3000,
					"externalhandle": "manual",
					"ngrokauthtoken": "",
					"external_http_url": "",
					"external_tcp_url": "",
					"udp_clients": {},
					"osc_udp_port": 9000,
					"osc_tcp_port": 3333
				}
			},
			twitch:{},
			discord:{},
			nextPage:{
				"intro":"restore",
				"scratch":"ngrok",
				"ngrok":"plugins",
				"plugins":"finish"
			},
			themes:{
				webui:{},
				"spooderpet": {
					"bigeyeleft": "o",
					"bigeyeright": "o",
					"littleeyeleft": "\u00ba",
					"littleeyeright": "\u00ba",
					"fangleft": " ",
					"fangright": " ",
					"mouth": "\u03c9",
					"colors": {
						"bigeyeleft": "white",
						"bigeyeright": "white",
						"littleeyeleft": "white",
						"littleeyeright": "white",
						"fangleft": "white",
						"fangright": "white",
						"mouth": "white"
					}
				},
				modui:{}
			}
		};
		this.nextPage = this.nextPage.bind(this);
		this.prevPage = this.prevPage.bind(this);

		this.setPage = this.setPage.bind(this);
		this.handleConfigChange = this.handleConfigChange.bind(this);
		this.handleTwitchChange = this.handleTwitchChange.bind(this);
		this.handleDiscordChange = this.handleDiscordChange.bind(this);
		this.getData = this.getData.bind(this);
	}

	componentDidMount(){
		var scene = new THREE.Scene();
		scene.background = new THREE.Color("hsl(200, 100%, 25%)");
		var camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 0.1, 1000 );
		camera.position.z = 15;
		var renderer = new THREE.WebGLRenderer();
		var loader = new THREE.ObjectLoader();
		var backgroundSphere = null;
		renderer.setSize(window.innerWidth, window.innerHeight);
		
		document.querySelector(".background3d").appendChild(renderer.domElement);
		
		loader.parse(model, (obj)=>{
			console.log("OBJ", obj);
			backgroundSphere = obj;
			scene.add(backgroundSphere);
			

			var animateBackground=()=>{
				backgroundSphere.rotation.y += 1/1000;
				requestAnimationFrame(animateBackground);
				renderer.render(scene, camera);
			}
			animateBackground();
		});

		window.addEventListener( 'resize', onWindowResize, false );

		function onWindowResize(){

			camera.aspect = window.innerWidth / window.innerHeight;
			camera.updateProjectionMatrix();

			renderer.setSize( window.innerWidth, window.innerHeight );
		}
		this.getData();
	}

	nextPage(e){
		this.setState(Object.assign(this.state, {page:this.state.nextPage[this.state.page]}));
	}

	prevPage(e){
		this.setState(Object.assign(this.state, {page:this.state.prevPage}));
	}

	setPage(page){
		this.setState(Object.assign(this.state, {page:page}));
	}

	handleConfigChange(e){
		let name = e.target.name.split("-");
		let newState = Object.assign({}, this.state.config);
		newState[name[0]][name[1]] = e.target.value;
		this.setState(Object.assign(this.state, {config:newState}));
	}

	handleTwitchChange(e){
		let newState = Object.assign({}, this.state.twitch);
		
		newState[e.target.name] = e.target.value;
		console.log(newState);
		this.setState(Object.assign(this.state, {twitch:newState}));
	}

	handleDiscordChange(e){
		let newState = Object.assign({}, this.state.discord);
		newState[e.target.name] = e.target.value;
		this.setState(Object.assign(this.state, {discord:newState}));
	}

	updateCustomSpooder(e){
		let newState = Object.assign({}, this.state.themes);
		newState["spooderpet"][e.target.name] = e.target.value;
		this.setState(Object.assign(this.state, {themes:newState}));
	}

	getData(){
		fetch("/init",{
			method:"GET",
			headers: {'Content-Type': 'application/json', 'Accept':'application/json'},
		})
		.then(response => response.json())
		.then(data=>{
			console.log("GOT DATA", data);
			if(data.config == null){
				data.config = {
					"bot": {
						"owner_name": "Grey",
						"bot_name": "Lon",
						"help_command": "help",
						"introduction": "The backstage banana spooder! Along with channel point rewards, I have many chat commands. Try !neonboi or !boop. Try !launch to shoot a fox across the screen!"
					},
					"network": {
						"host": "",
						"host_port": 3000,
						"externalhandle": "manual",
						"ngrokauthtoken": "",
						"external_http_url": "",
						"external_tcp_url": "",
						"udp_clients": {},
						"osc_udp_port": 9000,
						"osc_tcp_port": 3333
					}
				};
			}
			if(data.themes == null){
				data.themes = {
					webui:{},
					"spooderpet": {
						"bigeyeleft": "o",
						"bigeyeright": "o",
						"littleeyeleft": "\u00ba",
						"littleeyeright": "\u00ba",
						"fangleft": " ",
						"fangright": " ",
						"mouth": "\u03c9",
						"colors": {
							"bigeyeleft": "white",
							"bigeyeright": "white",
							"littleeyeleft": "white",
							"littleeyeright": "white",
							"fangleft": "white",
							"fangright": "white",
							"mouth": "white"
						}
					},
					modui:{}
				}
			}
			this.setState(Object.assign(this.state, {config:data.config, nets:data.nets, twitch:data.twitch, twitch_user:data.twitch_user, discord:data.discord, themes:data.themes, initialDataGet:true}));
		})
	}
	
	saveConfig(){
		return new Promise((res, rej) => {
			fetch("/save_config",{
				method:"POST",
				headers: {'Content-Type': 'application/json', 'Accept':'application/json'},
				body:JSON.stringify(this.state.config)
			})
			.then(response => response.json())
			.then(data => {
				res(data);
			}).catch(e=>{
				rej(e);
			})
		})
	}

	saveTwitch(){
		console.log(this.state.twitch);
		return new Promise((res, rej) => {
			fetch("/save_twitch",{
				method:"POST",
				headers: {'Content-Type': 'application/json', 'Accept':'application/json'},
				body:JSON.stringify(this.state.twitch)
			})
			.then(response => response.json())
			.then(data => {
				res(data);
			}).catch(e=>{
				rej(e);
			})
		})
	}

	saveDiscord(){
		console.log(this.state.discord);
		return new Promise((res, rej) => {
			fetch("/discord/saveDiscordConfig",{
				method:"POST",
				headers: {'Content-Type': 'application/json', 'Accept':'application/json'},
				body:JSON.stringify(this.state.discord)
			})
			.then(response => response.json())
			.then(data => {
				res(data);
			}).catch(e=>{
				rej(e);
			})
		})
	}

	getPlatformResponse(){
		let userAgent = window.navigator.userAgentData.brands;
		for(let u in userAgent){
			switch(userAgent[u].brand){
				case "Google Chrome":
					return "Everything's made of Chrome in the future :3";
				case "Mozilla Firefox":
					return "Fun fact: Firefox is a hot dog that can cook hot dogs :3";
				case "Microsoft Edge":
					return "Did you know that one Edge window contains 4 edges? :3"
				case "Apple Safari":
					return "Imagine, surfing on Apple sauce :3"
				case "Opera":
					return "Kudos if you can sing Opera :3"
				case "Samsung Internet":
					return "What sort of song did Samsung sing? :3"
				default:
					return " :3"
			}
		}
	}

	getWebPorts(){
		console.log(this.state.nets);
		let options = [];
		for(let n in this.state.nets){
			for(let i in this.state.nets[n]){
				options.push(<option value={this.state.nets[n][i]}>{n} : {this.state.nets[n][i]}</option>)
			}
			
		}
		options.push(<option value={"0.0.0.0"}>Anywhere : 0.0.0.0</option>);
		return options;
	}

	handleUploadClick(e){
		let fileInput = document.querySelector("#input-file-backup");
		fileInput.click();
	}

	restoreFromFile(e){
		let fd = new FormData();
		console.log("GET FILE", e.target.files);
		fd.append('file', e.target.files[0]);

		const requestOptions = {
			method: 'POST',
			body: fd
		};
		fetch("/restore_settings", requestOptions);
	}

	copyTokensToBroadcaster(e){
		fetch("/twitch/save_auth_to_broadcaster")
		.then(this.getData());
	}

	render(){

		let formPages = {
			intro:<div key="intro" className="init-form">
				<div className="content centered">
					<button onClick={()=>{this.setPage("backup")}}>Hi :)</button>
				</div>
			</div>,
			backup:<div key="backup" className="init-form">
				<div className="content horizontal">
					<button onClick={this.handleUploadClick}>Restore From Backup</button>
					<input type='file' id='input-file-backup' onChange={this.restoreFromFile.bind(this)} style={{ display: 'none' }} />
					<button onClick={()=>{this.setPage("scratch")}}>Start From Scratch</button>
				</div>
			</div>,
			restore:<div key="restore" className="init-form">

			</div>,
			scratch:<div key="scratch" className="init-form">
				<div className="content">
					<div className="custom-spooder-ui">
						<div className="custom-spooder-inputs">
							<div className="custom-spooder-pair"><div className="custom-spooder-label">Little Eye Left</div>
								<input type="text" name="littleeyeleft" onChange={this.updateCustomSpooder} defaultValue={this.state.themes.spooderpet.littleeyeleft}/>
								<input type="color" name="littleeyeleft" onChange={this.updateCustomSpooder} defaultValue={this.state.themes.spooderpet.colors.littleeyeleft}/>
							</div>
							<div className="custom-spooder-pair"><div className="custom-spooder-label">Big Eye Left</div>
								<input type="text" name="bigeyeleft" onChange={this.updateCustomSpooder} defaultValue={this.state.themes.spooderpet.bigeyeleft}/>
								<input type="color" name="bigeyeleft" onChange={this.updateCustomSpooder} defaultValue={this.state.themes.spooderpet.colors.bigeyeleft}/>
							</div>
							<div className="custom-spooder-pair"><div className="custom-spooder-label">Fang Left</div>
								<input type="text" name="fangleft" onChange={this.updateCustomSpooder} defaultValue={this.state.themes.spooderpet.fangleft}/>
								<input type="color" name="fangleft" onChange={this.updateCustomSpooder} defaultValue={this.state.themes.spooderpet.colors.fangleft}/>
							</div>
							<div className="custom-spooder-pair"><div className="custom-spooder-label">Mouth</div>
								<input type="text" name="mouth" onChange={this.updateCustomSpooder} defaultValue={this.state.themes.spooderpet.mouth}/>
								<input type="color" name="mouth" onChange={this.updateCustomSpooder} defaultValue={this.state.themes.spooderpet.colors.mouth}/>
							</div>
							<div className="custom-spooder-pair"><div className="custom-spooder-label">Fang Right</div>
								<input type="text" name="fangright" onChange={this.updateCustomSpooder} defaultValue={this.state.themes.spooderpet.fangright}/>
								<input type="color" name="fangright" onChange={this.updateCustomSpooder} defaultValue={this.state.themes.spooderpet.colors.fangright}/>
							</div>
							<div className="custom-spooder-pair"><div className="custom-spooder-label">Big Eye Right</div>
								<input type="text" name="bigeyeright" onChange={this.updateCustomSpooder} defaultValue={this.state.themes.spooderpet.bigeyeright}/>
								<input type="color" name="bigeyeright" onChange={this.updateCustomSpooder} defaultValue={this.state.themes.spooderpet.colors.bigeyeright}/>
							</div>
							<div className="custom-spooder-pair"><div className="custom-spooder-label">Little Eye Right</div>
								<input type="text" name="littleeyeright" onChange={this.updateCustomSpooder} defaultValue={this.state.themes.spooderpet.littleeyeright}/>
								<input type="color" name="littleeyeright" onChange={this.updateCustomSpooder} defaultValue={this.state.themes.spooderpet.colors.littleeyeright}/>
							</div>
							<div className="custom-spooder-pair"><div className="custom-spooder-label">Body Color</div>
								<input type="color" name="body" onChange={this.updateCustomSpooder} defaultValue={this.state.themes.spooderpet.colors.body}/>
							</div>
							<div className="custom-spooder-pair"><div className="custom-spooder-label">Short Legs Color</div>
								<input type="color" name="shortlegs" onChange={this.updateCustomSpooder} defaultValue={this.state.themes.spooderpet.colors.shortlegs}/>
							</div>
							<div className="custom-spooder-pair"><div className="custom-spooder-label">Long Legs Color</div>
								<input type="color" name="longlegs" onChange={this.updateCustomSpooder} defaultValue={this.state.themes.spooderpet.colors.longlegs}/>
							</div>
						</div>
					</div>
					<label>My Name
						<input type="text" name="bot-bot_name" defaultValue={this.state.config.bot.bot_name} onChange={this.handleConfigChange}/>
					</label>
					<label>Your Name
						<input type="text" name="bot-owner_name" defaultValue={this.state.config.bot.owner_name} onChange={this.handleConfigChange}/>
					</label>
					<label>OSC IP Address
						
						<select name="network-host_port" defaultValue={this.state.config.network.host_port} onChange={this.handleConfigChange}>
							{this.getWebPorts()}
						</select>
					</label>

					<label>WebUI Host Port
						<input type="text" name="network-host_port" defaultValue={this.state.config.network.host_port} onChange={this.handleConfigChange}/>
					</label>
					<label>OSC TCP Port
						<input type="text" name="network-osc_tcp_port" defaultValue={this.state.config.network.osc_tcp_port} onChange={this.handleConfigChange}/>
					</label>
					<label>OSC UDP Port
						<input type="text" name="network-osc_udp_port" defaultValue={this.state.config.network.osc_udp_port} onChange={this.handleConfigChange}/>
					</label>
				</div>
				<div className="footer">
					<button onClick={()=>{this.saveConfig().then(d=>this.setPage("wan"))}}>Save</button>
				</div>
				
			</div>,
			wan:<div key="wan" className="init-form">
				<div className="content horizontal centered">
					<button onClick={()=>{this.setPage("ngrok")}}>Yes</button>
					<button onClick={()=>{this.setPage("overworld")}}>No</button>
				</div>
			</div>,
			ngrok:<div key="ngrok" className="init-form">
				<div className="content">
					<label>Proxy Handler
						<select name="network-externalhandle" defaultValue={this.state.config.network.externalhandle} onChange={this.handleConfigChange}>
							<option value="ngrok">Ngrok</option>
							<option value="manual">Manual</option>
						</select>
					</label>
					
					{this.state.config.network.externalhandle=="ngrok"?<label>Ngrok Auth Token
						<input type="text" name="network-ngrokauthtoken" defaultValue={this.state.config.network.ngrokauthtoken} placeholder="Ngrok Auth Token..." onChange={this.handleConfigChange}/>
					</label>:<label>
						<label>HTTPS URL
							<input type="text" name="network-external_http_url" defaultValue={this.state.config.network.external_http_url} placeholder="Web access url..." onChange={this.handleConfigChange}/>
						</label>
						<label>OSC Websocket URL
							<input type="text" name="network-external_tcp_url" defaultValue={this.state.config.network.external_tcp_url} placeholder="OSC websocket url..." onChange={this.handleConfigChange}/>
						</label>
					</label>}
				</div>
			</div>,
			overworld:<div key="overworld" className="overworld-form">
				<div className="content horizontal centered">
					<button onClick={()=>this.setPage("twitch")}><img height="50px" src={TwitchIcon}/>Twitch</button>
					<button onClick={()=>this.setPage("discord")}><img height="50px" src={DiscordIcon}/>Discord</button>
				</div>
			</div>,
			twitch:<div key="twitch" className="init-form">
				<div className="content">
					<label>Client ID
						<input type="text" name="client-id" defaultValue={this.state.twitch["client-id"]} placeholder="From dev.twitch.tv" onChange={this.handleTwitchChange}/>
					</label>
					<label>Client Secret
						<input type="text" name="client-secret" defaultValue={this.state.twitch["client-secret"]} placeholder="From dev.twitch.tv" onChange={this.handleTwitchChange}/>
					</label>
				</div>
				<div className="footer">
					<button onClick={()=>{this.saveTwitch().then(d=>this.setPage("twitchauth"))}}>Save</button>
				</div>
			</div>,
			twitchauth:<div key="twitchauth" className="init-form">
					<div className="content centered">
						<button disabled={window.location.hostname!="localhost"||this.state.twitch["client-id"]==null||this.state.twitch["client-id"]==""}><a className={window.location.hostname!="localhost"||this.state.twitch["client-id"]==null||this.state.twitch["client-id"]==""?"disabled":""} 
						key={this.state.twitch["client-id"]+this.state.twitch["client-secret"]} 
						href={"https://id.twitch.tv/oauth2/authorize?client_id="+this.state.twitch["client-id"]+"&redirect_uri=http://localhost:"+this.state.config.network.host_port+"/twitch/authorize&response_type=code&scope="+this.scopes.join(" ")}>Authorize</a></button>
					</div>
				</div>,
			twitchmanage:<div key="twitchmanage" className="twitchmanage-form">
				<div className="content">
					<div className="twitch-bot">
						<label>CHAT BOT</label>
						<div className="twitch-pfp"><img height="200px" src={this.state.twitch_user?.botUser!=null?this.state.twitch_user?.botUser[0].profile_image_url:null}/></div>
						<div className="twitch-username">{this.state.twitch_user?.botUser!=null?this.state.twitch_user?.botUser[0].display_name : ""}</div>
						<label style={{display:'block', width:"200px"}}>You may log out of Twitch and back in as another account to authorize it for your chat bot.</label>
						<button disabled={window.location.hostname!="localhost"||this.state.twitch["client-id"]==null||this.state.twitch["client-id"]==""}><a className={window.location.hostname!="localhost"||this.state.twitch["client-id"]==null||this.state.twitch["client-id"]==""?"disabled":""} 
						key={this.state.twitch["client-id"]+this.state.twitch["client-secret"]} 
						href={"https://id.twitch.tv/oauth2/authorize?client_id="+this.state.twitch["client-id"]+"&redirect_uri=http://localhost:"+this.state.config.network.host_port+"/twitch/authorize&response_type=code&scope="+this.scopes.join(" ")}>Authorize</a></button>
					</div>
					<div className="twitch-broadcaster">
						<label>BROADCASTER</label>
						<div className="twitch-pfp"><img height="200px" src={this.state.twitch_user?.broadcasterUser!=null?this.state.twitch_user?.broadcasterUser[0].profile_image_url:null}/></div>
						<div className="twitch-username">{this.state.twitch_user?.broadcasterUser!=null?this.state.twitch_user?.broadcasterUser[0].display_name : ""}</div>
						<label style={{display:'block', width:"200px"}}>Copy the chat bot auth tokens to replace the broadcaster.</label>
						<button onClick={this.copyTokensToBroadcaster.bind(this)} disabled={window.location.hostname!="localhost"||this.state.twitch["client-id"]==null||this.state.twitch["client-id"]==""}>Copy</button>
					</div>
				</div>
				<div className="footer">
					<button onClick={()=>this.setPage("wan")}>Ok</button>
				</div>
			</div>,
			discord:<div key="discord" className="discord-form">
				<div className="content">
					<label>Master User ID
						<input type="text" name="discord-master" defaultValue={this.state.discord["master"]} onChange={this.handleTwitchChange}/>
					</label>
					<label>Bot Token
						<input type="text" name="discord-token" defaultValue={this.state.discord["token"]} onChange={this.handleTwitchChange}/>
					</label>
					<label>Client ID
						<input type="text" name="discord-clientId" defaultValue={this.state.discord["clientId"]} onChange={this.handleTwitchChange}/>
					</label>
				</div>
				<div className="footer">
					<button onClick={()=>this.setPage("overworld")}>Back</button>
					<button onClick={()=>this.setPage("overworld")}>Save</button>
				</div>
			</div>
		}

		let instructionPages = {
			intro:<span>Hi, I'm your Spooder!</span>,
			backup:<span>Who am I? 🤔</span>,
			scratch:<span>{this.getPlatformResponse()}</span>,

			twitch:window.location.hostname=="localhost"?
			<span>We'll need some app credentials from your <a href="https://dev.twitch.tv">Twitch Developer Console</a>. Sign up, create an app, and grab the client ID and client secret.</span>
			:<span>Oh no, you're not on localhost. You need to access this UI on the same machine Spooder is running to authorize your Twitch account(s). You can set this up after initializing
				if you want. Click Next to continue.
			</span>,
			twitchauth:<span>Alright, now click this link to authorize</span>,
			wan:<span>Would you like this Spooder to be accessible on the internet? You'll need this to receive Twitch events.</span>,
			ngrok:this.state.config.network.externalhandle=="ngrok"?<span>Internet access enables webhooks, overlay sharing, and web access (Public-UI and Mod-UI only).<br/> Create a free account on <a target='_blank' href="https://ngrok.io">Ngrok</a> and paste your API key here.</span>
			:<span>Internet access enables webhooks, overlay sharing, and web access (Public-UI and Mod-UI only).<br/> Set 2 https endpoints for webpages and for websockets.</span>,
			discord:<span>Integrating Discord enables share notifications, share commands, crash reports, and plugins with Discord support.<br/><br/>⚠️ Enable Developer Mode on Discord to right-click copy User IDs.</span>,
			overworld:<span>Choose an integration to set up. </span>,
			finish:<span>I'm all set! Now close Spooder and start normally with 'npm run start'. You can back up your settings on the Config tab 🙂</span>
		};

		return (
			<div className="App">
				<div className="not-background">
					<div className="main-body">
						<div className="header">
							<div className="logo">
								<span style={{color:this.state.themes?.spooderpet.colors.longlegs}}>/</span>
								<span style={{color:this.state.themes?.spooderpet.colors.longlegs}}>╲</span>
								<span style={{color:this.state.themes?.spooderpet.colors.shortlegs}}>/</span>
								<span style={{color:this.state.themes?.spooderpet.colors.shortlegs}}>\</span>
								<span style={{color:this.state.themes?.spooderpet.colors.body}}>(</span>
								<span> </span>
								<span style={{color:this.state.themes?.spooderpet.colors.littleeyeleft}}>{this.state.themes?.spooderpet.littleeyeleft}</span>
								<span style={{color:this.state.themes?.spooderpet.colors.bigeyeleft}}>{this.state.themes?.spooderpet.bigeyeleft}</span>
								<span style={{color:this.state.themes?.spooderpet.colors.fangleft}}>{this.state.themes?.spooderpet.fangleft}</span>
								<span style={{color:this.state.themes?.spooderpet.colors.mouth}}>{this.state.themes?.spooderpet.mouth}</span>
								<span style={{color:this.state.themes?.spooderpet.colors.fangright}}>{this.state.themes?.spooderpet.fangright}</span>
								<span style={{color:this.state.themes?.spooderpet.colors.bigeyeright}}>{this.state.themes?.spooderpet.bigeyeright}</span>
								<span style={{color:this.state.themes?.spooderpet.colors.littleeyeright}}>{this.state.themes?.spooderpet.littleeyeright}</span>
								<span> </span>
								<span style={{color:this.state.themes?.spooderpet.colors.body}}>)</span>
								<span style={{color:this.state.themes?.spooderpet.colors.shortlegs}}>/</span>
								<span style={{color:this.state.themes?.spooderpet.colors.shortlegs}}>\</span>
								<span style={{color:this.state.themes?.spooderpet.colors.longlegs}}>╱</span>
								<span style={{color:this.state.themes?.spooderpet.colors.longlegs}}>\</span>
							</div>
							<div className="instruction">
								{instructionPages[this.state.page]}
							</div>
						</div>
						{formPages[this.state.page]}
					</div>
				</div>
				<div className="background3d">
				</div>
			</div>
		);
	}

	scopes = [
		'channel:moderate',
		'chat:read',
		'chat:edit', 
		'whispers:read', 
		'whispers:edit', 
		'analytics:read:extensions', 
		'analytics:read:games', 
		'bits:read', 
		'channel:edit:commercial', 
		'channel:manage:broadcast', 
		'channel:read:charity', 
		'channel:manage:extensions', 
		'channel:manage:moderators', 
		'channel:manage:polls', 
		'channel:manage:predictions', 
		'channel:manage:raids', 
		'channel:manage:redemptions', 
		'channel:manage:schedule', 
		'channel:manage:videos', 
		'channel:read:editors', 
		'channel:read:goals', 
		'channel:read:hype_train', 
		'channel:read:polls', 
		'channel:read:predictions', 
		'channel:read:redemptions', 
		'channel:read:stream_key', 
		'channel:read:subscriptions', 
		'channel:read:vips', 
		'channel:manage:vips', 
		'clips:edit', 
		'moderation:read', 
		'moderator:manage:announcements', 
		'moderator:manage:automod',
		'moderator:read:automod_settings', 
		'moderator:manage:automod_settings', 
		'moderator:manage:banned_users', 
		'moderator:read:blocked_terms',
		'moderator:manage:chat_messages',
		'moderator:read:chat_settings',
		'moderator:manage:chat_settings',
		'moderator:read:chatters',
		'moderator:read:followers',
		'moderator:read:shield_mode',
		'moderator:manage:shield_mode',
		'user:edit',
		'user:manage:blocked_users',
		'user:read:blocked_users',
		'user:read:broadcast',
		'user:manage:chat_color',
		'user:read:email',
		'user:read:follows',
		'user:read:subscriptions',
		'user:manage:whispers'
	   ];
	   
}
export default App;
