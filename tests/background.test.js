const LONG_TEXT = 'This is a sample terms of service sentence. '.repeat(10);
const SELF = { id: 'ext@test' };

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
  };
}

function okReply(parts, extra = {}) {
  return jsonResponse(200, {
    candidates: [{ content: { parts }, finishReason: 'STOP', ...extra }]
  });
}

describe('background.js', () => {
  let localStore;
  let sessionStore;
  let listeners;
  let bg;

  beforeEach(() => {
    jest.resetModules();
    localStore = { geminiApiKey: 'SECRET-KEY' };
    sessionStore = {};
    listeners = {};
    const area = (store) => ({
      get: jest.fn(async (k) => {
        const out = {};
        [].concat(k).forEach((key) => { if (key in store) out[key] = store[key]; });
        return out;
      }),
      set: jest.fn(async (o) => { Object.assign(store, o); }),
      remove: jest.fn(async (k) => { [].concat(k).forEach((key) => delete store[key]); })
    });
    global.browser = {
      storage: { local: area(localStore), session: area(sessionStore) },
      runtime: {
        id: SELF.id,
        onMessage: { addListener: jest.fn((fn) => { listeners.message = fn; }) },
        onInstalled: { addListener: jest.fn((fn) => { listeners.installed = fn; }) },
        getPlatformInfo: jest.fn(async () => ({})),
        openOptionsPage: jest.fn(async () => {})
      }
    };
    global.fetch = jest.fn();
    bg = require('../background.js');
  });

  afterEach(() => {
    delete global.browser;
    delete global.fetch;
  });

  const send = (msg, sender = SELF) => listeners.message(msg, sender);
  const summarize = (extra = {}) =>
    send({ action: 'summarize', text: LONG_TEXT, source: 'page', tabUrl: 'https://x.test', inputTruncated: false, ...extra });

  test('registers listeners at load', () => {
    expect(typeof listeners.message).toBe('function');
    expect(typeof listeners.installed).toBe('function');
  });

  test('getConfig reports key and model', async () => {
    expect(await send({ action: 'getConfig' })).toEqual({
      hasKey: true, model: 'gemini-flash-latest', defaultModel: 'gemini-flash-latest'
    });
  });

  test('no key -> NO_KEY and promise resolves', async () => {
    delete localStore.geminiApiKey;
    const res = await summarize();
    expect(res).toMatchObject({ ok: false, code: 'NO_KEY' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('too short text -> TOO_SHORT', async () => {
    expect(await summarize({ text: '  short  ' })).toMatchObject({ ok: false, code: 'TOO_SHORT' });
  });

  test('key sent in header, never in URL; model id encoded', async () => {
    localStore.geminiModel = 'my model/x';
    global.fetch.mockResolvedValue(okReply([{ text: '- a' }]));
    await summarize();
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).not.toContain('SECRET-KEY');
    expect(url).not.toContain('key=');
    expect(url).toContain('/models/my%20model%2Fx:generateContent');
    expect(init.headers['x-goog-api-key']).toBe('SECRET-KEY');
    const body = JSON.parse(init.body);
    expect(body.systemInstruction.parts[0].text).toMatch(/untrusted/);
    expect(body.contents[0].parts[0].text).toContain('=== BEGIN DOCUMENT ===');
  });

  test('legacy geminiModelName ignored', async () => {
    localStore.geminiModelName = 'retired-model';
    global.fetch.mockResolvedValue(okReply([{ text: '- a' }]));
    await summarize();
    expect(global.fetch.mock.calls[0][0]).toContain('/models/gemini-flash-latest:');
    expect(global.fetch.mock.calls[0][0]).not.toContain('retired-model');
  });

  test('400 invalid key -> BAD_KEY with clean message', async () => {
    global.fetch.mockResolvedValue(jsonResponse(400, {
      error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT',
        details: [{ reason: 'API_KEY_INVALID' }] }
    }));
    const res = await summarize();
    expect(res.code).toBe('BAD_KEY');
    expect(res.error).toContain('API key not valid');
    expect(res.error).not.toMatch(/[{}]/);
  });

  test('404 -> MODEL_NOT_FOUND', async () => {
    global.fetch.mockResolvedValue(jsonResponse(404, { error: { message: 'models/x is not found' } }));
    const res = await summarize();
    expect(res.code).toBe('MODEL_NOT_FOUND');
    expect(res.error).toMatch(/Extension Settings/);
  });

  test('429 passes server message', async () => {
    global.fetch.mockResolvedValue(jsonResponse(429, { error: { message: 'You exceeded your current quota.' } }));
    const res = await summarize();
    expect(res.code).toBe('QUOTA');
    expect(res.error).toContain('You exceeded your current quota.');
    expect(res.error).not.toMatch(/60 per minute/);
  });

  test('non-JSON error body tolerated', async () => {
    global.fetch.mockResolvedValue(jsonResponse(500, '<html>oops</html>'));
    const res = await summarize();
    expect(res).toMatchObject({ ok: false, code: 'API' });
  });

  test('multi-part reply joined', async () => {
    global.fetch.mockResolvedValue(okReply([{ text: '- one\n' }, { text: '- two' }]));
    const res = await summarize();
    expect(res).toEqual({ ok: true, summary: '- one\n- two', truncated: false });
  });

  test('thought parts skipped', async () => {
    global.fetch.mockResolvedValue(okReply([{ text: 'thinking...', thought: true }, { text: '- real' }]));
    expect((await summarize()).summary).toBe('- real');
  });

  test('MAX_TOKENS -> truncated true', async () => {
    global.fetch.mockResolvedValue(okReply([{ text: '- partial' }], { finishReason: 'MAX_TOKENS' }));
    expect(await summarize()).toMatchObject({ ok: true, truncated: true });
  });

  test('blockReason -> BLOCKED naming reason', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, { promptFeedback: { blockReason: 'OTHER' } }));
    const res = await summarize();
    expect(res.code).toBe('BLOCKED');
    expect(res.error).toContain('OTHER');
  });

  test('SAFETY finishReason -> BLOCKED', async () => {
    global.fetch.mockResolvedValue(okReply([], { finishReason: 'SAFETY' }));
    const res = await summarize();
    expect(res.code).toBe('BLOCKED');
    expect(res.error).toContain('SAFETY');
  });

  test('empty text -> EMPTY', async () => {
    global.fetch.mockResolvedValue(okReply([{ text: '   ' }]));
    expect((await summarize()).code).toBe('EMPTY');
  });

  test('non-JSON 200 -> BAD_RESPONSE', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, 'not json'));
    expect((await summarize()).code).toBe('BAD_RESPONSE');
  });

  test('fetch failure -> NETWORK', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    expect((await summarize()).code).toBe('NETWORK');
  });

  test('abort -> TIMEOUT', async () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    global.fetch.mockRejectedValue(err);
    expect((await summarize()).code).toBe('TIMEOUT');
  });

  test('oversized input is sliced and flagged', async () => {
    global.fetch.mockResolvedValue(okReply([{ text: '- a' }]));
    await summarize({ text: 'a'.repeat(bg.MAX_INPUT_CHARS + 500) });
    const sent = JSON.parse(global.fetch.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(sent.length).toBeLessThan(bg.MAX_INPUT_CHARS + 200);
    expect(sessionStore.lastSummary.inputTruncated).toBe(true);
  });

  test('foreign sender rejected', async () => {
    const res = await send({ action: 'getConfig' }, { id: 'other@ext' });
    expect(res).toEqual({ ok: false, code: 'UNKNOWN_ACTION', error: 'Unknown action.' });
  });

  test('unknown action', async () => {
    expect(await send({ action: 'nope' })).toEqual({ ok: false, error: 'Unknown action.', code: 'UNKNOWN_ACTION' });
  });

  test('listModels paginates and filters', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse(200, {
        models: [
          { name: 'models/a', displayName: 'A', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/emb', displayName: 'Emb', supportedGenerationMethods: ['embedContent'] }
        ],
        nextPageToken: 'tok2'
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        models: [{ name: 'models/b', displayName: 'B', supportedGenerationMethods: ['generateContent', 'countTokens'] }]
      }));
    const res = await send({ action: 'listModels', apiKey: 'OTHER-KEY' });
    expect(res).toEqual({ ok: true, models: [{ id: 'a', displayName: 'A' }, { id: 'b', displayName: 'B' }] });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][0]).toContain('pageSize=1000');
    expect(global.fetch.mock.calls[1][0]).toContain('pageToken=tok2');
    global.fetch.mock.calls.forEach(([url, init]) => {
      expect(url).not.toContain('OTHER-KEY');
      expect(init.headers['x-goog-api-key']).toBe('OTHER-KEY');
    });
  });

  test('testConnection makes a real generateContent call with given values', async () => {
    global.fetch.mockResolvedValue(okReply([{ text: 'ok' }]));
    const res = await send({ action: 'testConnection', apiKey: 'K2', model: 'm1' });
    expect(res).toEqual({ ok: true, model: 'm1' });
    expect(global.fetch.mock.calls[0][0]).toContain('/models/m1:generateContent');
  });

  test('testConnection reports retired model', async () => {
    global.fetch.mockResolvedValue(jsonResponse(404, { error: { message: 'gone' } }));
    expect((await send({ action: 'testConnection' })).code).toBe('MODEL_NOT_FOUND');
  });

  test('lastSummary written pending then done', async () => {
    const seen = [];
    global.browser.storage.session.set.mockImplementation(async (o) => {
      seen.push(o.lastSummary.status);
      Object.assign(sessionStore, o);
    });
    global.fetch.mockResolvedValue(okReply([{ text: '- a' }]));
    await summarize();
    expect(seen).toEqual(['pending', 'done']);
    expect(sessionStore.lastSummary).toMatchObject({
      status: 'done', summary: '- a', tabUrl: 'https://x.test', source: 'page', truncated: false
    });
    expect(sessionStore.lastSummary.finishedAt).toBeDefined();
  });

  test('lastSummary records error; session failure does not break response', async () => {
    global.browser.storage.session.set.mockRejectedValue(new Error('no session'));
    global.fetch.mockResolvedValue(jsonResponse(404, {}));
    const res = await summarize();
    expect(res.code).toBe('MODEL_NOT_FOUND');
  });

  test('onInstalled removes legacy key; opens options only on install', async () => {
    localStore.geminiModelName = 'old';
    await listeners.installed({ reason: 'update' });
    expect(localStore.geminiModelName).toBeUndefined();
    expect(global.browser.runtime.openOptionsPage).not.toHaveBeenCalled();
    await listeners.installed({ reason: 'install' });
    expect(global.browser.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
  });

  test('keepalive pings getPlatformInfo during a slow request', async () => {
    jest.useFakeTimers();
    try {
      let release;
      global.fetch.mockReturnValue(new Promise((r) => { release = r; }));
      const p = summarize();
      await jest.advanceTimersByTimeAsync(41000);
      expect(global.browser.runtime.getPlatformInfo).toHaveBeenCalledTimes(2);
      release(okReply([{ text: '- a' }]));
      expect((await p).ok).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
