// ToS Summarizer AI v1.2 - Options Script

const apiKeyInput = document.getElementById('apiKey');
const saveButton = document.getElementById('saveButton');
const statusMessage = document.getElementById('statusMessage');
const testModelButton = document.getElementById('testModelButton');
const modelStatus = document.getElementById('modelStatus');
const reportBugButton = document.getElementById('reportBugButton');
const viewSourceButton = document.getElementById('viewSourceButton');

// Function to show status messages
function showStatus(element, message, type = 'info', duration = 3000) {
    element.textContent = message;
    element.className = `status ${type}`;
    if (duration > 0) {
        setTimeout(() => {
            element.textContent = '';
            element.className = 'status';
        }, duration);
    }
}

// Function to save the API key
function saveApiKey() {
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
        showStatus(statusMessage, 'Please enter an API key.', 'error');
        return;
    }

    // Basic validation - check if it looks like a Google API key
    if (!apiKey.startsWith('AIza') || apiKey.length < 35) {
        showStatus(statusMessage, 'Invalid API key format. Google AI Studio keys should start with "AIza".', 'error');
        return;
    }

    saveButton.disabled = true;
    saveButton.textContent = '💾 Saving...';

    browser.storage.local.set({
        geminiApiKey: apiKey
    }).then(() => {
        showStatus(statusMessage, '✅ API Key saved successfully!', 'success');
        // Test the API key after saving (via background to keep key off options page network stack)
        testApiKey();
    }).catch(error => {
        showStatus(statusMessage, `❌ Error saving key: ${error.message}`, 'error');
        console.error("Error saving API key:", error);
    }).finally(() => {
        saveButton.disabled = false;
        saveButton.textContent = '💾 Save Key';
    });
}

// Function to test API key — delegates to background.js so the key never
// appears in the options page DevTools Network tab
async function testApiKey() {
    testModelButton.disabled = true;
    testModelButton.textContent = '🧪 Testing...';
    showStatus(modelStatus, 'Testing API connection...', 'info', 0);

    try {
        const result = await browser.runtime.sendMessage({ action: 'testKey' });
        if (result.valid) {
            showStatus(modelStatus, `✅ API key is valid! Found ${result.modelCount} available models.`, 'success');
        } else {
            showStatus(modelStatus, `❌ API test failed: ${result.error || 'Invalid key'}`, 'error');
        }
    } catch (error) {
        showStatus(modelStatus, `❌ Error: ${error.message}`, 'error');
    } finally {
        testModelButton.disabled = false;
        testModelButton.textContent = '🧪 Test Model';
    }
}

// Function to load saved settings
async function loadSavedSettings() {
    try {
        const result = await browser.storage.local.get('geminiApiKey');

        if (result.geminiApiKey) {
            apiKeyInput.value = result.geminiApiKey;
            // Key test is user-initiated only (via Test Connection button)
        }

    } catch (error) {
        showStatus(statusMessage, `❌ Error loading settings: ${error.message}`, 'error');
        console.error("Error loading settings:", error);
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', loadSavedSettings);

saveButton.addEventListener('click', saveApiKey);

apiKeyInput.addEventListener('keypress', (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        saveApiKey();
    }
});

testModelButton.addEventListener('click', () => testApiKey());

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