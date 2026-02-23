const { JSDOM } = require('jsdom');

describe('extractBestTextContent', () => {
  function setupDom(html) {
    const dom = new JSDOM(html);
    if (!('innerText' in dom.window.HTMLElement.prototype)) {
      Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', {
        get() { return this.textContent; },
        set(v) { this.textContent = v; }
      });
    }
    Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetWidth', {
      get() { return 100; }
    });
    Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetHeight', {
      get() { return 20; }
    });
    dom.window.HTMLElement.prototype.getClientRects = function() { return [1]; };
    global.document = dom.window.document;
    global.Node = dom.window.Node;
    global.window = dom.window;
  }

  test('prefers article with legal class and heading over plain paragraphs', () => {
    const longText = 'a'.repeat(350);
    const html = `
      <div id="summarizePageButton"></div>
      <div id="summarizeSelectedButton"></div>
      <div id="status"></div>
      <div id="loader"></div>
      <div id="summaryResult"></div>
      <pre id="summaryText"></pre>
      <div id="errorResult"></div>
      <p id="errorText"></p>
      <button id="copyButton"></button>
      <p id="disclaimer"></p>
      <button id="openOptionsButton"></button>
      <button id="reportIssueButton"></button>

      <div id="header"><p>short header</p></div>
      <article id="legal" class="terms">
        <h1>Terms of Service</h1>
        <p>${longText}</p>
      </article>
      <footer><p>footer text</p></footer>
    `;
    setupDom(html);

    jest.resetModules();
    const { extractBestTextContent } = require('../popup.js');
    const result = extractBestTextContent();
    // The article element (with 'terms' class and 'terms' heading) should be selected,
    // so the result includes both the heading and the long body text.
    expect(result).toContain(longText);
    expect(result).toContain('Terms of Service');
  });

  test('falls back to plain div when no legal-specific markers are present', () => {
    const longText = 'b'.repeat(350);
    const html = `
      <div id="summarizePageButton"></div>
      <div id="summarizeSelectedButton"></div>
      <div id="status"></div>
      <div id="loader"></div>
      <div id="summaryResult"></div>
      <pre id="summaryText"></pre>
      <div id="errorResult"></div>
      <p id="errorText"></p>
      <button id="copyButton"></button>
      <p id="disclaimer"></p>
      <button id="openOptionsButton"></button>
      <button id="reportIssueButton"></button>

      <div id="main-content">
        <p>${longText}</p>
      </div>
      <footer><p>footer text</p></footer>
    `;
    setupDom(html);

    jest.resetModules();
    const { extractBestTextContent } = require('../popup.js');
    const result = extractBestTextContent();
    expect(result).toContain(longText);
  });
});
