// Server-only role change; run from the deployed API container after schema upgrade.
import {createDatabase} from './db.js';
import {changeAdminRole} from './adminGroup.js';
const [email,role]=process.argv.slice(2);
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email||'')||!['admin','user'].includes(role)){
 console.error('Usage: node manage-admin-group.js existing-email admin|user');process.exit(2);
}
const db=createDatabase(process.env.MYSQL_URL);
try{const result=await changeAdminRole(db,{email,role});console.log(JSON.stringify({email,role:result.role,previousRole:result.previousRole,sessionsRevoked:true}));}
catch(e){console.error(e.httpStatus?e.message:'Role change failed; inspect private server diagnostics');process.exitCode=1;}
finally{await db.end();}
