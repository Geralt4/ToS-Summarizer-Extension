// ========================================================================
// --- START OF background.js (v2 - Improved 429 Error Message) ---
// ========================================================================

// --- Function Definitions ---

async function listAvailableModels(apiKey) {
    // ... (This function remains unchanged from before) ...
    if (!apiKey) { console.error("[listAvailableModels] API Key is missing."); return { error: "API Key not found. Please set it in the extension options." }; }
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    console.log("[listAvailableModels] Listing models from:", listUrl);
    try {
        const response = await fetch(listUrl);
        console.log("[listAvailableModels] Response Status:", response.status);
        if (!response.ok) {
            const errorText = await response.text(); console.error("[listAvailableModels] API Error Status:", response.status); console.error("[listAvailableModels] API Error Body:", errorText);
            try { const errorJson = JSON.parse(errorText); return { error: `API Error ${response.status}: ${errorJson?.error?.message || errorText}` }; } catch (e) { return { error: `API Error ${response.status}: ${errorText}` }; }
        }
        const data = await response.json(); console.log("[listAvailableModels] --- Available Models START ---"); console.log(JSON.stringify(data, null, 2)); console.log("[listAvailableModels] --- Available Models END ---");
        let usableModelNames = []; if (data.models && Array.isArray(data.models)) { const usableModels = data.models.filter(model => model.supportedGenerationMethods && model.supportedGenerationMethods.includes("generateContent")); usableModelNames = usableModels.map(model => model.name.replace('models/', '')); console.log("[listAvailableModels] --- Models supporting 'generateContent' START ---"); console.log(usableModelNames); console.log("[listAvailableModels] --- Models supporting 'generateContent' END ---"); }
        return { models: data.models, usableNames: usableModelNames };
    } catch (error) { console.error("[listAvailableModels] Network/Fetch Error:", error); return { error: `Network or fetch error: ${error.message}` }; }
}

async function summarizeTextWithGemini(textToSummarize, apiKey) {
    if (!apiKey) {
        console.error("[summarizeTextWithGemini] API Key is missing.");
        return { error: "API Key not found. Please set it in the extension options." };
    }
    const modelToUse = "gemini-1.5-flash-latest";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${apiKey}`;
    const prompt = `Please analyze and summarize the following Terms of Service text.\n\n**Instructions:**\n1. Focus on key aspects like data collection and usage (especially sharing or selling to third parties), user rights and content ownership, liability limitations and disclaimers, arbitration clauses, class action waivers, automatic renewals or subscription terms, account termination clauses, and how terms can be changed by the company.\n2. Present the summary as clear, concise bullet points.\n3. **Critically Important:** If a summarized point covers a potentially concerning clause (like mandatory arbitration, waiving class action rights, broad rights for the company over user data/content, difficult cancellation, limiting liability significantly, company changing terms without clear notice), **you MUST prepend that specific bullet point with the exact marker: "[WARNING] "**. Do not use the marker otherwise.\n\n**Terms of Service Text:**\n---\n${textToSummarize}\n---\n\n**Summary (following instructions):**`;
    const requestBody = { contents: [{ parts: [{ text: prompt }] }] };

    console.log(`[summarizeTextWithGemini] Sending request to Gemini API using model: ${modelToUse}...`);
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        console.log("[summarizeTextWithGemini] Received response status:", response.status);

        if (!response.ok) {
            let errorBody;
            try {
                errorBody = await response.json();
            } catch (e) {
                // If response is not JSON, use text
                errorBody = { error: { message: await response.text() } };
            }
            console.error("[summarizeTextWithGemini] Gemini API Error:", response.status, errorBody);

            // --- *** MODIFIED ERROR HANDLING FOR 429 *** ---
            if (response.status === 429) {
                return {
                    error: "API Quota Exceeded (Error 429). This usually means too many requests were sent in a short period (e.g., >60 per minute for the free tier) or the input text was too large for the current quota. Please wait a minute and try again with a smaller selection if needed.",
                    isQuotaError: true // Add a flag for specific handling in popup
                };
            }
            // --- *** END MODIFICATION *** ---

            if (response.status === 404) {
                 return { error: `API Error: 404 - Model '${modelToUse}' not found or doesn't support generateContent.` };
            }
            // Handle potential safety blocks (though Gemini API structure for this might vary)
            if (errorBody?.error?.message?.includes("SAFETY")) { // Generic check for safety in error message
                 console.warn("[summarizeTextWithGemini] Request potentially blocked due to safety settings in error:", errorBody.error.message);
                 return { error: `Request might be blocked by API safety filters: ${errorBody.error.message}. The content might contain sensitive topics.` };
            }
            return { error: `API Error: ${response.status} - ${errorBody?.error?.message || 'Unknown API error from server.'}` };
        }

        const responseData = await response.json();

        if (responseData?.candidates?.[0]?.finishReason === 'SAFETY') {
             console.warn("[summarizeTextWithGemini] Response flagged due to safety settings:", responseData.candidates[0].safetyRatings);
             return { error: "Response partially blocked by API safety filters. Summary might be incomplete." };
        }
        if (responseData?.promptFeedback?.blockReason) {
             console.warn("[summarizeTextWithGemini] Prompt blocked due to safety settings:", responseData.promptFeedback.blockReason);
             return { error: `Prompt blocked by API safety filters: ${responseData.promptFeedback.blockReason}.` };
        }

        const summary = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!summary) {
            console.error("[summarizeTextWithGemini] Could not extract summary from API response structure:", responseData);
             if (!responseData?.candidates || responseData.candidates.length === 0) {
                 return { error: "API returned no summary candidates. This might be due to safety filters, invalid input, or an API issue." };
             }
            return { error: "Failed to parse summary from API response." };
        }
        console.log("[summarizeTextWithGemini] Summary extracted successfully.");
        return { summary: summary.trim() };

    } catch (error) {
        console.error("[summarizeTextWithGemini] Network/Fetch Error:", error);
        return { error: `Network or fetch error: ${error.message}` };
    }
}

// --- Event Listener (Unchanged from before) ---
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
        let apiKey = null;
        try {
            const storageResult = await browser.storage.local.get('geminiApiKey');
            if (storageResult && storageResult.geminiApiKey) { apiKey = storageResult.geminiApiKey; console.log("[onMessage] Successfully retrieved API key from storage.");
            } else { console.warn("[onMessage] API Key not found in storage."); }
        } catch (error) { console.error("[onMessage] Error retrieving API Key:", error); sendResponse({ error: `Failed to access storage: ${error.message}` }); return; }

        if (request.action === "summarize") {
            // ... (rest of summarize action handling is identical) ...
            console.log("[onMessage] Received 'summarize' request.");
            if (!apiKey) { sendResponse({ error: "API Key not configured. Please set it in the extension options page." }); return; }
            if (!request.text || typeof request.text !== 'string' || request.text.trim().length === 0) { console.error("[onMessage] 'summarize' request received without valid text."); sendResponse({ error: "No text provided for summarization." }); return; }
            console.log("[onMessage] Text length:", request.text.length);
            console.log("[onMessage] Calling summarizeTextWithGemini...");
            const result = await summarizeTextWithGemini(request.text, apiKey);
            console.log("[onMessage] summarizeTextWithGemini returned:", result);
            try { sendResponse(result); } catch (e) { console.warn("[onMessage] Could not send response for 'summarize'.", e.message); }
        } else if (request.action === "listModels") {
            // ... (listModels action handling is identical) ...
            console.log("[onMessage] Received 'listModels' request.");
            if (!apiKey) { sendResponse({ error: "API Key not configured." }); return; }
            console.log("[onMessage] Calling listAvailableModels...");
            const result = await listAvailableModels(apiKey);
            console.log("[onMessage] listAvailableModels returned:", result);
            try { sendResponse({ status: "listModels executed", details: result }); } catch (e) { console.warn("[onMessage] Could not send response for 'listModels'.", e.message); }
        } else { console.log("[onMessage] Received unknown message action:", request?.action); }
    })();
    return true;
});

// --- Initial Script Load Confirmation (Unchanged) ---
console.log("Background script loaded successfully. Functions defined. Message listener added.");
console.log("Using model for summarization:", "gemini-1.5-flash-latest");
console.info("Background script will now attempt to retrieve API key from browser.storage.local when messages are received.");
console.info("Prompt includes instruction to prepend potentially concerning clauses with '[WARNING] ' marker.");

// ========================================================================
// --- END OF background.js ---
// ========================================================================