export async function handleSmsHistory({req,res,path,user,pool,send,readJson}){
 if(path!=='/api/external-sms/history'||req.method!=='POST')return false;
 if(!user.features?.messaging)return send(res,403,{error:'Messaging access required'});
 const {local,peer,offset=0}=await readJson(req),phone=/^\+[1-9][0-9]{7,14}$/;
 if(!phone.test(local)||!phone.test(peer)||!Number.isSafeInteger(offset)||offset<0)return send(res,400,{error:'Valid conversation numbers and offset required'});
 const result=await pool.query(`SELECT * FROM (
 SELECT id,sender,recipient,body,status,received_at AS created_at,0 AS outgoing FROM flowroute_message_events WHERE tenant_id=$1 AND owner_id=$2 AND recipient=$3 AND sender=$4 AND kind IN ('sms','mms')
 UNION ALL
 SELECT id,sender,recipient,body,status,created_at,1 AS outgoing FROM flowroute_sms_outbound WHERE tenant_id=$1 AND user_id=$2 AND sender=$3 AND recipient=$4
 ) history ORDER BY created_at ASC,id ASC LIMIT 100 OFFSET ${offset}`,[user.tenant_id,user.id,local,peer]);
 return send(res,200,{messages:result.rows,nextOffset:result.rows.length===100?offset+100:null});
}
