// ToS Summarizer AI - Popup Script

// --- Element References ---
const summarizePageButton = document.getElementById('summarizePageButton');
const summarizeSelectedButton = document.getElementById('summarizeSelectedButton');
const titleH3 = document.getElementById('title');
const statusDiv = document.getElementById('status');
const loaderDiv = document.getElementById('loader');
const summaryResultDiv = document.getElementById('summaryResult');
const summaryTextDiv = document.getElementById('summaryText');
const summaryNoteP = document.getElementById('summaryNote');
const errorResultDiv = document.getElementById('errorResult');
const errorTextP = document.getElementById('errorText');
const errorSettingsButton = document.getElementById('errorSettingsButton');
const copyButton = document.getElementById('copyButton');
const copyStatusSpan = document.getElementById('copyStatus');
const disclaimerP = document.getElementById('disclaimer');
const openOptionsButton = document.getElementById('openOptionsButton');
const reportIssueButton = document.getElementById('reportIssueButton');

// --- Constants ---
const DISCLAIMER_TEXT = "AI-generated summary. May not be fully accurate or complete. Not legal advice.";
const MAX_INPUT_CHARS = 300000;
const SAFETY_TIMEOUT_MS = 130000;
const BULLET_PATTERN = /^[-*•]\s+/;
const WARNING_PREFIX_PATTERN = /^(?:\*\*)?\[WARNING\](?:\*\*)?:?\s*(?:\*\*)?\s*/i;
const SETTINGS_ERROR_CODES = ['NO_KEY', 'BAD_KEY', 'MODEL_NOT_FOUND'];

// --- State ---
let currentTabUrl = null;
let currentRun = 0;
let busy = false;
let currentPlainText = '';
let storageListener = null;
let watchTimer = null;
let copyResetTimer = null;

// --- Display Helpers ---
function hideAll() {
    statusDiv.hidden = true;
    loaderDiv.hidden = true;
    summaryResultDiv.hidden = true;
    errorResultDiv.hidden = true;
    errorSettingsButton.hidden = true;
    disclaimerP.hidden = true;
}

function showStatus(message, isError) {
    hideAll();
    statusDiv.textContent = message;
    statusDiv.classList.toggle('status-error', Boolean(isError));
    statusDiv.hidden = false;
}

function showLoader(message) {
    hideAll();
    statusDiv.textContent = message;
    statusDiv.classList.remove('status-error');
    statusDiv.hidden = false;
    loaderDiv.hidden = false;
}

function showError(message, code) {
    hideAll();
    errorTextP.textContent = message;
    errorSettingsButton.hidden = !SETTINGS_ERROR_CODES.includes(code);
    errorResultDiv.hidden = false;
}

function setActionsEnabled(enabled) {
    summarizePageButton.disabled = !enabled;
    summarizeSelectedButton.disabled = !enabled;
}

// --- Summary Parsing and Rendering ---
function stripBold(text) {
    return text.replace(/\*\*/g, '');
}

function parseSummary(summary) {
    const blocks = [];
    String(summary).split(/\r?\n/).forEach(rawLine => {
        let line = rawLine.trim();
        if (line.length === 0) return;
        const isBullet = BULLET_PATTERN.test(line);
        if (isBullet) line = line.replace(BULLET_PATTERN, '').trim();
        let isWarning = false;
        if (WARNING_PREFIX_PATTERN.test(line)) {
            isWarning = true;
            line = line.replace(WARNING_PREFIX_PATTERN, '').trim();
        }
        if (line.length === 0) return;
        blocks.push({ type: isBullet || isWarning ? 'bullet' : 'paragraph', warning: isWarning, text: line });
    });
    return blocks;
}

function toPlainText(blocks) {
    return blocks.map(block => {
        const text = stripBold(block.text);
        if (block.warning) return `- [WARNING] ${text}`;
        return block.type === 'bullet' ? `- ${text}` : text;
    }).join('\n');
}

function appendInline(parent, text) {
    const parts = text.split(/\*\*(.+?)\*\*/);
    parts.forEach((part, index) => {
        const clean = part.replace(/\*\*/g, '');
        if (clean.length === 0) return;
        if (index % 2 === 1) {
            const strong = document.createElement('strong');
            strong.textContent = clean;
            parent.appendChild(strong);
        } else {
            parent.appendChild(document.createTextNode(clean));
        }
    });
}

function renderBlocks(blocks) {
    summaryTextDiv.textContent = '';
    blocks.forEach(block => {
        const div = document.createElement('div');
        if (block.warning) {
            div.className = 'summary-warning';
            const label = document.createElement('span');
            label.className = 'warning-label';
            label.textContent = 'Warning';
            div.appendChild(label);
            div.appendChild(document.createTextNode(' '));
        } else {
            div.className = block.type === 'bullet' ? 'summary-item' : 'summary-paragraph';
        }
        appendInline(div, block.text);
        summaryTextDiv.appendChild(div);
    });
}

function showSummary(summary, flags) {
    const blocks = parseSummary(summary);
    currentPlainText = toPlainText(blocks);
    hideAll();
    renderBlocks(blocks);

    const notes = [];
    if (flags && flags.inputTruncated) {
        notes.push("The page was too long, so only the first part of it was analyzed.");
    }
    if (flags && flags.truncated) {
        notes.push("The AI's reply was cut short, so this summary may be incomplete.");
    }
    if (flags && flags.usedFallback) {
        notes.push("No main text block could be identified, so the whole page was analyzed.");
    }
    summaryNoteP.textContent = notes.join(' ');
    summaryNoteP.hidden = notes.length === 0;

    copyStatusSpan.textContent = '';
    summaryResultDiv.hidden = false;
    disclaimerP.textContent = DISCLAIMER_TEXT;
    disclaimerP.hidden = false;
}

function showSetupNeeded() {
    showStatus("Add your API key in Extension Settings to start summarizing.", false);
    openOptionsButton.classList.add('prominent');
    setActionsEnabled(false);
}

// --- Stored Result Handling ---
function renderRecord(record) {
    if (record.status === 'done' && typeof record.summary === 'string') {
        showSummary(record.summary, { truncated: record.truncated, inputTruncated: record.inputTruncated });
    } else {
        showError(record.error || "The summary could not be completed.", record.code);
    }
}

function stopWatching() {
    if (storageListener) {
        browser.storage.onChanged.removeListener(storageListener);
        storageListener = null;
    }
    if (watchTimer) {
        clearTimeout(watchTimer);
        watchTimer = null;
    }
}

function watchPending(record) {
    stopWatching();
    showLoader("Summarizing... you can close this popup and come back later.");
    setActionsEnabled(false);

    const finish = () => {
        stopWatching();
        setActionsEnabled(true);
    };

    storageListener = (changes, area) => {
        if (area !== 'session' || !changes.lastSummary) return;
        const next = changes.lastSummary.newValue;
        if (!next || next.tabUrl !== currentTabUrl || next.status === 'pending') return;
        finish();
        renderRecord(next);
    };
    browser.storage.onChanged.addListener(storageListener);

    const elapsed = Date.now() - (Number(record.startedAt) || Date.now());
    watchTimer = setTimeout(() => {
        finish();
        showError("The request took too long and was stopped. Please try again.", 'TIMEOUT');
    }, Math.max(0, SAFETY_TIMEOUT_MS - elapsed));
}

async function restoreLastSummary() {
    try {
        const stored = await browser.storage.session.get('lastSummary');
        const record = stored && stored.lastSummary;
        if (!record || !currentTabUrl || record.tabUrl !== currentTabUrl) return;
        if (record.status === 'pending') {
            watchPending(record);
        } else {
            renderRecord(record);
        }
    } catch (error) {
        console.error("Popup: Could not read the stored summary:", error);
    }
}

// --- Page Access Helpers ---
function getUnsupportedPageMessage(url) {
    if (!url) return "This page cannot be read by the extension.";
    if (url.startsWith('about:reader')) {
        return "Reader View pages cannot be summarized. Leave Reader View and try again on the original page.";
    }
    if (url.startsWith('view-source:')) {
        return "Page source views cannot be summarized. Open the normal page instead.";
    }
    if (url.startsWith('about:') || url.startsWith('moz-extension:')) {
        return "Firefox internal pages cannot be summarized. Open a regular web page and try again.";
    }
    if (isPdfUrl(url)) {
        return "Firefox's built-in PDF viewer cannot be read by this extension. Open the document as a web page instead.";
    }
    return null;
}

function isPdfUrl(url) {
    try {
        return new URL(url).pathname.toLowerCase().endsWith('.pdf');
    } catch (e) {
        return false;
    }
}

function describeInjectionError(error, url) {
    const message = (error && error.message) || '';
    if (isPdfUrl(url)) {
        return "Firefox's built-in PDF viewer cannot be read by this extension. Open the document as a web page instead.";
    }
    if (/missing host permission/i.test(message)) {
        return "Mozilla does not allow extensions to read this site (for example addons.mozilla.org), so it cannot be summarized.";
    }
    if (/target frame did not respond/i.test(message)) {
        return "The page is unresponsive or still loading. Please try again.";
    }
    return `The page could not be read: ${message || 'unknown error'}`;
}

async function getActiveTab() {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) throw new Error("Could not find the active tab.");
    return tabs[0];
}

async function runInTab(tab, func) {
    try {
        return await browser.scripting.executeScript({ target: { tabId: tab.id }, func: func });
    } catch (injectionError) {
        console.error("Popup: Injection error:", injectionError);
        throw new Error(describeInjectionError(injectionError, tab.url));
    }
}

// --- Summarization Flow ---
async function collectInput(mode, tab) {
    if (mode === 'page') {
        const results = await runInTab(tab, extractBestTextContent);
        const result = results && results[0] && results[0].result;
        if (!result || typeof result.text !== 'string') {
            throw new Error("Could not extract text from this page.");
        }
        if (result.text.trim().length === 0) {
            throw new Error("No readable text was found on this page.");
        }
        return { text: result.text, source: 'page', inputTruncated: Boolean(result.truncated), usedFallback: Boolean(result.usedFallback) };
    }

    const results = await runInTab(tab, () => window.getSelection().toString());
    const selected = results && results[0] && results[0].result;
    if (typeof selected !== 'string') {
        throw new Error("Could not read the selection from this page.");
    }
    if (selected.trim().length === 0) {
        throw new Error("No text is selected on the page. Select some text first.");
    }
    return { text: selected, source: 'selection', inputTruncated: false, usedFallback: false };
}

async function summarize(mode) {
    if (busy) return;
    busy = true;
    stopWatching();
    setActionsEnabled(false);
    const runId = ++currentRun;
    let safetyTimer = null;

    const flow = async () => {
        showLoader(mode === 'page' ? "Reading the page..." : "Reading the selected text...");
        const tab = await getActiveTab();
        currentTabUrl = tab.url;
        const unsupported = getUnsupportedPageMessage(tab.url);
        if (unsupported) throw new Error(unsupported);

        const input = await collectInput(mode, tab);
        let text = input.text;
        let inputTruncated = input.inputTruncated;
        if (text.length > MAX_INPUT_CHARS) {
            text = text.slice(0, MAX_INPUT_CHARS);
            inputTruncated = true;
        }

        if (runId !== currentRun) return;
        showLoader(`Sending ${text.length.toLocaleString('en-US')} characters to Google Gemini...`);

        const response = await browser.runtime.sendMessage({
            action: 'summarize',
            text: text,
            source: input.source,
            tabUrl: tab.url,
            inputTruncated: inputTruncated
        });

        if (runId !== currentRun) return;
        if (response && response.ok && typeof response.summary === 'string') {
            showSummary(response.summary, {
                truncated: response.truncated,
                inputTruncated: inputTruncated,
                usedFallback: input.usedFallback
            });
        } else if (response && response.error) {
            showError(response.error, response.code);
        } else {
            throw new Error("Invalid response received from the background script.");
        }
    };

    const timeout = new Promise((resolve, reject) => {
        safetyTimer = setTimeout(() => {
            reject(Object.assign(new Error("The request took too long and was stopped. Please try again."), { code: 'TIMEOUT' }));
        }, SAFETY_TIMEOUT_MS);
    });

    try {
        await Promise.race([flow(), timeout]);
    } catch (error) {
        if (runId === currentRun) {
            console.error("Popup: Error during summarization:", error);
            if (error && error.code === 'TIMEOUT') currentRun++;
            showError((error && error.message) || "An unexpected error occurred.", error && error.code);
        }
    } finally {
        clearTimeout(safetyTimer);
        busy = false;
        setActionsEnabled(true);
    }
}

// --- Event Listeners ---
summarizePageButton.addEventListener('click', () => summarize('page'));
summarizeSelectedButton.addEventListener('click', () => summarize('selection'));

copyButton.addEventListener('click', async () => {
    clearTimeout(copyResetTimer);
    try {
        await navigator.clipboard.writeText(currentPlainText);
        copyStatusSpan.textContent = 'Copied!';
    } catch (err) {
        console.error('Popup: Failed to copy summary text: ', err);
        copyStatusSpan.textContent = 'Copy failed.';
    }
    copyResetTimer = setTimeout(() => { copyStatusSpan.textContent = ''; }, 2000);
});

openOptionsButton.addEventListener('click', () => {
    browser.runtime.openOptionsPage();
});

errorSettingsButton.addEventListener('click', () => {
    browser.runtime.openOptionsPage();
});

reportIssueButton.addEventListener('click', () => {
    browser.tabs.create({
        url: 'https://github.com/Geralt4/ToS-Summarizer-Extension/issues'
    });
});

// --- Initialisation ---
async function init() {
    titleH3.textContent = `ToS Summarizer AI v${browser.runtime.getManifest().version}`;
    showStatus("Ready. Click an action below.", false);

    let config = null;
    try {
        config = await browser.runtime.sendMessage({ action: 'getConfig' });
    } catch (error) {
        console.error("Popup: Could not read the configuration:", error);
    }
    if (config && config.hasKey === false) {
        showSetupNeeded();
        return;
    }

    try {
        const tab = await getActiveTab();
        currentTabUrl = tab.url || null;
    } catch (error) {
        console.error("Popup: Could not read the active tab:", error);
    }
    await restoreLastSummary();
}

init();
