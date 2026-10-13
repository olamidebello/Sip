# Message gestures

Hold a message for half a second to reveal its existing actions. Only one message is selected at a time. Actions include Reply, Star/Unstar, Forward and reactions; Edit and Remove remain restricted to the sender. Removed messages have no action menu. Choosing an action, pressing Escape, leaving the chat or tapping outside dismisses selection. File links, playback controls and inputs keep their native behavior.

Swipe horizontally at least 65 pixels in either direction to reply to the touched message. Its existing Reply handler sets the exact `replyTo` message ID for the authenticated messaging API. Vertical movement or scrolling cancels a pending hold/swipe. A canceled pointer cannot later select a message. Keyboard users can focus a message and press Enter or Shift+F10; desktop users can right-click.

After exact-head CI succeeds, deploy the web update:

```bash
cd /opt/olamide/repo &&
git pull --ff-only origin main &&
bash deployment/deploy-messaging-gui.sh
```

Reload the browser, hold a sent and received message to compare actions, swipe two different messages and verify the reply preview and quoted original, and scroll vertically to verify no reply is triggered. Existing API authorization remains authoritative; no database migration is required.
