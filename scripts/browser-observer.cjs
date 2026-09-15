// Test-only observation of real Worker messages; no production test endpoints.
async function observe(page) {
  await page.addInitScript(() => {
    const Native = window.Worker;
    window.__coreMessages = [];
    window.__coreRequests = [];
    window.Worker = class extends Native {
      constructor(url, options) {
        super(url, options);
        if (!String(url).includes('core.worker')) return;
        window.__coreWorker = this;
        this.addEventListener('message', e => window.__coreMessages.push(e.data));
        const post = this.postMessage.bind(this);
        this.postMessage = message => { window.__coreRequests.push(message); post(message); };
      }
    };
  });
}
async function resultAfter(page, action) {
  const index = await page.evaluate(() => window.__coreRequests.length);
  await action();
  await page.waitForFunction(index => {
    const request = window.__coreRequests.slice(index).find(r => r.input && r.input.action !== 'metadata');
    return request && window.__coreMessages.some(m => m.id === request.id && !m.progress);
  }, index, { timeout: 120000 });
  const response = await page.evaluate(index => {
    const request = window.__coreRequests.slice(index).find(r => r.input && r.input.action !== 'metadata');
    return window.__coreMessages.find(m => m.id === request.id && !m.progress);
  }, index);
  if (!response.ok) throw Error(JSON.stringify(response));
  return response.data;
}
module.exports = { observe, resultAfter };
