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

3. Sign in as a super administrator. Open **Account & security → Email
   verification settings**. Enter the verified sender and Resend sending API
   key, save, and send a test to your administrator email. The key is write-only
   in the GUI and encrypted in MySQL with the server-owned key.
4. Create a test account with an inbox you control, receive the six-digit code,
   verify the account, and sign in. If delivery fails, check the sender domain
   and API logs without sharing secrets.

Back up the private environment securely: losing `EMAIL_CONFIG_KEY` prevents
decryption of the saved sending key, and changing `OTP_HMAC_SECRET` invalidates
outstanding codes. Do not paste provider credentials into chat or command lines.

Registration remains unavailable until a delivery provider is configured.
