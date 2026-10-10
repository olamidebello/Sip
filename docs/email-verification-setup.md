# Production email verification

The production Compose API needs `RESEND_API_KEY`, `RESEND_FROM`, and a stable
`OTP_HMAC_SECRET` of at least 32 characters. The source of these values is
`/opt/olamide/repo/deployment/docker/.env`. A health check alone does not
confirm that a message can be delivered.

1. Verify the sending domain in your Resend account and create a sending API key.
2. On the production host as root, run:

   ```bash
   cd /opt/olamide/kamailio-staging
   bash deploy/kamailio/configure-email-verification.sh
   ```

   The command prompts for the sender and key without echoing the key. It
   preserves the existing OTP secret, recreates only the API container, and
   checks that the API received the settings. Do not paste the key in chat or
   place it on a command line.

3. Create a test account with an email inbox you control, receive the six-digit
   code, verify the account, and sign in. If the provider rejects the sender,
   review its domain verification and the server's API logs without sharing
   secret environment values.

Registration remains unavailable until a delivery provider is configured.
