import React from 'react';
import OBSWebSocket from 'obs-websocket-js';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faCircle, faStream, faColumns, faArrowRight, faTv} from '@fortawesome/free-solid-svg-icons';
import BoolSwitch from './BoolSwitch.js';

var statInterval = null;
var obsConnected = false;
const obs = new OBSWebSocket();

var skippedFrames = 0;
var skippedFramesCount = 0;

obs.on('SwitchScenes', data => {
	console.log(`New Active Scene: ${data.sceneName}`);
});

obs.on('StudioModeSwitched', data=>{
	window.setClass(document.querySelector(".obs-transition-mode"), "active", data['new-state']);
});

obs.on('error', err => {
	console.error('socket error:', err);
});


class Monitor extends React.Component{
	constructor(props){
		super(props);

		this.state = {logs:[], scenes:{}, obs:{
			ip:localStorage.getItem("obs-ip"),
			port:localStorage.getItem("obs-port"),
			password:localStorage.getItem("obs-password")
		}};
		this.addMonitorLog = this.addMonitorLog.bind(this);
		this.obsRemoteConnect = this.obsRemoteConnect.bind(this);
		this.obsRemoteDisconnect = this.obsRemoteDisconnect.bind(this);
		this.obsSubmitForm = this.obsSubmitForm.bind(this);
	}
	
	componentWillUnmount() {
		clearInterval(statInterval);
	}
	
	cloneArray(arr){
		let newArr = [];
		for(let a in arr){
			newArr.push(arr[a]);
		}
		return newArr;
	}
	
	addMonitorLog(message){
		
		let newLogs = this.cloneArray(this.state.logs);
		if(newLogs.length > 25){
			newLogs.splice(0,1);
		}
		if(message.address == "/frontend/monitor"){
			let messageArgs = JSON.parse(message.args[0]);
			newLogs.push({
				"types":messageArgs.types,
				"address":messageArgs.address,
				"args":messageArgs.content
			});
		}else{
			newLogs.push(message);
		}
		
		this.setState(Object.assign(this.state, {"logs":newLogs}));
		
	}

	obsSubmitForm(e){
		let obsIP = document.querySelector(".obs-remote-title input[name='obs-ip']").value;
		let obsPort = document.querySelector(".obs-remote-title input[name='obs-port']").value;
		let obsPassword = document.querySelector(".obs-remote-title input[name='obs-password']").value;
		let obsRemember = document.querySelector(".obs-remote-title input[name='obs-remember']").checked;
		console.log("OBS REMEMBER", obsRemember);
		if(obsRemember){
			localStorage.setItem("obs-ip", obsIP);
			localStorage.setItem("obs-port",obsPort);
			localStorage.setItem("obs-password",obsPassword);
		}

		this.setState(Object.assign(this.state, {obs:{
			ip:obsIP,
			port:obsPort,
			password:obsPassword
		}}));
	}
	
	obsRemoteConnect(){
		
		obs.connect({
			address: this.state.obs.ip+":"+this.state.obs.port,
			password: this.state.obs.password
		})
		.then(() => {
			obsConnected = true;
			console.log(`Success! We're connected & authenticated.`);
			
			obs.send('GetSceneList').then(data => {
				console.log("SCENE LIST", data);
				this.setState(Object.assign(this.state, {"scenes":data.scenes, "currentScene":data.currentScene}));
				window.radioClass("selected", ".scene-button", document.querySelector(".scene-button[name='"+this.state.currentScene+"']"));
				console.log(this.state);
			});
			statInterval = setInterval(function(){
				obs.send('GetStreamingStatus').then(data => {
					console.log("Streaming Status", data);
					window.setClass(window.$(".obs-stream"), "streaming", data.streaming);
					window.setClass(window.$(".obs-record"), "recording", data.recording);
				});
				obs.send('GetStats').then(data => {
					console.log("STATS", data);
					window.$(".obs-monitor-cpu").textContent = "CPU: "+Math.floor(data.stats["cpu-usage"])+"%";
					window.$(".obs-monitor-frames-fps").textContent = "FPS: "+Math.floor(data.stats["fps"]);
					window.$(".obs-monitor-frames-outputtotal").textContent = "Total Out: "+Math.floor(data.stats["output-total-frames"]);
					window.$(".obs-monitor-frames-outputskipped").textContent = "Total Skipped: "+Math.floor(data.stats["output-skipped-frames"]);
					window.$(".obs-monitor-freespace").textContent = "HDD: "+Math.round(data.stats["free-disk-space"]/1024)+"GB";

					if(Math.floor(data.stats["output-skipped-frames"]) > skippedFrames){
						skippedFrames = Math.floor(data.stats["output-skipped-frames"]);
						skippedFramesCount++;
						if(skippedFramesCount >= 3){
							window.sendOSC("/spooder/alert", JSON.stringify({icon:"urgent", text:"OBS is skipping frames and climbing!"}));
							skippedFramesCount = -3;
						}
					}
					
					
				})
				.catch(err => { // Promise convention dicates you have a catch on every chain.
					console.log(err);
					
				});
			}, 2000);
		}).catch(err => {
			console.log("ERROR RESETTING STATE");
			this.setState(Object.assign(this.state, {obs:{
				ip:null,
				port:null,
				password:null
			}}));
		})
	}

	obsRemoteDisconnect(){
		obs.disconnect();
		clearInterval(statInterval);
		statInterval = null;
		localStorage.removeItem("obs-ip");
		localStorage.removeItem("obs-port");
		localStorage.removeItem("obs-password");
		this.setState(Object.assign(this.state, {obs:{
			ip:null,
			port:null,
			password:null
		}}));
	}
	
	obsRemoteClick(data){
		console.log("COMMAND", data);
		let command = Object.keys(data)[0];
		obs.send(command, data[command]);
		
	}
	
	render(){

		console.log(this.state, obsConnected);
		if(this.state.obs.ip !== null && obsConnected === false){
			console.log("CONNECTING TO OBS")
			this.obsRemoteConnect();
		}
		
		let oscLogs = this.cloneArray(this.state.logs);
		let oscLogDivs = [];
		
		for(let o in oscLogs){
			oscLogDivs.push(
				<div className="monitor-log-div" key={o}>
					<div className="monitor-log type">{oscLogs[o].types}</div>
					<div className="monitor-log address">{oscLogs[o].address}</div>
					<div className="monitor-log args">{oscLogs[o].args}</div>
				</div>
			);
		}
		
		let obsScenes = this.state.scenes;
		let obsSceneButtons = [];
		for(let s in obsScenes){
			obsSceneButtons.push(
				<div className="obs-button scene-button" key={obsScenes[s].name} name={obsScenes[s].name} onClick={()=>{
					window.radioClass("selected", ".scene-button", document.querySelector(".scene-button[name='"+obsScenes[s].name+"']"));
					this.obsRemoteClick({"SetCurrentScene":{'scene-name':obsScenes[s].name}})}}>
					<label>
						{obsScenes[s].name}
					</label>
					
					<FontAwesomeIcon icon={faTv} size="2x" />
				</div>
			);
		}

		let obsSettings = this.state.obs.ip == null ? 
		[<div className="obs-remote-settings">
			<label>
				Host:
				<input type="text" name="obs-ip" placeholder="IP of OBS machine" /> 
			</label>
			<label>
				Port:
				<input type="text" name="obs-port" placeholder="Port of OBS machine" /> 
			</label>
			<label>
				Password:
				<input type="password" name="obs-password" placeholder="Password of OBS machine" /> 
			</label>
			<div className="obs-remember-div boolswitch-div">
				Remember:
				<BoolSwitch name="obs-remember" />
			</div>
			<button className="obs-connect-button" onClick={this.obsSubmitForm}>Connect</button>
		</div>]:<div className="obs-remote-status"><label>Connected to {this.state.obs.ip}</label><button className="obs-disconnect-button" onClick={this.obsRemoteDisconnect}>Disconnect</button></div>
		
		return(
			<div className="monitor-container">
				<div className="obs-remote-title">OBS Remote 
					{obsSettings}
				</div>
				<div className='stream-container'>
					<div className="obs-remote">
						
						<div className="obs-stream obs-button" onClick={()=>{this.obsRemoteClick({"StartStopStreaming":{}})}}>
							<label>
								Stream
							</label>
							<FontAwesomeIcon icon={faStream} size="2x" />
						</div>
						<div className="obs-record obs-button" onClick={()=>{this.obsRemoteClick({"StartStopRecording":{}})}}>
							<label>
								Record
							</label>
							<FontAwesomeIcon icon={faCircle} size="2x" />
						</div>
						<div className="obs-transition-mode obs-button" onClick={()=>{this.obsRemoteClick({"ToggleStudioMode":{}})}}>
							<label>
								Studio Mode
							</label>
							<FontAwesomeIcon icon={faColumns} size="2x"/>
						</div>
						<div className="obs-transition obs-button" onClick={()=>{this.obsRemoteClick({"TransitionToProgram":{}})}}>
							<label>
								Transition
							</label>
							
							<FontAwesomeIcon icon={faArrowRight} size="2x" />
						</div>
					</div>
					
				</div>
				<div className="obs-scenes">
					{obsSceneButtons}
				</div>
				<div className="obs-monitor">
					<div className="obs-monitor-cpu">CPU
					</div>
					<div className="obs-monitor-frames">
						<div className="obs-monitor-frames-fps"></div>
						<div className="obs-monitor-frames-outputtotal"></div>
						<div className="obs-monitor-frames-outputskipped"></div>
					</div>
					<div className="obs-monitor-freespace">HDD
					</div>
				</div>
				<div className="osc-monitor">
					<div className="osc-monitor-title">OSC Monitor</div>
					<div id="monitorLog" className="monitor-logger">
						{oscLogDivs}
					</div>
				</div>
			</div>
		);
	}
}

export {Monitor};