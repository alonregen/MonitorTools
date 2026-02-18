/**
 * New Tool Template – copy this file to add a new tool tab.
 *
 * Steps to add a new tool:
 * 1. Copy _template.js to a new file, e.g. mytool.js
 * 2. Replace 'mytool' with your route name and update navLabel
 * 3. Implement render() to return the HTML string for your view
 * 4. Implement mount(container, context) to attach event listeners
 * 5. Optionally implement unmount() for cleanup (e.g. charts, intervals)
 * 6. In js/app.js: add import and add your view to the routes array
 * 7. In index.html: add a nav item with href="#/mytool" and data-route="mytool"
 */
const dom = window.App.dom;

function getRoot(container) {
  return container || document;
}

function render() {
  return `
    <div class="container py-4">
      <h1 class="h2 mb-4">My Tool</h1>
      <div class="card">
        <div class="card-body">
          <p>Your tool content here.</p>
          <button type="button" class="btn btn-primary" id="newToolBtn">Do something</button>
          <pre id="newToolOutput" class="output-box mt-2"></pre>
        </div>
      </div>
    </div>
  `;
}

function mount(container, context) {
  const root = getRoot(container);
  const btn = root.querySelector('#newToolBtn');
  const output = root.querySelector('#newToolOutput');
  if (btn && output) {
    btn.addEventListener('click', function () {
      output.textContent = 'Result at ' + new Date().toISOString();
    });
  }
}

function unmount() {
  // Cleanup: clear intervals, destroy charts, etc.
}

export const newToolView = {
  route: 'newtool',
  navLabel: 'New Tool',
  render,
  mount,
  unmount
};
