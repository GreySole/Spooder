import React from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faTrash} from '@fortawesome/free-solid-svg-icons';
import BoolSwitch from './BoolSwitch.js';

class ConfigTab extends React.Component{
	constructor(props){
		super(props);
		this.state = Object.assign(props.data);
		console.log(this.state);
		this.handleChange = this.handleChange.bind(this);
		this.saveConfig = this.saveConfig.bind(this);
		this.deleteUDPClient = this.deleteUDPClient.bind(this);
		this.addSubVar = this.addSubVar.bind(this);
	}
	
	handleChange(s){
		
		let name = s.target.name;
		let section = s.target.getAttribute("sectionname");
		let newSection = Object.assign(this.state[section]);
		
		if(section != "oscvars"){
			if(s.target.type == "checkbox"){
				window.toggleSwitch(s);
				newSection[name] = s.target.checked;
			}else{
				newSection[name] = s.target.value;
			}
		}else{
			newSection[s.target.getAttribute("varname")][name] = s.target.value;
		}
		this.setState(Object.assign(this.state,{[section]:newSection}));
	}
	
	addSubVar(e){
		
		let el = e.target.closest(".config-sub-var.add")
		let sectionName = e.target.closest(".config-variable.sub-section").getAttribute("sectionname");
		
		let varname = e.target.closest(".config-variable.sub-section").getAttribute("varname");
		let newUDPClients = Object.assign(this.state[sectionName][varname]);

		let clientKey = el.querySelector(".config-sub-var-ui input[name='clientKey']").value;
		let clientName = el.querySelector(".config-sub-var-ui input[name='clientName']").value;
		let clientIP = el.querySelector(".config-sub-var-ui input[name='clientIP']").value
		let clientPort = el.querySelector(".config-sub-var-ui input[name='clientPort']").value;

		newUDPClients[clientKey] = {
			name:clientName,
			ip:clientIP,
			port:clientPort
		};
		
		this.setState(Object.assign(this.state, {"network":Object.assign(this.state.network,{udp_clients:newUDPClients})}));
	}
	
	saveConfig(){
		let newList = Object.assign(this.state);
		
		const requestOptions = {
			method: 'POST',
			headers: {'Content-Type': 'application/json', 'Accept':'application/json'},
			body: JSON.stringify(newList)
		};
		console.log(requestOptions);
		fetch('/saveConfig', requestOptions)
		.then(response => response.json())
		.then(data => {
			if(data.status == "SAVE SUCCESS"){
				document.querySelector("#saveStatusText").textContent = "Config has saved! Restart Spooder to take effect.";
				setTimeout(()=>{
					document.querySelector("#saveStatusText").textContent = "";
				}, 5000)
			}else{
				document.querySelector("#saveStatusText").textContent = "Error: "+data.status;
			}
		});
	}

	deleteUDPClient(e){
		let el = e.currentTarget.closest(".config-sub-var");
		let sectionname = el.getAttribute("sectionname");
		let varname = el.getAttribute("varname");
		let subvarname = el.getAttribute("subvarname");

		let newUDPClients = Object.assign(this.state[sectionname][varname]);
		delete newUDPClients[subvarname];
		
		this.setState(Object.assign(this.state, {"network":Object.assign(this.state.network,{udp_clients:newUDPClients})}));

	}
	
	render(){
		console.log(this.state);
		let sections = [];
		let table = [];

		let udpTrashButton = <FontAwesomeIcon icon={faTrash} size="lg" onClick={this.deleteUDPClient} />;

		let udpClients = this.state.network.udp_clients;
		let clientTable = [];

		for(let u in udpClients){
			clientTable.push(<option value={u}>{udpClients[u].name}</option>);
		}
		
		for(let s in this.state){
			table = [];
			//console.log(s);
			for(let ss in this.state[s]){
				if(ss=="sectionname"){continue;}
				let dataType = typeof this.state[s][ss];

				switch(dataType){
					case 'number':
					case 'string':
						table.push(<div className="config-variable"><label>{ss}<input type="text" name={ss} sectionname={s} defaultValue={this.state[s][ss]} onChange={this.handleChange} /></label></div>);
					break;
					case 'boolean':
						
						table.push(<div className="config-variable"><label>{ss}</label>
						<BoolSwitch name="obs-remember" sectionname={s} checked={this.state[s][ss]} onChange={this.handleChange} />
						<label className={this.state[s][ss]?"boolswitch checked":"boolswitch"}><input type="checkbox" name={ss} sectionname={s} defaultChecked={this.state[s][ss]} onChange={this.handleChange}/>
						<div></div></label></div>);
						break;
					case 'object':
						let subTable = [];
						//console.log(this.state);
						for(let c in this.state[s][ss]){
							
							subTable.push(<div className="config-sub-var" sectionname={s} varname={ss} subvarname={c}>
								<div className="config-sub-var-buttons">
									{udpTrashButton}
								</div>
								<div className="config-sub-var-ui">
									<label>
										{c}
									</label>
									<label>Name:
										<input name="clientName" type="text" defaultValue={this.state[s][ss][c]['name']} placeholder="Name of client" onChange={this.handleChange} />
									</label>
									<label>IP:
										<input name="clientIP" type="text" defaultValue={this.state[s][ss][c]['ip']} placeholder="IP address to send to" onChange={this.handleChange} />
									</label>
									<label>Port:
										<input name="clientPort" type="text" defaultValue={this.state[s][ss][c]['port']} placeholder="IP port to send to" onChange={this.handleChange} />
									</label>
								</div>
							</div>);
						}
						let addSubVarForm = <div className="config-sub-var add">
												
												<div className="config-sub-var-ui">
													<label>Key:
														<input name="clientKey" type="text" placeholder="Key name for storage"  />
													</label>
													<label>Name:
														<input name="clientName" type="text" placeholder="Name of client"  />
													</label>
													<label>IP:
														<input name="clientIP" type="text" placeholder="IP address to send to"  />
													</label>
													<label>Port:
														<input name="clientPort" type="text" placeholder="IP port to send to"  />
													</label>
												</div>
												<div className="config-sub-var-buttons">
													<button type="button" className="add-button" onClick={this.addSubVar}>Add</button>
												</div>
											</div>
						table.push(<div varname={ss} sectionname={s} className="config-variable sub-section"><label>{ss} {subTable}
						<div className="config-variable add">{addSubVarForm}</div></label>
						</div>);
						
					break;
				}
			}
			sections.push(<div className="config-element" name={s}><label>{this.state[s]["sectionname"]}</label>{table}</div>);
		}
		
		return (
			<form className="config-tab">
				{sections}
				<div className="save-commands"><button type="button" id="saveCommandsButton" className="save-button" onClick={this.saveConfig}>Save</button><div id="saveStatusText" className="save-status"></div></div>
			</form>
		);
	}
}

export {ConfigTab};


