export function softphoneMediaOptions(config){
 if(!config||!Array.isArray(config.iceServers))throw Error('Calling network configuration unavailable');
 return {iceGatheringTimeout:8000,peerConnectionConfiguration:{iceServers:config.iceServers,iceTransportPolicy:'all'}};
}
