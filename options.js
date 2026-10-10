// ToS Summarizer AI - Options Script

const apiKeyInput = document.getElementById('apiKey');
const saveButton = document.getElementById('saveButton');
const removeButton = document.getElementById('removeButton');
const removeConfirm = document.getElementById('removeConfirm');
const confirmRemoveButton = document.getElementById('confirmRemoveButton');
const cancelRemoveButton = document.getElementById('cancelRemoveButton');
const keyState = document.getElementById('keyState');
const statusMessage = document.getElementById('statusMessage');
const modelSelect = document.getElementById('modelSelect');
const refreshModelsButton = document.getElementById('refreshModelsButton');
const modelStatus = document.getElementById('modelStatus');
const testModelButton = document.getElementById('testModelButton');
const testStatus = document.getElementById('testStatus');
const versionText = document.getElementById('versionText');
const reportBugButton = document.getElementById('reportBugButton');
const viewSourceButton = document.getElementById('viewSourceButton');

const AUTO_LABEL = 'Automatic (latest Flash) - recommended';
const TEST_LABEL = 'Test connection';

let hasKey = false;
const statusTimers = new Map();

// Show a status message; one timer per element so an older timer never
// wipes a newer message.
function showStatus(element, message, type = 'info', duration = 3000) {
    if (statusTimers.has(element)) {
        clearTimeout(statusTimers.get(element));
        statusTimers.delete(element);
    }
    element.textContent = message;
    element.className = `status ${type}`;
    if (duration > 0) {
        const timer = setTimeout(() => {
            statusTimers.delete(element);
            element.textContent = '';
            element.className = 'status';
        }, duration);
        statusTimers.set(element, timer);
    }
}

function errorText(error) {
    return (error && error.message) ? error.message : String(error);
}

function renderKeyState() {
    keyState.textContent = hasKey ? 'A key is saved' : 'No key saved';
    apiKeyInput.placeholder = hasKey
        ? 'Enter a new key to replace the saved one'
        : 'Enter your Google AI Studio API key';
    removeButton.disabled = !hasKey;
    if (!hasKey) {
        removeConfirm.hidden = true;
    }
}

async function refreshKeyState() {
    try {
        const config = await browser.runtime.sendMessage({ action: 'getConfig' });
        hasKey = !!(config && config.hasKey);
    } catch (error) {
        hasKey = false;
        showStatus(statusMessage, `Error loading settings: ${errorText(error)}`, 'error');
    }
    renderKeyState();
    return hasKey;
}

async function getStoredModel() {
    const result = await browser.storage.local.get('geminiModel');
    return typeof result.geminiModel === 'string' ? result.geminiModel : '';
}

function addOption(value, label) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    modelSelect.appendChild(option);
}

// Rebuild the select. `models` is null when the list is not available.
function renderModels(models, storedModel) {
    modelSelect.textContent = '';
    addOption('', AUTO_LABEL);
    const ids = new Set();
    (models || []).forEach(model => {
        ids.add(model.id);
        const label = model.displayName && model.displayName !== model.id
            ? `${model.displayName} (${model.id})`
            : model.id;
        addOption(model.id, label);
    });
    if (storedModel && !ids.has(storedModel)) {
        addOption(storedModel, models ? `${storedModel} (unavailable)` : storedModel);
    }
    modelSelect.value = storedModel || '';
}

async function loadModels(showErrors = true) {
    let storedModel = '';
    try {
        storedModel = await getStoredModel();
    } catch (error) {
        showStatus(modelStatus, `Error loading model: ${errorText(error)}`, 'error');
    }

    if (!hasKey) {
        renderModels(null, storedModel);
        return;
    }

    refreshModelsButton.disabled = true;
    try {
        const result = await browser.runtime.sendMessage({ action: 'listModels' });
        if (result && result.ok) {
            renderModels(result.models || [], storedModel);
        } else {
            renderModels(null, storedModel);
            if (showErrors) {
                showStatus(modelStatus, `Could not load models: ${(result && result.error) || 'Unknown error'}`, 'error', 0);
            }
        }
    } catch (error) {
        renderModels(null, storedModel);
        if (showErrors) {
            showStatus(modelStatus, `Could not load models: ${errorText(error)}`, 'error', 0);
        }
    } finally {
        refreshModelsButton.disabled = false;
    }
}

async function saveModel() {
    const value = modelSelect.value;
    try {
        if (value) {
            await browser.storage.local.set({ geminiModel: value });
        } else {
            await browser.storage.local.remove('geminiModel');
        }
        showStatus(modelStatus, value ? `Model saved: ${value}` : 'Model saved: Automatic', 'success');
    } catch (error) {
        showStatus(modelStatus, `Error saving model: ${errorText(error)}`, 'error');
    }
}

// Tests exactly what the user sees: a typed (unsaved) key if present,
// otherwise the saved key, with the currently selected model.
async function testConnection() {
    testModelButton.disabled = true;
    testModelButton.textContent = 'Testing...';
    showStatus(testStatus, 'Testing API connection...', 'info', 0);

    const message = { action: 'testConnection' };
    const typedKey = apiKeyInput.value.trim();
    if (typedKey) {
        message.apiKey = typedKey;
    }
    if (modelSelect.value) {
        message.model = modelSelect.value;
    }

    try {
        const result = await browser.runtime.sendMessage(message);
        if (result && result.ok) {
            showStatus(testStatus, `Connection works. Model tested: ${result.model || modelSelect.value || 'default'}`, 'success', 8000);
        } else {
            showStatus(testStatus, `Test failed: ${(result && result.error) || 'Unknown error'}`, 'error', 8000);
        }
    } catch (error) {
        showStatus(testStatus, `Error: ${errorText(error)}`, 'error', 8000);
    } finally {
        testModelButton.disabled = false;
        testModelButton.textContent = TEST_LABEL;
    }
}

async function saveApiKey() {
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
        showStatus(statusMessage, 'Please enter an API key.', 'error');
        return;
    }
    if (/\s/.test(apiKey)) {
        showStatus(statusMessage, 'The API key must not contain spaces or line breaks.', 'error');
        return;
    }

    const looksOdd = !apiKey.startsWith('AIza') || apiKey.length < 35;

    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';

    try {
        await browser.storage.local.set({ geminiApiKey: apiKey });
        apiKeyInput.value = '';
        const warning = looksOdd
            ? ' Note: this does not look like a typical Google AI Studio key (usually starts with "AIza"), so it may not work.'
            : '';
        showStatus(statusMessage, `API key saved.${warning}`, looksOdd ? 'info' : 'success', looksOdd ? 8000 : 3000);
        await refreshKeyState();
        await loadModels();
        await testConnection();
    } catch (error) {
        showStatus(statusMessage, `Error saving key: ${errorText(error)}`, 'error');
        console.error('Error saving API key:', error);
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Save key';
    }
}

async function removeApiKey() {
    removeConfirm.hidden = true;
    try {
        await browser.storage.local.remove('geminiApiKey');
        showStatus(statusMessage, 'API key removed.', 'success');
        await refreshKeyState();
        await loadModels(false);
    } catch (error) {
        showStatus(statusMessage, `Error removing key: ${errorText(error)}`, 'error');
    }
}

async function init() {
    try {
        versionText.textContent = browser.runtime.getManifest().version;
    } catch (error) {
        versionText.textContent = 'unknown';
    }
    await refreshKeyState();
    await loadModels();
}

// Event Listeners
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

saveButton.addEventListener('click', saveApiKey);

apiKeyInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        saveApiKey();
    }
});

removeButton.addEventListener('click', () => {
    removeConfirm.hidden = false;
});
cancelRemoveButton.addEventListener('click', () => {
    removeConfirm.hidden = true;
});
confirmRemoveButton.addEventListener('click', removeApiKey);

modelSelect.addEventListener('change', saveModel);
refreshModelsButton.addEventListener('click', async () => {
    await refreshKeyState();
    if (!hasKey) {
        showStatus(modelStatus, 'Save an API key first to load the model list.', 'info');
        return;
    }
    await loadModels();
});

testModelButton.addEventListener('click', () => testConnection());

reportBugButton.addEventListener('click', () => {
    browser.tabs.create({
        url: 'https://github.com/Geralt4/ToS-Summarizer-Extension/issues/new'
    });
});

viewSourceButton.addEventListener('click', () => {
    browser.tabs.create({
        url: 'https://github.com/Geralt4/ToS-Summarizer-Extension'
    });
});
