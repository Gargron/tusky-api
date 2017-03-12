Tusky API server
================

This server proxies notification from the Mastodon API to Firebase push notifications for users of the Tusky app. The Tusky app registers a device with some metadata, and the server connects to the Mastodon streaming API on behalf of the device user.

- `SERVER_KEY`: Firebase server API key
- `PORT`: Port to run the HTTP server on (defaults to 3000)

This server **should run behind HTTPS**.

Docker configuration included for convenience.
