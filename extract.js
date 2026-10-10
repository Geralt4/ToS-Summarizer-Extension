// ToS Summarizer - page text extraction.
// extractBestTextContent is injected into web pages with scripting.executeScript({ func }),
// so it must stay fully self-contained: no references to anything outside its own body.

function extractBestTextContent() {
    const MAX_CHARS = 300000;
    const MIN_TEXT_LENGTH = 300;
    const DEEPER_RATIO = 0.8;
    const KEYWORDS = ['terms', 'privacy', 'legal', 'agreement', 'policy', 'service', 'conditions', 'eula', 'license', 'disclaimer'];
    const EXCLUDED_TAGS = ['script', 'style', 'nav', 'header', 'footer', 'aside', 'input', 'button', 'select', 'option', 'datalist', 'textarea', 'iframe', 'noscript', 'dialog'];
    const EXCLUDED_SELECTOR = EXCLUDED_TAGS.join(',') + ',[aria-hidden="true"],[hidden]';
    const BAD_TOKENS = new Set(['comment', 'comments', 'sidebar', 'advert', 'advertisement', 'ads', 'promo', 'share', 'social', 'menu', 'nav', 'navigation', 'footer', 'header', 'related', 'modal', 'popup', 'login', 'signup', 'widget', 'cookie', 'cookies', 'banner']);
    const GOOD_TOKENS = new Set(['legal', 'terms', 'policy', 'agreement', 'content', 'article', 'document', 'tos', 'privacy']);
    const BLOCK_TAGS = new Set(['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'tr', 'section', 'article']);
    const CANDIDATE_SELECTOR = 'div, section, article, main';

    function isExcluded(el) {
        return el.matches(EXCLUDED_SELECTOR);
    }

    function isInvisible(el) {
        if (typeof el.checkVisibility !== 'function') return false;
        const visible = el.checkVisibility({
            checkOpacity: true,
            checkVisibilityCSS: true,
            contentVisibilityAuto: true
        });
        if (visible) return false;
        // display: contents elements have no box and report false, but their children render.
        try {
            const view = el.ownerDocument.defaultView;
            if (view && view.getComputedStyle(el).display === 'contents') return false;
        } catch (e) {
            // ignore and treat as hidden
        }
        return true;
    }

    function shouldSkip(el) {
        return isExcluded(el) || isInvisible(el);
    }

    function tokens(el) {
        const raw = `${el.getAttribute('class') || ''} ${el.id || ''}`.toLowerCase();
        return raw.split(/[^a-z0-9]+/).filter(Boolean);
    }

    // Single pass measuring visible text and link text for every element below root.
    function measure(root, info) {
        // Iterative post-order walk so a very deep DOM cannot overflow the stack.
        const stack = [{ el: root, child: root.firstChild, len: 0, link: 0, isLink: root.tagName.toLowerCase() === 'a' }];
        while (stack.length) {
            const frame = stack[stack.length - 1];
            const child = frame.child;
            if (child) {
                frame.child = child.nextSibling;
                if (child.nodeType === 3) {
                    const n = child.data.replace(/\s+/g, ' ').trim().length;
                    frame.len += n;
                    if (frame.isLink) frame.link += n;
                } else if (child.nodeType === 1) {
                    if (shouldSkip(child)) continue;
                    stack.push({ el: child, child: child.firstChild, len: 0, link: 0, isLink: child.tagName.toLowerCase() === 'a' });
                }
                continue;
            }
            stack.pop();
            info.set(frame.el, { len: frame.len, link: frame.link });
            const parent = stack[stack.length - 1];
            if (parent) {
                parent.len += frame.len;
                parent.link += parent.isLink ? frame.len : frame.link;
            }
        }
    }

    function depthOf(el) {
        let d = 0;
        for (let p = el.parentElement; p; p = p.parentElement) d++;
        return d;
    }

    function calculateScore(el, stats) {
        const textLength = stats.len;
        if (textLength < MIN_TEXT_LENGTH) return 0;

        let score = textLength * 1.5;
        const tagName = el.tagName.toLowerCase();
        if (tagName === 'article' || tagName === 'main') score *= 1.3;
        if (tagName === 'section') score *= 1.1;

        const ts = tokens(el);
        if (ts.some(t => BAD_TOKENS.has(t))) score *= 0.1;
        if (ts.some(t => GOOD_TOKENS.has(t))) score *= 1.2;

        let keywordBonus = 0;
        el.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
            const headingText = h.textContent.toLowerCase();
            KEYWORDS.forEach(keyword => {
                if (headingText.includes(keyword)) keywordBonus += 0.2;
            });
        });
        score *= (1 + Math.min(keywordBonus, 2));

        const linkDensity = stats.link / textLength;
        if (linkDensity > 0.5) return 0;
        if (linkDensity > 0.25) score *= 0.5;

        return score;
    }

    // Tree walk collecting visible text, with line breaks at block boundaries.
    function collectText(root) {
        const parts = [];
        let size = 0;
        let stopped = false;
        const limit = MAX_CHARS * 2;

        function push(s) {
            parts.push(s);
            size += s.length;
            if (size > limit) stopped = true;
        }

        // Iterative pre-order walk; a CLOSE marker emits the trailing block break.
        const CLOSE = null;
        const stack = [root];
        while (stack.length && !stopped) {
            const node = stack.pop();
            if (node === CLOSE) {
                push('\n');
                continue;
            }
            if (node.nodeType === 3) {
                push(node.data.replace(/\s+/g, ' '));
                continue;
            }
            if (node.nodeType !== 1) continue;
            if (node !== root && shouldSkip(node)) continue;
            const tag = node.tagName.toLowerCase();
            const isBlock = BLOCK_TAGS.has(tag);
            if (tag === 'br') {
                push('\n');
                continue;
            }
            if (isBlock) {
                push('\n');
                stack.push(CLOSE);
            }
            const children = [];
            for (let child = node.firstChild; child; child = child.nextSibling) children.push(child);
            for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
        }

        let text = parts.join('')
            .split('\n')
            .map(line => line.replace(/ {2,}/g, ' ').trim())
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        let truncated = stopped;
        if (text.length > MAX_CHARS) {
            text = text.slice(0, MAX_CHARS);
            truncated = true;
        }
        return { text, truncated };
    }

    function fallback() {
        const out = collectText(document.body);
        return { text: out.text, truncated: out.truncated, usedFallback: true };
    }

    try {
        const info = new Map();
        measure(document.body, info);

        let best = null;
        let bestScore = 0;
        const scored = [];
        document.body.querySelectorAll(CANDIDATE_SELECTOR).forEach(el => {
            const stats = info.get(el);
            // Not measured means it sits inside an excluded or invisible subtree.
            if (!stats) return;
            const score = calculateScore(el, stats);
            if (score <= 0) return;
            scored.push(el);
            if (score > bestScore) {
                bestScore = score;
                best = el;
            }
        });

        if (!best) return fallback();

        // Prefer the deepest candidate that still holds most of the best candidate's text.
        const minLen = info.get(best).len * DEEPER_RATIO;
        let chosen = best;
        let chosenDepth = depthOf(best);
        scored.forEach(el => {
            if (el === best || !best.contains(el)) return;
            if (info.get(el).len < minLen) return;
            const d = depthOf(el);
            if (d > chosenDepth) {
                chosen = el;
                chosenDepth = d;
            }
        });

        const out = collectText(chosen);
        return { text: out.text, truncated: out.truncated, usedFallback: false };
    } catch (e) {
        try {
            return fallback();
        } catch (e2) {
            return { text: '', truncated: false, usedFallback: true };
        }
    }
}

// Exports for unit testing only; not executed in the browser context.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { extractBestTextContent };
}
