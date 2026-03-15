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
