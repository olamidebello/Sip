<?php
// Runtime keys stay outside the source tree and source download.
$c=json_decode(file_get_contents('/run/native-astpp/config.json'),true,512,JSON_THROW_ON_ERROR);
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
$db=null;for($i=0;$i<60;$i++){try{$db=new mysqli('native-db','astppuser',$c['dbPassword'],'astpp');break;}catch(Throwable $e){sleep(2);}}
if(!$db)throw new RuntimeException('Native database unavailable');
$ini="dbhost=native-db\ndbname=astpp\ndbuser=astppuser\ndbpass=".$c['dbPassword']."\nPRIVATE_KEY=\"".$c['privateKey']."\"\nENCRYPTION_KEY=\"".$c['sessionKey']."\"\nastpp_dbengine=MySQLi\ndebug=0\nbase_url=".$c['baseUrl']."\n";
file_put_contents('/var/lib/astpp/astpp-config.conf',$ini);chmod('/var/lib/astpp/astpp-config.conf',0640);chown('/var/lib/astpp/astpp-config.conf','www-data');
$db->query('CREATE TABLE IF NOT EXISTS olamide_native_bootstrap(id INT PRIMARY KEY)');
if(!$db->query('SELECT id FROM olamide_native_bootstrap WHERE id=1')->num_rows){
 $encrypted=openssl_encrypt($c['operatorPassword'],'BF-ECB',$c['privateKey'],OPENSSL_RAW_DATA);if($encrypted===false)throw new RuntimeException('Native password cipher unavailable');
 $password=str_replace(['+','/','='],['-','$',''],base64_encode($encrypted));
 $db->begin_transaction();try{
  $q=$db->prepare('UPDATE accounts SET password=?,status=0,deleted=0,balance=0,credit_limit=0 WHERE id=1');$q->bind_param('s',$password);$q->execute();
  $db->query('UPDATE accounts SET status=1 WHERE id<>1');$db->query('DELETE FROM ci_sessions');
  $db->query('INSERT INTO olamide_native_bootstrap(id) VALUES(1)');$db->commit();
 }catch(Throwable $e){$db->rollback();throw $e;}
}
