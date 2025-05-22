// ToS Summarizer AI v1.1 - Enhanced Options Script

const apiKeyInput = document.getElementById('apiKey');
const saveButton = document.getElementById('saveButton');
const statusMessage = document.getElementById('statusMessage');
const modelSelect = document.getElementById('modelSelect');
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
        console.log("API Key saved.");
        
        // Test the API key after saving
        testApiKey(apiKey);
    }).catch(error => {
        showStatus(statusMessage, `❌ Error saving key: ${error.message}`, 'error');
        console.error("Error saving API key:", error);
    }).finally(() => {
        saveButton.disabled = false;
        saveButton.textContent = '💾 Save Key';
    });
}

// Function to test API key
async function testApiKey(apiKey = null) {
    if (!apiKey) {
        const result = await browser.storage.local.get('geminiApiKey');
        apiKey = result.geminiApiKey;
    }

    if (!apiKey) {
        showStatus(statusMessage, 'No API key to test.', 'error');
        return;
    }

    testModelButton.disabled = true;
    testModelButton.textContent = '🧪 Testing...';
    showStatus(modelStatus, 'Testing API connection...', 'info', 0);

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        
        if (response.ok) {
            const data = await response.json();
            const modelCount = data.models ? data.models.length : 0;
            showStatus(modelStatus, `✅ API key is valid! Found ${modelCount} available models.`, 'success');
        } else {
            const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
            showStatus(modelStatus, `❌ API test failed: ${errorData.error?.message || 'Invalid key'}`, 'error');
        }
    } catch (error) {
        showStatus(modelStatus, `❌ Network error: ${error.message}`, 'error');
    } finally {
        testModelButton.disabled = false;
        testModelButton.textContent = '🧪 Test Model';
    }
}

// Function to save model selection
function saveModelSelection() {
    const selectedModel = modelSelect.value;
    
    browser.storage.local.set({
        geminiModelName: selectedModel
    }).then(() => {
        showStatus(modelStatus, `✅ Model "${selectedModel}" saved!`, 'success');
        console.log("Model selection saved:", selectedModel);
    }).catch(error => {
        showStatus(modelStatus, `❌ Error saving model: ${error.message}`, 'error');
        console.error("Error saving model selection:", error);
    });
}

// Function to load saved settings
async function loadSavedSettings() {
    try {
        const result = await browser.storage.local.get(['geminiApiKey', 'geminiModelName']);
        
        // Load API key
        if (result.geminiApiKey) {
            apiKeyInput.value = result.geminiApiKey;
            console.log("Loaded saved API key.");
        }
        
        // Load model selection
        if (result.geminiModelName) {
            modelSelect.value = result.geminiModelName;
            console.log("Loaded saved model:", result.geminiModelName);
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

modelSelect.addEventListener('change', saveModelSelection);

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

// Auto-test API key on load if it exists
setTimeout(async () => {
    const result = await browser.storage.local.get('geminiApiKey');
    if (result.geminiApiKey) {
        testApiKey(result.geminiApiKey);
    }
}, 1000);

console.log("ToS Summarizer AI v1.1 options script loaded.");