import OSCService from './../OSCService';

// One OSC message to one destination - the whole of the OSC Send node.
//
// It used to be three nodes in one: 'timed' held the address for a duration and sent an off
// value afterwards, arbitrating against overlapping events by priority, and 'button-press'
// sent an off value 500ms later. Both are graph shapes now (a Delay node and a second send,
// or OSC Claim/OSC Release for the arbitration), so saved nodes were rewritten into those -
// see upgradeOscSendNodes in EventGraphMigration.ts - and what's left is the send itself.
export default function EventSoftwareCommand(eCommand: any) {
  return () => {
    OSCService.sendToUDP(eCommand.dest_udp, eCommand.address, eCommand.valueOn);
  };
}
