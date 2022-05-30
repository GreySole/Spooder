import React from 'react';
import BoolSwitch from './BoolSwitch.js';

var _udpClients = {};
var _plugins = [];
var authMessageHidden = false;

class EventSubTab extends React.Component{

	

	constructor(props){
		super(props);
		console.log(props.udpClients);
		this.state = Object.assign(props.data);
		_udpClients = Object.assign(props._udpClients);
		_plugins = Object.assign(props._plugins);
		authMessageHidden = localStorage.getItem("authMessageHidden")!=null?localStorage.getItem("authMessageHidden"):false;
		
		this.handleChange = this.handleChange.bind(this);
		this.saveEventSubs = this.saveEventSubs.bind(this);
		this.getEventSubs();
	}

	componentDidMount(){
		console.log("AUTH MESSAGE", authMessageHidden);
		window.setClass(document.querySelector("#authMessage"), "hidden", authMessageHidden);
	}

	
	
	handleChange(s){
		
		let name = s.target.name.split("-");
		let eventname = s.target.getAttribute("eventname");
		let value = s.target.value;

		if(s.target.type == "checkbox"){
			value = s.target.checked;
		}

		console.log(name, eventname, value);

		if(!eventname){
			let newConfig = Object.assign(this.state);
			newConfig[name] = value;
			this.setState(newConfig);
		}else{
			let newEvents = Object.assign(this.state.events);
			newEvents[eventname][name[0]][name[1]] = value;

			this.setState(Object.assign(this.state, {"events":newEvents}));
		}
	}

	verifyResponseScript(e){
		e.preventDefault();
		let parentEl = e.target.closest(".config-variable-ui");
		let responseEl = parentEl.querySelector("[name='chat-message']");
		let responseScript = responseEl.value;

		let testEvent = {
			user_id: '14764422',
			user_login: 'testFromUser',
			user_name: 'testFromUser',
			broadcaster_user_id: '87215513',
			broadcaster_user_login: '87215513',
			broadcaster_user_name: 'testBroadcaster',
			followed_at: '2022-05-05T17:15:55.5713334Z'
		  };

		try{
			let responseFunct = eval("() => { let event = "+JSON.stringify(testEvent)+"; "+responseScript.replace(/\n/g, "")+"}");
			let response = responseFunct();
			console.log("SCRIPT RAN SUCCESSFULLY:",response);
			window.setClass(responseEl, "verified", true);
			window.setClass(responseEl, "failed", false);
		}catch(e){
			console.log("SCRIPT FAILED", e);
			window.setClass(responseEl, "verified", false);
			window.setClass(responseEl, "failed", true);
		}
		
		
		console.log(responseScript);
	}
	
	saveEventSubs(){
		let newList = Object.assign(this.state);
		delete newList["eventsub"];
		
		const requestOptions = {
			method: 'POST',
			headers: {'Content-Type': 'application/json', 'Accept':'application/json'},
			body: JSON.stringify(newList)
		};
		console.log(requestOptions);
		fetch('/saveEventSubs', requestOptions)
		.then(response => response.json())
		.then(data => {
			if(data.status == "SAVE SUCCESS"){
				document.querySelector("#saveStatusText").textContent = "Save success!";
				setTimeout(()=>{
					document.querySelector("#saveStatusText").textContent = "";
				}, 5000)
			}else{
				document.querySelector("#saveStatusText").textContent = "Error: "+data.status;
			}
		});
	}

	getEventSubs = async() => {

		let eventsubsRaw = await fetch('/get_eventsub')
		.then(response => response.json());
		let eventsubs = eventsubsRaw.data;
		
		let newEventState = {};
		console.log(newEventState);
		for(let e in eventsubs){
			if(newEventState[eventsubs[e].type] == null){
				newEventState[eventsubs[e].type] = [];
			}

			newEventState[eventsubs[e].type].push(eventsubs[e]);
			
		}

		this.setState(Object.assign(this.state, {"eventsub":newEventState}));
		console.log(this.state);
	}

	initEventSub = async(e) => {
		let eventType = document.querySelector("#event-sub-add select").value;
		if(eventType == null){return;}
		let eventSub = await fetch('/init_followsub?type='+eventType)
		.then(response => response.json());
		console.log(eventSub);
		document.querySelector("#eventSubAddStatus").textContent = eventSub.status;
		setTimeout(function(){
			document.querySelector("#eventSubAddStatus").textContent = "";
		}, 3000);
		this.getEventSubs();
	}

	deleteEventSub = async(e) => {
		e.preventDefault();
		let followSub = await fetch('/delete_eventsub?id='+e.target.getAttribute("subid"))
		.then(response => response.json());
		console.log(followSub);

		this.getEventSubs();
	}

	async saveAuthToBroadcaster(){
		let confirmation = window.confirm("This will store your current oauth as broadcaster. This will not overwrite your current oauth. Ok?");
		if (confirmation == false) { return; }
		
		let saveStatus = await fetch('/save_auth_to_broadcaster')
		.then(response => response.json());
		
		console.log("DONE", saveStatus);
	}
	
	hideAuthMessage(e){
		let isHidden = window.toggleClass(document.querySelector("#authMessage"), "hidden");
		if(isHidden){
			e.target.textContent = "Show";
		}else{
			e.target.textContent = "Hide";
		}

		localStorage.setItem("authMessageHidden", isHidden);
	}
	
	render(){
		console.log(this.state);
		let table = [];
		let udpHostOptions = [];
		
		console.log(_udpClients);
		if(Object.keys(_udpClients).length > 0){
			for(let u in _udpClients){
				udpHostOptions.push(
					<option value={u}>{_udpClients[u].name}</option>
				)
			}
		}

		let pluginOptions = [];

		if(Object.keys(_plugins).length > 0){
			for(let p in _plugins){
				pluginOptions.push(
					<option value={_plugins[p]}>{_plugins[p]}</option>
				)
			}
		}

		table.push(<div className="stack-div">
						<label id="authMessage">
							Some eventsubs don't require a specific scope to authorize, but those that do require the broadcaster to be authorized on this app.
							Channel point redemptions also need a valid broadcaster oauth for retrieving awards to link to events.
							<br/><br/>
							If you're already authorized and logged into Spooder as the broadcaster, click the button below to save it as broadcaster oauth
							and restart Spooder.<br/><br/> If you're logged in as a bot account for chat, you'll need to login to Twitch as the broadcaster.
							Click authorize on the top right to get oauth tokens for your broadcaster. If the username is your broadcaster username, click the button below
							to save the oauth as broadcaster. Finally, log back into Twitch as the bot account and click authorize again.
							Restart Spooder, the console should have your bot connecting to chat and your broadcaster validating.
						</label>
						<div>
							<button type="button" className="oauth-broadcaster-button command-button" onClick={this.hideAuthMessage}>Hide</button>
							<button type="button" className="oauth-broadcaster-button save-button" onClick={this.saveAuthToBroadcaster}>Save Current Oauth as Broadcaster</button>
						</div>
							
						</div>);

		table.push(<div id="event-sub-add">
						<select>
							<option value="channel.update">Channel Update</option>
							<option value="channel.follow">Follow</option>
							<option value="channel.subscribe">Subscribe</option>
							<option value="channel.subscription.end">Subscription End</option>
							<option value="channel.subscription.gift">Subscription Gift</option>
							<option value="channel.subscription.message">Subscription Message</option>
							<option value="channel.cheer">Cheer</option>
							<option value="channel.raid-receive">Receive Raid</option>
							<option value="channel.raid-send">Send Raid</option>
							<option value="channel.ban">Ban</option>
							<option value="channel.unban">Unban</option>
							<option value="channel.moderator.add">Mod Add</option>
							<option value="channel.moderator.remove">Mod Remove</option>
							<option value="channel.channel_points_custom_reward.add">Channel Points Custom Reward Add</option>
							<option value="channel.channel_points_custom_reward.update">Channel Points Custom Reward Update</option>
							<option value="channel.channel_points_custom_reward.remove">Channel Points Custom Reward Remove</option>
							<option value="channel.channel_points_custom_reward_redemption.add">Channel Points Custom Reward Redemption Add</option>
							<option value="channel.channel_points_custom_reward_redemption.update">Channel Points Custom Reward Redemption Update</option>
							<option value="channel.poll.begin">Poll Begin</option>
							<option value="channel.poll.progress">Poll Progress</option>
							<option value="channel.poll.end">Poll End</option>
							<option value="channel.prediction.begin">Prediction Begin</option>
							<option value="channel.prediction.progress">Prediction Progress</option>
							<option value="channel.prediction.lock">Prediction Lock</option>
							<option value="channel.prediction.end">Prediction End</option>
							<option value="drop.entitlement.grant">Drop Entitlement Grant</option>
							<option value="extension.bits_transaction.create">Extension Bits Transaction Create</option>
							<option value="channel.goal.begin">Goal Begin</option>
							<option value="channel.goal.progress">Goal Progress</option>
							<option value="channel.goal.end">Goal End</option>
							<option value="channel.hype_train.begin">Hype Train Begin</option>
							<option value="channel.hype_train.progress">Hype Train Progress</option>
							<option value="channel.hype_train.end">Hype Train End</option>
							<option value="stream.online">Stream Online</option>
							<option value="stream.offline">Stream Offline</option>
							<option value="user.authorization.grant">User Authorization Grant</option>
							<option value="user.authorization.revoke">User Authorization Revoke</option>
							<option value="user.update">User Update</option>
						</select><button type="button" onClick={this.initEventSub}>Add</button><div id="eventSubAddStatus"></div></div>);
		
		

		for(let s in this.state){
				switch(s){
					case 'callback_url':
						table.push(<div className="eventsub-variable"><div><label>WARNING: Changing the callback URL invalidates all your event subs. They'll need to be deleted and added again. Deleting subs will not delete their settings.</label>
							<div className="callback-url"><label>{s}</label><input type="text" name={s} defaultValue={this.state[s]} onChange={this.handleChange} /></div></div></div>);
					break;
					case 'eventsub':
						
						let eventsubs = this.state.eventsub;
						let events = Object.assign(this.state.events);

						for(let event in eventsubs){
							
							let subTable = [];
							for(let sub in eventsubs[event]){
								let conditionTable = [];
								for(let c in eventsubs[event][sub].condition){
									conditionTable.push(<label>{c}: {eventsubs[event][sub].condition[c]}</label>)
								}
								subTable.push(
									<div>{event}<div className="stack-div">
										<div>ID: {eventsubs[event][sub].id}</div>
										<div>Conditions: {conditionTable}</div>
										<div className={eventsubs[event][sub].transport.callback==this.state["callback_url"]+"/webhooks/callback"? "good":"error"}>Callback: {eventsubs[event][sub].transport.callback}</div>
										</div><button type="button" className="event-sub-delete-button" onClick={this.deleteEventSub} subid={eventsubs[event][sub].id}>DELETE</button></div>
								);
							}
							if(typeof events[event] == "undefined"){
								events[event] = {
									"chat":{enabled:false, message:""},
									"tcp":{enabled:false, address:"", value:""},
									"plugin":{enabled:false, pluginname:""},
									"udp":{enabled:false, dest:-1, address:"", value:""}
								}
							}

							table.push(<div className="eventsub-variable">
											
											<div className="">
												<label className="event-label">{event}</label>
												<div className="config-variable-ui tooltip"><div className="toggle-label">Say in chat
												<BoolSwitch eventname={event} name="chat-enabled" checked={events[event].chat.enabled} onChange={this.handleChange}/></div>
												
												<label className={"response "+(events[event].chat.enabled?"":"hidden")}>Message:
													<textarea type="text" eventname={event} name="chat-message" defaultValue={events[event].chat.message} placeholder="Write a response script in JS and return the final string. The event object is included in the script." onChange={this.handleChange}></textarea>
													<div className="verify-message"><button className="verify-message-button save-button" onClick={this.verifyResponseScript}>Verify Script</button></div>
												</label>
												
												</div>

												<div className="config-variable-ui tooltip"><label className="toggle-label">Send event to overlay
												<BoolSwitch eventname={event} name="tcp-enabled" checked={events[event].tcp.enabled} onChange={this.handleChange}/>
												<span className="tooltiptext">Define an overlay's address to send the event object to.</span></label>
													<label className={events[event].tcp.enabled?"":"hidden"}>Address:
														<input type="text" eventname={event} name="tcp-address" defaultValue={events[event].tcp.address} onChange={this.handleChange} />
													</label>
												</div>

												<div className="config-variable-ui tooltip"><label className="toggle-label">Send event to plugin
												<BoolSwitch eventname={event} name="plugin-enabled" checked={events[event].plugin.enabled} onChange={this.handleChange}/>
												<span className="tooltiptext">Send the event object to a plugin's onEvent function.</span></label>
													<label className={events[event].plugin.enabled?"":"hidden"}>Plugin Name:
														<select name="plugin-pluginname" data-key={event} eventname={event} defaultValue={events[event].plugin.pluginname} onChange={this.handleChange}>
															<option value={-1}>Select a plugin</option>
																{pluginOptions}
														</select>
													</label>
												</div>

												<div className="config-variable-ui software tooltip"><label className="toggle-label">Send to software
												<BoolSwitch eventname={event} name="udp-enabled" checked={events[event].udp.enabled} onChange={this.handleChange}/>
												<span className="tooltiptext">Send a string, a value, or two values seperated by a comma</span></label>
													<label className={events[event].udp.enabled?"":"hidden"}>Destination:
													<select name="udp-dest" data-key={event} eventname={event} defaultValue={events[event].udp.dest} onChange={this.handleChange}>
														<option value={-1}>None</option>
														<option value={-2}>All</option>
															{udpHostOptions}
													</select></label>
													<label className={events[event].udp.enabled?"":"hidden"}>Address:
														<input type="text" eventname={event} name="udp-address" defaultValue={events[event].udp.address} onChange={this.handleChange} />
													</label>
													<label className={events[event].udp.enabled?"":"hidden"}>Value On:
														<input type="text" eventname={event} name="udp-value" defaultValue={events[event].udp.value} onChange={this.handleChange}/>
													</label>
													<label className={events[event].udp.enabled?"":"hidden"}>Value Off:
														<input type="text" eventname={event} name="udp-valueoff" defaultValue={events[event].udp.valueoff} onChange={this.handleChange}/>
													</label>
													<label className={events[event].udp.enabled?"":"hidden"}>Duration (Milliseconds):
														<input type="number" eventname={event} name="udp-duration" defaultValue={events[event].udp.duration} onChange={this.handleChange}/>
													</label>
												</div>
											</div>
											<div class="active-subs">Active subs
												{subTable}
											</div>
										</div>);
						}
						
						
					break;
				}
			
			
			

			//sections.push(<div className="config-element" name={s}><label>{this.state[s]["sectionname"]}</label>{table}</div>);
		}
		
		return (
			<form className="config-tab">
				{table}
				<div className="save-commands"><button type="button" id="saveEventSubsButton" className="save-button" onClick={this.saveEventSubs}>Save</button><div id="saveStatusText" className="save-status"></div></div>
			</form>
		);
	}
}

export {EventSubTab};


