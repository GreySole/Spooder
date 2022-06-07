
import React from 'react';
import ReactDOM from 'react-dom';
import {Monitor} from './Monitor.js';
import {EventTable} from './EventTable.js';
import {ConfigTab} from './ConfigTab.js';
import {PluginTab} from './PluginTab.js';
import {OSCTunnelTab} from './OSCTunnelTab.js';
import {EventSubTab} from './EventSubTab.js';
import OSC from 'osc-js';

//import logo from './logo.svg';
const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);

var username = "NOT LOGGED IN";

var hostIP = window.location.hostname;
var udpClients = {};
var plugins = [];
var hostPort = 3001;
var clientID = null;
var osc = null;

if(urlParams.get("host") != null){
	hostIP = urlParams.get("host");
}

window.sendOSC = (address, value) => {
	if(osc != null){
		osc.send(new OSC.Message(address, value));
	}
};

class App extends React.Component {

	constructor(props){
		super(props);
		console.log("APP CONSTRUCTING");
		this.getServerState()
		.then((data)=>{
			console.log(data);
			let serverData = data;
			hostPort = serverData.host.port;
			clientID = serverData.clientID;
			udpClients = serverData.osc["udp_clients"];
			plugins = serverData.osc["plugins"];
			console.log(serverData, udpClients);
			osc = new OSC({plugin: new OSC.WebsocketClientPlugin({host:serverData.osc.host,port:serverData.osc.port,secure:false})});
			this.initOSC();
			this.setState(Object.assign(this.state, {"host":hostPort}));
		})
		.catch(err => console.log(err))
	}
	
	state = {
		data: null
	}
	
	commandRef = React.createRef();
	configRef = React.createRef();
	monitorRef = React.createRef();
	pluginRef = React.createRef();
	oscTunnelRef = React.createRef();
	eventSubRef = React.createRef();
	
	selectTab = this.selectTab.bind(this);
	setTabContent = this.setTabContent.bind(this);

	componentDidMount(){
		this.setTabContent();
	}
	
	initOSC(){
		console.log("OPENING OSC");
		osc.open();
		osc.on("open", () =>{
			console.log("OSC OPEN");
			osc.send(new OSC.Message('/frontend/connect', 1.0));
		});
		osc.on('*', (message)=>{
			if(message.address.startsWith("/frontend")){
				console.log("I HEARD SOMETHING", message);
				if(this.state.tab == "monitor"){
					
					this.monitorRef.current.addMonitorLog(message);
				}
			}
		});
	}
	
	getServerState = async () => {
		const response = await fetch("/server_state");
		const serverStateRaw = await response.json();
		if(serverStateRaw.user != null &&
			serverStateRaw.user != ""){
				username = serverStateRaw.user;
			}
		
		hostPort = serverStateRaw.host.port;
		clientID = serverStateRaw.clientID;
		return serverStateRaw;
	}
	
	selectTab(e){
		console.log("TAB SELECT", e.target);
		document.querySelector(".tab-button.selected").classList.remove("selected");
		e.target.classList.add("selected");
		this.setTabContent();
	}
	
	setTabContent(){
		console.log("SET TAB CONTENT");
		let tab = document.querySelector(".tab-button.selected").name;
		this.setState(Object.assign(this.state, {"tab":tab}));
		switch(tab){
			case "monitor":
				ReactDOM.render(<Monitor ref={this.monitorRef}/>, document.getElementById("tabContent"));
			break;
			case "commands":
				this.loadCommandData();
			break;
			case "config":
				this.loadConfigData();
			break;
			case "plugins":
				this.loadPlugins();
			break;
			case "osctunnels":
				this.loadOSCTunnelData();
			break;
			case "eventsub":
				this.loadEventSubData();
			break;
		}
	}
	
	loadMonitor = () => {
		ReactDOM.render(<Monitor ref={this.monitorRef}/>, document.getElementById("tabContent"));
	}
	
	loadPlugins = async () => {
		const response = await fetch("/plugins");
		const pluginDataRaw = await response.json();
		//const pluginData = JSON.parse(pluginDataRaw);
		console.log("I GOT PLUGINS! ",pluginDataRaw);

		if(response.status !== 200){
			throw Error("Error: "+response.status);
		}
		ReactDOM.render(<PluginTab ref={this.pluginRef} data={pluginDataRaw} _udpClients={udpClients} />, document.getElementById("tabContent"));
	}
	
	loadConfigData = async () => {
		const response = await fetch("/server_config");
		const configDataRaw = await response.json();
		const configData = JSON.parse(configDataRaw.express);
		
		console.log("I GOT CONFIG! ",configData);
		
		var body = configData;

		if(response.status !== 200){
			throw Error(body.message);
		}
		ReactDOM.render(<ConfigTab ref={this.configRef} data={configData} />, document.getElementById("tabContent"));
	}
	
	loadConfigData = this.loadConfigData.bind(this);
	
	
	loadCommandData = async () => {
		const response = await fetch("/command_table");
		const commandDataRaw = await response.json();
		const commandData = JSON.parse(commandDataRaw.express);
		
		var body = commandData;

		if(response.status !== 200){
			throw Error(body.message);
		}

		ReactDOM.render(<EventTable ref={this.commandRef} data={commandData.events} groups={commandData.groups} _udpClients={udpClients} _plugins={plugins} />, document.getElementById("tabContent"));
	}
	
	loadCommandData = this.loadCommandData.bind(this);

	loadOSCTunnelData = async () => {
		const response = await fetch("/osc_tunnels");
		const tunnelData = await response.json();
		if(response.status !== 200){
			throw Error(tunnelData);
		}
		ReactDOM.render(<OSCTunnelTab ref={this.oscTunnelRef} data={tunnelData} _udpClients={udpClients} />, document.getElementById("tabContent"));
	}

	loadEventSubData = async () => {
		const response = await fetch("/eventsubs");
		const eventData = await response.json();
		
		if(response.status !== 200){
			throw Error(eventData);
		}
		ReactDOM.render(<EventSubTab ref={this.eventSubRef} data={eventData} _udpClients={udpClients} _plugins={plugins} />, document.getElementById("tabContent"));
	}
	
	render(){
		
		return(
			<div className="App">
				<div className="App-header">
					<h1 className="App-title">/╲/\( ºo ω oº )/\╱\</h1>
					<div className="login">
						<div className="account-info">{username}</div>
						<div className="login-buttons">
							<a href={"https://id.twitch.tv/oauth2/authorize?client_id="+clientID+"&redirect_uri=http://localhost:"+hostPort+"/handle&response_type=code&scope=chat:read chat:edit channel:read:goals bits:read channel:read:subscriptions moderation:read channel:read:redemptions channel:read:polls channel:read:predictions channel:read:hype_train"}>Authorize</a>
							<a href={"/revoke"}>Revoke</a>
						</div>
					</div>
				</div>
				<div className="App-content">
					<div className="navigation-tabs">
						<button type="button" name="monitor" className="tab-button selected" onClick={this.selectTab}>Deck</button>
						<button type="button" name="commands" className="tab-button" onClick={this.selectTab}>Events</button>
						<button type="button" name="plugins" className="tab-button" onClick={this.selectTab}>Plugins</button>
						<button type="button" name="osctunnels" className="tab-button" onClick={this.selectTab}>OSC Tunnels</button>
						<button type="button" name="eventsub" className="tab-button" onClick={this.selectTab}>EventSub</button>
						<button type="button" name="config" className="tab-button" onClick={this.selectTab}>Config</button>
					</div>
					<div id="tabContent">
						
					</div>
				</div>
			</div>
		);
	}
}
export default App;
