import React from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faTrash, faAward, faCommentDots} from '@fortawesome/free-solid-svg-icons';
import BoolSwitch from './BoolSwitch.js';

class EventTable extends React.Component{
	constructor(props){
		super(props);
		this.state = {};

		this.state.events = Object.assign(props.data);
		this.state.groups = props.groups;
		
		this.state._udpClients = props._udpClients;
		this.state._plugins = props._plugins;
		
		this.handleChange = this.handleChange.bind(this);
		this.addCommand = this.addCommand.bind(this);
		this.addEvent = this.addEvent.bind(this);
		this.addGroup = this.addGroup.bind(this);
		this.saveCommands = this.saveCommands.bind(this);
		this.deleteCommand = this.deleteCommand.bind(this);
		this.deleteEvent = this.deleteEvent.bind(this);
		this.getCustomRewards = this.getCustomRewards.bind(this);
		this.checkEventTaken = this.checkEventTaken.bind(this);
		
		this.getCustomRewards();
	}
	
	handleChange(e){
		let eventName = e.target.closest(".command-element").id;
		let isCommand = e.target.closest(".command-fields") != null;
		let isTrigger = e.target.closest(".command-props.triggers") != null;

		let newState = Object.assign(this.state.events);

		if(isCommand){
			let commandIndex = e.target.closest(".command-fields").getAttribute("commandindex");
			let varname = e.target.name;
			newState[eventName].commands[commandIndex][varname] = e.target.value;

		}else if(isTrigger){
			let varname = e.target.name;
			let triggerType = e.target.closest("[triggertype]").getAttribute("triggertype");
			if(e.target.type == "checkbox"){
				newState[eventName].triggers[triggerType][varname] = e.target.checked;
			}else{
				newState[eventName].triggers[triggerType][varname] = e.target.value;
			}
			
		}else{
			let varname = e.target.name;
			console.log(eventName, varname, e.target.type);
			if(e.target.type == "checkbox"){
				newState[eventName][varname] = e.target.checked;
			}else{
				newState[eventName][varname] = e.target.value;
			}
			
		}
		
		this.setState(Object.assign(this.state,{events:newState}));
		//console.log(this.state);
	}

	addGroup(e){
		let newGroup = e.target.closest(".add-command-actions").querySelector("[name='groupname']").value;
		//console.log("NEW GROUP", newGroup);

		let newGroups = Object.assign(this.state.groups);
		newGroups.push(newGroup);
		this.setState(Object.assign(this.state,{groups:newGroups}));
	}

	addEvent(e){
		let newKey = document.querySelector(".event-add #eventkey").value;
		let eventGroup = document.querySelector(".event-add #eventgroup").value;

		let newEvent = {
			"name":newKey,
			"description":"",
			"group":eventGroup,
			"cooldown":0,
			"chatnotification":false,
			"triggers":{
				"chat":{"enabled":true, "command":"!"},
				"redemption":{"enabled":false, "id":""}
			},
			"commands":[]
		};

		let newState = Object.assign(this.state.events);
		newState[newKey] = newEvent;
		this.setState(Object.assign(this.state,{events:newState}));
	}
	
	addCommand(e){
		let eventName = e.target.getAttribute("eventname");
		let commandType = document.querySelector("#"+eventName+" .add-command [name='type']").value;
		let newCommand = {};
		switch(commandType){
			case 'response':
				newCommand = {
					type:"response",
					enabled:true,
					command:"",
					delay:0
				};
			break;
			case 'plugin':
				newCommand = {
					type:"plugin",
					pluginname:"",
					delay:0
				};
			break;
			case 'software':
				newCommand = {
					type:"software",
					etype:"timed",
					dest_udp:"-1",
					address:"/",
					valueOn:1.0,
					valueOff:0.0,
					duration:60,
					delay:0
				};
			break;
		}
		
		
		let newState = Object.assign(this.state.events);
		newState[eventName].commands.push(newCommand)
		this.setState(Object.assign(this.state,{events:newState}));
	}
	
	saveCommands(){
		let newEvents = Object.assign(this.state.events);
		for(let c in newEvents){
			for(let n in newEvents[c]){
				if(!isNaN(newEvents[c][n]) && typeof newEvents[c][n] != 'boolean'){
					newEvents[c][n] = parseFloat(newEvents[c][n]);
				}
			}
		}
		let eventElements = document.querySelectorAll(".command-element");
		for(let e in newEvents){
			newEvents[e].group = document.querySelector("#"+e+" [name='group']").value;
		}

		let newList = {
			"events":newEvents,
			"groups":this.state.groups
		};
		
		const requestOptions = {
			method: 'POST',
			headers: {'Content-Type': 'application/json', 'Accept':'application/json'},
			body: JSON.stringify(newList)
		};
		fetch('/saveCommandList', requestOptions)
		.then(response => response.json())
		.then(data => {
			if(data.status == "SAVE SUCCESS"){
				document.querySelector("#saveStatusText").textContent = "Commands are saved!";
				setTimeout(()=>{
					document.querySelector("#saveStatusText").textContent = "";
				}, 5000)
			}else{
				document.querySelector("#saveStatusText").textContent = "Error: "+data.status;
			}
		});
	}
	
	deleteCommand(e){
		
		let eventName = e.target.closest(".command-element").id;
		let cIndex = e.target.closest(".command-fields").getAttribute("commandindex");
		let newState = Object.assign(this.state.events);
		newState.events[eventName].commands.splice(cIndex,1);

		this.setState(Object.assign(this.state,{events:newState}));
	}

	deleteEvent(e){
		let eventName = e.target.closest(".command-element").id;
		window.setClass(e.target.closest(".command-element"), "expanded", false);
		window.setClass(e.target.closest(".command-section"), "hidden", true);
		
		let newState = Object.assign(this.state.events);
		delete newState[eventName];

		this.setState(Object.assign(this.state, {events:newState}));
	}
	
	toggleProps(e){
		let topElement = e.currentTarget.closest(".command-element");
		let middleElement = topElement.querySelector(".command-key");
		let element = topElement.querySelector(".command-section");

		window.toggleClass(topElement, "expanded");
		window.toggleClass(middleElement, "expanded");
		window.toggleClass(element, "hidden");
	}
	
	sortList() {
	  var list, i, switching, b, shouldSwitch;
	  list = document.getElementById("id01");
	  switching = true;
	  /* Make a loop that will continue until
	  no switching has been done: */
	  while (switching) {
		// Start by saying: no switching is done:
		switching = false;
		b = list.getElementsByTagName("LI");
		// Loop through all list items:
		for (i = 0; i < (b.length - 1); i++) {
		  // Start by saying there should be no switching:
		  shouldSwitch = false;
		  /* Check if the next item should
		  switch place with the current item: */
		  if (b[i].innerHTML.toLowerCase() > b[i + 1].innerHTML.toLowerCase()) {
			/* If next item is alphabetically lower than current item,
			mark as a switch and break the loop: */
			shouldSwitch = true;
			break;
		  }
		}
		if (shouldSwitch) {
		  /* If a switch has been marked, make the switch
		  and mark the switch as done: */
		  b[i].parentNode.insertBefore(b[i + 1], b[i]);
		  switching = true;
		}
	  }
	}

	verifyResponseScript(e){
		e.preventDefault();
		let parentEl = e.target.closest(".command-props");
		let responseEl = parentEl.querySelector("[name='message']");
		let responseScript = responseEl.value;

		//Usually event.username is the uncapitalized version of a username.
		//Spooder replaces this with the capitalized version in runCommands()
		let testEvent = {  timestamp: "2022-05-05T17:06:31.505Z",
			command: 'PRIVMSG',
			event: 'PRIVMSG',
			channel: '#testchannel',
			username: 'TestChannel',
			isSelf: false,
			message: '!dice',
			tags: {
			  badgeInfo: 'subscriber/1',
			  badges: { broadcaster: true, subscriber: 0 },
			  clientNonce: '00000000000000000000000000000000',
			  color: '#1E90FF',
			  displayName: 'TestChannel',
			  emotes: [],
			  firstMsg: '0',
			  flags: '',
			  id: '00000000-0000-0000-0000-000000000000',
			  mod: '0',
			  roomId: '000000000',
			  subscriber: '1',
			  tmiSentTs: '0000000000000',
			  turbo: '0',
			  userId: '000000000',
			  userType: '',
			  bits: undefined,
			  emoteSets: [],
			  username: 'testchannel',
			  isModerator: false
			}
		  }
		  

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
		
		
	}

	checkEventTaken(e){
		if(Object.keys(this.state.events).includes(e.target.value)){
			window.setClass(e.target, "error", true);
		}else{
			window.setClass(e.target, "error", false);
		}
	}

	async getCustomRewards(){
		let rewardsRaw = await fetch('/get_channelpoint_rewards')
		.then(response => response.json());

		if(rewardsRaw.message == 'OAuth token is missing'){
			console.log("You need to set a broadcaster oauth token to get custom rewards. \
			If you're logged into chat with a bot account, you will need to log out of Twitch.tv and log in as your broadcaster.\
			Authorize the broadcaster account here. Then go to the Config tab and click 'Save Oauth to Broadcaster.'\
			Log out of Twitch and back in as the bot account. Close Spooder and run again with 'npm run start-noautologin'\
			Then you can authorize your bot account as the main token and keep the broadcaster token on file.");
		}

		let rewards = rewardsRaw.data;
		let newState = Object.assign(this.state);
		newState._rewards = rewards;
		this.setState(newState);
	}
	
	render(){
		
		let udpHostOptions = [];
		//console.log(this.state._udpClients);
		if(Object.keys(this.state._udpClients).length > 0){
			for(let u in this.state._udpClients){
				udpHostOptions.push(
					<option value={u}>{this.state._udpClients[u].name}</option>
				)
			}
		}

		let rewardOptions = [<option value="">Select a reward</option>];
		if(this.state._rewards != null){
			let rewards = this.state._rewards;
			for(let r in rewards){
				rewardOptions.push(
					<option value={rewards[r].id}>{rewards[r].title}</option>
				)
			}
		}

		let pluginOptions = [];
		if(this.state._plugins != null){
			let plugins = this.state._plugins;
			for(let p in plugins){
				pluginOptions.push(
					<option value={plugins[p]}>{plugins[p]}</option>
				)
			}
		}

		let eventTable = [];
		let trashButton = <FontAwesomeIcon icon={faTrash} size="lg" className="delete-button" onClick={this.deleteCommand} />;

		var groups = this.state.groups;
		let groupObjects = [];

		let groupOptions = [];
		for(let g in groups){
			groupOptions.push(
				<option value={groups[g]}>{groups[g]}</option>
			);
		}

		let propKeys = Object.keys(this.state.events);
		propKeys.sort((a,b) => {
			return this.state.events[a].name.toUpperCase() > this.state.events[b].name.toUpperCase() ? 1:-1;
		});

		for(let p in propKeys){

			let s = propKeys[p];

			if(s.startsWith("_")){continue;}

			let thisEvent = this.state.events;

			let eventName = thisEvent[s].name;
			let eventDesc = thisEvent[s].description;

			let groupName = thisEvent[s].group;
			if(groupName==null){groupName = ""}

			let eventCooldown = thisEvent[s].cooldown;
			if(eventCooldown == null){eventCooldown = 0}

			let chatNotification = thisEvent[s].chatnotification;
			if(chatNotification == null){chatNotification = false}

			let eventTriggers = thisEvent[s].triggers;
			let redemptionTrigger = null;
			if(this.state._rewards != null){
				redemptionTrigger = this.state._rewards.length > 0 ? 
				<label triggertype="redemption">
					Redemption:
					<label>
						Enabled:
						<BoolSwitch name="enabled" checked={eventTriggers.redemption.enabled} onChange={this.handleChange}/>
					</label>
					<label>
						Reward:
						<select name="id" defaultValue={eventTriggers.redemption.id} onChange={this.handleChange}>
							{rewardOptions}
						</select>
					</label>
				</label>:null;
			}
			
			let triggerElement = <div className="command-props triggers">
									<label triggertype="chat">
										Chat:
										<label>
											Enabled:
											<BoolSwitch name="enabled" checked={eventTriggers.chat.enabled} onChange={this.handleChange}/>
										</label>
										<label>
											Command:
											<input type="text" name="command" defaultValue={eventTriggers.chat.command} onChange={this.handleChange} />
										</label>
									</label>
									{redemptionTrigger}
								</div>;

			let eventCommands = thisEvent[s].commands;
			let commandElements = [];

			for(let c in eventCommands){
				let element = null;
				switch(eventCommands[c].type){
					case 'response':
						element = <div className="command-props response">
							<label>
								Message:
								<textarea name="message" key={s} defaultValue={eventCommands[c].message} onChange={this.handleChange} placeholder="Write your response script in JS here. You can access the sender name and tags with 'event.username and event.tags' be sure to end the script with 'return <string>' without quotes." ></textarea>
								<div className="verify-message"><button className="verify-message-button save-button" onClick={this.verifyResponseScript}>Verify Script</button></div>
							</label>
							
							<label>
								Delay (Milliseconds):
								<input name="delay" key={s} defaultValue={eventCommands[c].delay} type="number" break="anywhere" onChange={this.handleChange} />
							</label>
						</div>;
					break;
					case 'plugin':
						element = <div className="command-props plugin">
							<label>
								Plugin:
								<select name="pluginname" key={s} defaultValue={eventCommands[c].pluginname} onChange={this.handleChange}>{pluginOptions}</select>
							</label>
							<label>
								Event Name:
								<input type="text" key={s} name="eventname" defaultValue={eventCommands[c].eventname} onChange={this.handleChange} />
							</label>
							<label>
								Delay (Milliseconds):
								<input name="delay" key={s} defaultValue={eventCommands[c].delay} type="number" break="anywhere" onChange={this.handleChange} />
							</label>
						</div>;
					break;
					case 'software':
						let duration = eventCommands[c].etype=="timed" ? <label>
																		Duration (Seconds):
																		<input type="number" name="duration" key={s} defaultValue={eventCommands[c].duration} onChange={this.handleChange} />
																	</label>:null;
						element = <div className="command-props software">
							
							<label>
								Address:
								<input type="text" name="address" key={s} defaultValue={eventCommands[c].address} onChange={this.handleChange} />
							</label>
							<label>
								UDP:
								<select name="dest_udp" key={s} defaultValue={eventCommands[c].dest_udp} onChange={this.handleChange}>
									<option value={-1}>None</option>
									<option value={-2}>All</option>
										{udpHostOptions}
								</select>
							</label>
							<label>
								Value On:
								<input type="text" name="valueOn" key={s} defaultValue={eventCommands[c].valueOn} onChange={this.handleChange} />
							</label>
							<label>
								Value Off:
								<input type="text" name="valueOff" key={s} defaultValue={eventCommands[c].valueOff} onChange={this.handleChange} />
							</label>
							<label>
								Event Type:
								<select name="etype" key={s} defaultValue={eventCommands[c].etype} onChange={this.handleChange}><option value="timed">Timed</option><option value="oneshot">One Shot</option></select>
							</label>
							{duration}
							<label>
								Delay (Milliseconds):
								<input name="delay" key={s} defaultValue={eventCommands[c].delay} type="number" break="anywhere" onChange={this.handleChange} />
							</label>
						</div>;
					
					break;
				}
				
				commandElements.push(
					<div className="command-fields" key={c} commandindex={c}>
						<label>
							{eventCommands[c].type}
							{element}
						</label>
						
						<div className="command-actions">
							{trashButton}
						</div>
					</div>
				);
			}
	
			let addElement = <div className="add-command">
					<div className="add-command-fields">
						<label>
						Command Type:
						<select id="addCommandType" name="type">
							<option value={"response"}>Reponse</option>
							<option value={"plugin"}>Plugin</option>
							<option value={"software"}>Software</option>
						</select>
						</label>
					</div>
					<div className="add-command-actions">
						<button type="button" id="addCommandButton" eventname={s} className="add-button" onClick={this.addCommand}>Add</button>
					</div>
				</div>;

			let triggerIcons = [];
			if(eventTriggers.chat.enabled){
				triggerIcons.push(
					<FontAwesomeIcon icon={faCommentDots} />
				);
			}

			if(eventTriggers.redemption.enabled){
				triggerIcons.push(
					<FontAwesomeIcon icon={faAward} />
				)
			}

			let eventElement = <div className="command-element" key={s} id={s}>
									<div className="command-key" onClick={this.toggleProps}>
										<label>
											<h1>{eventName}{triggerIcons}</h1>
										</label>
									</div>
									<div className="command-section hidden">
									<label>
										Name:
										<input name="name" defaultValue={eventName} onChange={this.handleChange}/>
									</label>
									<label>
										Description:
										<input name="description" defaultValue={eventDesc} onChange={this.handleChange}/>
									</label>
									<label>
										Group:
										<select name="group" defaultValue={groupName}>
											{groupOptions}
										</select>
									</label>
									<label>
										Cooldown (In Seconds):
										<input type="number" name="cooldown" defaultValue={eventCooldown} onChange={this.handleChange}/>
									</label>
									<label class="label-switch">
										Notify Activation in Chat:
										<BoolSwitch name="chatnotification" checked={chatNotification} onChange={this.handleChange}/>
									</label>
									<label className="field-section">
										Trigger:
										{triggerElement}
									</label>
									<label className="field-section">
										Commands:
										{commandElements}
										{addElement}
									</label>
									
									<div className="delete-event-div">
										<button type="button" className="delete-button" onClick={this.deleteEvent}>DELETE EVENT</button>
									</div>
									</div>
								</div>;

			if(groupObjects[groupName] == null){
				groupObjects[groupName] = [];
			}

			groupObjects[groupName].push(eventElement);
		}

		let groupElements = [];
		

		let groupKeys = Object.keys(groupObjects).sort();

		for(let go in groupKeys){
			groupElements.push(
				<div className="command-group">
					<div className="command-group-label">{groupKeys[go]}</div>
					<div className="command-group-content">{groupObjects[groupKeys[go]]}</div>
				</div>
			);
		}
		
		return (
			<form className="event-table">
				<div className="event-container">
					{groupElements}
				</div>
				<div className="event-add">Add Event
					<div>
						<input type="text" id="eventkey" placeholder="Event name" onInput={this.checkEventTaken} />
						<select name="group" id="eventgroup" defaultValue="Default">
							{groupOptions}
						</select>
						<button type="button" id="addEventButton" className="add-button" onClick={this.addEvent}>Add</button>
					</div>
				</div>
				<div className="event-add">
					<label>
						Groups:
						{this.state.groups.join(", ")}
					</label>
					<div className="add-command-actions">
							<input type="text" name="groupname" />
							<button type="button" id="addGroupButton" className="add-button" onClick={this.addGroup}>Add</button>
						</div>
				</div>
				<div className="save-commands"><button type="button" id="saveCommandsButton" className="save-button" onClick={this.saveCommands}>Save</button><div id="saveStatusText" className="save-status"></div></div>
			</form>
		);
	}
}

export {EventTable};


