# Olamide Social

Social appears after Money with an original star/network icon. A tenant-scoped chronological feed supports 280-character text posts, replies, people search by display name, author feed, following feed, likes, repost counts, private bookmarks and soft deletion. Publishing requires the user's explicit Post action. Super admin navigation policy can hide Social per user or group and the API enforces that policy. All accounts within the workspace can see social posts; this is not the opt-in private contact directory. No cross-tenant public network is enabled.

Run after exact-release CI succeeds:

```bash
cd /opt/olamide/repo &&
git pull --ff-only origin main &&
bash deployment/deploy-social-platform.sh
```

The existing Ansible workflow backs up MySQL, builds API/web, applies additive social tables, restarts the app and checks HTTPS. Verify with two accounts. Posts, likes, reposts, bookmarks and follows persist in MySQL. Moderators may remove a tenant post through DELETE /api/social/posts/:id; the user interface exposes deletion to the author. Reposts currently record endorsement/count; they do not inject another user's post into follower timelines. Replies display their parent identifier in the chronological feed. For you is chronological, not algorithmic.

This is an initial social platform, not full Twitter/X parity. Media posts, public handles, quote posts, notifications, trends, Spaces, algorithmic ranking, subscriptions, advertisements and a complete reporting/moderation console are not implemented. Card issuance, SIP calls and wallet transactions are unaffected.

## Existing social profile links

Users can save, edit, hide and unlink HTTPS profile links for X/Twitter, Instagram, Facebook, LinkedIn, TikTok, YouTube, Threads and Bluesky under Social → Link your social profiles. One link per platform is stored in MySQL. Find people → Social profiles displays links explicitly made visible in the same tenant. Hidden links are returned only to their owner. Profile URLs are unverified; no provider account ownership, OAuth, cross-posting or synchronization is established. Only approved platform hosts are accepted; credentials, non-HTTPS, lookalike domains and tracking parameters are rejected or stripped. Use the same social deployment script to apply the additive table.
