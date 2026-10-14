FROM php:7.4-apache-bullseye
ARG ASTPP_COMMIT=9479778d1c9a325fc28b0265575f256703626077
# Bullseye security packages are retained in Debian's signed snapshot archive.
RUN printf 'deb https://deb.debian.org/debian bullseye main\ndeb [check-valid-until=no] https://snapshot.debian.org/archive/debian-security/20260903T220410Z/ bullseye-security main\n' > /etc/apt/sources.list \
 && rm -rf /var/lib/apt/lists/* \
 && apt-get -o Acquire::Retries=3 -o Acquire::http::No-Cache=true -o Acquire::https::No-Cache=true update \
 && apt-get -o Acquire::Retries=3 install -y --no-install-recommends git ca-certificates curl libmcrypt-dev libonig-dev libzip-dev libpng-dev libjpeg62-turbo-dev libfreetype6-dev libicu-dev libxml2-dev locales && rm -rf /var/lib/apt/lists/* \
 && docker-php-ext-configure gd --with-freetype --with-jpeg \
 && docker-php-ext-install -j2 mysqli pdo_mysql mbstring gettext gd intl bcmath zip soap \
 && pecl install mcrypt-1.0.7 && docker-php-ext-enable mcrypt \
 && a2enmod rewrite headers \
 && git init /usr/src/astpp && cd /usr/src/astpp && git remote add origin https://github.com/iNextrix/ASTPP.git && git fetch --depth=1 origin "$ASTPP_COMMIT" && git checkout --detach FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "$ASTPP_COMMIT" \
 && cp -a web_interface/astpp/. /var/www/html/ && cp LICENSE /var/www/html/ASTPP-LICENSE \
 && mkdir -p /var/lib/astpp && chown -R www-data:www-data /var/www/html/application/cache /var/www/html/application/logs /var/lib/astpp \
 && sed -i 's|AllowOverride None|AllowOverride All|g' /etc/apache2/apache2.conf \
 && printf 'display_errors=Off\nlog_errors=On\nexpose_php=Off\n' > /usr/local/etc/php/conf.d/astpp-production.ini
COPY Dockerfile compose.yml NOTICE.md entrypoint.sh bootstrap.php sanitize_sql.py /usr/local/lib/native-astpp/
RUN tar --exclude=.git -czf /var/www/html/astpp-source.tar.gz -C /usr/src astpp -C /usr/local/lib native-astpp
HEALTHCHECK --interval=15s --timeout=5s --retries=12 CMD curl -fsS http://127.0.0.1/ | grep -qi 'password'
ENTRYPOINT ["/bin/sh","/usr/local/lib/native-astpp/entrypoint.sh"]
