# Changelog

## 1.3.0 - 2026-10-10

### Fixed
- Using the extension for the first time without an API key no longer hangs; you now get a clear message.
- Auto-detect now reliably selects the main text of the page instead of missing it.
- Upgrading from version 1.1 no longer leaves you on an outdated, stale model.
- Errors from Google are shown as readable messages instead of raw JSON.
- Warning highlighting no longer flags unrelated text (fewer false positives).
- The last summary is kept when you close the popup, so reopening it shows it again. It is cleared when the browser closes.
- Long requests are no longer cut off before they finish.

### Security
- Your API key is now sent in a request header instead of in the request URL.
- The API key can be removed with the new "Remove key" button, and it is no longer loaded back into the settings page.
- Hardened the prompt against instructions hidden inside the page being summarized, and hidden text is now excluded from extraction.
- Added a data-collection declaration to the manifest (page text is sent to Google when you ask for a summary).
- A stricter content security policy limits the extension to its own files and the Google Gemini API.

### Changed
- You can pick the model from a live list in settings. The default, "gemini-flash-latest", is chosen automatically.
- Extraction scores the live page, skips nav, header, footer and aside areas, and sends at most 300,000 characters.
- The settings page opens automatically on first install.
- Requires Firefox 140 or newer.
