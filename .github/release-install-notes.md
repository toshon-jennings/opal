## Install

| Platform | Download |
| --- | --- |
| macOS (Apple Silicon) | `Perci-__VERSION__-arm64.dmg` |
| macOS (Intel) | `Perci-__VERSION__-x64.dmg` |
| Windows | `Perci-Setup-__VERSION__.exe` |

Not sure which Mac build you need? Open **Apple menu → About This Mac**. If it
shows **Chip: Apple M-series**, download `arm64`. If it shows **Processor:
Intel**, download `x64`. Both Mac builds require macOS 12 Monterey or newer.

The other assets (`.zip`, `.blockmap`, `latest-mac.yml`, `latest.yml`) are used
by the in-app updater. You don't need to download them.

### Opening Perci the first time on macOS

Perci isn't signed with an Apple Developer certificate yet, so macOS won't
verify it and will refuse to open it on the first try.

1. Drag Perci to Applications and double-click it.
2. When macOS blocks it, open **System Settings → Privacy & Security**.
3. Scroll to **Security**, find the message about Perci, and click **Open Anyway**.

You only do this once per install. Windows has no equivalent step.

### Updates

Perci checks for updates on launch.

- **Windows** — updates in place. You'll get a prompt to download and restart.
- **macOS** — manual for now. Download the newest `.dmg` above and replace the
  app. macOS refuses to swap in an update whose code signature it can't verify,
  so automatic updates need the same Apple certificate as above.
