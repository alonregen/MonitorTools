/**
 * Home view – welcome and tool links (hash routes). Tailwind styled.
 */
var homeView = {
  route: 'home',
  navLabel: 'HOME Page',

  render: function () {
    return `
      <div class="text-center">
        <h1 class="text-2xl sm:text-3xl font-bold text-slate-800 mb-2">Welcome to Monitor Tools</h1>
        <p class="text-slate-600 mb-8">This site offers various tools for log analysis and more.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <a href="#/nested" class="group flex flex-col items-center gap-4 rounded-2xl bg-gradient-to-br from-purple-50 to-violet-50 border-2 border-purple-200 p-6 shadow-md hover:shadow-xl hover:border-purple-400 hover:-translate-y-1 transition-all duration-300">
            <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform duration-300">
              <i class="fas fa-sitemap text-xl"></i>
            </div>
            <span class="font-semibold text-slate-800 group-hover:text-purple-700 transition-colors">Monitor Query Builder</span>
          </a>
          <a href="#/email" class="group flex flex-col items-center gap-4 rounded-2xl bg-gradient-to-br from-purple-50 to-violet-50 border-2 border-purple-200 p-6 shadow-md hover:shadow-xl hover:border-purple-400 hover:-translate-y-1 transition-all duration-300">
            <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform duration-300">
              <i class="fas fa-envelope text-xl"></i>
            </div>
            <span class="font-semibold text-slate-800 group-hover:text-purple-700 transition-colors">Email Generator</span>
          </a>
          <a href="#/tokens" class="group flex flex-col items-center gap-4 rounded-2xl bg-gradient-to-br from-purple-50 to-violet-50 border-2 border-purple-200 p-6 shadow-md hover:shadow-xl hover:border-purple-400 hover:-translate-y-1 transition-all duration-300">
            <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform duration-300">
              <i class="fas fa-key text-xl"></i>
            </div>
            <span class="font-semibold text-slate-800 group-hover:text-purple-700 transition-colors">Tokens Extractor</span>
          </a>
          <a href="#/analyze" class="group flex flex-col items-center gap-4 rounded-2xl bg-gradient-to-br from-purple-50 to-violet-50 border-2 border-purple-200 p-6 shadow-md hover:shadow-xl hover:border-purple-400 hover:-translate-y-1 transition-all duration-300">
            <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform duration-300">
              <i class="fas fa-chart-line text-xl"></i>
            </div>
            <span class="font-semibold text-slate-800 group-hover:text-purple-700 transition-colors">Analyze Logs</span>
          </a>
        </div>
      </div>
    `;
  },

  mount: function () {}
};
(function () { window.MonitorToolsViews = window.MonitorToolsViews || {}; window.MonitorToolsViews.homeView = homeView; })();
