import React from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faTrash} from '@fortawesome/free-solid-svg-icons';

var udpClients = {};

class OSCTunnelTab extends React.Component{
	constructor(props){
		super(props);
		this.state = Object.assign(props.data);
		console.log(this.state);
		this.handleChange = this.handleChange.bind(this);
		this.handleAddOSCVar = this.handleAddOSCVar.bind(this);
		this.saveTunnels = this.saveTunnels.bind(this);
		this.deleteOSCVar = this.deleteOSCVar.bind(this);
		udpClients = Object.assign(props._udpClients);
	}
	
	handleChange(s){
		
		let name = s.target.name;
		let section = s.target.getAttribute("sectionname");
		let newSection = Object.assign(this.state[section]);
		
		newSection[s.target.getAttribute("varname")][name] = s.target.value;
		this.setState(Object.assign(this.state,{[section]:newSection}));
	}
	
	handleAddOSCVar(){
		let name = window.$(".add-osc-var [name='name']").value;
		let handlerFrom = window.$(".add-osc-var [name='handlerFrom']").value;
		let handlerTo = window.$(".add-osc-var [name='handlerTo']").value;
		let addressFrom = window.$(".add-osc-var [name='addressFrom']").value;
		let addressTo = window.$(".add-osc-var [name='addressTo']").value;
		
		let newVar = {};
		newVar = {
			"handlerFrom":handlerFrom,
			"handlerTo":handlerTo,
			"addressFrom":addressFrom,
			"addressTo":addressTo
		}
		
		this.setState(Object.assign(this.state,{[name]:newVar}));
	}
	
	saveTunnels(){
		let newList = Object.assign(this.state);
		
		const requestOptions = {
			method: 'POST',
			headers: {'Content-Type': 'application/json', 'Accept':'application/json'},
			body: JSON.stringify(newList)
		};
		
		fetch('/saveOSCTunnels', requestOptions)
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

	deleteOSCVar(e){
		console.log(e.currentTarget);
		let el = e.currentTarget.closest(".config-variable");

		let varname = el.getAttribute("varname");

		let oscVars = Object.assign(this.state);
		delete oscVars[varname];

		this.setState(oscVars);
	}
	
	
	render(){
		console.log(this.state);
		let table = [];

		let oscTrashButton = <FontAwesomeIcon icon={faTrash} size="lg" className="delete-button" onClick={this.deleteOSCVar} />;

		let clientTable = [];

		for(let u in udpClients){
			clientTable.push(<option value={u}>{udpClients[u].name}</option>);
		}
		var tunnels = this.state;
		table = [];
		for(let s in tunnels){
			
			console.log(s);
			//for(let ss in tunnels[s]){
				table.push(<div className="config-variable" varname={s}>
								
								<div className="config-variable-ui">
									<label>{s}</label>
									<label>Handler From
										<select name="handlerFrom" varname={s}  defaultValue={tunnels[s]["handlerFrom"]} onChange={this.handleChange}>
											<option value="tcp">TCP (Overlays)</option>
											<option value="udp">UDP Any</option>
											{clientTable}
										</select>
									</label>
									<label>Handler To
										<select name="handlerTo" varname={s} defaultValue={tunnels[s]["handlerTo"]} onChange={this.handleChange}>
											<option value="tcp">TCP (Overlays)</option>
											<option value="udp">UDP All</option>
											{clientTable}
										</select>
									</label>
									<label>Address From:
										<input name="addressFrom" type="text" varname={s}  defaultValue={tunnels[s]["addressFrom"]} placeholder="OSC Address From" onChange={this.handleChange} />
									</label>
									<label>AddressTo:
										<input name="addressTo" type="text" varname={s}  defaultValue={tunnels[s]["addressTo"]} placeholder="OSC Address To" onChange={this.handleChange} />
									</label>
								</div>
								<div className="config-variable-buttons">{oscTrashButton}</div>
							</div>);
			//}
			
			
			//sections.push(<div className="config-element" name={s}><label>{this.state[s]["sectionname"]}</label>{table}</div>);
		}

		table.push(<div className="add-osc-var">
				<div className="config-variable">
					<label>Name:<input type="text" name="name" placeholder="Name" /></label>
					<label>Handler From
						<select defaultValue="tcp" name="handlerFrom">
							<option value="tcp">TCP (Overlays)</option>
							<option value="udp">UDP Any</option>
							{clientTable}
						</select>
					</label>
					<label>Handler To
						<select defaultValue="tcp" name="handlerTo">
							<option value="tcp">TCP (Overlays)</option>
							<option value="udp">UDP All</option>
							{clientTable}
						</select>
					</label>
					<label>Address From:<input type="text" name="addressFrom" placeholder="OSC Address From" /></label>
					<label>Address To:<input type="text" name="addressTo" placeholder="OSC Address To" /></label>
				</div>
				<button type="button" className="add-button" onClick={this.handleAddOSCVar}>Add</button></div>);
		
		return (
			<form className="config-tab">
				{table}
				<div className="save-commands"><button type="button" id="saveTunnelsButton" className="save-button" onClick={this.saveTunnels}>Save</button><div id="saveStatusText" className="save-status"></div></div>
			</form>
		);
	}
}

export {OSCTunnelTab};


