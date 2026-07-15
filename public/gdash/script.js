const SERVICES = [
    // AI & Intelligence (The Thinking Space)
    { id: 'gemini', name: 'Gemini', category: 'ai', desc: 'Conversational AI for everything.', url: 'https://gemini.google.com', icon: 'assets/icons/gemini.svg', color: '#6898EE', tags: ['chat', 'assistant', 'gpt', 'llm', 'answer'], external: true },
    { id: 'ai-studio', name: 'AI Studio', category: 'ai', desc: 'Fastest way to build with Gemini.', url: 'https://aistudio.google.com/prompts/new_chat', icon: 'assets/icons/ai_studio.svg', color: '#4285F4', tags: ['developer', 'api', 'model', 'tuning'], external: true },
    { id: 'notebooklm', name: 'NotebookLM', category: 'ai', desc: 'AI-first notebook for researchers.', url: 'https://notebooklm.google.com', icon: 'https://www.gstatic.com/images/branding/product/2x/notebooklm_48dp.png', color: '#1B73E8', tags: ['research', 'notes', 'study', 'source'], external: true },
    { id: 'vertex', name: 'Vertex AI Studio', category: 'ai', desc: 'Build, deploy, and scale ML models.', url: 'https://cloud.google.com/vertex-ai', icon: 'assets/icons/vertex_ai.png', color: '#4285F4', tags: ['ml', 'machine learning', 'cloud', 'enterprise'], external: true },
    { id: 'imagen', name: 'Imagen', category: 'ai', desc: 'AI-powered image generation.', url: 'https://deepmind.google/models/imagen/', icon: 'assets/icons/imagen.svg', color: '#EA4335', tags: ['image', 'generation', 'art', 'create', 'ai'], external: true },
    { id: 'veo', name: 'Veo', category: 'ai', desc: 'AI video generation model.', url: 'https://deepmind.google/technologies/veo/', icon: 'assets/icons/veo.svg', color: '#FBBC05', tags: ['video', 'generation', 'ai', 'create'], external: true },
    { id: 'learn-about', name: 'Learn About', category: 'ai', desc: 'AI-powered learning companion.', url: 'https://learning.google.com/experiments/learn-about/signup', icon: 'assets/icons/learnlm.svg', color: '#34A853', tags: ['learning', 'education', 'study', 'tutor'], external: true },
    { id: 'research', name: 'Research', category: 'ai', desc: 'Advancing the state of the art.', url: 'https://research.google/', icon: 'assets/icons/labs.svg', color: '#EA4335', tags: ['research', 'science', 'papers', 'ai', 'innovation'], external: true },
    { id: 'weather-lab', name: 'Weather Lab', category: 'ai', desc: 'Advancing weather prediction with AI.', url: 'https://deepmind.google.com/science/weatherlab', icon: 'assets/icons/labs.svg', color: '#4285F4', tags: ['weather', 'climate', 'science', 'ai', 'deepmind'], external: true },
    { id: 'robotics', name: 'Robotics', category: 'ai', desc: 'Preview Gemini Robotics model.', url: 'https://aistudio.google.com/prompts/new_chat?model=gemini-robotics-er-1.5-preview&utm_source=deepmind.google&utm_medium=referral&utm_campaign=gdm&utm_content=', icon: 'assets/icons/ai_studio.svg', color: '#4285F4', tags: ['robotics', 'gemini', 'ai', 'model', 'preview'], external: true },
    { id: 'jules', name: 'Jules', category: 'ai', desc: 'Agentic coding assistant for GitHub.', url: 'https://jules.google', icon: 'assets/icons/labs.svg', color: '#EA4335', tags: ['code', 'github', 'programming', 'developer'], external: true },

    // Knowledge & Memory (Where Ideas Persist)
    { id: 'docs', name: 'Docs', category: 'knowledge', desc: 'Create and edit documents online.', url: 'https://docs.google.com', icon: 'https://www.gstatic.com/images/branding/product/2x/docs_48dp.png', color: '#4285F4', tags: ['word', 'writer', 'paper', 'text'], external: true, quick: { label: 'New document', url: 'https://docs.new' } },
    { id: 'sheets', name: 'Sheets', category: 'knowledge', desc: 'Powerful spreadsheets for everyone.', url: 'https://sheets.google.com', icon: 'https://www.gstatic.com/images/branding/product/2x/sheets_48dp.png', color: '#34A853', tags: ['table', 'excel', 'data', 'grid'], external: true, quick: { label: 'New spreadsheet', url: 'https://sheets.new' } },
    { id: 'slides', name: 'Slides', category: 'knowledge', desc: 'Stunning presentations made easy.', url: 'https://slides.google.com', icon: 'https://www.gstatic.com/images/branding/product/2x/slides_48dp.png', color: '#FBBC05', tags: ['deck', 'ppt', 'presentation'], external: true, quick: { label: 'New presentation', url: 'https://slides.new' } },
    { id: 'drive', name: 'Drive', category: 'knowledge', desc: 'Store, share, and collaborate on files.', url: 'https://drive.google.com', icon: 'https://www.gstatic.com/images/branding/product/2x/drive_48dp.png', color: '#34A853', tags: ['storage', 'cloud', 'files', 'upload'], external: true },
    { id: 'photos', name: 'Photos', category: 'knowledge', desc: 'Home for all your photos and videos.', url: 'https://photos.google.com', icon: 'https://www.gstatic.com/images/branding/product/2x/photos_48dp.png', color: '#FBBC05', tags: ['gallery', 'images', 'pictures', 'backup'], external: true },
    { id: 'images', name: 'Images', category: 'knowledge', desc: 'Search for images on the web.', url: 'https://images.google.com', icon: 'assets/icons/search.svg', color: '#4285F4', tags: ['search', 'images', 'photos', 'visual'], external: true },

    { id: 'gmail', name: 'Gmail', category: 'productivity', desc: 'Check your latest mail.', url: 'https://mail.google.com', icon: 'https://www.gstatic.com/images/branding/product/2x/gmail_48dp.png', color: '#EA4335', external: true, quick: { label: 'Compose email', url: 'https://mail.google.com/mail/?view=cm&fs=1' } },
    { id: 'calendar', name: 'Calendar', category: 'productivity', desc: 'Your upcoming schedule.', url: 'https://calendar.google.com', icon: 'https://www.gstatic.com/images/branding/product/2x/calendar_48dp.png', color: '#4285F4', external: true, quick: { label: 'New event', url: 'https://calendar.google.com/calendar/r/eventedit' } },
    { id: 'meet', name: 'Meet', category: 'productivity', desc: 'Video meetings and calls.', url: 'https://meet.google.com', icon: 'assets/icons/meet.svg', color: '#00897B', tags: ['video', 'call', 'conference', 'meeting'], external: true, quick: { label: 'New meeting', url: 'https://meet.new' } },
    { id: 'keep', name: 'Keep', category: 'productivity', desc: 'Capture what\'s on your mind quickly.', url: 'https://keep.google.com', icon: 'https://www.gstatic.com/images/branding/product/2x/keep_48dp.png', color: '#FBBC05', tags: ['notes', 'lists', 'todo', 'reminders'], external: true, quick: { label: 'New note', url: 'https://keep.new' } },
    { id: 'tasks', name: 'Tasks', category: 'productivity', desc: 'Stay on top of your to-dos.', url: 'https://tasks.google.com', icon: 'https://www.gstatic.com/images/branding/product/2x/tasks_48dp.png', color: '#4285F4', tags: ['todo', 'list', 'reminders'], external: true },

    // Labs & Experiments (A Sandbox for Play)
    { id: 'stitch', name: 'Stitch', category: 'labs', desc: 'Transform ideas into UI designs.', url: 'https://stitch.withgoogle.com', icon: 'assets/icons/labs.svg', color: '#4285F4', tags: ['ui', 'design', 'app', 'web', 'prototype'], external: true },
    { id: 'illuminate', name: 'Illuminate', category: 'labs', desc: 'AI-powered research and learning summaries.', url: 'https://illuminate.google.com/explore', icon: 'assets/icons/labs.svg', color: '#4285F4', tags: ['research', 'learning', 'papers', 'audio', 'ai'], external: true },
    { id: 'flow', name: 'Flow', category: 'labs', desc: 'AI-powered presentation builder.', url: 'https://labs.google/flow', icon: 'assets/icons/flow.svg', color: '#9C27B0', tags: ['presentation', 'slides', 'ai', 'deck'], external: true },
    { id: 'musicfx', name: 'MusicFX', category: 'labs', desc: 'Generate music with AI.', url: 'https://aitestkitchen.withgoogle.com/tools/music-fx', icon: 'assets/icons/musicfx.svg', color: '#E91E63', tags: ['music', 'audio', 'generation', 'ai', 'sound'], external: true },
    { id: 'mixboard', name: 'Mixboard', category: 'labs', desc: 'AI-powered visual concepting canvas.', url: 'https://labs.google/mixboard', icon: 'assets/icons/labs.svg', color: '#FF5722', tags: ['whiteboard', 'concept', 'design', 'brainstorm'], external: true },
    { id: 'opal', name: 'Opal', category: 'labs', desc: 'No-code builder for AI-powered apps.', url: 'https://opal.google', icon: 'assets/icons/labs.svg', color: '#607D8B', tags: ['nocode', 'app builder', 'automation'], external: true },
    { id: 'earth-studio', name: 'Earth Studio', category: 'labs', desc: 'Animation tool for Google Earth imagery.', url: 'https://www.google.com/earth/studio/', icon: 'assets/icons/earth.svg', color: '#4285F4', tags: ['animation', 'video', '3d', 'maps'], external: true },
    { id: 'ai-mode', name: 'AI Mode', category: 'labs', desc: 'Search Labs experiment (SGE).', url: 'https://www.google.com/search?authuser=0&udm=50&aep=25&hl=en&source=searchlabs', icon: 'assets/icons/search.svg', color: '#4285F4', tags: ['search', 'ai', 'labs', 'sge'], external: true },
    { id: 'say-what-you-see', name: 'Say what you see!', category: 'labs', desc: 'Gamified prompt trainer experiment.', url: 'https://artsandculture.google.com/experiment/say-what-you-see/jwG3m7wQShZngw?cp&hl=en', icon: 'assets/icons/arts_culture.png', color: '#FBBC05', tags: ['arts', 'culture', 'experiment', 'prompt', 'game'], external: true },

    // Build & Infra (Anything that Deploys or Scales)
    { id: 'cloud', name: 'GCP', category: 'build', desc: 'Google Cloud platform management.', url: 'https://console.cloud.google.com', icon: 'assets/icons/google_cloud.svg', color: '#4285F4', tags: ['gcp', 'server', 'compute', 'database'], external: true },
    { id: 'firebase', name: 'Firebase', category: 'build', desc: 'App development platform for all.', url: 'https://console.firebase.google.com', icon: 'https://www.gstatic.com/images/branding/product/2x/firebase_48dp.png', color: '#FFCA28', tags: ['database', 'auth', 'hosting', 'analytics'], external: true },
    { id: 'bigquery', name: 'BigQuery', category: 'build', desc: 'Serverless data warehouse.', url: 'https://console.cloud.google.com/bigquery', icon: 'assets/icons/bigquery.svg', color: '#4285F4', tags: ['data', 'sql', 'analytics', 'warehouse'], external: true },
    { id: 'api-explorer', name: 'API Explorer', category: 'build', desc: 'Try Google APIs interactively.', url: 'https://developers.google.com/apis-explorer', icon: 'https://www.gstatic.com/images/branding/product/2x/google_developers_48dp.png', color: '#4285F4', tags: ['api', 'rest', 'sdk', 'dev'], external: true },
    { id: 'adk-docs', name: 'ADK Docs', category: 'build', desc: 'Agent Development Kit documentation.', url: 'https://google.github.io/adk-docs/', icon: 'https://www.gstatic.com/images/branding/product/2x/cloud_48dp.png', color: '#4285F4', tags: ['adk', 'docs', 'agent', 'dev'], external: true },
    { id: 'adk-samples', name: 'ADK Samples', category: 'build', desc: 'Official ADK code samples.', url: 'https://github.com/google/adk-samples', icon: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png', color: '#FFFFFF', tags: ['code', 'github', 'samples', 'adk'], external: true },
    { id: 'adk-training', name: 'ADK Training', category: 'build', desc: 'Training resources for ADK.', url: 'https://raphaelmansuy.github.io/adk_training/', icon: 'https://www.gstatic.com/images/branding/product/2x/cloud_48dp.png', color: '#4285F4', tags: ['training', 'learn', 'course', 'adk'], external: true },
    { id: 'antigravity-skills', name: 'Antigravity Skills', category: 'build', desc: 'Skills for Antigravity agents.', url: 'https://github.com/rominirani/antigravity-skills', icon: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png', color: '#FFFFFF', tags: ['skills', 'antigravity', 'extensions', 'adk'], external: true },
    { id: 'web-dev', name: 'web.dev', category: 'build', desc: 'Modern web development guidance.', url: 'https://web.dev/learn/testing?hl=en', icon: 'assets/icons/webdev.svg', color: '#37474F', tags: ['web', 'dev', 'html', 'css', 'javascript', 'testing'], external: true },
    { id: 'awesome-adk', name: 'Awesome ADK', category: 'build', desc: 'Curated ADK agents & resources.', url: 'https://github.com/Sri-Krishna-V/awesome-adk-agents?tab=readme-ov-file', icon: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png', color: '#FFFFFF', tags: ['awesome', 'list', 'community', 'adk'], external: true },
    { id: 'prompt-gallery', name: 'Prompt Gallery', category: 'build', desc: 'Explore and use pre-built prompts.', url: 'https://console.cloud.google.com/vertex-ai/studio/prompt-gallery?project=project-709a19c2-1276-4e88-83e', icon: 'assets/icons/google_cloud.svg', color: '#4285F4', tags: ['prompts', 'vertex', 'gallery', 'build'], external: true },

    // Signal & Behavior (Real User Insights)
    { id: 'analytics', name: 'Analytics', category: 'signal', desc: 'Get essential customer insights.', url: 'https://analytics.google.com', icon: 'https://www.gstatic.com/images/branding/product/2x/analytics_48dp.png', color: '#F4B400', tags: ['traffic', 'stats', 'users', 'web'], external: true },
    { id: 'search-console', name: 'Search Console', category: 'signal', desc: 'Optimize your site for Search.', url: 'https://search.google.com/search-console', icon: 'https://www.gstatic.com/images/branding/product/2x/search_console_48dp.png', color: '#4285F4', tags: ['seo', 'webmaster', 'analytics', 'index'], external: true },
    { id: 'trends', name: 'Trends', category: 'signal', desc: 'Explore what the world is searching.', url: 'https://trends.google.com', icon: 'https://www.gstatic.com/images/branding/product/2x/trends_48dp.png', color: '#4285F4', tags: ['search', 'data', 'insights', 'keywords'], external: true },
    { id: 'finance', name: 'Finance', category: 'signal', desc: 'Real-time market quotes and news.', url: 'https://www.google.com/finance/beta/?hl=en', icon: 'assets/icons/finance.svg', color: '#34A853', tags: ['money', 'stocks', 'market', 'news', 'crypto'], external: true },
    { id: 'ads', name: 'Ads', category: 'signal', desc: 'Get in front of customers.', url: 'https://ads.google.com', icon: 'https://www.gstatic.com/images/branding/product/2x/ads_48dp.png', color: '#4285F4', tags: ['marketing', 'advertising', 'ppc', 'campaign'], external: true },
    { id: 'transparency-report', name: 'Transparency Report', category: 'signal', desc: 'Check URL safety via Google Safe Browsing.', url: 'https://transparencyreport.google.com/safe-browsing/search?hl=en', icon: 'assets/icons/transparency_report.svg', color: '#4285F4', tags: ['safety', 'safe browsing', 'url', 'security', 'phishing', 'malware'], external: true },

    // Identity & Control (Manage Access and Security)
    { id: 'account', name: 'Account', category: 'identity', desc: 'Manage your account.', url: 'https://myaccount.google.com', icon: 'assets/icons/account.svg', color: '#4285F4', tags: ['settings', 'privacy', 'security', 'profile', 'personal'], external: true },
    { id: 'oauth', name: 'OAuth Console', category: 'identity', desc: 'Manage OAuth 2.0 clients.', url: 'https://console.cloud.google.com/apis/credentials', icon: 'https://www.gstatic.com/images/branding/product/2x/google_developers_48dp.png', color: '#4285F4', tags: ['auth', 'login', 'api', 'credentials'], external: true },
    { id: 'admin', name: 'Admin Console', category: 'identity', desc: 'Manage Google Workspace.', url: 'https://admin.google.com', icon: 'https://www.gstatic.com/images/branding/product/2x/admin_48dp.png', color: '#4285F4', tags: ['workspace', 'users', 'organization', 'domain'], external: true },
    { id: 'family', name: 'Family', category: 'identity', desc: 'Manage your family group.', url: 'https://myaccount.google.com/family/details', icon: 'assets/icons/account.svg', color: '#4285F4', tags: ['family', 'group', 'manage', 'kids'], external: true },

    // Learning & Skills
    { id: 'google-skills', name: 'Skills', category: 'learning', desc: 'Main skills portal.', url: 'https://www.skills.google/', icon: 'assets/icons/learnlm.svg', color: '#4285F4', tags: ['skills', 'learn', 'courses'], external: true },
    { id: 'intro-vertex', name: 'Intro to Vertex AI', category: 'learning', desc: 'Course: Intro to Vertex AI Studio.', url: 'https://www.skills.google/course_templates/552', icon: 'assets/icons/vertex_ai.png', color: '#4285F4', tags: ['course', 'vertex', 'ai', 'learn'], external: true },
    { id: 'linux-lab', name: 'Linux Essentials', category: 'learning', desc: 'Lab: Command Line Primer.', url: 'https://skills.google/focuses/129043?parent=catalog', icon: 'assets/images/linux-tux-1-logo.png', color: '#FCC624', tags: ['linux', 'lab', 'command line'], external: true },
    { id: 'gen-ai-path', name: 'Intro to Gen AI', category: 'learning', desc: 'Learning path.', url: 'https://www.skills.google/paths/118', icon: 'assets/icons/google_cloud.svg', color: '#4285F4', tags: ['genai', 'path', 'learn'], external: true },
    { id: 'gen-ai-leader', name: 'Gen AI Leader', category: 'learning', desc: 'Leader learning path.', url: 'https://www.skills.google/paths/1951', icon: 'assets/icons/google_cloud.svg', color: '#4285F4', tags: ['leader', 'path', 'genai'], external: true }
];

const grid = document.getElementById('dashboard-grid');
const searchInput = document.getElementById('service-search');
const categoryFiltersContainer = document.getElementById('category-filters');

// Category filter state
let currentCategoryFilter = 'all';

// Connected-dashboard state (populated via the host bridge further down; declared
// here because the initial render below already consults it).
let dashboardData = null;
let isConnected = false;
let lastFetchedAt = 0;

const CATEGORIES = [
    { id: 'ai', label: 'AI & Intelligence', desc: 'Your thinking space' },
    { id: 'productivity', label: 'Productivity & Sync', desc: 'Action-oriented utilities' },
    { id: 'knowledge', label: 'Knowledge & Memory', desc: 'Where ideas persist' },
    { id: 'labs', label: 'Labs & Experiments', desc: 'A sandbox for play' },
    { id: 'build', label: 'Build & Infra', desc: 'Anything that deploys or scales' },
    { id: 'signal', label: 'Signal & Behavior', desc: 'Real user insights' },
    { id: 'identity', label: 'Identity & Control', desc: 'Manage access and security' },
    { id: 'learning', label: 'Learning & Skills', desc: 'Grow your expertise' }
];

/* --- Pinned favorites (persisted locally) --- */
const PINS_KEY = 'gdash:pins';

function loadPins() {
    try {
        const raw = JSON.parse(localStorage.getItem(PINS_KEY) || '[]');
        if (!Array.isArray(raw)) return [];
        const known = new Set(SERVICES.map(s => s.id));
        return raw.filter(id => known.has(id));
    } catch { return []; }
}

let pinnedIds = loadPins();

function togglePin(id) {
    if (pinnedIds.includes(id)) pinnedIds = pinnedIds.filter(p => p !== id);
    else pinnedIds = [...pinnedIds, id];
    try { localStorage.setItem(PINS_KEY, JSON.stringify(pinnedIds)); } catch { /* private mode etc. */ }
    renderServices(searchInput.value);
}

const PIN_STAR_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
const QUICK_PLUS_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';

function createServiceCard(s) {
    const isPinned = pinnedIds.includes(s.id);
    const card = document.createElement('div');
    card.className = 'service-card';
    card.setAttribute('tabindex', '0'); // Make focusable
    card.dataset.url = s.url;
    card.dataset.id = s.id;
    card.style.setProperty('--accent-color', s.color);

    card.innerHTML = `
        <div class="card-actions">
            ${s.quick ? `<button type="button" class="card-action-btn quick" title="${escapeAttr(s.quick.label)}" aria-label="${escapeAttr(s.quick.label)}">${QUICK_PLUS_SVG}</button>` : ''}
            <button type="button" class="card-action-btn pin${isPinned ? ' pinned' : ''}" title="${isPinned ? 'Unpin' : 'Pin to top'}" aria-label="${isPinned ? 'Unpin' : 'Pin to top'}" aria-pressed="${isPinned}">${PIN_STAR_SVG}</button>
        </div>
        <div class="card-icon">
            <img src="${s.icon}" alt="${s.name}" onerror="this.src='https://www.gstatic.com/images/branding/product/2x/generic_48dp.png'">
        </div>
        <div class="card-info">
            <h3>${s.name}</h3>
            <p>${s.desc}</p>
        </div>
        <div class="widget-area"></div>
    `;

    // Click handler
    card.addEventListener('click', (e) => {
        e.preventDefault(); // Prevent default if it was a link
        launchService(s);
    });

    // Enter key handler
    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target === card) {
            e.preventDefault();
            launchService(s);
        }
    });

    const quickBtn = card.querySelector('.card-action-btn.quick');
    if (quickBtn) quickBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.open(s.quick.url, '_blank');
    });
    card.querySelector('.card-action-btn.pin').addEventListener('click', (e) => {
        e.stopPropagation();
        togglePin(s.id);
    });

    return card;
}

function renderSection(label, desc, services) {
    const section = document.createElement('div');
    section.className = 'category-section';

    const header = document.createElement('div');
    header.className = 'section-header';
    header.innerHTML = `
        <h2 class="section-title">${label}</h2>
        <span class="section-desc">${desc}</span>
    `;
    section.appendChild(header);

    const cardsGrid = document.createElement('div');
    cardsGrid.className = 'cards-grid';
    services.forEach(s => cardsGrid.appendChild(createServiceCard(s)));
    section.appendChild(cardsGrid);
    return section;
}

function renderServices(query = '', categoryFilter = currentCategoryFilter) {
    grid.innerHTML = '';
    const lowerQuery = query.toLowerCase();

    // Filter services by search query and category
    let filteredServices = SERVICES.filter(s =>
        s.name.toLowerCase().includes(lowerQuery) ||
        s.desc.toLowerCase().includes(lowerQuery) ||
        (s.tags && s.tags.some(tag => tag.toLowerCase().includes(lowerQuery)))
    );

    // Apply category filter if not 'all'
    if (categoryFilter !== 'all') {
        filteredServices = filteredServices.filter(s => s.category === categoryFilter);
    }

    // Search tools: matches from the connected account's data + deep-search links.
    const liveMatches = query ? buildLiveMatches(query) : [];
    if (query) grid.appendChild(renderSearchTools(query, liveMatches));

    if (query && filteredServices.length === 0 && liveMatches.length === 0) {
        grid.insertAdjacentHTML('beforeend', '<div class="no-results">No services or content found matching your search.</div>');
        return;
    }

    // Pinned section first (only in the 'all' view; category views keep cards in place)
    let remaining = filteredServices;
    if (categoryFilter === 'all' && pinnedIds.length > 0) {
        const byId = new Map(filteredServices.map(s => [s.id, s]));
        const pinned = pinnedIds.map(id => byId.get(id)).filter(Boolean);
        if (pinned.length > 0) {
            grid.appendChild(renderSection('Pinned', 'Your favorites', pinned));
            const pinnedSet = new Set(pinned.map(s => s.id));
            remaining = filteredServices.filter(s => !pinnedSet.has(s.id));
        }
    }

    // Group by category
    const grouped = {};
    remaining.forEach(s => {
        if (!grouped[s.category]) grouped[s.category] = [];
        grouped[s.category].push(s);
    });

    // Render by defined order
    CATEGORIES.forEach(cat => {
        const services = grouped[cat.id];
        if (!services || services.length === 0) return;
        services.sort((a, b) => a.name.localeCompare(b.name));
        grid.appendChild(renderSection(cat.label, cat.desc, services));
    });

    // Re-hydrate card widgets after every re-render (search, filters, pinning).
    applyWidgets();
}

/* --- Live search over connected-account data --- */

function buildLiveMatches(query) {
    if (!isConnected || !dashboardData) return [];
    const q = query.toLowerCase();
    const matches = [];
    const seenFiles = new Map();

    const fileSources = [
        dashboardData.drive?.recentFiles,
        dashboardData.docs,
        dashboardData.sheets,
        dashboardData.slides,
    ];
    fileSources.forEach(list => (list || []).forEach(f => {
        if (f && f.id && !seenFiles.has(f.id)) seenFiles.set(f.id, f);
    }));
    seenFiles.forEach(f => {
        if ((f.name || '').toLowerCase().includes(q)) {
            matches.push({ icon: getFileEmoji(f.mimeType || ''), label: f.name, url: f.webViewLink });
        }
    });

    (dashboardData.calendar?.events || []).forEach(ev => {
        if ((ev.summary || '').toLowerCase().includes(q)) {
            matches.push({ icon: '📅', label: `${formatEventWhen(ev)} — ${ev.summary}`, url: ev.htmlLink });
        }
    });

    (dashboardData.gmail?.messages || []).forEach(raw => {
        const msg = normalizeGmailMessage(raw);
        const hay = `${msg.subject} ${msg.from}`.toLowerCase();
        if (hay.includes(q)) {
            matches.push({ icon: '✉️', label: `${msg.from.split('<')[0].trim()}: ${msg.subject}`, url: `https://mail.google.com/mail/u/0/#inbox/${msg.id || ''}` });
        }
    });

    (dashboardData.tasks?.items || []).forEach(t => {
        if ((t.title || '').toLowerCase().includes(q)) {
            matches.push({ icon: '☐', label: t.title, url: 'https://tasks.google.com/embed/?origin=https://tasks.google.com' });
        }
    });

    return matches.slice(0, 8);
}

function renderSearchTools(query, liveMatches) {
    const enc = encodeURIComponent(query);
    const section = document.createElement('div');
    section.className = 'category-section search-tools';

    const header = document.createElement('div');
    header.className = 'section-header';
    header.innerHTML = `
        <h2 class="section-title">Search</h2>
        <span class="section-desc">${isConnected ? 'Your content and Google-wide search' : 'Google-wide search'}</span>
    `;
    section.appendChild(header);

    const deepLinks = document.createElement('div');
    deepLinks.className = 'deep-links';
    deepLinks.innerHTML = [
        { label: 'Drive', url: `https://drive.google.com/drive/search?q=${enc}` },
        { label: 'Gmail', url: `https://mail.google.com/mail/u/0/#search/${enc}` },
        { label: 'Calendar', url: `https://calendar.google.com/calendar/r/search?text=${enc}` },
    ].map(l => `
        <button type="button" class="deep-link-chip" data-open-url="${escapeAttr(l.url)}">
            Search ${l.label} for &ldquo;${escapeHtml(query)}&rdquo;
        </button>
    `).join('');
    section.appendChild(deepLinks);
    deepLinks.querySelectorAll('.deep-link-chip').forEach(chip => {
        chip.addEventListener('click', () => window.open(chip.dataset.openUrl, '_blank'));
    });

    if (liveMatches.length > 0) {
        const list = document.createElement('div');
        list.className = 'live-results';
        liveMatches.forEach(m => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'live-item';
            item.innerHTML = `<span class="file-icon">${m.icon}</span><span class="file-name">${escapeHtml(m.label)}</span>`;
            item.addEventListener('click', () => window.open(m.url || '#', '_blank'));
            list.appendChild(item);
        });
        section.appendChild(list);
    }

    return section;
}

// Render Category Filter Pills
function renderCategoryFilters() {
    if (!categoryFiltersContainer) return;

    // Clear existing pills
    categoryFiltersContainer.innerHTML = '';

    // Create 'All' pill
    const allPill = document.createElement('button');
    allPill.className = 'filter-pill' + (currentCategoryFilter === 'all' ? ' active' : '');
    allPill.textContent = 'All';
    allPill.setAttribute('data-category', 'all');
    allPill.addEventListener('click', () => {
        currentCategoryFilter = 'all';
        renderCategoryFilters();
        renderServices(searchInput.value);
    });
    categoryFiltersContainer.appendChild(allPill);

    // Create category pills
    CATEGORIES.forEach(cat => {
        const pill = document.createElement('button');
        pill.className = 'filter-pill' + (currentCategoryFilter === cat.id ? ' active' : '');
        pill.textContent = cat.label;
        pill.setAttribute('data-category', cat.id);
        pill.addEventListener('click', () => {
            currentCategoryFilter = cat.id;
            renderCategoryFilters();
            renderServices(searchInput.value);
        });
        categoryFiltersContainer.appendChild(pill);
    });
}

// Event Listeners
searchInput.addEventListener('input', (e) => {
    renderServices(e.target.value, currentCategoryFilter);
});

// Keyboard Navigation Manager
class KeyboardManager {
    constructor() {
        this.currentFocus = -1;
        this.focusableSelector = '.service-card, input[type="text"]';
    }

    handleKey(e) {
        const focusable = Array.from(document.querySelectorAll(this.focusableSelector));
        if (focusable.length === 0) return;

        // Find current index
        const currentIndex = focusable.indexOf(document.activeElement);

        // Arrow Key Grid Navigation logic could be complex purely based on DOM order.
        // For simplicity in a grid, we often map Left/Right to -1/+1 index.
        // Up/Down depends on columns. Let's start with basic linear nav for arrows.

        let nextIndex = currentIndex;

        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                e.preventDefault();
                nextIndex = currentIndex + 1;
                if (nextIndex >= focusable.length) nextIndex = 0;
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                e.preventDefault();
                nextIndex = currentIndex - 1;
                if (nextIndex < 0) nextIndex = focusable.length - 1;
                break;
            case '/':
                if (document.activeElement !== searchInput) {
                    e.preventDefault();
                    searchInput.focus();
                }
                return;
        }

        if (nextIndex !== currentIndex && nextIndex >= 0) {
            focusable[nextIndex].focus();
        }
    }
}

const keyManager = new KeyboardManager();

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // Clear the search when it has focus or a query is active.
        if (searchInput.value || document.activeElement === searchInput) {
            searchInput.value = '';
            renderServices('');
            searchInput.blur();
        }
        return;
    }

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '/'].includes(e.key)) {
        keyManager.handleKey(e);
    }
});

// Initial Render
renderCategoryFilters();
renderServices();

// Service Launcher (Part C)
function launchService(service) {
    window.open(service.url, '_blank');
}

/* --- Part B: API-Aware Dashboard --- */

// Auth Elements
const authBtn = document.getElementById('auth-btn');
const authText = authBtn.querySelector('.auth-text');
const refreshBtn = document.getElementById('refresh-btn');
const refreshAge = document.getElementById('refresh-age');
const authError = document.createElement('div');
authError.className = 'auth-error';
authError.setAttribute('role', 'alert');
authError.hidden = true;
document.querySelector('.user-area').appendChild(authError);
const authStatus = document.createElement('div');
authStatus.className = 'auth-status';
authStatus.setAttribute('role', 'status');
authStatus.hidden = true;
document.querySelector('.user-area').appendChild(authStatus);
let isConnecting = false;

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
}

/* --- Host bridge (Perci / Electron) ---
 * G-Dash runs inside Perci as an iframe. OAuth and every Google API call happen
 * in the Electron main process — this iframe never sees an access token. We talk
 * to the host React panel (GDashMode) over postMessage; it relays to the
 * window.electron.gdash* IPC methods and pushes back the assembled dashboard.
 * The frame is same-origin with the host, so pin messages to our origin when
 * served over http(s) (dev server). Packaged file:// builds report
 * location.origin as "file://" while message events arrive with origin "null",
 * so pinning would silently drop every message — '*' is the only option there;
 * the event.source identity check is the real boundary. */
const GDASH_HOST = (window.parent && window.parent !== window) ? window.parent : null;
const HOST_ORIGIN = /^https?:$/.test(window.location.protocol)
    ? window.location.origin
    : '*';

function postToHost(type, payload) {
    if (!GDASH_HOST) return;
    GDASH_HOST.postMessage({ source: 'gdash', type, ...(payload || {}) }, HOST_ORIGIN);
}

function showAuthError(message) {
    authError.textContent = message || '';
    authError.hidden = !message;
}

function showAuthStatus(message) {
    authStatus.textContent = message || '';
    authStatus.hidden = !message;
}

function applyDashboard(data) {
    if (data && data.connected) {
        dashboardData = data;
        isConnected = true;
        if (data.fetchedAt) lastFetchedAt = data.fetchedAt;
        handleAuthSuccess();
    } else {
        dashboardData = null;
        isConnected = false;
        lastFetchedAt = 0;
        handleSignOut();
    }
    updateRefreshAge();
}

window.addEventListener('message', (event) => {
    if (!GDASH_HOST || event.source !== GDASH_HOST) return;
    if (HOST_ORIGIN !== '*' && event.origin !== HOST_ORIGIN) return;
    const msg = event.data;
    if (!msg || msg.source !== 'gdash-host') return;
    switch (msg.type) {
        case 'dashboard:result':
            isConnecting = false;
            showAuthError('');
            showAuthStatus('');
            refreshBtn.classList.remove('spinning');
            applyDashboard(msg.data);
            break;
        case 'connecting':
            isConnecting = true;
            authText.textContent = 'Cancel sign-in';
            authBtn.title = 'Click to cancel Google sign-in';
            showAuthStatus(msg.message || 'Complete Google sign-in in your default browser.');
            break;
        case 'connect:error':
            isConnecting = false;
            isConnected = false;
            refreshBtn.classList.remove('spinning');
            handleSignOut();
            showAuthStatus('');
            showAuthError(
                msg.error === 'no-client-id'
                    ? 'Add your Google client ID in Perci Settings to connect.'
                    : msg.error === 'no-client-secret'
                        ? 'Add your Google client secret in Perci Settings to connect.'
                        : (msg.error || 'Google sign-in failed. Try again.')
            );
            break;
        default:
            break;
    }
});

function loadOrbitGoogleConnect() {
    if (!GDASH_HOST) {
        // Opened standalone (no Electron host) — show the static signed-out grid.
        handleSignOut();
        return;
    }
    authText.textContent = 'Checking…';
    postToHost('dashboard:request');
}

/* --- Freshness: manual refresh, auto-refresh, "updated Xm ago" --- */

function requestDashboard(force) {
    if (!GDASH_HOST) return;
    if (force) refreshBtn.classList.add('spinning');
    postToHost('dashboard:request', force ? { force: true } : undefined);
}

refreshBtn.addEventListener('click', () => requestDashboard(true));

function updateRefreshAge() {
    if (!isConnected || !lastFetchedAt) {
        refreshAge.hidden = true;
        return;
    }
    const mins = Math.floor((Date.now() - lastFetchedAt) / 60000);
    refreshAge.textContent = mins < 1 ? 'Updated just now'
        : mins < 60 ? `Updated ${mins}m ago`
            : `Updated ${Math.floor(mins / 60)}h ago`;
    refreshAge.hidden = false;
}

setInterval(updateRefreshAge, 30 * 1000);

// Periodic + on-return refresh. The host's main-process cache absorbs these, so
// they only hit Google when the data is actually stale.
setInterval(() => {
    if (isConnected && document.visibilityState === 'visible') requestDashboard(false);
}, 5 * 60 * 1000);

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isConnected) requestDashboard(false);
});

// Auth button toggles: connect when signed out, disconnect when signed in.
authBtn.addEventListener('click', () => {
    showAuthError('');
    if (isConnecting) {
        authText.textContent = 'Cancelling…';
        postToHost('connect:cancel');
        return;
    }
    if (isConnected) {
        postToHost('disconnect');
        authText.textContent = 'Connect';
        return;
    }
    if (!GDASH_HOST) {
        showAuthError('Google sign-in needs the Perci desktop app.');
        return;
    }
    authText.textContent = 'Connecting…';
    postToHost('connect');
});


function handleAuthSuccess() {
    isConnecting = false;
    document.body.classList.add('is-signed-in');
    authBtn.classList.add('signed-in');
    authError.hidden = true;
    authError.textContent = '';
    const givenName = dashboardData?.profile?.givenName;
    authText.textContent = givenName ? `Hi, ${givenName}` : 'Connected';
    applyWidgets();
}

function handleSignOut() {
    isConnecting = false;
    document.body.classList.remove('is-signed-in');
    authBtn.classList.remove('signed-in');
    authBtn.title = '';
    authText.textContent = 'Connect';
    // Clear widgets
    document.querySelectorAll('.service-card').forEach(card => {
        card.classList.remove('widget-mode');
        const widgetArea = card.querySelector('.widget-area');
        if (widgetArea) widgetArea.innerHTML = '';
    });
}

// Re-render every data widget from the current dashboard payload. Safe to call
// after any grid re-render (search, category filters, pin toggles, sign-in).
function applyWidgets() {
    if (!isConnected || !dashboardData) return;
    renderDriveWidget();
    renderCalendarWidget();
    renderGmailWidget();
    renderDocsWidget();
    renderSheetsWidget();
    renderSlidesWidget();
    renderTasksWidget();
    handleKeepWidget();
    handleNotebookLMWidget();
}

function getOpenItemAttributes(url) {
    return `onclick="event.stopPropagation(); window.open(this.dataset.openUrl, '_blank')" data-open-url="${escapeAttr(url || '#')}"`;
}

function renderServiceError(serviceId, message) {
    const card = document.querySelector(`.service-card[data-id="${serviceId}"]`);
    if (!card) return;

    card.classList.add('widget-mode');
    const widgetArea = card.querySelector('.widget-area');
    if (!widgetArea) return;

    widgetArea.innerHTML = `
        <div class="widget-container stats activity">
            <div class="activity-list">
                <div class="activity-item widget-error">
                    <span class="file-icon">⚠️</span>
                    <span class="file-name">${escapeHtml(message)}</span>
                </div>
            </div>
        </div>
    `;
}

function normalizeGmailMessage(message) {
    if (message.subject || message.from) return message;
    const headers = message.payload?.headers || [];
    return {
        id: message.id,
        subject: headers.find(h => h.name === 'Subject')?.value || '(No Subject)',
        from: headers.find(h => h.name === 'From')?.value || 'Unknown',
    }
}

// Widgets: a null section means that fetch failed in the main process (vs. an
// empty array, which is a real "nothing there" result).

function renderDocsWidget() {
    const files = dashboardData?.docs;
    if (files === null) return renderServiceError('docs', "Couldn't load Docs — refresh to retry");
    renderServiceActivity('docs', (files || []).slice(0, 5), '#4285F4', 'Recent Docs');
}

function renderSheetsWidget() {
    const files = dashboardData?.sheets;
    if (files === null) return renderServiceError('sheets', "Couldn't load Sheets — refresh to retry");
    renderServiceActivity('sheets', (files || []).slice(0, 5), '#34A853', 'Recent Sheets');
}

function renderSlidesWidget() {
    const files = dashboardData?.slides;
    if (files === null) return renderServiceError('slides', "Couldn't load Slides — refresh to retry");
    renderServiceActivity('slides', (files || []).slice(0, 5), '#FBBC05', 'Recent Slides');
}

// Helper: Generic Service Activity Renderer
function renderServiceActivity(serviceId, files, color, label) {
    const card = document.querySelector(`.service-card[data-id="${serviceId}"]`);
    if (!card) return;

    // Clear old state
    card.classList.add('widget-mode');
    const widgetArea = card.querySelector('.widget-area');
    if (!widgetArea) return;

    if (files.length === 0) {
        widgetArea.innerHTML = `
            <div class="widget-container stats activity">
                <div class="activity-header">
                    <span class="plan-badge" style="background:${color};color:white;">${label}</span>
                </div>
                <div class="activity-list">
                    <div class="activity-item" style="cursor: default; opacity: 0.6;">
                        <span class="file-icon">📂</span>
                        <span class="file-name">No recent items found</span>
                    </div>
                </div>
            </div>
        `;
        return;
    }

    const fileListHtml = files.map(file => `
        <div class="activity-item" ${getOpenItemAttributes(file.webViewLink)}>
            <span class="file-icon">${getFileEmoji(file.mimeType || '')}</span>
            <span class="file-name">${escapeHtml(file.name)}</span>
        </div>
    `).join('');

    widgetArea.innerHTML = `
        <div class="widget-container stats activity">
            <div class="activity-header">
                <span class="plan-badge" style="background:${color};color:white;">${label}</span>
            </div>
            <div class="activity-list">
                ${fileListHtml}
            </div>
        </div>
    `;
}

function renderDriveWidget() {
    const files = dashboardData?.drive?.recentFiles;
    if (files === null) return renderServiceError('drive', "Couldn't load Drive — refresh to retry");

    const driveCard = document.querySelector('.service-card[data-id="drive"]');
    if (!driveCard) return;

    driveCard.classList.add('widget-mode');
    const widgetArea = driveCard.querySelector('.widget-area');
    if (!widgetArea) return;

    const fileListHtml = (files || []).map(file => `
        <div class="activity-item" ${getOpenItemAttributes(file.webViewLink)}>
            <span class="file-icon">${getFileEmoji(file.mimeType || '')}</span>
            <span class="file-name">${escapeHtml(file.name)}</span>
        </div>
    `).join('');

    widgetArea.innerHTML = `
        <div class="widget-container stats activity">
            <div class="activity-header">
                <span class="plan-badge" style="background:#34A853;color:white;">Recent Activity</span>
            </div>
            <div class="activity-list">
                ${fileListHtml || '<div class="activity-item" style="cursor: default; opacity: 0.6;"><span class="file-icon">📂</span><span class="file-name">No recent items found</span></div>'}
            </div>
        </div>
    `;

    // Storage quota bar (best-effort; only when the drive fetch itself succeeded)
    const quota = dashboardData?.drive?.storageQuota;
    if (quota) renderDriveQuota(quota, widgetArea);
}

function getFileEmoji(mimeType) {
    if (mimeType.includes('document')) return '📄';
    if (mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('presentation')) return '📽️';
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('image')) return '🖼️';
    if (mimeType.includes('folder')) return '📁';
    return '📝';
}

function renderTasksWidget() {
    const items = dashboardData?.tasks?.items;
    if (items === null) return renderServiceError('tasks', "Couldn't load Tasks — refresh to retry");

    const card = document.querySelector('.service-card[data-id="tasks"]');
    if (!card) return;

    card.classList.add('widget-mode');
    const widgetArea = card.querySelector('.widget-area');
    if (!widgetArea) return;

    // Pending tasks only (main already filters, but stay defensive on shape)
    const validTasks = (items || []).filter(t => t.title).slice(0, 5);

    const taskListHtml = validTasks.map(task => {
        const isCompleted = task.status === 'completed';
        const icon = isCompleted ? '☑️' : '☐';
        const style = isCompleted ? 'text-decoration: line-through; opacity: 0.7;' : '';

        return `
            <div class="activity-item" onclick="event.stopPropagation(); window.open('https://tasks.google.com/embed/?origin=https://tasks.google.com', '_blank')">
                <span class="file-icon">${icon}</span>
                <span class="file-name" style="${style}">${escapeHtml(task.title)}</span>
            </div>
        `;
    }).join('');

    widgetArea.innerHTML = `
        <div class="widget-container stats activity">
             <div class="activity-header">
                <span class="plan-badge" style="background:#4285F4;color:white;">Your Tasks</span>
            </div>
            <div class="activity-list">
                ${taskListHtml || '<div class="activity-item" style="cursor: default; opacity: 0.6;"><span class="file-icon">🎉</span><span class="file-name">All caught up</span></div>'}
            </div>
        </div>
    `;
}


// Handler: NotebookLM (Static)
function handleNotebookLMWidget() {
    const card = document.querySelector('.service-card[data-id="notebooklm"]');
    if (!card) return;

    card.classList.add('widget-mode');
    const widgetArea = card.querySelector('.widget-area');
    if (!widgetArea) return;

    // NotebookLM consumer API is not public. Providing quick access.
    widgetArea.innerHTML = `
        <div class="widget-container stats activity">
             <div class="activity-header">
                <span class="plan-badge" style="background:#1B73E8;color:white;">Quick Actions</span>
            </div>
            <div class="activity-list">
                 <div class="activity-item" onclick="event.stopPropagation(); window.open('https://notebooklm.google.com/', '_blank')">
                    <span class="file-icon">📓</span>
                    <span class="file-name">My Notebooks</span>
                </div>
                 <div class="activity-item" onclick="event.stopPropagation(); window.open('https://notebooklm.google.com/create', '_blank')">
                    <span class="file-icon">➕</span>
                    <span class="file-name">New Notebook</span>
                </div>
            </div>
        </div>
    `;
}

// Handler: Google Keep (Static)
function handleKeepWidget() {
    const card = document.querySelector('.service-card[data-id="keep"]');
    if (!card) return;

    card.classList.add('widget-mode');
    const widgetArea = card.querySelector('.widget-area');
    if (!widgetArea) return;

    // Keep API is Enterprise only. We provide a quick link.
    widgetArea.innerHTML = `
        <div class="widget-container stats activity">
             <div class="activity-header">
                <span class="plan-badge" style="background:#FBBC05;color:black;">Quick Actions</span>
            </div>
            <div class="activity-list">
                 <div class="activity-item" onclick="event.stopPropagation(); window.open('https://keep.google.com/', '_blank')">
                    <span class="file-icon">📝</span>
                    <span class="file-name">Create a Note</span>
                </div>
                 <div class="activity-item" onclick="event.stopPropagation(); window.open('https://keep.google.com/#list', '_blank')">
                    <span class="file-icon">☑️</span>
                    <span class="file-name">Create a List</span>
                </div>
            </div>
        </div>
    `;
}

// Format an event's start as a compact, honest label. All-day events have
// start.date (no time — parse as LOCAL date to avoid the UTC-midnight shift);
// timed events have start.dateTime. Non-today events get a day label.
function formatEventWhen(event) {
    const allDay = !event.start?.dateTime;
    let d;
    if (allDay) {
        const raw = event.start?.date || '';
        const [y, m, day] = raw.split('-').map(Number);
        d = new Date(y, (m || 1) - 1, day || 1);
    } else {
        d = new Date(event.start.dateTime);
    }
    if (!d || Number.isNaN(d.getTime())) return '';

    const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diffDays = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
    const dayLabel = diffDays === 0 ? ''
        : diffDays === 1 ? 'Tomorrow'
            : diffDays > 1 && diffDays < 7 ? d.toLocaleDateString([], { weekday: 'short' })
                : d.toLocaleDateString([], { month: 'short', day: 'numeric' });

    if (allDay) return dayLabel ? `${dayLabel} · All day` : 'All day';
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return dayLabel ? `${dayLabel} ${time}` : time;
}

function renderCalendarWidget() {
    const events = dashboardData?.calendar?.events;
    if (events === null) return renderServiceError('calendar', "Couldn't load Calendar — refresh to retry");

    const card = document.querySelector('.service-card[data-id="calendar"]');
    if (!card) return;

    card.classList.add('widget-mode');
    const widgetArea = card.querySelector('.widget-area');
    if (!widgetArea) return;

    const eventListHtml = (events || []).map(event => `
        <div class="activity-item" ${getOpenItemAttributes(event.htmlLink)}>
            <span class="file-icon">📅</span>
            <span class="file-name"><strong>${escapeHtml(formatEventWhen(event))}</strong> ${escapeHtml(event.summary || '(No title)')}</span>
        </div>
    `).join('');

    widgetArea.innerHTML = `
        <div class="widget-container stats activity">
            <div class="activity-header">
                <span class="plan-badge" style="background:#4285F4;color:white;">Upcoming</span>
            </div>
            <div class="activity-list">
                ${eventListHtml || '<div class="activity-item" style="cursor: default; opacity: 0.6;"><span class="file-icon">📅</span><span class="file-name">No upcoming events</span></div>'}
            </div>
        </div>
    `;
}

function renderGmailWidget() {
    const gmail = dashboardData?.gmail;
    if (gmail === null) return renderServiceError('gmail', "Couldn't load Gmail — refresh to retry");

    const card = document.querySelector('.service-card[data-id="gmail"]');
    if (!card) return;

    card.classList.add('widget-mode');
    const widgetArea = card.querySelector('.widget-area');
    if (!widgetArea) return;

    const count = gmail?.unreadCount || 0;
    const msgListHtml = (gmail?.messages || []).map(rawMessage => {
        const msg = normalizeGmailMessage(rawMessage);
        const subject = msg.subject || '(No Subject)';
        const from = msg.from || 'Unknown';
        const sender = from.split('<')[0].trim();
        return `
            <div class="activity-item" ${getOpenItemAttributes(`https://mail.google.com/mail/u/0/#inbox/${msg.id || ''}`)}>
                <span class="file-icon">✉️</span>
                <span class="file-name"><strong>${escapeHtml(sender)}</strong>: ${escapeHtml(subject)}</span>
            </div>
        `;
    }).join('');

    widgetArea.innerHTML = `
        <div class="widget-container stats activity">
            <div class="activity-header">
                <span class="plan-badge" style="background:#EA4335;color:white;">${count} Unread</span>
            </div>
            <div class="activity-list">
                ${msgListHtml || '<div class="activity-item" style="cursor: default; opacity: 0.6;"><span class="file-icon">📭</span><span class="file-name">No unread messages</span></div>'}
            </div>
        </div>
    `;
}

function renderDriveQuota(quota, widgetArea) {
    // Use total from quota (usually 15GB for free users)
    const limit = parseInt(quota.limit);
    const usage = parseInt(quota.usage);
    if (!Number.isFinite(limit) || !Number.isFinite(usage) || limit <= 0) return;
    const percent = Math.min(100, Math.round((usage / limit) * 100));

    const usageGB = (usage / (1024 ** 3)).toFixed(1);
    const limitGB = (limit / (1024 ** 3)).toFixed(1);

    const quotaHtml = `
        <div class="quota-container">
            <div class="quota-info">
                <span>Storage</span>
                <span>${usageGB}GB / ${limitGB}GB</span>
            </div>
            <div class="quota-bar-bg">
                <div class="quota-bar-fill" style="width: ${percent}%;"></div>
            </div>
        </div>
    `;

    const widgetContainer = widgetArea.querySelector('.widget-container');
    if (widgetContainer) {
        widgetContainer.insertAdjacentHTML('beforeend', quotaHtml);
    }
}

// Init
loadOrbitGoogleConnect();
