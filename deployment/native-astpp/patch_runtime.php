<?php
// Log only exception type and source location; never account data or credentials.
$path='/var/www/html/application/hooks/PHPFatalError.php';
$source=file_get_contents($path);
$target='function exception_handler($exception) {';
$replacement=<<<'PATCH'
function exception_handler($exception) {
    error_log('Native ASTPP '.get_class($exception).' at '.$exception->getFile().':'.$exception->getLine());
PATCH;
if(strpos($source,$target)===false)throw new RuntimeException('Native error hook changed');
file_put_contents($path,str_replace($target,$replacement,$source));

// ASTPP uses CodeIgniter routes, not Drupal's q= query routing.
$path='/var/www/html/.htaccess';
$source=file_get_contents($path);
$target='index.php?q=$1';
if(strpos($source,$target)===false)throw new RuntimeException('Native front controller rule changed');
file_put_contents($path,str_replace($target,'index.php/$1',$source));

// Legacy framework errors can exit without throwing a PHP exception.
$path='/var/www/html/system/core/Exceptions.php';
$source=file_get_contents($path);
$logging=<<<'TRACE'
    error_log('Native ASTPP framework error');
    foreach(debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS,6) as $frame){
        error_log('Native ASTPP caller '.($frame['file']??'unknown').':'.($frame['line']??0));
    }
TRACE;
$count=0;
$source=preg_replace('/(function\s+show_error\s*\([^)]*\)\s*\{)/','$1'."\n".$logging,$source,1,$count);
if($count!==1)throw new RuntimeException('Native framework error function changed');
file_put_contents($path,$source);

// Record authentication progress as booleans only.
$path='/var/www/html/application/modules/login/controllers/login.php';
$source=file_get_contents($path);
$target=<<<'AUTH'
                $actual_password = $_POST['password'];
AUTH;
if(strpos($source,$target)===false)throw new RuntimeException('Native login handler changed');
$source=str_replace($target,$target."\n                error_log('Native ASTPP auth handler reached');",$source);
$target=<<<'AUTH'
                $user_valid = $this->Auth_model->verify_login($_POST['username'], $_POST['password']);
AUTH;
$logging=<<<'AUTH'
                error_log('Native ASTPP auth accepted='.(int)$user_valid);
AUTH;
if(strpos($source,$target)===false)throw new RuntimeException('Native login verification changed');
file_put_contents($path,str_replace($target,$target."\n".$logging,$source));

$path='/var/www/html/application/modules/login/controllers/login.php';
$source=file_get_contents($path);
$steps=<<<'STEPS'
$this->session->set_userdata('user_login', TRUE);
$result = $result[0];
$permission_decode = json_decode($permission_result['permissions'], true);
$token = $this->token($result['id'], 'e', $result);
$this->db->insert('login_activity_report', $login_activity_array);
$accessid = $this->encrypt($this->config->item('private_key'), $result['id'] . $result['type']);
$menu_list = $this->permission->get_module_access($result['type']);
STEPS;
foreach(explode("\n",$steps) as $index=>$target){
 if(strpos($source,$target)===false)throw new RuntimeException('Native login stage changed');
 $source=str_replace($target,$target."\n error_log('Native ASTPP login stage ".$index."');",$source);
}
file_put_contents($path,$source);
