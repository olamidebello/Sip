# Production email verification

The registration API sends codes through Resend over HTTPS. The host needs
trusted CA certificates, outbound HTTPS, a stable OTP secret, and an encryption
key for the provider credential stored in MySQL. A local SMTP daemon is not
required. A health check alone does not prove delivery.

1. Verify the sending domain in your Resend account and create a sending API key.
2. On the Debian 12 production host as root, pull the branch and run:

   ```bash
   cd /opt/olamide/kamailio-staging
   git fetch origin kamailio-rebuild
   git switch --detach origin/kamailio-rebuild
   ansible-playbook -i deploy/kamailio/local-inventory.ini deploy/kamailio/email-verification.yml
   ```

   The playbook installs CA certificates, curl, OpenSSL and DNS tools, generates
   missing `OTP_HMAC_SECRET` and `EMAIL_CONFIG_KEY` in the existing private
   `/opt/olamide/repo/deployment/docker/.env`, then deploys the GUI, API and
   database migration. It refuses to replace a populated key.

3. For local unattended provisioning, put the Resend sending key alone in a
   root-owned file outside the Git checkout and supply its path and verified
   sender in a root-only Ansible vars file:

   ```bash
   install -d -m 0700 /root/olamide-email
   umask 077
   read -r -s -p 'Resend sending key: ' EMAIL_INPUT; printf '\n'
   printf '%s\n' "$EMAIL_INPUT" > /root/olamide-email/provider.key
   unset EMAIL_INPUT
   chmod 0600 /root/olamide-email/provider.key
   cat > /root/olamide-email/provision.yml <<'EOF'
   email_provider_key_file: /root/olamide-email/provider.key
   email_sender: verify@YOUR_VERIFIED_DOMAIN
   EOF
   chmod 0600 /root/olamide-email/provision.yml
   ansible-playbook -i deploy/kamailio/local-inventory.ini \
     deploy/kamailio/email-verification.yml -e @/root/olamide-email/provision.yml
   ```

   Replace the sender with an address on the domain verified in Resend. The
   playbook copies the provider configuration into the private production
   environment and checks that the running API received it. Existing
   GUI-managed settings in MySQL take precedence over environment settings.

   Alternatively, sign in as a super administrator. Open **Account & security → Email
   verification settings**. Enter the verified sender and Resend sending API
   key, save, and send a test to your administrator email. The key is write-only
   in the GUI and encrypted in MySQL with the server-owned key.
4. Send a test message from the GUI, then create a test account with an inbox you control, receive the six-digit code,
   verify the account, and sign in. If delivery fails, check the sender domain
   and API logs without sharing secrets.

Back up the private environment securely: losing `EMAIL_CONFIG_KEY` prevents
decryption of the saved sending key, and changing `OTP_HMAC_SECRET` invalidates
outstanding codes. Do not paste provider credentials into chat or command lines.

Registration remains unavailable until a delivery provider is configured.
