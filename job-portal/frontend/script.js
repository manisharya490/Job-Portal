// POINT FRONTEND TO FASTAPI BACKEND
const API_BASE = 'http://localhost:8000/api';

// UTILITY FUNCTIONS
function showSkeleton(skeletonId, show = true) {
  const skeleton = document.getElementById(skeletonId);
  const content = skeleton.nextElementSibling;
  if (skeleton && content) {
    skeleton.classList.toggle('hidden', !show);
    content.classList.toggle('hidden', show);
  }
}

function showMessage(elementId, message, type = 'error') {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.className = `message ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}

function setButtonLoading(button, isLoading) {
  if (!button) return;
  if (isLoading) {
    if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
    button.dataset.loadingText = button.textContent.includes('Publish') ? 'Publishing Job...' : 'Processing...';
    button.disabled = true;
    button.innerHTML = ` ${button.dataset.loadingText} ⏳`;
  } else {
    button.disabled = false;
    if (button.dataset.originalText) button.innerHTML = button.dataset.originalText;
  }
}

// AUTH HELPERS
function saveAuth(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function getToken() {
  return localStorage.getItem('token');
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user')) || null;
  } catch {
    return null;
  }
}

function authHeaders() {
  const token = getToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// THEME
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const toggle = document.getElementById('themeToggle');
  if (toggle) toggle.textContent = savedTheme === 'light' ? '🌙' : '☀️';
}

document.addEventListener('click', e => {
  if (e.target.id === 'themeToggle') {
    const current = document.documentElement.getAttribute('data-theme');
    const nextTheme = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('theme', nextTheme);
    e.target.textContent = nextTheme === 'light' ? '🌙' : '☀️';
  }
});

// JOBS (Enhanced with skeleton support)
async function loadJobsInto(containerId, skeletonId = null) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Show skeleton if provided
  if (skeletonId) showSkeleton(skeletonId, true);

  try {
    const res = await fetch(`${API_BASE}/jobs`);
    const data = await res.json();
    if (!res.ok) throw new Error('Failed to load jobs');

    renderJobs(container, data);
  } catch {
    container.innerHTML = `<p class="muted">Network error while loading jobs.</p>`;
  } finally {
    // Hide skeleton
    if (skeletonId) showSkeleton(skeletonId, false);
  }
}

function renderJobs(container, jobs) {
  container.innerHTML = '';
  if (!jobs || jobs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon-large" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
        <div class="empty-title">No jobs found</div>
        <p class="empty-description">We couldn't find any open positions right now. Please check back later.</p>
      </div>
    `;
    return;
  }

  jobs.forEach(job => {
    const card = document.createElement('article');
    card.className = 'job-card full-details';

    const typeLabel = job.type ? job.type.replace('-', ' ').toUpperCase() : 'FULL-TIME';
    const safeDescription = (job.description || '').replace(/\n/g, '</p><p>');

    card.innerHTML = `
      <div class="job-header">
        <div class="job-primary-info">
          <h3 class="job-title">${job.title}</h3>
          <div class="job-meta">
            <span class="job-type-badge">${typeLabel}</span>
            <span class="job-company">${job.company || 'Confidential'}</span>
            <span class="job-separator">•</span>
            <span class="job-location">${job.location || 'Remote'}</span>
          </div>
        </div>
      </div>
      <div class="job-description-full">
        <p>${safeDescription}</p>
      </div>
      <div class="job-actions">
        <button class="btn btn-primary btn-large" data-job-id="${job.id}">
          Apply Now
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  // Wire up apply buttons
  container.querySelectorAll('button[data-job-id]').forEach(btn => {
    btn.addEventListener('click', () => applyForJob(btn.dataset.jobId));
  });
}

async function applyForJob(jobId) {
  const user = getUser();
  if (!user || user.role !== 'candidate') {
    alert('Please login as candidate to apply.');
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/jobs/${jobId}/apply`, {
      method: 'POST',
      headers: authHeaders(),
    });
    const data = await res.json();
    if (res.ok) {
      alert(data.message || 'Application submitted successfully!');
    } else {
      alert(data.detail || 'Unable to apply.');
    }
  } catch {
    alert('Network error.');
  }
}

// NEW: APPLICATION STATUS TIMELINE
function renderCandidateApplicationsTimeline(containerId, apps) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  if (!apps || apps.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon-large" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
        <div class="empty-title">No applications yet</div>
        <p class="empty-description">Browse jobs above and start applying to see your application status here.</p>
      </div>
    `;
    return;
  }

  apps.forEach(app => {
    const card = document.createElement('div');
    card.className = 'status-timeline-card';

    const getStatusClass = () => {
      switch (app.status) {
        case 'selected': return 'completed';
        case 'rejected': return 'completed';
        default: return 'current';
      }
    };

    card.innerHTML = `
      <div class="status-timeline-header">
        <div class="status-timeline-job">${app.job_title}</div>
        <div class="status-timeline-meta">
          <span class="status-badge ${app.status}">${app.status}</span>
          <span>${new Date(app.applied_at).toLocaleDateString()}</span>
        </div>
      </div>
      <div class="status-timeline">
        <div class="timeline-step completed">
          <div class="timeline-circle">✓</div>
          <div class="timeline-label">Applied</div>
        </div>
        <div class="timeline-line"></div>
        <div class="timeline-step ${getStatusClass()}">
          <div class="timeline-circle">${app.status === 'selected' ? '✅' : app.status === 'rejected' ? '❌' : '⏳'}</div>
          <div class="timeline-label">${app.status === 'pending' ? 'Review' : app.status.charAt(0).toUpperCase() + app.status.slice(1)}</div>
        </div>
        <div class="timeline-line"></div>
        <div class="timeline-step ${app.status === 'pending' ? 'pending' : 'pending'}">
          <div class="timeline-circle">?</div>
          <div class="timeline-label">Interview</div>
        </div>
      </div>
      ${app.message ? `<p style="margin-top: 12px; font-size: 14px; color: rgb(var(--color-text-2));">${app.message}</p>` : ''}
    `;
    container.appendChild(card);
  });
}

// ADMIN DASHBOARD
async function initAdminDashboard() {
  const section = document.getElementById('adminSection');
  if (section) section.classList.remove('hidden');

  try {
    const [summaryRes, usersRes, appsRes] = await Promise.all([
      fetch(`${API_BASE}/admin/summary`, { headers: authHeaders() }),
      fetch(`${API_BASE}/admin/users`, { headers: authHeaders() }),
      fetch(`${API_BASE}/admin/applications`, { headers: authHeaders() }),
    ]);

    if (summaryRes.ok) {
      const summary = await summaryRes.json();
      document.getElementById('adminRecruiters').textContent = summary.recruiters;
      document.getElementById('adminCandidates').textContent = summary.candidates;
      document.getElementById('adminJobs').textContent = summary.jobs;
      document.getElementById('adminApps').textContent = summary.applications;
    }

    if (usersRes.ok) {
      const { recruiters, candidates } = await usersRes.json();
      renderUserTable('adminRecruiterList', recruiters);
      renderUserTable('adminCandidateList', candidates);
    }

    if (appsRes.ok) {
      const apps = await appsRes.json();
      renderAdminApplications('adminAppsList', apps);
    }
  } catch (error) {
    console.error('Admin dashboard error:', error);
  }
}

function renderUserTable(containerId, users) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  if (!users || users.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; background: var(--bg-surface); border-radius: var(--radius-lg); border: 1px solid rgba(0,0,0,0.05);">
        <svg class="empty-icon-large" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
        <div class="empty-title">No users found</div>
        <p class="empty-description">There are no registered users in this category yet.</p>
      </div>
    `;
    return;
  }
  users.forEach(u => {
    const card = document.createElement('div');
    card.className = 'data-card';
    card.innerHTML = `
      <div class="data-card-header">
        <div class="data-card-title">${u.name}</div>
        <div class="status-badge current">Active</div>
      </div>
      <div class="data-card-body">
        <div class="flex items-center gap-2">📧 ${u.email}</div>
        <div class="flex items-center gap-2">📅 Joined ${new Date(u.created_at).toLocaleDateString()}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderAdminApplications(containerId, apps) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  if (!apps || apps.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; background: var(--bg-surface); border-radius: var(--radius-lg); border: 1px solid rgba(0,0,0,0.05);">
        <svg class="empty-icon-large" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
        <div class="empty-title">No applications yet</div>
        <p class="empty-description">Applications submitted by candidates will appear here.</p>
      </div>
    `;
    return;
  }
  apps.forEach(app => {
    const card = document.createElement('div');
    card.className = 'data-card';
    card.innerHTML = `
      <div class="data-card-header">
        <div class="data-card-title">${app.job_title}</div>
        <span class="status-badge ${app.status}">${app.status}</span>
      </div>
      <div class="data-card-subtitle">${app.company}</div>
      <div class="data-card-body" style="margin-top: 1rem;">
        <div>👤 <strong>Candidate:</strong> ${app.candidate_name}</div>
        <div>🏢 <strong>Recruiter:</strong> ${app.recruiter_name}</div>
        <div>📅 <strong>Applied:</strong> ${new Date(app.applied_at).toLocaleDateString()}</div>
        ${app.message ? `<div style="margin-top:0.5rem; padding:0.5rem; background:var(--color-slate-50); border-radius:4px;">💬 ${app.message}</div>` : ''}
      </div>
    `;
    container.appendChild(card);
  });
}

// RECRUITER DASHBOARD
async function initRecruiterDashboard() {
  const section = document.getElementById('recruiterSection');
  if (section) section.classList.remove('hidden');

  // Job form
  const jobForm = document.getElementById('jobForm');
  if (jobForm) {
    jobForm.addEventListener('submit', async e => {
      e.preventDefault();
      const submitBtn = jobForm.querySelector('button[type="submit"]');
      setButtonLoading(submitBtn, true);

      const payload = {
        title: jobForm.title.value,
        company: jobForm.company.value,
        location: jobForm.location.value,
        type: jobForm.type.value,
        description: jobForm.description.value,
      };

      try {
        const res = await fetch(`${API_BASE}/jobs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok) {
          showMessage('jobMsg', 'Job published successfully!', 'success');
          jobForm.reset();
        } else {
          showMessage('jobMsg', data.detail || 'Failed to publish job.', 'error');
        }
      } catch {
        showMessage('jobMsg', 'Network error.', 'error');
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }

  // Load applications with skeleton
  showSkeleton('recruiterAppsSkeleton', true);
  try {
    const res = await fetch(`${API_BASE}/recruiter/applications`, { headers: authHeaders() });
    if (res.ok) {
      const apps = await res.json();
      renderApplications('recruiterAppsList', apps);
    }
  } catch (error) {
    console.error('Recruiter applications error:', error);
  } finally {
    showSkeleton('recruiterAppsSkeleton', false);
  }
}

async function updateApplicationStatus(appId, status, message, buttonEl) {
  if (buttonEl) setButtonLoading(buttonEl, true);
  try {
    const res = await fetch(`${API_BASE}/applications/${appId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ status, message }),
    });
    const data = await res.json();
    if (res.ok) {
      alert('Application updated successfully.');
    } else {
      alert(data.detail || 'Failed to update application.');
    }
  } catch {
    alert('Network error.');
  } finally {
    if (buttonEl) setButtonLoading(buttonEl, false);
  }
}

// FIXED: renderApplications with resume viewing + single event listener
// FIXED: renderApplications with resume viewing + single event listener
function renderApplications(containerId, apps) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  if (!apps || apps.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; background: var(--bg-surface); border-radius: var(--radius-lg); border: 1px solid rgba(0,0,0,0.05);">
        <svg class="empty-icon-large" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path></svg>
        <div class="empty-title">No applications yet</div>
        <p class="empty-description">Candidates haven't applied to your jobs yet. Share your job postings to attract talent.</p>
      </div>
    `;
    return;
  }

  apps.forEach(app => {
    const card = document.createElement('div');
    card.className = 'data-card';

    // Status options
    const statusOptions = `
      <option value="pending" ${app.status === 'pending' ? 'selected' : ''}>Pending</option>
      <option value="selected" ${app.status === 'selected' ? 'selected' : ''}>Selected</option>
      <option value="rejected" ${app.status === 'rejected' ? 'selected' : ''}>Rejected</option>
    `;

    // Resume link
    const resumeLink = app.resume ?
      `<a href="${API_BASE}/resumes/${app.resume.split('/').pop()}" target="_blank" class="text-sm font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1">📄 Resume</a>` :
      '<span class="text-sm text-muted">No resume</span>';

    card.innerHTML = `
      <div class="data-card-header">
        <div class="data-card-title">${app.job_title}</div>
        <span class="status-badge ${app.status}">${app.status}</span>
      </div>
      <div class="data-card-subtitle">Candidate: ${app.candidate_name}</div>
      <div class="data-card-body" style="margin: 1rem 0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
           ${resumeLink}
        </div>
        <select class="form-select app-status" data-app-id="${app.id}" style="margin-bottom:0.5rem; padding:0.5rem;">
          ${statusOptions}
        </select>
        <input type="text" class="form-input app-message" placeholder="Message to candidate..."
               value="${app.message || ''}" data-app-id="${app.id}" style="padding:0.5rem;" />
      </div>
      <div class="data-card-footer">
        <button class="btn btn-primary app-save" data-app-id="${app.id}" style="width:100%">Update Status</button>
      </div>
    `;
    container.appendChild(card);
  });

  // Wire up save buttons
  container.querySelectorAll('.app-save').forEach(btn => {
    btn.addEventListener('click', () => {
      const appId = btn.dataset.appId;
      const statusSelect = container.querySelector(`.app-status[data-app-id="${appId}"]`);
      const messageInput = container.querySelector(`.app-message[data-app-id="${appId}"]`);
      const status = statusSelect ? statusSelect.value : 'pending';
      const message = messageInput ? messageInput.value : '';
      updateApplicationStatus(appId, status, message, btn);
    });
  });
}

// CANDIDATE DASHBOARD
async function initCandidateDashboard() {
  const section = document.getElementById('candidateSection');
  if (section) section.classList.remove('hidden');

  const user = getUser();
  if (user) {
    document.getElementById('candidateName').textContent = user.name;
  }

  // Load jobs with skeleton
  await loadJobsInto('candidateJobs', 'jobsSkeleton');

  // Load applications timeline with skeleton
  showSkeleton('appsTimelineSkeleton', true);
  try {
    const res = await fetch(`${API_BASE}/candidate/applications`, { headers: authHeaders() });
    if (res.ok) {
      const apps = await res.json();
      renderCandidateApplicationsTimeline('candidateAppsTimeline', apps);
    }
  } catch (e) {
    console.error('Candidate applications error:', e);
  } finally {
    showSkeleton('appsTimelineSkeleton', false);
  }
}

// FORMS (Login/Register)
function initForms() {
  // LOGIN
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      setButtonLoading(submitBtn, true);

      const formData = new FormData(loginForm);
      try {
        const res = await fetch(`${API_BASE}/auth/login`, { method: 'POST', body: formData });
        let data;
        try {
          data = await res.json();
        } catch (err) {
          data = { detail: 'Server error (invalid JSON response)' };
        }

        if (!res.ok) {
          showMessage('loginMsg', data.detail || 'Login failed');
        } else {
          saveAuth(data.token, data.user);
          window.location.href = 'dashboard.html';
        }
      } catch (err) {
        console.error(err);
        showMessage('loginMsg', 'Network error or server unreachable.');
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }

  // REGISTER
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    const roleSelect = document.getElementById('regRole');
    const resumeField = document.getElementById('resumeField');
    const submitBtn = registerForm.querySelector('button[type="submit"]');

    function toggleResumeField() {
      if (roleSelect?.value === 'candidate') {
        resumeField?.classList.remove('hidden');
      } else {
        resumeField?.classList.add('hidden');
        const fileInput = resumeField?.querySelector('input[type="file"]');
        if (fileInput) fileInput.value = '';
      }
      submitBtn.disabled = !roleSelect?.value;
    }

    roleSelect?.addEventListener('change', toggleResumeField);
    toggleResumeField();

    registerForm.addEventListener('submit', async e => {
      e.preventDefault();
      setButtonLoading(submitBtn, true);
      const formData = new FormData(registerForm);
      try {
        const res = await fetch(`${API_BASE}/auth/register`, { method: 'POST', body: formData });
        let data;
        try {
          data = await res.json();
        } catch (err) {
          data = { detail: 'Server error (invalid JSON response)' };
        }

        if (!res.ok) {
          showMessage('registerMsg', data.detail || 'Registration failed');
        } else {
          showMessage('registerMsg', 'Account created successfully!', 'success');
          saveAuth(data.token, data.user);
          setTimeout(() => window.location.href = 'dashboard.html', 1500);
        }
      } catch (err) {
        console.error(err);
        showMessage('registerMsg', 'Network error or server unreachable.');
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }
}

// MAIN INIT
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initForms();

  // Show register on link click
  const showRegister = document.getElementById('showRegister');
  const registerSection = document.getElementById('register');
  if (showRegister && registerSection) {
    showRegister.addEventListener('click', e => {
      e.preventDefault();
      registerSection.classList.remove('hidden');
      registerSection.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // Save original button texts
  document.querySelectorAll('button[type="submit"]').forEach(btn => {
    btn.dataset.originalText = btn.textContent;
  });

  // LOGOUT
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', e => {
      e.preventDefault();
      localStorage.clear();
      window.location.href = 'login.html';
    });
  }

  // USER INFO
  const user = getUser();
  const userInfoEl = document.getElementById('userInfo');
  if (userInfoEl && user) {
    userInfoEl.textContent = `${user.name} (${user.role.toUpperCase()})`;
  }

  // ROUTING
  const path = window.location.pathname;
  if (path.includes('dashboard.html')) {
    if (!user) {
      window.location.href = 'login.html';
      return;
    }
    if (user.role === 'admin') initAdminDashboard();
    else if (user.role === 'recruiter') initRecruiterDashboard();
    else if (user.role === 'candidate') initCandidateDashboard();
  }

  if (path.includes('jobs.html')) {
    loadJobsInto('jobsList');
  }
});
