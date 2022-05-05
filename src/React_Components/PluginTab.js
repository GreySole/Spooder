import React from 'react';
import './PluginTab.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCog, faTrash, faPlusCircle, faUpload, faSync, faSpider, faFile, faDownload } from '@fortawesome/free-solid-svg-icons';

class PluginTab extends React.Component {
	constructor(props) {
		super(props);
		this.state = Object.assign(props.data);
		this.state["_udpClients"] = props._udpClients;
		this.state["_openSettings"] = null;
		this.state["_openAssets"] = null;
		this.state["_assetFilePreview"] = null;

		this.hiddenFileInput = React.createRef();
		this.hiddenAssetInput = React.createRef();
		this.onPluginChange = this.onPluginChange.bind(this);
		this.renderSettings = this.renderSettings.bind(this);
		this.onSettingsFormSubmit = this.onSettingsFormSubmit.bind(this);
		this.fillAssetFields = this.fillAssetFields.bind(this);
		this.fillUDPFields = this.fillUDPFields.bind(this);
		this.deleteAsset = this.deleteAsset.bind(this);
		this.selectAsset = this.selectAsset.bind(this);
	}

	audioPreviewRef = React.createRef();

	handleFileClick = e => {
		this.hiddenFileInput.current.click();
	};

	handleAssetUploadClick = e => {
		let pluginName = e.currentTarget.getAttribute("plugin-name");
		document.querySelector("#input-file[plugin-name='"+pluginName+"']").click();
	}

	refreshPlugins = async() => {
		let rStatus = await fetch('/refresh_plugins', {method:"POST", body:""})
		.then(response=>response.json());
		
		document.querySelector(".plugin-element .save-status").textContent = rStatus.status;
		setTimeout(()=>{
			document.querySelector(".plugin-element .save-status").textContent = "";
		}, 5000);
	}

	fillAssetFields(entryID){
		var state = this.state;
		let assetFields = document.querySelectorAll("#"+entryID+" [assetselect]");

		assetFields.forEach(assetF =>{
			let format = assetF.getAttribute("assetselect");
			let assets = state[entryID]["assets"];
			let options = [];
			let extensions = window.mediaExtensions;

			for(let a in assets){
				if(format != "*" && format != ""){
					let astring = assets[a];
					if(extensions[format].includes(astring.substring(astring.lastIndexOf(".")))){
						options.push(astring);
					}
				}else{
					options.push(assets[a]);
				}
			}
			let optionHTML = "";
			for(let o in options){
				optionHTML += "<option>"+options[o]+"</option>";
			}
			
			assetF.innerHTML = optionHTML;
		});
		
	}

	fillUDPFields(entryID){
		let udpFields = document.querySelectorAll("#"+entryID+" [udpselect]");
		let udpClients = this.state._udpClients;
		udpFields.forEach(udpF => {

			let optionHTML = "<option value='-1'>Disabled</option><option value='-2'>All</option>";
			for(let c in udpClients){
				optionHTML += "<option value='"+c+"'>"+c+"</option>";
			}
			
			udpF.innerHTML = optionHTML;
		});
	}

	componentDidUpdate() {
		this.handleSettingsForms();
	}

	handleSettingsForms(){
		
			var s = this.state._openSettings;
			let settingsForm = document.querySelector("#"+s+" .settings-form");
			this.fillAssetFields(s);
			this.fillUDPFields(s);
			
			if(settingsForm != null){
				settingsForm.onsubmit = this.onSettingsFormSubmit;
				let settings = this.state[s]["settings"];
				for(let ss in settings){
					if(typeof settings[ss] == "object"){
						let subform = settingsForm.querySelector("[subname="+ss+"-form] .subform-container");
						let subformArray = [];
						let subsettings = settings[ss];
						
						for(let sss in subsettings){
							let newSubForm = subform.cloneNode(true);
							newSubForm.setAttribute("subname",sss);
							let newSubFormNames = newSubForm.querySelectorAll("[subvar]");
							for(let i=0; i<newSubFormNames.length; i++){
								if(newSubFormNames[i].getAttribute("subvar") == "keyname"){
									newSubForm.querySelector("[subvar="+newSubFormNames[i].getAttribute("subvar")+"]").value = sss;
								}else{
									newSubFormNames[i].value = subsettings[sss][newSubFormNames[i].getAttribute("subvar")];
								}
							}
							subformArray.push(newSubForm);
						}
						subform.style.display = "none";
						
						var subformCont = settingsForm.querySelector("[subname="+ss+"-form]");
						for(let sa in subformArray){
							subformCont.appendChild(subformArray[sa]);
						}
						settingsForm.querySelector("[varname="+ss+"] .add-button").onclick = () => {
							console.log("ADDING SUBFORM", ss);
							let newSubForm = subform.cloneNode(true);
							newSubForm.style.display = "";
							newSubForm.setAttribute("subname", "newcommand");
							newSubForm.querySelector(".delete-button").onclick = function(){this.closest(".subform-container").remove()}
							subformCont.appendChild(newSubForm);
							subformCont.scrollLeft = subformCont.scrollWidth;
						}
						
						settingsForm.querySelectorAll(".subform-container .delete-button").forEach((e,i) => {
							e.onclick = function(){e.closest(".subform-container").remove();}
						});
					}else{
						if(settingsForm.querySelector("[name="+ss+"]") != null){
							settingsForm.querySelector("[name="+ss+"]").value = settings[ss];
						}
					}
					
				}
			}
	}

	async onSettingsFormSubmit(e){
		e.preventDefault();
		let pluginName = e.target.closest(".settings-form-html").getAttribute("pluginname");
		let inputs = document.querySelectorAll("#"+pluginName+"SettingsForm .settings-form [name]");
		let subforms = document.querySelectorAll("#"+pluginName+"SettingsForm .settings-subform");
		
		let newSettings = Object.assign(this.state[pluginName].settings);
		for(let i=0; i<inputs.length; i++){
			let varname = inputs[i].getAttribute("name");
			newSettings[varname] = inputs[i].value;
		}
		for(let s in subforms){
			if(typeof subforms[s] != "object"){continue;}
			let varname = subforms[s].getAttribute("varname");
			newSettings[varname] = {};
			let elements = subforms[s].querySelectorAll(".subform-container[subname]");
			for(let e in elements){
				if(typeof elements[e] != "object"){continue;}
				let commandName = elements[e].querySelector("[subvar='keyname']").value;
				let command = {};
				let subvars = elements[e].querySelectorAll("[subvar]:not([subvar='keyname'])");
				
				for(let sv in subvars){
					if(typeof subvars[sv] != "object"){continue;}
					if(subvars[sv].getAttribute("subvar") == commandName){continue;}
					command[subvars[sv].getAttribute("subvar")] = subvars[sv].value;
				}
				newSettings[varname][commandName] = command;
			}
		}
		
		const requestOptions = {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
			body: JSON.stringify({ "pluginName": pluginName, "settings": newSettings })
		}

		let saveStatus = await fetch('/save_plugin', requestOptions)
			.then(response => response.json());
		document.querySelector("#" + pluginName + " .save-status").textContent = "Plugin saved!";
		setTimeout(function () {
			document.querySelector("#" + pluginName + " .save-status").textContent = "";
		}, 3000);
	}

	uploadPluginAsset = async (e) => {
		let pluginName = e.target.getAttribute("plugin-name");
		var fd = new FormData();
		fd.append('file', e.target.files[0]);

		const requestOptions = {
			method: 'POST',
			body: fd
		};
		let uploadReq = await fetch('/upload_plugin_asset/'+pluginName, requestOptions)
			.then(response => response.json());
		let newState = Object.assign(this.state);
		
		newState[pluginName]["assets"] = uploadReq["newAssets"];
		this.setState(newState);
	}

	reloadPlugins = async () => {
		const response = await fetch("/plugins");
		const pluginDataRaw = await response.json();

		let newState = {};
		newState = Object.assign(pluginDataRaw);
		newState["_udpClients"] = this.state._udpClients;
		newState["_openSettings"] = null;
		newState["_openAssets"] = null;
		newState["_assetFilePreview"] = null;
		this.setState(newState);
	}

	installNewPlugin = async (e) => {

		var fd = new FormData();
		fd.append('file', e.target.files[0]);
		//return;

		const requestOptions = {
			method: 'POST',
			body: fd
		};
		await fetch('/install_plugin', requestOptions)
			.then(response => response.json());

		this.reloadPlugins();
	}

	pluginSettings = (e) => {
		let plugin = e.target.closest(".plugin-entry").id;
		if(plugin == this.state._openSettings){
			this.setState(Object.assign(this.state, {"_openSettings":null}));
		}else{
			this.setState(Object.assign(this.state, {"_openSettings":plugin, "_openAssets":null}));
		}
	}

	pluginAssets = (e) => {
		let plugin = e.target.closest(".plugin-entry").id;
		if(plugin == this.state._openAssets){
			this.setState(Object.assign(this.state, {"_openAssets":null}));
		}else{
			this.setState(Object.assign(this.state, {"_openAssets":plugin, "_openSettings":null}));
		}
	}

	savePlugin = async (e) => {
		let pluginID = e.target.closest(".plugin-entry").id;
		let pluginSettings = Object.assign(this.state[pluginID].settings);

		
		const requestOptions = {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
			body: JSON.stringify({ "pluginName": pluginID, "settings": pluginSettings })
		}

		let saveStatus = await fetch('/save_plugin', requestOptions)
			.then(response => response.json());
		document.querySelector("#" + pluginID + " .save-status").textContent = "Plugin saved!";
		setTimeout(function () {
			document.querySelector("#" + pluginID + " .save-status").textContent = "";
		}, 3000);
	}

	exportPlugin = async (e) => {
		let pluginID = e.target.closest(".plugin-entry").id;

		const requestOptions = {
			method: 'GET',
			headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
		}

		let pluginFile = await fetch('/export_plugin/'+pluginID);
		console.log(pluginFile);

	}

	onPluginChange(e) {
		let pluginName = e.target.closest(".plugin-entry").id;
		let varname = e.target.getAttribute("name");
		let varval = e.target.value;
		if(typeof this.state[pluginName].settings[varname] == "boolean"){
			varval = e.target.checked;
			window.setClass(e.target.parentElement, "checked", varval);
		}

		let thisPlugin = Object.assign(this.state)[pluginName];
		thisPlugin.settings[varname] = varval;
		this.setState({ [pluginName]: thisPlugin });
	}

	deletePlugin = async (e) => {
		let confirmation = window.confirm("Are you sure you want to delete this plugin?");
		if (confirmation == false) { return; }

		let currentPlugins = Object.assign(this.state);

		let pluginID = e.target.closest(".plugin-entry").id;

		const requestOptions = {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
			body: JSON.stringify({ "pluginName": pluginID })
		}

		let saveStatus = await fetch('/delete_plugin', requestOptions)
			.then(response => response.json());
		if (saveStatus.status == "SUCCESS") {
			delete currentPlugins[pluginID];
			this.setState(Object.assign(this.state, { "plugins": currentPlugins }));
		}
	}

	renderSettings(name, sForm) {

		let isOpen = name == this.state._openSettings;
		if(isOpen){
			return <div className='settings-form-container'>
				<div id={name+"SettingsForm"} className='settings-form-html' pluginname={name} dangerouslySetInnerHTML={{__html:sForm}}></div>
				<div className="save-div"><button type="submit" form="settingsForm" className="save-button">Save</button><div className="save-status"></div></div>
			</div>
		}else{
			return null;
		}
	}

	selectAsset(e){
		let assetParent = e.target.closest(".plugin-entry");
		window.radioClass("selected", "#"+assetParent.id+" .asset-entry", e.target.closest(".asset-entry"));

		let assetName = e.target.closest(".asset-entry").id;

		let newState = Object.assign(this.state);
		newState._assetFilePreview = assetName;
		if(window.getMediaType(assetName) == "sound"){
			this.setState(newState,function(){
				this.audioPreviewRef.current.pause();
				this.audioPreviewRef.current.load();
		   });
			
		}else{
			this.setState(newState);
		}
		
	}

	async deleteAsset(e){
		let pluginName = e.target.closest(".plugin-entry").id;
		let assetName = document.querySelector("#"+pluginName+" .asset-entry.selected").id;

		const requestOptions = {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
			body: JSON.stringify({ "pluginName": pluginName, "assetName":assetName })
		}

		let deleteReq = await fetch('/delete_plugin_asset', requestOptions)
			.then(response => response.json());
		if (deleteReq.status == "SUCCESS") {
			let thisPlugin = Object.assign(this.state[pluginName]);
			thisPlugin.assets = deleteReq.newAssets;
			this.setState(Object.assign(this.state, { [pluginName]: thisPlugin }));
		}
	}

	renderAssetManager(name){
		let isOpen = name == this.state._openAssets;

		let pluginAssets = this.state[name].assets;

		if(isOpen){
			let fileTable = [];
			for(let p in pluginAssets){
				fileTable.push(
					<div className="asset-entry" id={pluginAssets[p]} onClick={this.selectAsset}>{pluginAssets[p]}</div>
				);
			}

			let previewHTML = null;
			let previewAudio = null;
			if(this.state._assetFilePreview != null){
				if(window.getMediaType(this.state._assetFilePreview) == "sound"){
					previewAudio = this.state[name].path+"/assets/"+this.state._assetFilePreview
				}else{
					previewHTML = window.getMediaHTML(this.state[name].path+"/assets/"+this.state._assetFilePreview);
				}
				
			}

			return <div className="asset-container">
					
					<div className="asset-select">
						<div className="asset-fileselect">
							{fileTable}
						</div>
						<div className="asset-preview">
							{previewHTML}
							<audio id="audioPreview" file={previewAudio} ref={this.audioPreviewRef} controls>
								<source src={previewAudio}></source>
							</audio>
						</div>
					</div>
					<div className="asset-buttons">
						<div className="asset-button upload" onClick={this.handleAssetUploadClick} plugin-name={name}>
							<FontAwesomeIcon icon={faUpload} size="lg" />
						</div>
						<div className="asset-button delete" onClick={this.deleteAsset}>
							<FontAwesomeIcon icon={faTrash} size="lg" />
						</div>
					</div>
				</div>
		}else{
			return null;
		}
	}

	imgError(el){
		el.preventDefault();
		window.setClass(el.target.closest(".plugin-entry-icon"), "default", true);
	}

	render() {

		let pluginList = [];
		for (let p in this.state) {
			if(p.startsWith("_")){continue;}
			pluginList.push(
				<div className="plugin-entry" id={p}>
					<div className="plugin-entry-ui">
						<div className="plugin-entry-icon">
							<img src={this.state[p]['path'] + "/icon.png"} onError={this.imgError} />
							<FontAwesomeIcon icon={faSpider} size="lg" className="plugin-default-icon"/>
						</div>
						<div className="plugin-entry-info">
							<div className="plugin-entry-title">{p}</div>
							<a href={this.state[p]["path"]} target="_blank">{this.state[p]["path"]}</a>
						</div>
						<div className="plugin-button-ui">
							<div className="plugin-button settings" onClick={this.pluginSettings}><FontAwesomeIcon icon={faCog} size="lg" /></div>
							<div className="plugin-button upload" onClick={this.pluginAssets}><FontAwesomeIcon icon={faFile} size="lg" plugin-name={p} /></div>
							<a className="link-override" href={"/export_plugin/"+p} download={p+".zip"}><div className="plugin-button export"><FontAwesomeIcon icon={faDownload} size="lg" plugin-name={p} /></div></a>
							<div className="plugin-button delete" onClick={this.deletePlugin}><FontAwesomeIcon icon={faTrash} size="lg" /></div>
							<input type='file' id='input-file' plugin-name={p} onChange={this.uploadPluginAsset} style={{ display: 'none' }} />
						</div>
					</div>
					<div className="plugin-entry-settings">
						{this.renderSettings(p, this.state[p]['settings-form'])}
					</div>
					<div className="plugin-asset-manager">
						{this.renderAssetManager(p)}
					</div>
				</div>
			);
		}

		return (<div className="plugin-element">
			<div className="plugin-install-button">
				<label htmlFor='input-file'>
					<button onClick={this.handleFileClick}>Install New Plugin <FontAwesomeIcon icon={faPlusCircle} size="lg" /></button>
				</label>
				<div className="save-div"><button onClick={this.refreshPlugins}>Refresh Plugins <FontAwesomeIcon icon={faSync} size="lg" /></button><div className="save-status"></div></div>
				<input type='file' id='input-file' ref={this.hiddenFileInput} onChange={this.installNewPlugin} style={{ display: 'none' }} />
			</div>
			<div className="plugin-list">{pluginList}</div></div>);
	}
}

export { PluginTab };