<?php
// Read-only native menu/schema check. Never print credentials or database errors.
try {
 $c=json_decode(file_get_contents('/run/native-astpp/config.json'),true,512,JSON_THROW_ON_ERROR);
 mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
 $db=new mysqli('native-db','astppuser',$c['dbPassword'],'astpp');
 $stages=[
  'accounts'=>['accounts','sip_devices','permissions','roles_and_permission'],
  'carriers'=>['trunks','gateways','outbound_routes'],
  'rates'=>['pricelists','routes','ratedeck'],
  'billing'=>['invoices','invoice_details','invoice_conf','payment_transaction','taxes'],
  'numbers'=>['dids','accessnumber','ani_map'],
  'products'=>['products','orders','order_items'],
  'reports'=>['cdrs','accounts_cdr_summary','provider_cdr_summary'],
  'settings'=>['system','currency','countrycode','languages','localization']
 ];
 $stage=$argv[1]??'all';if($stage!=='all'&&!isset($stages[$stage]))throw new RuntimeException('Unknown stage');
 $required=['accounts' ,'menu_modules','permissions','roles_and_permission','trunks','gateways','routes','outbound_routes','invoices','invoice_details','products','orders'];
 if($stage!=='all')$required=array_merge(['menu_modules','permissions','roles_and_permission'],$stages[$stage]);
 $found=[];$q=$db->query('SHOW TABLES');while($row=$q->fetch_row())$found[]=$row[0];
 if(array_diff($required,$found))throw new RuntimeException('Incomplete schema');
 $menus=(int)$db->query('SELECT COUNT(*) FROM menu_modules')->fetch_row()[0];
 $permissions=(int)$db->query('SELECT COUNT(*) FROM permissions')->fetch_row()[0];
 $roles=(int)$db->query('SELECT COUNT(*) FROM roles_and_permission')->fetch_row()[0];
 if($menus<1||$permissions<1||$roles<1)throw new RuntimeException('Missing upstream menu or role records');
 echo json_encode(['stage'=>$stage,'nativeMenuRows'=>$menus,'permissionProfiles'=>$permissions,'roleDefinitions'=>$roles,'requiredDatabaseTables'=>'present','productionSwitch'=>'kamailio','liveCallAcceptance'=>'unverified']).PHP_EOL;
} catch(Throwable $e) {fwrite(STDERR,"Native menu/schema verification failed; review private native runtime configuration.\n");exit(1);}
