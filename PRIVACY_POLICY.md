# Privacy Policy — MirrorTab

**Last updated:** February 27, 2026

## Overview

MirrorTab is a browser extension that mirrors DOM interactions (clicks, keyboard input, scrolling, and form changes) from one browser tab to another in real time.

**MirrorTab does not collect, store, transmit, or share any personal data or user data of any kind.**

---

## Data the extension does NOT collect

- No browsing history
- No page content or URLs beyond what you explicitly type into the extension popup
- No keystrokes or form values are stored outside your own browser
- No analytics, telemetry, or crash reporting
- No account registration or login of any kind

---

## How the extension works locally

All processing happens entirely on your device:

| What                                                    | Where it stays                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Session configuration (source URL, target URL, tab IDs) | `chrome.storage.local` on your device only                                                       |
| Captured DOM events forwarded between tabs              | Passed in-memory via `chrome.runtime` messaging; never written to disk or sent to any server     |
| Downloaded session logs (JSON / text)                   | Saved to your local filesystem by your browser when you click Download; not transmitted anywhere |

The extension communicates solely between the browser's own internal extension APIs (`chrome.tabs`, `chrome.scripting`, `chrome.storage`, `chrome.runtime`). No external servers, APIs, or third-party services are contacted.

---

## External resources

The extension popup loads the **Poppins** typeface from Google Fonts (`fonts.googleapis.com`) for display purposes only. This is a standard CSS stylesheet request made by your browser. No extension data is included in this request. Refer to [Google's Privacy Policy](https://policies.google.com/privacy) for how Google handles font requests.

---

## Changes to this policy

If the extension is updated in a way that changes how data is handled, this document will be updated and the "Last updated" date above will change.

---

## Contact

For questions or concerns, open an issue at [github.com/KostaD02/MirrorTab](https://github.com/KostaD02/MirrorTab/issues) or contact me at [konstantine@datunishvili.ge](mailto:konstantine@datunishvili.ge)
