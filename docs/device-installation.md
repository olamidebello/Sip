# Device-aware installation and updates

The install page is `/install/` on the SIP website and `/install/sip` on Africa Apps Store. Detection recommends Android, iPhone/iPad, Windows, macOS or Linux. Users can always select another platform and architecture. iPad desktop-mode detection uses touch capability; unknown devices receive the web option. No user-agent data is sent for detection.

Links come from actual published Sip GitHub release assets. The Apps Store proxies the fixed public release endpoint with a ten-minute cache. The installer excludes draft releases and rejects assets hosted outside the Sip release path. The user can check for updates; the site cannot read installed native app versions or silently install an operating-system update.

Packages workflow builds Android and x64/arm64 Windows, macOS and Linux previews. Android permissions for microphone, camera and audio routing are declared independently of optional Firebase configuration. Permission grants still belong to the user. Firebase credentials and compatible switch push-wait routing remain required for background incoming-call delivery.

Physical iPhone and iPad users use Safari → Share → Add to Home Screen. Simulator artifacts are never offered as a physical-device install. Native iOS distribution requires Apple signing and an App Store or TestFlight release. Desktop previews are unsigned. Android preview updates require the same signing certificate; do not promise seamless upgrades across development keys or distribution channels.

Deploy SIP web links with `deploy/ansible/device-downloads.yml` on the SIP server. Deploy the Store listing with `ansible/deploy-sip-device-downloads.yml` from the africanappsstore repository on the existing Apps Store server. Both preserve existing application state and include rollback. The store-specific updater changes only the SIP routes, static files and catalog entry, preserving its visibility setting and other applications.
