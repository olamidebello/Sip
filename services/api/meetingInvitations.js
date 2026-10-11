export async function migrateMeetingInvitations(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS meeting_invitations (
    room_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,recipient_id CHAR(36) NOT NULL,
    invited_by CHAR(36) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY(room_id,recipient_id),INDEX meeting_invitee(tenant_id,recipient_id,created_at),
    FOREIGN KEY(room_id) REFERENCES meeting_rooms(id) ON DELETE CASCADE,
    FOREIGN KEY(recipient_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(invited_by) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
}

export async function inviteMeeting({pool,tenant,host,roomId,email}){
  if(typeof email!=='string'||email.length>254||!/^\S+@\S+\.\S+$/.test(email))
    return {status:400,body:{error:'Enter a valid recipient email'}};
  const found=await pool.query(`SELECT u.id FROM users u JOIN meeting_rooms m
    ON m.id=$1 AND m.tenant_id=u.tenant_id AND m.host_id=$2 AND m.ended_at IS NULL
    WHERE u.tenant_id=$3 AND LOWER(u.email)=LOWER($4) AND u.status='active'`,
  [roomId,host,tenant,email.trim()]);
  if(!found.rowCount||found.rows[0].id===host)
    return {status:404,body:{error:'Active tenant recipient or hosted meeting unavailable'}};
  await pool.query(`INSERT INTO meeting_invitations(room_id,tenant_id,recipient_id,invited_by)
    VALUES($1,$2,$3,$4) ON DUPLICATE KEY UPDATE invited_by=VALUES(invited_by)`,
  [roomId,tenant,found.rows[0].id,host]);
  return {status:200,body:{invited:true}};
}
