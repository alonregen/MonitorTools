/**
 * SPA router and layout. Hash routes: #/home, #/nested, #/email, #/tokens, #/analyze
 * Uses window.MonitorToolsViews (set by view scripts) so the app works from file:// and GitHub Pages.
 */
(function () {
  var views = window.MonitorToolsViews || {};
  var routes = [
    { path: 'home', view: views.homeView },
    { path: 'nested', view: views.nestedView },
    { path: 'email', view: views.emailView },
    { path: 'tokens', view: views.tokensView },
    { path: 'analyze', view: views.analyzeView }
  ];

const defaultRoute = 'home';
let currentView = null;
let currentViewName = null;

const appContainer = document.getElementById('app');
const navLinks = document.querySelectorAll('.nav-link[data-route]');

function getHashRoute() {
  const hash = window.location.hash.slice(1);
  const path = hash.slice(0, 1) === '/' ? hash.slice(1) : hash;
  const segment = path.split('/')[0] || defaultRoute;
  return segment;
}

function setActiveNav(route) {
  navLinks.forEach(function (link) {
    const isActive = link.getAttribute('data-route') === route;
    link.classList.toggle('active', isActive);
    link.setAttribute('aria-current', isActive ? 'page' : null);
  });
}

function renderRoute(routeName) {
  const route = routes.find(function (r) { return r.path === routeName; });
  const view = route ? route.view : routes.find(function (r) { return r.path === defaultRoute; }).view;
  const name = route ? route.path : defaultRoute;

  if (currentView && currentView.unmount && typeof currentView.unmount === 'function') {
    try { currentView.unmount(); } catch (e) { console.warn('Unmount error:', e); }
  }

  currentView = view;
  currentViewName = name;
  setActiveNav(name);

  if (!view || typeof view.render !== 'function') {
    appContainer.innerHTML = '<div class="p-4 text-red-600">This view did not load. Open the browser console (F12 → Console) to see any script errors.</div>';
    return;
  }

  try {
    const html = view.render();
    appContainer.innerHTML = html;

    if (view.mount && typeof view.mount === 'function') {
      view.mount(appContainer, {
        copyOutput: (window.App && window.App.dom && window.App.dom.copyToClipboard) ? window.App.dom.copyToClipboard : function () { return Promise.resolve(false); }
      });
    }
  } catch (e) {
    console.error('Route render error:', e);
    appContainer.innerHTML = '<div class="p-4 text-red-600">Failed to load this page. Check the console for details.</div>';
  }

  appContainer.scrollIntoView({ behavior: 'instant', block: 'start' });
}

function handleHashChange() {
  const route = getHashRoute();
  if (route === currentViewName) return;
  renderRoute(route);
}

function navigateToDefault() {
  const route = getHashRoute();
  if (!route || !routes.some(function (r) { return r.path === route; })) {
    window.location.hash = '#/' + defaultRoute;
    return;
  }
  renderRoute(route);
}

window.addEventListener('hashchange', handleHashChange);
window.addEventListener('load', function () {
  navigateToDefault();
});
})();

