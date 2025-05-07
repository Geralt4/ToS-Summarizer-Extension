// --- options.js ---

const apiKeyInput = document.getElementById('apiKey');
const saveButton = document.getElementById('saveButton');
const statusMessage = document.getElementById('statusMessage');

// Function to save the API key to browser storage
function saveApiKey() {
    const apiKey = apiKeyInput.value.trim(); // Get value and remove extra whitespace

    if (!apiKey) {
        statusMessage.textContent = 'Please enter an API key.';
        statusMessage.className = 'status error'; // Style for error
        return;
    }

    // Use browser.storage.local - persists until extension removed or cleared
    // We store it as an object { geminiApiKey: 'the_key_value' }
    browser.storage.local.set({
        geminiApiKey: apiKey
    }).then(() => {
        // Success feedback
        statusMessage.textContent = 'API Key saved successfully!';
        statusMessage.className = 'status success'; // Style for success
        console.log("API Key saved.");
        // Clear message after a few seconds
        setTimeout(() => { statusMessage.textContent = ''; }, 3000);
    }).catch(error => {
        // Error feedback
        statusMessage.textContent = `Error saving key: ${error.message}`;
        statusMessage.className = 'status error';
        console.error("Error saving API key:", error);
    });
}

// Function to load the currently saved API key when the options page opens
function loadApiKey() {
    browser.storage.local.get('geminiApiKey') // Attempt to retrieve the key
        .then((result) => {
            if (result.geminiApiKey) {
                apiKeyInput.value = result.geminiApiKey; // Put the saved key in the input box
                console.log("Loaded saved API key.");
            } else {
                console.log("No API key found in storage.");
            }
        })
        .catch(error => {
            statusMessage.textContent = `Error loading key: ${error.message}`;
            statusMessage.className = 'status error';
            console.error("Error loading API key:", error);
        });
}

// --- Event Listeners ---
// 1. Run loadApiKey when the options page content has fully loaded
document.addEventListener('DOMContentLoaded', loadApiKey);

// 2. Run saveApiKey when the Save button is clicked
saveButton.addEventListener('click', saveApiKey);

// Optional: Save when Enter key is pressed in the input field
apiKeyInput.addEventListener('keypress', (event) => {
    if (event.key === "Enter") {
        event.preventDefault(); // Prevent default form submission if it were in a form
        saveApiKey();
    }
});

console.log("Options script loaded.");