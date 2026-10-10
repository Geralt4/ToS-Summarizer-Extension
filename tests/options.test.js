const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'options.html'), 'utf8')
    .replace(/<script[^>]*><\/script>/, '');
const code = fs.readFileSync(path.join(root, 'options.js'), 'utf8');

async function flush() {
    for (let i = 0; i < 40; i++) {
        await Promise.resolve();
    }
}

const openWindows = [];
const pendingTimers = new Set();

async function setup({ store = {}, config, models, version = '9.8.7' } = {}) {
    const data = { ...store };
    const sendMessage = jest.fn(async (msg) => {
        if (msg.action === 'getConfig') {
            return config || { hasKey: !!data.geminiApiKey, model: data.geminiModel, defaultModel: 'gemini-flash-latest' };
        }
        if (msg.action === 'listModels') {
            return models || { ok: true, models: [{ id: 'gemini-flash-latest', displayName: 'Flash Latest' }, { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' }] };
        }
        if (msg.action === 'testConnection') {
            return { ok: true, model: msg.model || 'gemini-flash-latest' };
        }
        return undefined;
    });
    const browser = {
        storage: {
            local: {
                get: jest.fn(async (key) => {
                    const out = {};
                    [].concat(key).forEach(k => { if (k in data) out[k] = data[k]; });
                    return out;
                }),
                set: jest.fn(async (obj) => { Object.assign(data, obj); }),
                remove: jest.fn(async (key) => { [].concat(key).forEach(k => delete data[k]); })
            }
        },
        runtime: { sendMessage, getManifest: () => ({ version }) },
        tabs: { create: jest.fn() }
    };
    const dom = new JSDOM(html, { runScripts: 'outside-only' });
    const win = dom.window;
    win.browser = browser;
    // Route window timers to the (possibly faked) global timers.
    openWindows.push(win);
    win.setTimeout = (...a) => {
        const id = setTimeout(...a);
        pendingTimers.add(id);
        return id;
    };
    win.clearTimeout = (...a) => clearTimeout(...a);
    win.eval(code);
    await flush();
    return { win, doc: win.document, data, browser, sendMessage };
}

function click(win, el) {
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
}

describe('options page', () => {
    afterEach(() => {
        pendingTimers.forEach(id => clearTimeout(id));
        jest.useRealTimers();
        pendingTimers.forEach(id => clearTimeout(id));
        pendingTimers.clear();
        openWindows.splice(0).forEach(w => w.close());
    });

    test('stored key never appears in the input and state text is shown', async () => {
        const { doc } = await setup({ store: { geminiApiKey: 'AIzaSECRETSECRETSECRETSECRETSECRET123' } });
        expect(doc.getElementById('apiKey').value).toBe('');
        expect(doc.body.innerHTML).not.toContain('SECRETSECRET');
        expect(doc.getElementById('keyState').textContent).toBe('A key is saved');
        expect(doc.getElementById('removeButton').disabled).toBe(false);
    });

    test('no key: state text and remove disabled', async () => {
        const { doc } = await setup();
        expect(doc.getElementById('keyState').textContent).toBe('No key saved');
        expect(doc.getElementById('removeButton').disabled).toBe(true);
    });

    test('remove-key flow requires inline confirm and removes the key', async () => {
        const { win, doc, data, browser } = await setup({ store: { geminiApiKey: 'AIzaSECRETSECRETSECRETSECRETSECRET123' } });
        click(win, doc.getElementById('removeButton'));
        expect(doc.getElementById('removeConfirm').hidden).toBe(false);
        expect(browser.storage.local.remove).not.toHaveBeenCalled();
        delete data.__x;
        // Config reflects storage after removal
        click(win, doc.getElementById('confirmRemoveButton'));
        await flush();
        expect(browser.storage.local.remove).toHaveBeenCalledWith('geminiApiKey');
        expect(data.geminiApiKey).toBeUndefined();
        expect(doc.getElementById('keyState').textContent).toBe('No key saved');
        expect(doc.getElementById('removeButton').disabled).toBe(true);
    });

    test('choosing Automatic removes geminiModel, choosing a model sets it', async () => {
        const { win, doc, data, browser } = await setup({ store: { geminiApiKey: 'k', geminiModel: 'gemini-2.5-pro' } });
        const select = doc.getElementById('modelSelect');
        expect(select.value).toBe('gemini-2.5-pro');

        select.value = '';
        select.dispatchEvent(new win.Event('change', { bubbles: true }));
        await flush();
        expect(browser.storage.local.remove).toHaveBeenCalledWith('geminiModel');
        expect(data.geminiModel).toBeUndefined();

        select.value = 'gemini-flash-latest';
        select.dispatchEvent(new win.Event('change', { bubbles: true }));
        await flush();
        expect(data.geminiModel).toBe('gemini-flash-latest');
        expect(doc.getElementById('modelStatus').textContent).toContain('saved');
    });

    test('stored model missing from the list is shown selected and unavailable', async () => {
        const { doc } = await setup({ store: { geminiApiKey: 'k', geminiModel: 'gemini-old-1' } });
        const select = doc.getElementById('modelSelect');
        expect(select.value).toBe('gemini-old-1');
        expect(select.selectedOptions[0].textContent).toContain('(unavailable)');
        expect(select.options[0].textContent).toBe('Automatic (latest Flash) - recommended');
    });

    test('listModels failure keeps Automatic and stored value and shows the error', async () => {
        const { doc } = await setup({
            store: { geminiApiKey: 'k', geminiModel: 'gemini-x' },
            models: { ok: false, error: 'boom', code: 'network' }
        });
        const select = doc.getElementById('modelSelect');
        expect(select.options[0].value).toBe('');
        expect(select.value).toBe('gemini-x');
        expect(doc.getElementById('modelStatus').textContent).toContain('boom');
    });

    test('test button passes the typed key and selected model', async () => {
        const { win, doc, sendMessage } = await setup({ store: { geminiApiKey: 'saved' } });
        doc.getElementById('apiKey').value = '  typedkey  ';
        const select = doc.getElementById('modelSelect');
        select.value = 'gemini-2.5-pro';
        click(win, doc.getElementById('testModelButton'));
        await flush();
        expect(sendMessage).toHaveBeenCalledWith({ action: 'testConnection', apiKey: 'typedkey', model: 'gemini-2.5-pro' });
        expect(doc.getElementById('testStatus').textContent).toContain('gemini-2.5-pro');
        expect(doc.getElementById('testModelButton').textContent).toBe('Test connection');
    });

    test('test button omits apiKey when input is empty', async () => {
        const { win, doc, sendMessage } = await setup({ store: { geminiApiKey: 'saved' } });
        click(win, doc.getElementById('testModelButton'));
        await flush();
        const call = sendMessage.mock.calls.find(c => c[0].action === 'testConnection')[0];
        expect(call.apiKey).toBeUndefined();
    });

    test('saving accepts an unusual key format, clears input, updates state', async () => {
        const { win, doc, data } = await setup();
        const input = doc.getElementById('apiKey');
        input.value = 'not-a-google-key';
        click(win, doc.getElementById('saveButton'));
        await flush();
        expect(data.geminiApiKey).toBe('not-a-google-key');
        expect(input.value).toBe('');
        expect(doc.getElementById('keyState').textContent).toBe('A key is saved');
        expect(doc.getElementById('statusMessage').textContent).toContain('may not work');
    });

    test('saving rejects keys with whitespace', async () => {
        const { win, doc, data } = await setup();
        doc.getElementById('apiKey').value = 'abc def';
        click(win, doc.getElementById('saveButton'));
        await flush();
        expect(data.geminiApiKey).toBeUndefined();
        expect(doc.getElementById('statusMessage').className).toContain('error');
    });

    test('an older status timer does not wipe a newer message', async () => {
        jest.useFakeTimers();
        const { win, doc } = await setup();
        const status = doc.getElementById('statusMessage');
        const save = doc.getElementById('saveButton');

        doc.getElementById('apiKey').value = '';
        click(win, save); // "Please enter an API key." (3000ms timer)
        await flush();
        expect(status.textContent).toBe('Please enter an API key.');

        jest.advanceTimersByTime(2000);
        doc.getElementById('apiKey').value = 'a b';
        click(win, save); // newer message
        await flush();
        const newer = status.textContent;
        expect(newer).toContain('must not contain');

        jest.advanceTimersByTime(1500); // past the first timer's deadline
        expect(status.textContent).toBe(newer);

        jest.advanceTimersByTime(2000);
        expect(status.textContent).toBe('');
    });

    test('version text comes from the manifest', async () => {
        const { doc } = await setup({ version: '4.5.6' });
        expect(doc.getElementById('versionText').textContent).toBe('4.5.6');
        expect(doc.body.textContent).not.toContain('1.2.0');
    });
});
