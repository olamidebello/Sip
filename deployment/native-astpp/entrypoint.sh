#!/bin/sh
set -eu
php /usr/local/lib/native-astpp/bootstrap.php
exec apache2-foreground
