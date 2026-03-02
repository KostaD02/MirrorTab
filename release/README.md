# MirrorTab - Release Builds

This folder contains the packaged release versions of MirrorTab.

Until MirrorTab is published on the Chrome Web Store, you can install it manually from this folder using Chrome's **Developer Mode**.

---

## How to Install

1. Download or locate the latest `.zip` file in this folder (e.g. `mirrortab-1.0.0.zip`).
2. **Extract** the `.zip` to a folder on your machine.
3. Open Chrome and navigate to `chrome://extensions`.
4. Enable **Developer mode** using the toggle in the top-right corner.
5. Click **Load unpacked**.
6. Select the **extracted folder** from step 2.

The MirrorTab icon will appear in your Chrome toolbar. Click it to open the popup and start a session.

---

## How to Use

1. Click the **MirrorTab** icon in the Chrome toolbar to open the popup.
2. Enter a **Source URL** - interactions on this tab will be captured.
3. Enter a **Target URL** - interactions will be replayed here in real time.
4. Click **Start Session**. Two new tabs will open automatically.
5. Interact with the **SOURCE** tab (click, type, scroll). Every action is mirrored live to the **TARGET** tab.
6. Use **Pause / Resume** to temporarily suspend mirroring without ending the session.
7. Use **Download JSON** or **Download Text** to export the full event log at any time.
8. Click **Stop** to end the session.

---

## Notes

- MirrorTab requires Chrome with Developer mode enabled for manual installation.
- The extension requests permissions for `tabs`, `scripting`, and `storage` - these are the minimum necessary for the mirroring functionality to work.
- No data is sent to any external server. All communication happens **locally** between your **browser tabs**.
