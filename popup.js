// ToS Summarizer AI v1.1 - Enhanced Popup Script

// --- Element References ---
const summarizePageButton = document.getElementById('summarizePageButton');
const summarizeSelectedButton = document.getElementById('summarizeSelectedButton');
const statusDiv = document.getElementById('status');
const loaderDiv = document.getElementById('loader');
const summaryResultDiv = document.getElementById('summaryResult');
const summaryTextPre = document.getElementById('summaryText');
const errorResultDiv = document.getElementById('errorResult');
const errorTextP = document.getElementById('errorText');
const copyButton = document.getElementById('copyButton');
const disclaimerP = document.getElementById('disclaimer');
const openOptionsButton = document.getElementById('openOptionsButton');
const reportIssueButton = document.getElementById('reportIssueButton');

// --- Constants ---
const DISCLAIMER_TEXT = "AI-generated summary. May not be fully accurate or complete. Not legal advice.";
const WARNING_PATTERN = /WARNING/i;

// --- Helper Functions ---
function showStatus(message, isError = false) {
    summaryResultDiv.style.display = 'none';
    errorResultDiv.style.display = 'none';
    loaderDiv.style.display = 'none';
    disclaimerP.style.display = 'none';
    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
    statusDiv.style.color = isError ? '#a94442' : '#555';
}

function showLoader(message) {
    summaryResultDiv.style.display = 'none';
    errorResultDiv.style.display = 'none';
    disclaimerP.style.display = 'none';
    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
    statusDiv.style.color = '#555';
    loaderDiv.style.display = 'block';
}

function showSummary(summary) {
    statusDiv.style.display = 'none';
    errorResultDiv.style.display = 'none';
    loaderDiv.style.display = 'none';
    summaryTextPre.innerHTML = '';
    
    const lines = summary.split('\n');
    lines.forEach(line => {
        if (WARNING_PATTERN.test(line)) {
            const warningDiv = document.createElement('div');
            warningDiv.className = 'summary-warning';
            warningDiv.textContent = line;
            summaryTextPre.appendChild(warningDiv);
        } else if (line.trim().length > 0) {
            summaryTextPre.appendChild(document.createTextNode(line + '\n'));
        } else if (line.length > 0) {
            summaryTextPre.appendChild(document.createTextNode('\n'));
        }
    });
    
    summaryResultDiv.style.display = 'block';
    disclaimerP.textContent = DISCLAIMER_TEXT;
    disclaimerP.style.display = 'block';
}

function showError(errorMessage) {
    statusDiv.style.display = 'none';
    summaryResultDiv.style.display = 'none';
    loaderDiv.style.display = 'none';
    errorTextP.textContent = errorMessage;
    errorResultDiv.style.display = 'block';
    disclaimerP.textContent = DISCLAIMER_TEXT;
    disclaimerP.style.display = 'block';
}

// --- Enhanced Content Extraction Function ---
function extractBestTextContent() {
    // Enhanced configuration for better detection
    const MIN_TEXT_LENGTH = 300;
    const KEYWORDS = ['terms', 'privacy', 'legal', 'agreement', 'policy', 'service', 'conditions', 'eula', 'license', 'disclaimer'];
    const BAD_TAGS = ['script', 'style', 'nav', 'header', 'footer', 'aside', 'form', 'button', 'select', 'textarea', 'iframe', 'noscript'];
    const BAD_CLASSES_REGEX = /comment|sidebar|advert|promo|share|social|menu|nav|footer|header|related|modal|popup|login|signup|widget|advertisement/i;
    const GOOD_CLASSES_REGEX = /legal|terms|policy|agreement|content|article|main|body|document|text|tos|privacy/i;
    
    function isElementVisible(el) {
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    }
    
    function calculateScore(el) {
        if (!isElementVisible(el)) return 0;
        
        let score = 0;
        const textLength = el.innerText ? el.innerText.trim().length : 0;
        const tagName = el.tagName.toLowerCase();
        
        if (textLength < MIN_TEXT_LENGTH) return 0;
        
        // Base score from text length
        score += textLength * 1.5;
        
        // Tag-based scoring
        if (tagName === 'article' || tagName === 'main') score *= 1.3;
        if (tagName === 'section') score *= 1.1;
        if (tagName === 'p') score *= 0.9;
        
        // Class and ID analysis
        const classIdString = `${el.className || ''} ${el.id || ''}`;
        if (BAD_CLASSES_REGEX.test(classIdString)) score *= 0.1;
        if (GOOD_CLASSES_REGEX.test(classIdString)) score *= 1.2;
        
        // Keyword detection in headings
        const headings = el.querySelectorAll('h1, h2, h3, h4, h5, h6');
        let keywordBonus = 0;
        headings.forEach(h => {
            const headingText = h.textContent.toLowerCase();
            KEYWORDS.forEach(keyword => {
                if (headingText.includes(keyword)) {
                    keywordBonus += 0.2;
                }
            });
        });
        score *= (1 + keywordBonus);
        
        // Penalize high link density
        const links = el.getElementsByTagName('a').length;
        if (links > 5 && textLength > 0) {
            const linkDensity = links / textLength;
            if (linkDensity > 0.1) score *= 0.5;
            if (linkDensity > 0.3) score = 0;
        }
        
        return score;
    }
    
    try {
        const bodyClone = document.body.cloneNode(true);
        bodyClone.querySelectorAll(BAD_TAGS.join(', ')).forEach(el => el.remove());
        
        const candidates = bodyClone.querySelectorAll('div, section, article, main, p, body');
        let bestCandidate = null;
        let maxScore = 0;
        
        candidates.forEach(el => {
            const score = calculateScore(el);
            if (score > maxScore) {
                maxScore = score;
                bestCandidate = el;
            }
        });
        
        if (bestCandidate && maxScore > 10) {
            let extractedText = bestCandidate.innerText.trim();
            extractedText = extractedText.replace(/(\n\s*){3,}/g, '\n\n');
            extractedText = extractedText.replace(/ {2,}/g, ' ');
            return extractedText;
        } else {
            console.warn("Could not find a suitable candidate block. Falling back to body text (cleaned).");
            let fallbackText = document.body.innerText.trim();
            fallbackText = fallbackText.replace(/(\n\s*){3,}/g, '\n\n');
            fallbackText = fallbackText.replace(/ {2,}/g, ' ');
            return fallbackText;
        }
    } catch (e) {
        console.error("Error during content extraction:", e);
        return document.body.innerText.trim();
    }
}

// --- Core Summarization Process Function ---
async function processSummarization(textToSummarize, sourceDescription) {
    if (!textToSummarize || textToSummarize.trim().length === 0) {
        throw new Error(`No text provided from ${sourceDescription} to summarize.`);
    }
    if (textToSummarize.trim().length < 50) {
        throw new Error(`Text from ${sourceDescription} is too short (<50 chars) to provide a meaningful summary.`);
    }

    showLoader(`Analyzing ${sourceDescription} with AI...`);

    let response;
    try {
        response = await browser.runtime.sendMessage({
            action: "summarize",
            text: textToSummarize
        });
    } catch (messageError) {
        console.error(`Popup: Error sending ${sourceDescription} text to background:`, messageError);
        throw new Error(`Communication error with background script: ${messageError.message}`);
    }

    if (response && response.summary) {
        showSummary(response.summary);
    } else if (response && response.error) {
        showError(response.error);
    } else {
        throw new Error("Invalid response received from background script.");
    }
}

// --- Event Listener for "Summarize Full Page (Auto-Detect)" Button ---
summarizePageButton.addEventListener('click', async () => {
    showLoader("Requesting page content (auto-detect)...");
    summarizePageButton.disabled = true;
    summarizeSelectedButton.disabled = true;

    try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0) throw new Error("Could not find the active tab.");
        const activeTab = tabs[0];
        const tabId = activeTab.id;

        if (!activeTab.url || activeTab.url.startsWith('about:') || activeTab.url.startsWith('moz-extension:')) {
            throw new Error("Cannot summarize special browser pages.");
        }

        showLoader("Analyzing page structure...");
        let injectionResults;
        try {
            injectionResults = await browser.scripting.executeScript({
                target: { tabId: tabId },
                func: extractBestTextContent
            });
        } catch (injectionError) {
            console.error("Popup: Injection Error (Full Page):", injectionError);
            if (injectionError.message.includes("Permission denied") || injectionError.message.includes("Missing host permission")) {
                throw new Error("Permission denied to access page content. Check host permissions.");
            } else if (injectionError.message.includes("target frame did not respond")) {
                throw new Error("Page unresponsive or still loading. Please try again.");
            } else {
                throw new Error(`Failed to execute script: ${injectionError.message}`);
            }
        }

        if (!injectionResults || injectionResults.length === 0 || injectionResults[0] == null || injectionResults[0].result == null) {
            throw new Error("Could not extract text using auto-detection.");
        }
        const pageText = injectionResults[0].result;
        await processSummarization(pageText, "auto-detected page");

    } catch (error) {
        console.error("Popup: Error during 'Summarize Full Page' process:", error);
        showError(error.message || "An unexpected error occurred during auto-detection.");
    } finally {
        summarizePageButton.disabled = false;
        summarizeSelectedButton.disabled = false;
    }
});

// --- Event Listener for "Summarize Selected Text" Button ---
summarizeSelectedButton.addEventListener('click', async () => {
    showLoader("Getting selected text...");
    summarizePageButton.disabled = true;
    summarizeSelectedButton.disabled = true;

    try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0) throw new Error("Could not find the active tab.");
        const activeTab = tabs[0];
        const tabId = activeTab.id;

        if (!activeTab.url || activeTab.url.startsWith('about:') || activeTab.url.startsWith('moz-extension:')) {
            throw new Error("Cannot get selected text from special browser pages.");
        }

        let injectionResults;
        try {
            injectionResults = await browser.scripting.executeScript({
                target: { tabId: tabId },
                func: () => window.getSelection().toString()
            });
        } catch (injectionError) {
            console.error("Popup: Injection Error (Selected Text):", injectionError);
            throw new Error(`Failed to get selected text: ${injectionError.message}`);
        }

        if (!injectionResults || injectionResults.length === 0 || injectionResults[0] == null || injectionResults[0].result == null) {
            throw new Error("No text appears to be selected on the page. Please select some text first.");
        }

        const selectedText = injectionResults[0].result;
        await processSummarization(selectedText, "selected text");

    } catch (error) {
        console.error("Popup: Error during 'Summarize Selected Text' process:", error);
        showError(error.message || "An unexpected error occurred with selected text.");
    } finally {
        summarizePageButton.disabled = false;
        summarizeSelectedButton.disabled = false;
    }
});

// --- Copy Button Click Handler ---
copyButton.addEventListener('click', () => {
    let summaryContent = '';
    for (const node of summaryTextPre.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            summaryContent += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE && node.className === 'summary-warning') {
            summaryContent += node.textContent + '\n';
        }
    }
    summaryContent = summaryContent.trim();
    navigator.clipboard.writeText(summaryContent)
        .then(() => {
            const originalText = copyButton.textContent;
            copyButton.textContent = 'Copied!';
            copyButton.disabled = true;
            setTimeout(() => {
                copyButton.textContent = originalText;
                copyButton.disabled = false;
            }, 1500);
        })
        .catch(err => {
            console.error('Popup: Failed to copy summary text: ', err);
            alert("Failed to copy summary.");
        });
});

// --- Options Button Click Handler ---
openOptionsButton.addEventListener('click', () => {
    browser.runtime.openOptionsPage();
});

// --- Report Issue Button Click Handler ---
reportIssueButton.addEventListener('click', () => {
    browser.tabs.create({
        url: 'https://github.com/Geralt4/ToS-Summarizer-Extension/issues'
    });
});

// --- Initial state ---
showStatus("Ready. Click an action below.");

// Exports for unit testing only — not executed in browser context
if (typeof module !== "undefined" && module.exports) {
  module.exports = { extractBestTextContent };
}
