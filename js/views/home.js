/**
 * Home view – welcome and tool links (hash routes). Tailwind styled.
 */
var homeView = {
  route: 'home',
  navLabel: 'HOME Page',

  render: function () {
    return `
      <div class="text-center">
        <h1 class="text-2xl sm:text-3xl font-bold text-slate-800 mb-2">Welcome to the Home Page!</h1>
        <p class="text-slate-600 mb-8">This site offers various tools for log analysis and more.</p>
        <div class="flex flex-col sm:flex-row flex-wrap gap-4 justify-center">
          <a href="#/nested" class="inline-flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary-dark text-white font-medium py-3 px-6 shadow-sm transition">
            <i class="fas fa-sitemap"></i> Nested Search Query Builder
          </a>
          <a href="#/email" class="inline-flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary-dark text-white font-medium py-3 px-6 shadow-sm transition">
            <i class="fas fa-envelope"></i> Email Generator
          </a>
          <a href="#/tokens" class="inline-flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary-dark text-white font-medium py-3 px-6 shadow-sm transition">
            <i class="fas fa-key"></i> Tokens Generator
          </a>
          <a href="#/analyze" class="inline-flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary-dark text-white font-medium py-3 px-6 shadow-sm transition">
            <i class="fas fa-chart-line"></i> Analyze Logs
          </a>
        </div>
      </div>
    `;
  },

  mount: function () {}
};
(function () { window.MonitorToolsViews = window.MonitorToolsViews || {}; window.MonitorToolsViews.homeView = homeView; })();
