// Deckdrop Admin Dashboard — Alpine.js app logic

const API_BASE = '/api/admin';

function getSecret() {
  return localStorage.getItem('adminSecret') || '';
}

function authHeaders() {
  return { 'x-admin-secret': getSecret(), 'Content-Type': 'application/json' };
}

async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

// ─── Overview ───────────────────────────────────────────────────────────────
function overviewApp() {
  return {
    stats: null,
    recentJobs: [],
    error: null,
    loading: true,

    async init() {
      try {
        const data = await apiFetch('/stats');
        this.stats = data.stats;
        this.recentJobs = data.recent_jobs || [];
      } catch (e) {
        this.error = e.message;
      } finally {
        this.loading = false;
      }
    },

    formatCost(val) {
      return val != null ? '$' + Number(val).toFixed(4) : '—';
    },

    statusClass(status) {
      return {
        completed: 'badge-success',
        processing: 'badge-warning',
        failed: 'badge-error',
        queued: 'badge-info',
      }[status] || 'badge-ghost';
    },
  };
}

// ─── Jobs ────────────────────────────────────────────────────────────────────
function jobsApp() {
  return {
    jobs: [],
    selected: null,
    loading: true,
    loadingDetail: false,
    error: null,
    page: 1,
    limit: 20,
    statusFilter: '',

    async init() {
      await this.loadJobs();
    },

    async loadJobs() {
      this.loading = true;
      this.error = null;
      try {
        const qs = new URLSearchParams({ page: this.page, limit: this.limit });
        if (this.statusFilter) qs.set('status', this.statusFilter);
        const data = await apiFetch('/jobs?' + qs);
        this.jobs = data.jobs || [];
      } catch (e) {
        this.error = e.message;
      } finally {
        this.loading = false;
      }
    },

    async selectJob(id) {
      this.loadingDetail = true;
      this.selected = null;
      try {
        const data = await apiFetch('/jobs/' + id);
        this.selected = data.job;
      } catch (e) {
        this.error = e.message;
      } finally {
        this.loadingDetail = false;
      }
    },

    async prevPage() {
      if (this.page > 1) { this.page--; await this.loadJobs(); }
    },

    async nextPage() {
      this.page++;
      await this.loadJobs();
    },

    formatCost(val) {
      return val != null ? '$' + Number(val).toFixed(4) : '—';
    },

    formatDate(ts) {
      if (!ts) return '—';
      return new Date(ts).toLocaleString();
    },

    statusClass(status) {
      return {
        completed: 'text-green-400',
        processing: 'text-yellow-400',
        failed: 'text-red-400',
        queued: 'text-blue-400',
      }[status] || 'text-gray-400';
    },
  };
}

// ─── Users ───────────────────────────────────────────────────────────────────
function usersApp() {
  return {
    users: [],
    loading: true,
    error: null,
    success: null,
    newUser: { email: '', credits: 1 },
    creditEdits: {},

    async init() {
      await this.loadUsers();
    },

    async loadUsers() {
      this.loading = true;
      this.error = null;
      try {
        const data = await apiFetch('/users');
        this.users = data.users || [];
      } catch (e) {
        this.error = e.message;
      } finally {
        this.loading = false;
      }
    },

    async createUser() {
      this.error = null;
      this.success = null;
      try {
        await apiFetch('/users', {
          method: 'POST',
          body: JSON.stringify(this.newUser),
        });
        this.success = `User ${this.newUser.email} created.`;
        this.newUser = { email: '', credits: 1 };
        await this.loadUsers();
      } catch (e) {
        this.error = e.message;
      }
    },

    async setCredits(email, credits) {
      this.error = null;
      this.success = null;
      const val = parseInt(credits, 10);
      if (isNaN(val) || val < 0) { this.error = 'Invalid credit value'; return; }
      try {
        await apiFetch('/users/' + encodeURIComponent(email) + '/credits', {
          method: 'PATCH',
          body: JSON.stringify({ credits: val }),
        });
        this.success = `Credits updated for ${email}.`;
        await this.loadUsers();
      } catch (e) {
        this.error = e.message;
      }
    },

    formatDate(ts) {
      if (!ts) return '—';
      return new Date(ts).toLocaleDateString();
    },
  };
}

// ─── Models ──────────────────────────────────────────────────────────────────
function modelsApp() {
  return {
    models: [],
    loading: true,
    error: null,
    success: null,

    async init() {
      await this.loadModels();
    },

    async loadModels() {
      this.loading = true;
      this.error = null;
      try {
        const data = await apiFetch('/models');
        this.models = data.models || [];
      } catch (e) {
        this.error = e.message;
      } finally {
        this.loading = false;
      }
    },

    async toggleModel(id, currentEnabled) {
      this.error = null;
      this.success = null;
      try {
        await apiFetch('/models/' + id, {
          method: 'PATCH',
          body: JSON.stringify({ enabled: !currentEnabled }),
        });
        this.success = 'Model updated.';
        await this.loadModels();
      } catch (e) {
        this.error = e.message;
      }
    },

    formatCost(val) {
      return val != null ? '$' + Number(val).toFixed(6) + '/1k tokens' : '—';
    },
  };
}

// ─── Config ──────────────────────────────────────────────────────────────────
function configApp() {
  return {
    config: {},
    original: {},
    loading: true,
    saving: false,
    error: null,
    success: null,

    async init() {
      await this.loadConfig();
    },

    async loadConfig() {
      this.loading = true;
      this.error = null;
      try {
        const data = await apiFetch('/config');
        this.config = data.config || {};
        this.original = JSON.parse(JSON.stringify(this.config));
      } catch (e) {
        this.error = e.message;
      } finally {
        this.loading = false;
      }
    },

    async saveConfig() {
      this.saving = true;
      this.error = null;
      this.success = null;
      try {
        // Save each changed key
        for (const [key, val] of Object.entries(this.config)) {
          if (JSON.stringify(val) !== JSON.stringify(this.original[key])) {
            await apiFetch('/config', {
              method: 'PATCH',
              body: JSON.stringify({ key, value: val }),
            });
          }
        }
        this.success = 'Config saved.';
        this.original = JSON.parse(JSON.stringify(this.config));
      } catch (e) {
        this.error = e.message;
      } finally {
        this.saving = false;
      }
    },

    configEntries() {
      return Object.entries(this.config);
    },
  };
}

// ─── Prompts ─────────────────────────────────────────────────────────────────
function promptsApp() {
  return {
    prompts: [],
    loading: true,
    saving: {},
    error: null,
    success: null,

    async init() {
      await this.loadPrompts();
    },

    async loadPrompts() {
      this.loading = true;
      this.error = null;
      try {
        const data = await apiFetch('/prompts');
        this.prompts = data.prompts || [];
      } catch (e) {
        this.error = e.message;
      } finally {
        this.loading = false;
      }
    },

    async savePrompt(prompt) {
      this.error = null;
      this.success = null;
      this.saving[prompt.key] = true;
      try {
        await apiFetch('/prompts/' + encodeURIComponent(prompt.key), {
          method: 'PATCH',
          body: JSON.stringify({ template: prompt.template }),
        });
        this.success = `Prompt "${prompt.key}" saved.`;
      } catch (e) {
        this.error = e.message;
      } finally {
        this.saving[prompt.key] = false;
      }
    },
  };
}

// ─── Test ────────────────────────────────────────────────────────────────────
function testApp() {
  return {
    url: '',
    email: 'dagnytaggart1997@gmail.com',
    running: false,
    result: null,
    error: null,

    async runTest() {
      if (!this.url.trim()) { this.error = 'Company URL is required'; return; }
      this.running = true;
      this.result = null;
      this.error = null;
      try {
        const data = await apiFetch('/test', {
          method: 'POST',
          body: JSON.stringify({ url: this.url.trim(), email: this.email }),
        });
        this.result = data;
      } catch (e) {
        this.error = e.message;
      } finally {
        this.running = false;
      }
    },
  };
}

// ─── Auth gate ───────────────────────────────────────────────────────────────
function authApp() {
  return {
    secret: localStorage.getItem('adminSecret') || '',
    page: 'overview',

    save() {
      localStorage.setItem('adminSecret', this.secret);
      window.location.reload();
    },

    isAuthed() {
      return !!localStorage.getItem('adminSecret');
    },

    nav(p) {
      this.page = p;
    },
  };
}

// ─── Root app ─────────────────────────────────────────────────────────────────
function app() {
  return {
    // Auth
    authed: !!localStorage.getItem('adminSecret'),
    secretInput: '',
    authError: false,

    // Nav
    page: 'overview',
    menuOpen: false,
    nav: [
      { id: 'overview', label: 'Overview' },
      { id: 'jobs', label: 'Jobs' },
      { id: 'users', label: 'Users' },
      { id: 'config', label: 'Config' },
      { id: 'test', label: 'Test' },
    ],

    // Model dropdown options (OpenRouter IDs)
    modelOptions: {
      gemini: [
        { id: 'google/gemini-2.5-pro',            label: 'Gemini 2.5 Pro' },
        { id: 'google/gemini-2.5-flash',           label: 'Gemini 2.5 Flash' },
        { id: 'google/gemini-2.5-flash-lite',      label: 'Gemini 2.5 Flash-Lite' },
        { id: 'google/gemini-2.0-flash-001',       label: 'Gemini 2.0 Flash' },
        { id: 'google/gemini-2.0-flash-lite-001',  label: 'Gemini 2.0 Flash-Lite' },
      ],
      openai: [
        { id: 'openai/gpt-4.1',       label: 'GPT-4.1' },
        { id: 'openai/gpt-4.1-mini',  label: 'GPT-4.1 Mini' },
        { id: 'openai/gpt-4.1-nano',  label: 'GPT-4.1 Nano' },
        { id: 'openai/gpt-4o',        label: 'GPT-4o' },
        { id: 'openai/gpt-4o-mini',   label: 'GPT-4o Mini' },
        { id: 'openai/o3',            label: 'o3 (reasoning)' },
        { id: 'openai/o4-mini',       label: 'o4-mini (reasoning)' },
      ],
      grok: [
        { id: 'x-ai/grok-4',           label: 'Grok 4' },
        { id: 'x-ai/grok-3-beta',       label: 'Grok 3 Beta' },
        { id: 'x-ai/grok-3-mini-beta',  label: 'Grok 3 Mini Beta' },
      ],
    },

    // Overview
    stats: {},
    recentJobs: [],

    // Jobs
    jobs: [],
    selectedJobId: null,
    selectedJob: null,
    selectedApiCalls: [],

    // Users
    showAddUser: false,
    newUserEmail: '',
    newUserCredits: 1,
    users: [],

    // Models
    models: [],

    // Config
    configItems: [],

    // Prompts
    prompts: [],

    // Test
    testUrl: '',
    testEmail: 'dagnytaggart1997@gmail.com',
    testRunning: false,
    testResult: null,

    async init() {
      if (this.authed) await this.loadPage(this.page);
    },

    async login() {
      localStorage.setItem('adminSecret', this.secretInput);
      try {
        await apiFetch('/stats');
        this.authed = true;
        this.authError = false;
        await this.loadPage(this.page);
      } catch {
        this.authed = false;
        this.authError = true;
        localStorage.removeItem('adminSecret');
      }
    },

    async setPage(p) {
      this.page = p;
      this.selectedJobId = null;
      await this.loadPage(p);
    },

    async loadPage(p) {
      if (p === 'overview') await this.loadOverview();
      else if (p === 'jobs') await this.loadJobs();
      else if (p === 'users') await this.loadUsers();
      else if (p === 'models') await this.loadModels();
      else if (p === 'config') await this.loadConfig();
      else if (p === 'prompts') await this.loadPrompts();
    },

    async loadOverview() {
      try {
        const data = await apiFetch('/stats');
        // API returns flat: { totalJobs, costToday, totalUsers }
        this.stats = {
          totalJobs: data.totalJobs ?? data.stats?.totalJobs ?? '—',
          costToday: data.costToday ?? data.stats?.costToday ?? '—',
          totalUsers: data.totalUsers ?? data.stats?.totalUsers ?? '—',
        };
        const jobs = await apiFetch('/jobs?limit=10');
        this.recentJobs = Array.isArray(jobs) ? jobs : (jobs.jobs ?? []);
      } catch {}
    },

    async loadJobs() {
      try {
        const data = await apiFetch('/jobs?limit=50');
        this.jobs = Array.isArray(data) ? data : (data.jobs ?? []);
      } catch {}
    },

    async openJob(id) {
      this.selectedJobId = id;
      this.selectedJob = null;
      this.selectedApiCalls = [];
      try {
        const data = await apiFetch('/jobs/' + id);
        this.selectedJob = data.job;
        this.selectedApiCalls = data.apiCalls ?? data.api_calls ?? [];
      } catch {}
    },

    async loadUsers() {
      try {
        const data = await apiFetch('/users');
        this.users = Array.isArray(data) ? data : (data.users ?? []);
      } catch {}
    },

    async addUser() {
      try {
        await apiFetch('/users', {
          method: 'POST',
          body: JSON.stringify({ email: this.newUserEmail, credits: parseInt(this.newUserCredits) }),
        });
        this.newUserEmail = '';
        this.newUserCredits = 1;
        this.showAddUser = false;
        await this.loadUsers();
      } catch {}
    },

    async updateCredits(email, credits) {
      try {
        await apiFetch('/users/' + encodeURIComponent(email) + '/credits', {
          method: 'PATCH',
          body: JSON.stringify({ credits: parseInt(credits) }),
        });
        await this.loadUsers();
      } catch {}
    },

    async loadModels() {
      try {
        const data = await apiFetch('/models');
        this.models = Array.isArray(data) ? data : (data.models ?? []);
      } catch {}
    },

    async toggleModel(m) {
      try {
        await apiFetch('/models/' + m.id, {
          method: 'PATCH',
          body: JSON.stringify({ enabled: !m.enabled }),
        });
        await this.loadModels();
      } catch {}
    },

    async loadConfig() {
      try {
        const data = await apiFetch('/config');
        // API returns array of { key, value, description }
        const arr = Array.isArray(data) ? data : (data.config ?? []);
        this.configItems = arr.map(r => ({
          key: r.key,
          value: r.value,
          description: r.description ?? '',
        }));
      } catch {}
    },

    async updateConfig(key, value) {
      try {
        await apiFetch('/config/' + encodeURIComponent(key), {
          method: 'PATCH',
          body: JSON.stringify({ value }),
        });
      } catch {}
    },

    async loadPrompts() {
      try {
        const data = await apiFetch('/prompts');
        this.prompts = Array.isArray(data) ? data : (data.prompts ?? []);
      } catch {}
    },

    async updatePrompt(key, content) {
      try {
        await apiFetch('/prompts/' + encodeURIComponent(key), {
          method: 'PATCH',
          body: JSON.stringify({ template: content }),
        });
      } catch {}
    },

    async runTest() {
      if (!this.testUrl.trim()) return;
      this.testRunning = true;
      this.testResult = null;
      try {
        const data = await apiFetch('/test', {
          method: 'POST',
          body: JSON.stringify({ url: this.testUrl.trim(), email: this.testEmail }),
        });
        this.testResult = data;
      } catch (e) {
        this.testResult = { error: e.message };
      } finally {
        this.testRunning = false;
      }
    },

    formatDate(ts) {
      if (!ts) return '—';
      return new Date(ts).toLocaleString();
    },

    statusClass(status) {
      return {
        completed: 'text-green-400',
        processing: 'text-yellow-400',
        failed: 'text-red-400',
        queued: 'text-blue-400',
      }[status] || 'text-gray-400';
    },
  };
}
