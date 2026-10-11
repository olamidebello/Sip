const defaults={maxParticipants:4,allowLinks:true,allowInvites:true,requireInvitation:false,
  allowScreenShare:true,allowChat:true,allowReactions:true,allowHand:true};
export async function migrateMeetingPolicy(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS meeting_tenant_policy (
    tenant_id CHAR(36) PRIMARY KEY,max_participants TINYINT UNSIGNED NOT NULL DEFAULT 4,
    allow_links BOOLEAN NOT NULL DEFAULT TRUE,allow_invites BOOLEAN NOT NULL DEFAULT TRUE,
    require_invitation BOOLEAN NOT NULL DEFAULT FALSE,allow_screen_share BOOLEAN NOT NULL DEFAULT TRUE,
    allow_chat BOOLEAN NOT NULL DEFAULT TRUE,allow_reactions BOOLEAN NOT NULL DEFAULT TRUE,
    allow_hand BOOLEAN NOT NULL DEFAULT TRUE,updated_by CHAR(36) NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(updated_by) REFERENCES users(id)
  ) ENGINE=InnoDB`);
}
export async function meetingPolicy(pool,tenant){
  const result=await pool.query(`SELECT max_participants,allow_links,allow_invites,require_invitation,
    allow_screen_share,allow_chat,allow_reactions,allow_hand FROM meeting_tenant_policy WHERE tenant_id=$1`,[tenant]);
  const row=result.rows[0];
  return row?{maxParticipants:Number(row.max_participants),allowLinks:!!row.allow_links,
    allowInvites:!!row.allow_invites,requireInvitation:!!row.require_invitation,
    allowScreenShare:!!row.allow_screen_share,allowChat:!!row.allow_chat,
    allowReactions:!!row.allow_reactions,allowHand:!!row.allow_hand}: {...defaults};
}
export function validMeetingPolicy(value){
  return value&&Number.isInteger(value.maxParticipants)&&value.maxParticipants>=2&&value.maxParticipants<=4&&
    Object.keys(defaults).filter(key=>key!=='maxParticipants').every(key=>typeof value[key]==='boolean')&&
    (!value.requireInvitation||value.allowInvites);
}
export async function saveMeetingPolicy(pool,tenant,actor,value){
  if(!validMeetingPolicy(value))throw new RangeError('Choose 2–4 participants and valid meeting switches; invitation required needs invitations enabled');
  await pool.query(`INSERT INTO meeting_tenant_policy(tenant_id,max_participants,allow_links,allow_invites,
    require_invitation,allow_screen_share,allow_chat,allow_reactions,allow_hand,updated_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON DUPLICATE KEY UPDATE max_participants=VALUES(max_participants),allow_links=VALUES(allow_links),
    allow_invites=VALUES(allow_invites),require_invitation=VALUES(require_invitation),
    allow_screen_share=VALUES(allow_screen_share),allow_chat=VALUES(allow_chat),
    allow_reactions=VALUES(allow_reactions),allow_hand=VALUES(allow_hand),updated_by=VALUES(updated_by)`,
    [tenant,value.maxParticipants,value.allowLinks,value.allowInvites,value.requireInvitation,
      value.allowScreenShare,value.allowChat,value.allowReactions,value.allowHand,actor]);
}
