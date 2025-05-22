// Background script for Gemini API integration
// --- Debug Flag (set to false for production) ---
const DEBUG = true;

// Helper to get stored API key
async function getApiKey() {
  const res = await browser.storage.local.get('geminiApiKey');
  return res.geminiApiKey || '';
}

// Helper to get stored model name or fallback
async function getModelName() {
  const res = await browser.storage.local.get('geminiModelName');
  return res.geminiModelName || 'gemini-1.5-flash-latest';
}

// List available models from Gemini API
async function listAvailableModels() {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { error: 'API key not configured.' };
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  if (DEBUG) console.log('[listAvailableModels] Fetching models from:', url);
  try {
    const response = await fetch(url);
    const text = await response.text();
    const data = response.ok ? JSON.parse(text) : null;
    if (!response.ok) {
      const errMsg = data?.error?.message || text;
      return { error: `API Error ${response.status}: ${errMsg}` };
    }
    const usable = (data.models || [])
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => m.name.replace('models/', ''));
    if (DEBUG) console.log('[listAvailableModels] usable models:', usable);
    return { usableNames: usable };
  } catch (err) {
    console.error('[listAvailableModels] Network error:', err);
    return { error: `Network error: ${err.message}` };
  }
}

// Summarize text with Gemini API
async function summarizeTextWithGemini(text) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('API key not configured.');
  const model = await getModelName();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  if (DEBUG) console.log('[summarizeTextWithGemini] URL:', url);
  
  const prompt = `Please analyze and summarize the following Terms of Service text:

**Instructions:**
1. Focus on key aspects like data collection and usage (especially sharing or selling to third parties), user rights and content ownership, liability limitations and disclaimers, arbitration clauses, class action waivers, automatic renewals or subscription terms, account termination clauses, and how terms can be changed by the company.
2. Present the summary as clear, concise bullet points.
3. **Critically Important:** If a summarized point covers a potentially concerning clause (like mandatory arbitration, waiving class action rights, broad rights for the company over user data/content, difficult cancellation, limiting liability significantly, company changing terms without clear notice), **you MUST prepend that specific bullet point with the exact marker: "[WARNING] "**. Do not use the marker otherwise.

**Terms of Service Text:**
---
${text}
---

**Summary (following instructions):**`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const bodyText = await response.text();
    const data = response.ok ? JSON.parse(bodyText) : null;
    if (!response.ok) {
      // Enhanced error handling for common issues
      if (response.status === 429) {
        throw new Error('API Quota Exceeded (Error 429). This usually means too many requests were sent in a short period (e.g., >60 per minute for the free tier) or the input text was too large for the current quota. Please wait a minute and try again with a smaller selection if needed.');
      }
      throw new Error(`API ${response.status}: ${data?.error?.message || bodyText}`);
    }
    // Safety block detection
    if (data?.candidates?.[0]?.finishReason === 'SAFETY') {
      throw new Error('Request blocked by safety filters.');
    }
    const summary = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!summary) throw new Error('No summary returned.');
    if (DEBUG) console.log('[summarizeTextWithGemini] Summary:', summary);
    return { summary: summary.trim() };
  } catch (err) {
    console.error('[summarizeTextWithGemini] Error:', err);
    return { error: err.message };
  }
}

// Background message listener
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    if (request.action === 'listModels') {
      const result = await listAvailableModels();
      sendResponse(result);
    } else if (request.action === 'summarize') {
      const result = await summarizeTextWithGemini(request.text || '');
      sendResponse(result);
    } else {
      sendResponse({ error: 'Unknown action.' });
    }
  })();
  return true; // Keep channel open for async response
});