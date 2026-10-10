# Privacy Policy for ToS Summarizer AI

**Effective Date:** October 10, 2026  
**Version:** 1.3.0

## Introduction

ToS Summarizer AI ("the Extension") runs entirely in your browser. The developer operates no server and receives none of your data. This policy explains what the Extension stores and what it sends to Google.

## What the Extension handles

- **API key:** The Google AI Studio API key you enter is stored **unencrypted** in the extension storage of your browser profile. Anyone with access to your profile files can read it. You can delete it at any time with the **Remove key** button in settings. The key is never loaded back into the settings page.
- **Page or selected text:** When you click the summarize button, the text of the current page (or your selection) is sent to Google's Gemini API, together with your API key in a request header. Nothing is sent until you click.
- **Last summary:** The most recent summary is held in your browser's session storage so the popup can show it again. It is cleared when the browser closes.
- **Settings:** Your chosen model is stored in extension storage.

## What the Extension does not do

- It does not send any data to the developer or to any party other than Google's Gemini API.
- It does not track your browsing, and it does not read pages until you ask for a summary.
- It does not keep summaries after the browser closes.
- Errors may be logged to the browser console to help debugging. These logs do not contain your API key.

## Google's handling of your content

Requests go directly from your browser to Google, and Google's terms apply to that content. On Google's unpaid (free) tier, Google may use the submitted content to improve its products, and human reviewers may read it. Different terms apply in the European Economic Area, the United Kingdom and Switzerland. See the [Gemini API terms](https://ai.google.dev/gemini-api/terms) and the [Google Privacy Policy](https://policies.google.com/privacy).

**Do not summarize pages that contain personal or confidential information.**

## Your controls

- Remove your API key with the **Remove key** button.
- Uninstall the Extension to delete all of its local data.
- You decide when and what is summarized.
- You are responsible for your Google API usage and any costs. See Google's [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

## Compliance

The Extension is built to follow Mozilla's add-on policies and declares in its manifest that it transmits website content to a third party (Google) at your request.

## Changes to this policy

Changes will be published in this repository. Continued use after a change means you accept the updated policy.

## Contact

- GitHub: [https://github.com/Geralt4/ToS-Summarizer-Extension](https://github.com/Geralt4/ToS-Summarizer-Extension)
- Issues: [https://github.com/Geralt4/ToS-Summarizer-Extension/issues](https://github.com/Geralt4/ToS-Summarizer-Extension/issues)
