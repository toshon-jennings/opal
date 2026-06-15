const SERVICES = [
    // AI & Intelligence (The Thinking Space)
    { id: 'gemini', name: 'Gemini', category: 'ai', desc: 'Conversational AI for everything.', url: 'https://gemini.google.com', icon: 'assets/icons/gemini.svg', color: '#6898EE', tags: ['chat', 'assistant', 'gpt', 'llm', 'answer'], external: true, planInfo: { tier: 'Pro Plan', stats: { value: 'Gemini 3', label: 'Pro Model' }, comparison: { free: ['Gemini 3 Flash Model', 'Standard Context', 'Standard Rate Limits'], pro: ['Gemini 3 Pro Model', 'Extended Context', 'Priority Access', 'Advanced Reasoning'] } } },
    { id: 'ai-studio', name: 'AI Studio', category: 'ai', desc: 'Fastest way to build with Gemini.', url: 'https://aistudio.google.com/prompts/new_chat', icon: 'assets/icons/ai_studio.svg', color: '#4285F4', tags: ['developer', 'api', 'model', 'tuning'], external: true },
    { id: 'notebooklm', name: 'NotebookLM', category: 'ai', desc: 'AI-first notebook for researchers.', url: 'https://notebooklm.google.com', icon: 'https://www.gstatic.com/images/branding/product/2x/notebooklm_48dp.png', color: '#1B73E8', tags: ['research', 'notes', 'study', 'source'], external: true, planInfo: { tier: 'Pro Plan', stats: { value: '300', label: 'sources/nb' }, comparison: { free: ['50 sources per notebook', '20MB max file size', 'Standard Audio Overview'], pro: ['300 sources per notebook', '500MB max file size', 'Team Sharing'] } } },
    { id: 'vertex', name: 'Vertex AI Studio', category: 'ai', desc: 'Build, deploy, and scale ML models.', url: 'https://cloud.google.com/vertex-ai', icon: 'assets/icons/vertex_ai.png', color: '#4285F4', tags: ['ml', 'machine learning', 'cloud', 'enterprise'], external: true },
    { id: 'imagen', name: 'Imagen', category: 'ai', desc: 'AI-powered image generation.', url: 'https://deepmind.google/models/imagen/', icon: 'assets/icons/imagen.svg', color: '#EA4335', tags: ['image', 'generation', 'art', 'create', 'ai'], external: true },
    { id: 'veo', name: 'Veo', category: 'ai', desc: 'AI video generation model.', url: 'https://deepmind.google/technologies/veo/', icon: 'assets/icons/veo.svg', color: '#FBBC05', tags: ['video', 'generation', 'ai', 'create'], external: true },
    { id: 'learn-about', name: 'Learn About', category: 'ai', desc: 'AI-powered learning companion.', url: 'https://learning.google.com/experiments/learn-about/signup', icon: 'assets/icons/learnlm.svg', color: '#34A853', tags: ['learning', 'education', 'study', 'tutor'], external: true },
    { id: 'research', name: 'Research', category: 'ai', desc: 'Advancing the state of the art.', url: 'https://research.google/', icon: 'assets/icons/labs.svg', color: '#EA4335', tags: ['research', 'science', 'papers', 'ai', 'innovation'], external: true },
    { id: 'weather-lab', name: 'Weather Lab', category: 'ai', desc: 'Advancing weather prediction with AI.', url: 'https://deepmind.google.com/science/weatherlab', icon: 'assets/icons/labs.svg', color: '#4285F4', tags: ['weather', 'climate', 'science', 'ai', 'deepmind'], external: true },
    { id: 'robotics', name: 'Robotics', category: 'ai', desc: 'Preview Gemini Robotics model.', url: 'https://aistudio.google.com/prompts/new_chat?model=gemini-robotics-er-1.5-preview&utm_source=deepmind.google&utm_medium=referral&utm_campaign=gdm&utm_content=', icon: 'assets/icons/ai_studio.svg', color: '#4285F4', tags: ['robotics', 'gemini', 'ai', 'model', 'preview'], external: true },
    { id: 'jules', name: 'Jules', category: 'ai', desc: 'Agentic coding assistant for GitHub.', url: 'https://jules.google', icon: 'assets/icons/labs.svg', color: '#EA4335', tags: ['code', 'github', 'programming', 'developer'], external: true },

    // Knowledge & Memory (Where Ideas Persist)
    { id: 'docs', name: 'Docs', category: 'knowledge', desc: 'Create and edit documents online.', url: 'https://docs.google.com', icon: 'https://www.gstatic.com/images/branding/product/2x/docs_48dp.png', color: '#4285F4', tags: ['word', 'writer', 'paper', 'text'], external: true },
    { id: 'sheets', name: 'Sheets', category: 'knowledge', desc: 'Powerful spreadsheets for everyone.', url: 'https://sheets.google.com', icon: 'https://www.gstatic.com/images/branding/product/2x/sheets_48dp.png', color: '#34A853', tags: ['table', 'excel', 'data', 'grid'], external: true },
    { id: 'slides', name: 'Slides', category: 'knowledge', desc: 'Stunning presentations made easy.', url: 'https://slides.google.com', icon: 'https://www.gstatic.com/images/branding/product/2x/slides_48dp.png', color: '#FBBC05', tags: ['deck', 'ppt', 'presentation'], external: true },
    { id: 'drive', name: 'Drive', category: 'knowledge', desc: 'Store, share, and collaborate on files.', url: 'https://drive.google.com', icon: 'https://www.gstatic.com/images/branding/product/2x/drive_48dp.png', color: '#34A853', tags: ['storage', 'cloud', 'files', 'upload'], external: true },
    { id: 'photos', name: 'Photos', category: 'knowledge', desc: 'Home for all your photos and videos.', url: 'https://photos.google.com', icon: 'https://www.gstatic.com/images/branding/product/2x/photos_48dp.png', color: '#FBBC05', tags: ['gallery', 'images', 'pictures', 'backup'], external: true },
    { id: 'images', name: 'Images', category: 'knowledge', desc: 'Search for images on the web.', url: 'https://images.google.com', icon: 'assets/icons/search.svg', color: '#4285F4', tags: ['search', 'images', 'photos', 'visual'], external: true },

    { id: 'gmail', name: 'Gmail', category: 'productivity', desc: 'Check your latest mail.', url: 'https://mail.google.com', icon: 'https://www.gstatic.com/images/branding/product/2x/gmail_48dp.png', color: '#EA4335', external: true },
    { id: 'calendar', name: 'Calendar', category: 'productivity', desc: 'Your upcoming schedule.', url: 'https://calendar.google.com', icon: 'https://www.gstatic.com/images/branding/product/2x/calendar_48dp.png', color: '#4285F4', external: true },
    { id: 'meet', name: 'Meet', category: 'productivity', desc: 'Video meetings and calls.', url: 'https://meet.google.com', icon: 'assets/icons/meet.svg', color: '#00897B', tags: ['video', 'call', 'conference', 'meeting'], external: true },
    { id: 'keep', name: 'Keep', category: 'productivity', desc: 'Capture what\'s on your mind quickly.', url: 'https://keep.google.com', icon: 'https://www.gstatic.com/images/branding/product/2x/keep_48dp.png', color: '#FBBC05', tags: ['notes', 'lists', 'todo', 'reminders'], external: true },
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
const modalOverlay = document.getElementById('modal-overlay');
const categoryFiltersContainer = document.getElementById('category-filters');

// Category filter state
let currentCategoryFilter = 'all';

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

    if (query && filteredServices.length === 0) {
        grid.innerHTML = '<div class="no-results">No services found matching your search.</div>';
        return;
    }

    // Group by category
    const grouped = {};
    filteredServices.forEach(s => {
        if (!grouped[s.category]) grouped[s.category] = [];
        grouped[s.category].push(s);
    });

    // Render by defined order
    CATEGORIES.forEach(cat => {
        const services = grouped[cat.id];
        if (!services || services.length === 0) return;

        // Sort services alphabetically by name
        services.sort((a, b) => a.name.localeCompare(b.name));

        // Section Container
        const section = document.createElement('div');
        section.className = 'category-section';

        // Section Header
        const header = document.createElement('div');
        header.className = 'section-header';
        header.innerHTML = `
            <h2 class="section-title">${cat.label}</h2>
            <span class="section-desc">${cat.desc}</span>
        `;
        section.appendChild(header);

        // Cards Grid
        const cardsGrid = document.createElement('div');
        cardsGrid.className = 'cards-grid';

        services.forEach((s, index) => {
            const card = document.createElement('div');
            card.className = 'service-card';
            card.setAttribute('tabindex', '0'); // Make focusable
            card.dataset.url = s.url;
            card.dataset.id = s.id;
            card.style.setProperty('--accent-color', s.color);

            card.innerHTML = `
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
                if (e.key === 'Enter') {
                    e.preventDefault();
                    launchService(s);
                }
            });

            cardsGrid.appendChild(card);
        });

        section.appendChild(cardsGrid);
        grid.appendChild(section);
    });
}

// Modal Functions
window.openModal = function (serviceId) {
    const service = SERVICES.find(s => s.id === serviceId);
    if (!service || !service.planInfo) return;

    const modalContent = document.getElementById('modal-content-inject');
    const freeList = service.planInfo.comparison.free.map(item => `<li><span class="cross">✕</span> ${item}</li>`).join('');
    const proList = service.planInfo.comparison.pro.map(item => `<li><span class="check">✓</span> ${item}</li>`).join('');

    modalContent.innerHTML = `
        <div class="modal-header">
            <div class="modal-icon">
                <img src="${service.icon}" alt="${service.name}">
            </div>
            <div class="modal-title">
                <h2>Upgrade ${service.name}</h2>
                <div class="current-plan-tag">Current: ${service.planInfo.tier}</div>
            </div>
            <button class="close-modal-btn" onclick="closeModal()">✕</button>
        </div>
        
        <div class="plan-comparison">
            <div class="plan-col free">
                <h3>Free Plan</h3>
                <div class="price">$0<span>/mo</span></div>
                <ul>${freeList}</ul>
                <button class="plan-btn secondary" disabled>Included</button>
            </div>
            <div class="plan-col pro">
                <h3>${service.planInfo.tier}</h3>
                <div class="price">$19.99<span>/mo</span></div>
                <ul>${proList}</ul>
                <button class="plan-btn primary" onclick="window.open('${service.url}', '_blank')">Manage Subscription</button>
            </div>
        </div>
    `;

    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
};

window.closeModal = function () {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
};

// Close modal on outside click
if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
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

// Remove old tab listeners
// tabs.forEach(tab => ... );

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
                return; // Let default happen if already focused? No, prevent "/" char typing if handled
                break;
        }

        if (nextIndex !== currentIndex && nextIndex >= 0) {
            focusable[nextIndex].focus();
        }
    }
}

const keyManager = new KeyboardManager();

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
        return;
    }

    // Only handle nav keys if modal is not open
    if (!modalOverlay.classList.contains('active')) {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '/'].includes(e.key)) {
            keyManager.handleKey(e);
        }
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

let dashboardData = null;
let isConnected = false;

// Auth Elements
const authBtn = document.getElementById('auth-btn');
const authText = authBtn.querySelector('.auth-text');
const authError = document.createElement('div');
authError.className = 'auth-error';
authError.setAttribute('role', 'alert');
authError.hidden = true;
authBtn.insertAdjacentElement('afterend', authError);

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
 * window.electron.gdash* IPC methods and pushes back the assembled dashboard. */
const GDASH_HOST = (window.parent && window.parent !== window) ? window.parent : null;

function postToHost(type, payload) {
    if (!GDASH_HOST) return;
    GDASH_HOST.postMessage({ source: 'gdash', type, ...(payload || {}) }, '*');
}

function showAuthError(message) {
    authError.textContent = message || '';
    authError.hidden = !message;
}

function applyDashboard(data) {
    if (data && data.connected) {
        dashboardData = data;
        isConnected = true;
        handleAuthSuccess();
    } else {
        dashboardData = null;
        isConnected = false;
        handleSignOut();
    }
}

window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || msg.source !== 'gdash-host') return;
    switch (msg.type) {
        case 'dashboard:result':
            showAuthError('');
            applyDashboard(msg.data);
            break;
        case 'connecting':
            authText.textContent = 'Connecting…';
            break;
        case 'connect:error':
            isConnected = false;
            handleSignOut();
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

// Auth button toggles: connect when signed out, disconnect when signed in.
authBtn.addEventListener('click', () => {
    showAuthError('');
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
    document.body.classList.add('is-signed-in');
    authBtn.classList.add('signed-in');
    authError.hidden = true;
    authError.textContent = '';
    const givenName = dashboardData?.profile?.givenName;
    authText.textContent = givenName ? `Hi, ${givenName}` : 'Connected';
    fetchDriveStats();
    fetchCalendarStats();
    fetchGmailStats();
    fetchDriveQuota();
    fetchDocsStats();
    fetchSheetsStats();
    fetchSlidesStats();
    fetchTasksStats();
    handleKeepWidget();
    handleNotebookLMWidget();
}

function handleSignOut() {
    document.body.classList.remove('is-signed-in');
    authBtn.classList.remove('signed-in');
    authText.textContent = 'Connect';
    // Clear widgets
    document.querySelectorAll('.service-card').forEach(card => {
        card.classList.remove('widget-mode');
        const widgetArea = card.querySelector('.widget-area');
        if (widgetArea) widgetArea.innerHTML = '';
    });
    // Clear old badges if any
    const badges = document.querySelectorAll('.card-hover-overlay.stats');
    badges.forEach(b => b.remove());
}

// API: Fetch User Profile
async function fetchUserProfile() {
    const givenName = dashboardData?.profile?.givenName;
    authText.textContent = givenName ? `Hi, ${givenName}` : 'Connected';
}

// API: Fetch Drive Stats
async function fetchDriveStats() {
    const files = dashboardData?.drive?.recentFiles || [];
    renderDriveActivity(files);
}

// Helper: Generic Drive File Fetcher
async function fetchDriveFiles(mimeType, limit = 5) {
    const filesByMimeType = {
        'application/vnd.google-apps.document': dashboardData?.docs || [],
        'application/vnd.google-apps.spreadsheet': dashboardData?.sheets || [],
        'application/vnd.google-apps.presentation': dashboardData?.slides || [],
    };
    return (filesByMimeType[mimeType] || []).slice(0, limit);
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
                <div class="activity-item" style="cursor: default; opacity: 0.65;">
                    <span class="file-icon">!</span>
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

// API: Fetch Docs Stats
async function fetchDocsStats() {
    try {
        const files = await fetchDriveFiles('application/vnd.google-apps.document');
        renderServiceActivity('docs', files, '#4285F4', 'Recent Docs');
    } catch (e) { renderServiceError('docs', 'Error loading docs'); }
}

// API: Fetch Sheets Stats
async function fetchSheetsStats() {
    try {
        const files = await fetchDriveFiles('application/vnd.google-apps.spreadsheet');
        renderServiceActivity('sheets', files, '#34A853', 'Recent Sheets');
    } catch (e) { renderServiceError('sheets', 'Error loading sheets'); }
}

// API: Fetch Slides Stats
async function fetchSlidesStats() {
    try {
        const files = await fetchDriveFiles('application/vnd.google-apps.presentation');
        renderServiceActivity('slides', files, '#FBBC05', 'Recent Slides');
    } catch (e) { renderServiceError('slides', 'Error loading slides'); }
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

function renderDriveActivity(files) {
    const driveCard = document.querySelector('.service-card[data-id="drive"]');
    if (!driveCard) return;

    // Clear old state
    driveCard.classList.add('widget-mode');
    const widgetArea = driveCard.querySelector('.widget-area');
    if (!widgetArea) return;

    const fileListHtml = files.map(file => `
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
                ${fileListHtml}
            </div>
        </div>
    `;
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

function updateDriveCard(value, label) {
    const driveCard = document.querySelector('.service-card[data-id="drive"]');
    if (!driveCard) return;

    const existingOverlay = driveCard.querySelector('.card-hover-overlay');
    if (existingOverlay) existingOverlay.remove();

    const statsHtml = `
        <div class="card-hover-overlay stats">
            <div class="plan-badge" style="background:#EA4335;color:white;">${label}</div>
            <div class="plan-stat">
                <span class="stat-value" style="font-size: 1.2rem;">${value}</span>
            </div>
        </div>
    `;
    driveCard.insertAdjacentHTML('beforeend', statsHtml);
}



// API: Fetch Google Tasks
async function fetchTasksStats() {
    renderTasksActivity(dashboardData?.tasks?.items || []);
}

function renderTasksActivity(tasks) {
    const card = document.querySelector('.service-card[data-id="tasks"]');
    if (!card) return;

    card.classList.add('widget-mode');
    const widgetArea = card.querySelector('.widget-area');
    if (!widgetArea) return;

    // Filter for relevant tasks: not empty title
    const validTasks = tasks.filter(t => t.title).slice(0, 5);

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
                ${taskListHtml || '<div class="activity-item">No recent tasks</div>'}
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

// API: Fetch Calendar Stats
async function fetchCalendarStats() {
    renderCalendarActivity(dashboardData?.calendar?.events || []);
}

function renderCalendarActivity(events) {
    const card = document.querySelector('.service-card[data-id="calendar"]');
    if (!card) return;

    card.classList.add('widget-mode');
    const widgetArea = card.querySelector('.widget-area');
    if (!widgetArea) return;

    const eventListHtml = events.map(event => {
        const start = event.start?.dateTime || event.start?.date;
        const time = new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `
            <div class="activity-item" ${getOpenItemAttributes(event.htmlLink)}>
                <span class="file-icon">📅</span>
                <span class="file-name"><strong>${escapeHtml(time)}</strong> ${escapeHtml(event.summary || '(No title)')}</span>
            </div>
        `;
    }).join('');

    widgetArea.innerHTML = `
        <div class="widget-container stats activity">
            <div class="activity-header">
                <span class="plan-badge" style="background:#4285F4;color:white;">Upcoming</span>
            </div>
            <div class="activity-list">
                ${eventListHtml || '<div class="activity-item">No upcoming events</div>'}
            </div>
        </div>
    `;
}

// API: Fetch Gmail Stats
async function fetchGmailStats() {
    renderGmailActivity(dashboardData?.gmail?.unreadCount || 0, dashboardData?.gmail?.messages || []);
}

function renderGmailActivity(count, messages) {
    const card = document.querySelector('.service-card[data-id="gmail"]');
    if (!card) return;

    card.classList.add('widget-mode');
    const widgetArea = card.querySelector('.widget-area');
    if (!widgetArea) return;

    const msgListHtml = messages.map(rawMessage => {
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
                ${msgListHtml || '<div class="activity-item">No unread messages</div>'}
            </div>
        </div>
    `;
}

// API: Fetch Drive Quota
async function fetchDriveQuota() {
    if (dashboardData?.drive?.storageQuota) {
        renderDriveQuota(dashboardData.drive.storageQuota);
    }
}

function renderDriveQuota(quota) {
    const driveCard = document.querySelector('.service-card[data-id="drive"]');
    if (!driveCard) return;

    // Use total from quota (usually 15GB for free users)
    const limit = parseInt(quota.limit);
    const usage = parseInt(quota.usage);
    if (!Number.isFinite(limit) || !Number.isFinite(usage) || limit <= 0) return;
    const percent = Math.min(100, Math.round((usage / limit) * 100));

    const usageGB = (usage / (1024 ** 3)).toFixed(1);
    const limitGB = (limit / (1024 ** 3)).toFixed(1);

    // We keep the activity list but add the quota bar at the bottom
    const widgetArea = driveCard.querySelector('.widget-area');
    if (!widgetArea) return;

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
