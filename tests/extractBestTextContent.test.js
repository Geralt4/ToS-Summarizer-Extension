const { JSDOM } = require('jsdom');

describe('extractBestTextContent', () => {
  test('returns best text block from page', () => {
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

    const { extractBestTextContent } = require('../popup.js');
    const result = extractBestTextContent();
    expect(result.trim()).toBe(longText);
  });
});
