import {createHmac} from "node:crypto";

export function turnIceServer({secret,host,port=3478,userId,now=Date.now()}) {
  if (typeof secret!=="string" || secret.length<32 ||
      typeof host!=="string" || !/^[a-z0-9][a-z0-9.-]{0,252}$/i.test(host) ||
      !Number.isInteger(port) || port<1 || port>65535 ||
      typeof userId!=="string" || !/^[a-f0-9-]{36}$/i.test(userId))
    throw new Error("Invalid TURN configuration");
  const expiry=Math.floor(now/1000)+3600;
  const username=`${expiry}:${userId}`;
  return {urls:[`turn:${host}:${port}?transport=udp`,`turn:${host}:${port}?transport=tcp`],
    username,credential:createHmac("sha1",secret).update(username).digest("base64")};
}
