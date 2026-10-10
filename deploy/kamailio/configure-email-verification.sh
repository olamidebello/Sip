#!/usr/bin/env bash
# Configure the existing production API's verification sender without putting
# the provider key in shell history, command arguments, or the Git checkout.
set -euo pipefail

staging=/opt/olamide/kamailio-staging
env_file=/opt/olamide/repo/deployment/docker/.env
[[ $(id -u) -eq 0 ]] || { echo 'Run as root on the application server.' >&2; exit 2; }
[[ -f $env_file && ! -L $env_file ]] || { echo 'Private production environment is missing or is a symlink.' >&2; exit 2; }
[[ -f $staging/deployment/docker/compose.yml ]] || { echo 'Staging Compose file is missing.' >&2; exit 2; }
[[ -t 0 ]] || { echo 'Run interactively; the provider key is requested privately.' >&2; exit 2; }

read -r -p 'Verified Resend sender (for example verify@yourdomain.com): ' sender
read -r -s -p 'Resend sending API key: ' provider_key
printf '\n'
[[ $sender =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || { echo 'Enter a valid sender address on your verified domain.' >&2; exit 2; }
[[ $provider_key =~ ^re_[A-Za-z0-9_]{16,}$ ]] || { echo 'Enter a Resend sending API key.' >&2; exit 2; }

EMAIL_FROM_INPUT="$sender" EMAIL_KEY_INPUT="$provider_key" EMAIL_ENV_FILE="$env_file" python3 - <<'PY'
import os, pathlib, secrets, tempfile

path = pathlib.Path(os.environ['EMAIL_ENV_FILE'])
lines = path.read_text().splitlines()
values = dict(line.split('=', 1) for line in lines if line and not line.startswith('#') and '=' in line)
values['RESEND_API_KEY'] = os.environ['EMAIL_KEY_INPUT']
values['RESEND_FROM'] = os.environ['EMAIL_FROM_INPUT']
# Never rotate an existing valid secret: pending email codes depend on it.
if len(values.get('OTP_HMAC_SECRET', '')) < 32:
    values['OTP_HMAC_SECRET'] = secrets.token_urlsafe(48)
keys = {'RESEND_API_KEY', 'RESEND_FROM', 'OTP_HMAC_SECRET'}
updated = [line for line in lines if not any(line.startswith(key + '=') for key in keys)]
updated.extend(f'{key}={values[key]}' for key in ('RESEND_API_KEY', 'RESEND_FROM', 'OTP_HMAC_SECRET'))
fd, temporary = tempfile.mkstemp(prefix='.email-verification-', dir=path.parent)
try:
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, 'w') as output:
        output.write('\n'.join(updated) + '\n')
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY
unset provider_key sender

compose=(docker compose --project-name docker --env-file "$env_file" -f "$staging/deployment/docker/compose.yml")
"${compose[@]}" config --quiet
"${compose[@]}" up -d --no-deps --force-recreate api
"${compose[@]}" exec -T api node -e 'const e=process.env;process.exit(e.RESEND_API_KEY && e.RESEND_FROM && e.OTP_HMAC_SECRET?.length>=32 ? 0 : 1)'
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:18080/api/health >/dev/null
echo 'Email verification settings reached the healthy API container. Create a test account and confirm delivery before relying on registration.'
