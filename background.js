// Background script for Gemini API integration

// Helper to get stored API key
async function getApiKey() {
  const res = await browser.storage.local.get('geminiApiKey');
  return res.geminiApiKey || '';
}

// Helper to get stored model name or fallback
async function getModelName() {
  const res = await browser.storage.local.get('geminiModelName');
  return res.geminiModelName || 'gemini-3-flash-preview';
}

// Test API key validity — called via message action so key never touches options page network stack
async function testApiKey() {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { error: 'No API key configured.' };
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json();
      const modelCount = data.models ? data.models.length : 0;
      return { valid: true, modelCount };
    } else {
      const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      return { valid: false, error: errorData.error?.message || 'Invalid key' };
    }
  } catch (err) {
    return { valid: false, error: `Network error: ${err.message}` };
  }
}

// Summarize text with Gemini API
async function summarizeTextWithGemini(text) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('API key not configured.');
  const model = await getModelName();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
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
      cache: 'no-store',
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
    return { summary: summary.trim() };
  } catch (err) {
    console.error('[summarizeTextWithGemini] Error:', err);
    return { error: err.message };
  }
}

// Background message listener
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    if (request.action === 'testKey') {
      const result = await testApiKey();
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