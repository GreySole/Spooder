import React from 'react';

class BoolSwitch extends React.Component{
    constructor(props){
        super(props);
        this.state = {...props};
        this.toggleSwitch = this.toggleSwitch.bind(this);
    }

    toggleSwitch = (e) =>{
		
        console.log("TOGGLE SWITCH");
        
        let thisSwitch = e.target.closest(".boolswitch");
        
        if(e.target.checked == false){
            thisSwitch.classList.remove("checked");
        }else{
            thisSwitch.classList.add("checked");
        }
        this.state.onChange(e);
    }

    render(){
        return <label className={this.state.checked?"boolswitch checked":"boolswitch"}><input type="checkbox" name={this.state.name} eventname={this.state.eventname} defaultChecked={this.state.checked} onChange={this.toggleSwitch}/>
        <div></div></label>;
    }
}

export default BoolSwitch;