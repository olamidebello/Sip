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
