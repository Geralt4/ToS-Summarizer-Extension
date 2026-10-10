const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
const extractSource = fs.readFileSync(path.join(root, 'extract.js'), 'utf8');
const popupSource = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');

const openWindows = [];
afterEach(() => {
  openWindows.splice(0).forEach(w => w.close());
});

const TAB_URL = 'https://example.com/terms';

async function flush() {
  for (let i = 0; i < 10; i++) await new Promise(resolve => setTimeout(resolve, 0));
}

// Loads popup.html with extract.js and popup.js against a mocked browser object.
async function loadPopup({ config = { hasKey: true, model: 'm', defaultModel: 'm' }, session = {},
  summarizeResponse, selection = 'x', tabUrl = TAB_URL } = {}) {
  const dom = new JSDOM(html.replace(/<script[^>]*><\/script>/g, ''), { runScripts: 'outside-only' });
  const { window } = dom;
  openWindows.push(window);
  const sent = [];
  const listeners = [];
  window.browser = {
    runtime: {
      getManifest: () => ({ version: '9.9.9' }),
      openOptionsPage: jest.fn(),
      sendMessage: jest.fn(async (message) => {
        sent.push(message);
        if (message.action === 'getConfig') return config;
        return summarizeResponse;
      })
    },
    tabs: {
      query: jest.fn(async () => [{ id: 1, url: tabUrl }]),
      create: jest.fn()
    },
    scripting: {
      executeScript: jest.fn(async ({ func }) => [{ result: func() }])
    },
    storage: {
      session: { get: jest.fn(async () => session) },
      onChanged: {
        addListener: fn => listeners.push(fn),
        removeListener: fn => listeners.splice(listeners.indexOf(fn), 1)
      }
    }
  };
  window.getSelection = () => ({ toString: () => selection });
  window.eval(extractSource);
  window.eval(popupSource);
  await flush();
  return { window, document: window.document, sent, listeners };
}

const visible = el => !el.hidden;

describe('popup', () => {
  test('shows the settings prompt and does not summarise when there is no key', async () => {
    const { document, sent, window } = await loadPopup({ config: { hasKey: false, defaultModel: 'm' } });
    expect(document.getElementById('status').textContent).toMatch(/Add your API key in Extension Settings/);
    expect(document.getElementById('openOptionsButton').classList.contains('prominent')).toBe(true);
    expect(document.getElementById('summarizePageButton').disabled).toBe(true);
    document.getElementById('summarizeSelectedButton').click();
    await flush();
    expect(sent.some(m => m.action === 'summarize')).toBe(false);
    expect(window.browser.scripting.executeScript).not.toHaveBeenCalled();
  });

  test('uses the manifest version in the title', async () => {
    const { document } = await loadPopup();
    expect(document.getElementById('title').textContent).toContain('9.9.9');
  });

  test('only bullets starting with [WARNING] get the warning style', async () => {
    const summary = [
      '- The service may change terms without warning.',
      '- [WARNING] They can delete your account.',
      '* [WARNING] Star bullet warning.'
    ].join('\n');
    const { document } = await loadPopup({ summarizeResponse: { ok: true, summary, truncated: false } });
    document.getElementById('summarizeSelectedButton').click();
    await flush();
    const warnings = [...document.querySelectorAll('.summary-warning')];
    expect(warnings).toHaveLength(2);
    expect(warnings[0].textContent).toBe('Warning They can delete your account.');
    expect(document.getElementById('summaryText').textContent).not.toContain('[WARNING]');
    const items = document.querySelectorAll('.summary-item');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toBe('The service may change terms without warning.');
  });

  test('renders bold as strong with no literal asterisks', async () => {
    const summary = '- You grant a **perpetual license** to your content.\n* **Data sharing** with partners.';
    const { document, sent } = await loadPopup({ summarizeResponse: { ok: true, summary } });
    document.getElementById('summarizeSelectedButton').click();
    await flush();
    const strongs = [...document.querySelectorAll('#summaryText strong')].map(s => s.textContent);
    expect(strongs).toEqual(['perpetual license', 'Data sharing']);
    expect(document.getElementById('summaryText').textContent).not.toContain('*');
    expect(sent.find(m => m.action === 'summarize')).toMatchObject({ source: 'selection', tabUrl: TAB_URL });
  });

  test('copy text keeps bullet and warning markers', async () => {
    const summary = '- Plain **bold** point.\n- [WARNING] Risky clause.';
    const { document, window } = await loadPopup({ summarizeResponse: { ok: true, summary } });
    const writeText = jest.fn(async () => {});
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });
    document.getElementById('summarizeSelectedButton').click();
    await flush();
    document.getElementById('copyButton').click();
    await flush();
    expect(writeText).toHaveBeenCalledWith('- Plain bold point.\n- [WARNING] Risky clause.');
    expect(document.getElementById('copyStatus').textContent).toBe('Copied!');
  });

  test('shows the disclaimer with a summary but not under an error', async () => {
    const ok = await loadPopup({ summarizeResponse: { ok: true, summary: '- A point.' } });
    ok.document.getElementById('summarizeSelectedButton').click();
    await flush();
    expect(visible(ok.document.getElementById('disclaimer'))).toBe(true);

    const bad = await loadPopup({ summarizeResponse: { ok: false, error: 'Boom', code: 'NETWORK' } });
    bad.document.getElementById('summarizeSelectedButton').click();
    await flush();
    expect(visible(bad.document.getElementById('errorResult'))).toBe(true);
    expect(bad.document.getElementById('errorText').textContent).toBe('Boom');
    expect(visible(bad.document.getElementById('disclaimer'))).toBe(false);
    expect(visible(bad.document.getElementById('errorSettingsButton'))).toBe(false);
  });

  test('offers Open Settings for NO_KEY and MODEL_NOT_FOUND errors', async () => {
    const { document } = await loadPopup({ summarizeResponse: { ok: false, error: 'No such model', code: 'MODEL_NOT_FOUND' } });
    document.getElementById('summarizeSelectedButton').click();
    await flush();
    expect(visible(document.getElementById('errorSettingsButton'))).toBe(true);
  });

  test('empty selection shows the no-selection message', async () => {
    const { document, sent } = await loadPopup({ selection: '' });
    document.getElementById('summarizeSelectedButton').click();
    await flush();
    expect(document.getElementById('errorText').textContent)
      .toBe('No text is selected on the page. Select some text first.');
    expect(sent.some(m => m.action === 'summarize')).toBe(false);
  });

  test('over-long selection is sliced and flagged as input truncated', async () => {
    const { document, sent } = await loadPopup({
      selection: 'a'.repeat(300500),
      summarizeResponse: { ok: true, summary: '- A point.', truncated: false }
    });
    document.getElementById('summarizeSelectedButton').click();
    await flush();
    const message = sent.find(m => m.action === 'summarize');
    expect(message.text.length).toBe(300000);
    expect(message.inputTruncated).toBe(true);
    expect(document.getElementById('summaryNote').textContent).toMatch(/too long/);
  });

  test('renders a stored summary for the same URL on open', async () => {
    const lastSummary = { status: 'done', tabUrl: TAB_URL, source: 'page', summary: '- Stored **point**.', truncated: true, startedAt: 1, finishedAt: 2 };
    const { document } = await loadPopup({ session: { lastSummary } });
    expect(document.querySelector('#summaryText strong').textContent).toBe('point');
    expect(document.getElementById('summaryNote').textContent).toMatch(/cut short/);
    expect(visible(document.getElementById('disclaimer'))).toBe(true);
  });

  test('ignores a stored summary for a different URL', async () => {
    const lastSummary = { status: 'done', tabUrl: 'https://other.example/', source: 'page', summary: '- Other.', startedAt: 1 };
    const { document } = await loadPopup({ session: { lastSummary } });
    expect(visible(document.getElementById('summaryResult'))).toBe(false);
  });

  test('pending stored summary shows the spinner and renders when it completes', async () => {
    const lastSummary = { status: 'pending', tabUrl: TAB_URL, source: 'page', startedAt: Date.now() };
    const { document, listeners } = await loadPopup({ session: { lastSummary } });
    expect(visible(document.getElementById('loader'))).toBe(true);
    expect(listeners).toHaveLength(1);
    listeners[0]({ lastSummary: { newValue: { status: 'done', tabUrl: TAB_URL, summary: '- Finished.' } } }, 'session');
    expect(document.getElementById('summaryText').textContent).toBe('Finished.');
    expect(visible(document.getElementById('loader'))).toBe(false);
    expect(listeners).toHaveLength(0);
  });

  test('gives a specific message for the built-in PDF viewer', async () => {
    const { document, window } = await loadPopup({ tabUrl: 'https://example.com/file.pdf' });
    document.getElementById('summarizePageButton').click();
    await flush();
    expect(document.getElementById('errorText').textContent).toMatch(/PDF viewer/);
    expect(window.browser.scripting.executeScript).not.toHaveBeenCalled();
  });
});
