// POINT FRONTEND TO FASTAPI BACKEND
const API_BASE = 'http://localhost:8000/api';

// CHAT GLOBALS
let currentUser = null;
let chatSocket = null;
let currentChatRecipient = null;
let chatContactsList = [];

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
async function loadJobsInto(containerId, skeletonId = null, filters = {}) {
  const container = document.getElementById(containerId);
  const countLabel = document.getElementById('jobsCount');
  if (!container) return;

  // Show skeleton if provided
  if (skeletonId) showSkeleton(skeletonId, true);

  // Build query string
  const params = new URLSearchParams();
  if (filters.keyword) params.append('keyword', filters.keyword);
  if (filters.location) params.append('location', filters.location);
  if (filters.type && filters.type !== 'all') params.append('type', filters.type);

  const queryString = params.toString() ? `?${params.toString()}` : '';

  try {
    const res = await fetch(`${API_BASE}/jobs${queryString}`);
    const data = await res.json();
    if (!res.ok) throw new Error('Failed to load jobs');

    renderJobs(container, data);

    if (countLabel) {
      countLabel.textContent = `${data.length} job${data.length === 1 ? '' : 's'} found`;
    }
  } catch {
    container.innerHTML = `<p class="muted">Network error while loading jobs.</p>`;
    if (countLabel) countLabel.textContent = '0 jobs';
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

    // Truncate description for "teaser"
    const isLong = job.description.length > 150;
    const shortDesc = isLong ? job.description.slice(0, 150) + '...' : job.description;
    const fullDesc = job.description.replace(/\n/g, '</p><p>');

    const typeLabel = job.type ? job.type.replace('-', ' ').toUpperCase() : 'FULL-TIME';

    card.innerHTML = `
      <div class="job-header">
        <div class="job-primary-info">
          <h3 class="job-title">${job.title}</h3>
          <div class="job-meta">
            <span class="job-type-badge">${typeLabel}</span>
            <span class="job-company">${job.company || 'Confidential'}</span>
            <span class="job-separator">•</span>
            <span class="job-location">${job.location || 'Remote'}</span>
            <span style="font-size:0.8rem; margin-left:auto; color:var(--text-light)">${job.views || 0} views</span>
          </div>
        </div>
      </div>
      
      <!-- Content Area -->
      <div class="job-content">
          <div class="job-description-teaser">${shortDesc}</div>
          <div class="job-description-full hidden"><p>${fullDesc}</p></div>
      </div>

      <div class="job-actions">
        ${isLong ? `<button class="btn btn-secondary btn-sm toggle-details" data-job-id="${job.id}">View Details</button>` : ''}
        <button class="btn btn-primary btn-large" data-job-id="${job.id}">
          Apply Now
        </button>
      </div>
    `;

    // Add event listener for toggle
    const toggleBtn = card.querySelector('.toggle-details');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const full = card.querySelector('.job-description-full');
        const teaser = card.querySelector('.job-description-teaser');

        if (full.classList.contains('hidden')) {
          full.classList.remove('hidden');
          teaser.classList.add('hidden');
          toggleBtn.textContent = 'Show Less';
          trackJobView(job.id); // Track view on expand
        } else {
          full.classList.add('hidden');
          teaser.classList.remove('hidden');
          toggleBtn.textContent = 'View Details';
        }
      });
    }

    container.appendChild(card);
  });

  // Wire up apply and view buttons
  container.addEventListener('click', async (e) => {
    // Apply Button
    if (e.target.matches('button[data-job-id]')) {
      applyForJob(e.target.dataset.jobId);
    }

    // View Details Toggle (simple version: just track view on hover/expand, 
    // but for now let's just assume rendering the list counts as "impression" logic
    // OR improve this: Add "View Details" button to expand description)
  });
}

// Separate function for tracking view
async function trackJobView(jobId) {
  try {
    await fetch(`${API_BASE}/jobs/${jobId}/view`, { method: 'POST' });
  } catch (e) { console.error(e); }
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
let currentAdminView = 'main'; // 'main', 'recruiters', 'candidates'

async function initAdminDashboard() {
  const section = document.getElementById('adminSection');
  if (section) section.classList.remove('hidden');

  // Default to main view
  showAdminMainView();
  await loadAdminStats();
}

async function loadAdminStats() {
  try {
    const summaryRes = await fetch(`${API_BASE}/admin/summary`, { headers: authHeaders() });
    if (summaryRes.ok) {
      const summary = await summaryRes.json();
      document.getElementById('adminRecruiters').textContent = summary.recruiters;
      document.getElementById('adminCandidates').textContent = summary.candidates;
      document.getElementById('adminJobs').textContent = `${summary.jobs} (${summary.pending_jobs || 0} pending)`;
      document.getElementById('adminApps').textContent = summary.applications;
    }
  } catch (error) {
    console.error('Admin stats error:', error);
  }
}

function showAdminMainView() {
  currentAdminView = 'main';
  document.getElementById('adminMainView').classList.remove('hidden');
  document.getElementById('adminRecruitersView').classList.add('hidden');
  document.getElementById('adminCandidatesView').classList.add('hidden');
  loadAdminStats(); // Refresh stats when returning to main
}

// Global functions for HTML access
window.showAdminMainView = showAdminMainView;

async function loadAdminRecruitersView() {
  currentAdminView = 'recruiters';
  document.getElementById('adminMainView').classList.add('hidden');
  document.getElementById('adminRecruitersView').classList.remove('hidden');

  const pendingContainer = document.getElementById('adminPendingJobsList');
  const recruitersContainer = document.getElementById('adminRecruiterList');

  pendingContainer.innerHTML = '<p class="muted">Loading pending jobs...</p>';
  recruitersContainer.innerHTML = '<p class="muted">Loading recruiters...</p>';

  try {
    const [usersRes, jobsRes] = await Promise.all([
      fetch(`${API_BASE}/admin/users`, { headers: authHeaders() }),
      fetch(`${API_BASE}/admin/jobs?status=pending`, { headers: authHeaders() }),
    ]);

    if (usersRes.ok) {
      const { recruiters } = await usersRes.json();
      renderUserTable(recruitersContainer, recruiters);
    }

    if (jobsRes.ok) {
      const jobs = await jobsRes.json();
      const badge = document.getElementById('pendingJobCountBadge');
      if (badge) badge.textContent = `${jobs.length} Pending`;
      renderAdminJobs(pendingContainer, jobs);
    }

  } catch (e) {
    console.error(e);
    pendingContainer.innerHTML = '<p class="error">Failed to load data.</p>';
  }
}
window.loadAdminRecruitersView = loadAdminRecruitersView;

async function loadAdminCandidatesView() {
  currentAdminView = 'candidates';
  document.getElementById('adminMainView').classList.add('hidden');
  document.getElementById('adminCandidatesView').classList.remove('hidden');

  const container = document.getElementById('adminCandidateList');
  container.innerHTML = '<p class="muted">Loading candidates...</p>';

  try {
    const usersRes = await fetch(`${API_BASE}/admin/users`, { headers: authHeaders() });
    if (usersRes.ok) {
      const { candidates } = await usersRes.json();
      renderUserTable(container, candidates);
    }
  } catch (e) {
    console.error(e);
    container.innerHTML = '<p class="error">Failed to load candidates.</p>';
  }
}
window.loadAdminCandidatesView = loadAdminCandidatesView;

// Reusing helper functions with minor tweaks for the new context
function renderUserTable(container, users) {
  if (!container) return;
  container.innerHTML = '';
  if (!users || users.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">No users found</div>
        <p class="empty-description">There are no registered users in this category yet.</p>
      </div>
    `;
    return;
  }
  users.forEach(u => {
    const row = document.createElement('div');
    row.className = 'list-card';
    const initial = u.name.charAt(0).toUpperCase();

    row.innerHTML = `
      <div class="list-card-header">
         <div class="list-card-avatar">${initial}</div>
         <div class="list-card-info">
            <div class="list-card-title">${u.name}</div>
            <div class="list-card-subtitle">${u.username ? '@' + u.username : ''}</div>
         </div>
      </div>
      
      <div class="list-card-details">
        <div class="list-card-detail-item">
            <span>📧</span> ${u.email}
        </div>
        <div class="list-card-detail-item">
            <span class="status-badge current active">Active</span>
        </div>
      </div>

      <div class="list-card-actions">
         <button class="btn btn-danger btn-sm delete-user-btn" data-user-id="${u.id}" style="color: var(--color-error); background: rgba(239, 68, 68, 0.1); border:none; padding: 0.5rem 1rem; border-radius: var(--radius-md); font-weight:600; cursor:pointer;">Delete User</button>
      </div>
    `;
    container.appendChild(row);
  });

  // Wire up delete buttons
  container.querySelectorAll('.delete-user-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteUser(btn.dataset.userId));
  });
}

async function deleteUser(userId) {
  if (!confirm("Are you sure you want to delete this user? This cannot be undone.")) return;

  try {
    const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
      method: 'DELETE',
      headers: authHeaders()
    });

    if (res.ok) {
      alert("User deleted successfully.");
      // Refresh current view
      if (currentAdminView === 'recruiters') loadAdminRecruitersView();
      else if (currentAdminView === 'candidates') loadAdminCandidatesView();
      else initAdminDashboard(); // Fallback
    } else {
      const data = await res.json();
      alert(data.detail || "Failed to delete user.");
    }
  } catch (e) {
    alert("Network error.");
  }
}

function renderAdminJobs(container, jobs) {
  if (!container) return;
  container.innerHTML = '';
  if (!jobs || jobs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">No pending jobs</div>
        <p class="empty-description">All jobs have been moderated.</p>
      </div>
    `;
    return;
  }

  jobs.forEach(job => {
    const row = document.createElement('div');
    row.className = 'list-card';

    row.innerHTML = `
      <div class="list-card-header">
         <div class="list-card-avatar" style="background:var(--color-warning); color:white;">?</div>
         <div class="list-card-info">
            <div class="list-card-title">${job.title}</div>
            <div class="list-card-subtitle">${job.company} • ${new Date(job.created_at).toLocaleDateString()}</div>
         </div>
      </div>
      
      <div class="list-card-details">
         <div class="list-card-detail-item">
             <span>👤</span> ${job.recruiter_name}
         </div>
         <div class="list-card-detail-item">
             <span class="status-badge pending">Pending Approval</span>
         </div>
      </div>

      <div class="list-card-actions">
         <button class="btn btn-primary btn-sm approve-job" data-job-id="${job.id}">Approve</button>
         <button class="btn btn-secondary btn-sm reject-job" data-job-id="${job.id}" style="color: var(--color-error); border-color: var(--color-error);">Reject</button>
      </div>
    `;
    container.appendChild(row);
  });

  // Wire up buttons
  container.querySelectorAll('.approve-job').forEach(btn => {
    btn.addEventListener('click', () => updateAdminJobStatus(btn.dataset.jobId, 'approved'));
  });
  container.querySelectorAll('.reject-job').forEach(btn => {
    btn.addEventListener('click', () => updateAdminJobStatus(btn.dataset.jobId, 'rejected'));
  });
}

async function updateAdminJobStatus(jobId, status) {
  if (!confirm(`Are you sure you want to ${status} this job?`)) return;
  try {
    const res = await fetch(`${API_BASE}/admin/jobs/${jobId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ status })
    });

    if (res.ok) {
      alert(`Job ${status} successfully.`);
      // Refresh recruiter view since that's where jobs are
      if (currentAdminView === 'recruiters') loadAdminRecruitersView();
      else initAdminDashboard();
    } else {
      const data = await res.json();
      alert(data.detail || "Failed to update job.");
    }
  } catch (e) {
    alert("Network error.");
  }
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

    // FETCH ANALYTICS
    const analyticsRes = await fetch(`${API_BASE}/recruiter/analytics`, { headers: authHeaders() });
    if (analyticsRes.ok) {
      const analyticsData = await analyticsRes.json();
      renderAnalytics('analyticsChart', analyticsData);
    }
  } catch (error) {
    console.error('Recruiter applications error:', error);
  } finally {
    showSkeleton('recruiterAppsSkeleton', false);
  }
}

function renderAnalytics(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!data || data.length === 0) {
    container.innerHTML = '<p class="muted">No data available yet.</p>';
    return;
  }

  container.innerHTML = '';

  // Calculate max for normalization
  const maxVal = Math.max(...data.map(d => Math.max(d.views, d.applications)));
  const scale = maxVal > 0 ? maxVal : 1;

  data.forEach(item => {
    const viewWidth = (item.views / scale) * 100;
    const appWidth = (item.applications / scale) * 100;

    const row = document.createElement('div');
    row.className = 'chart-row';
    row.innerHTML = `
            <div class="chart-label" title="${item.title}">${item.title}</div>
            <div class="chart-bar-container">
                <div class="chart-bar-views" style="width: ${viewWidth}%" title="${item.views} Views"></div>
                <div class="chart-bar-apps" style="width: ${appWidth}%" title="${item.applications} Applications"></div>
            </div>
            <div class="chart-value">${item.views} / ${item.applications}</div>
        `;
    container.appendChild(row);
  });

  // Legend
  const legend = document.createElement('div');
  legend.style.display = 'flex';
  legend.style.gap = '1rem';
  legend.style.fontSize = '0.8rem';
  legend.style.marginTop = '0.5rem';
  legend.innerHTML = `
        <div style="display:flex;align-items:center;gap:0.25rem"><div style="width:12px;height:12px;background:var(--color-primary-500);border-radius:2px"></div> Views</div>
        <div style="display:flex;align-items:center;gap:0.25rem"><div style="width:12px;height:12px;background:var(--color-success);border-radius:2px"></div> Applications</div>
    `;
  container.appendChild(legend);
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
    const resumeLink = app.resume
      ? `<a href="${API_BASE}/resumes/${app.resume.split('/').pop()}" target="_blank" class="resume-link">View Resume</a>`
      : '<span class="text-muted">No resume</span>';

    // Match Score Logic
    let matchBadge = '';
    if (app.match_score !== undefined) {
      let colorClass = 'bg-red-100 text-red-800';
      if (app.match_score >= 70) colorClass = 'bg-green-100 text-green-800';
      else if (app.match_score >= 40) colorClass = 'bg-yellow-100 text-yellow-800';

      matchBadge = `<span class="badge ${colorClass}" style="margin-left:0.5rem">Match: ${app.match_score}%</span>`;
    }

    card.innerHTML = `
      <div class="app-header">
        <div>
          <h4 class="app-title">${app.job_title} ${matchBadge}</h4>
          <p class="app-candidate">Candidate: <strong>${app.candidate_name}</strong></p>
          <div class="app-meta">Applied: ${new Date(app.applied_at).toLocaleDateString()}</div>
        </div>
        <div class="app-status status-${app.status}">${app.status.toUpperCase()}</div>
      </div>
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
    // Initial load
    loadJobsInto('jobsList');

    // Search listener
    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        const keyword = document.getElementById('searchInput').value;
        const location = document.getElementById('locationInput').value;
        const type = document.getElementById('typeInput').value;

        loadJobsInto('jobsList', null, { keyword, location, type });
      });
    }

    // Alert listener
    const alertBtn = document.getElementById('alertBtn');
    if (alertBtn) {
      alertBtn.addEventListener('click', async () => {
        const user = getUser();
        if (!user) {
          alert("Please login to set up alerts.");
          window.location.href = 'login.html';
          return;
        }

        const keyword = prompt("Enter a keyword to watch for (e.g. 'Python', 'Designer'):");
        if (!keyword) return;

        try {
          const res = await fetch(`${API_BASE}/alerts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ keyword, email: user.email })
          });
          if (res.ok) {
            alert(`Alert set! We'll email you when new "${keyword}" jobs are posted.`);
          } else {
            alert("Failed to set alert.");
          }
        } catch (e) {
          console.error(e);
          alert("Network error.");
        }
      });
    }
  }
});

// Init Chat Widget everywhere
initChat();

// --- CHAT SYSTEM ---
function initChat() {
  const toggleBtn = document.getElementById('toggleChatBtn');
  const widget = document.getElementById('chatWidget');
  const closeBtn = document.getElementById('closeChatBtn');
  const contactsView = document.getElementById('chatContacts');
  const chatWindow = document.getElementById('chatWindow');
  const backBtn = document.getElementById('backToContactsBtn');
  const sendBtn = document.getElementById('sendChatBtn');
  const input = document.getElementById('chatInput');

  if (!toggleBtn || !widget) return;

  // Toggle Widget
  toggleBtn.addEventListener('click', () => {
    const user = getUser();
    if (!user) {
      alert("Please login to chat.");
      return;
    }
    widget.classList.toggle('hidden');
    if (!widget.classList.contains('hidden')) {
      connectChatSocket();
      loadContacts();
    }
  });

  closeBtn.addEventListener('click', () => widget.classList.add('hidden'));

  // Navigation
  backBtn.addEventListener('click', () => {
    chatWindow.classList.add('hidden');
    contactsView.classList.remove('hidden');
    currentChatRecipient = null;
    document.getElementById('chatHeaderTitle').textContent = 'Messages';
  });

  // Send Message
  const sendMessage = () => {
    const content = input.value.trim();
    if (!content || !currentChatRecipient || !chatSocket) return;

    chatSocket.send(JSON.stringify({
      recipient_id: currentChatRecipient.id,
      content: content
    }));

    appendMessage({
      sender: currentUser.id,
      content: content,
      timestamp: new Date().toISOString()
    }, true);

    input.value = '';
  };

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
}

function connectChatSocket() {
  if (chatSocket && chatSocket.readyState === WebSocket.OPEN) return;

  const user = getUser();
  if (!user) return;
  currentUser = user;

  // Use ws:// or wss:// based on protocol
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  chatSocket = new WebSocket(`${protocol}//localhost:8000/api/ws/chat/${user.id}`);

  chatSocket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    // Only append if we are chatting with the sender
    if (currentChatRecipient && msg.sender === currentChatRecipient.id) {
      appendMessage(msg, false);
    } else {
      // Show notification dot or toast
    }
  };

  chatSocket.onopen = () => console.log("Chat connected");
}

async function loadContacts() {
  const list = document.getElementById('chatContacts');
  list.innerHTML = '<p class="muted" style="padding:1rem">Loading contacts...</p>';

  try {
    const res = await fetch(`${API_BASE}/chat/contacts`, { headers: authHeaders() });
    const contacts = await res.json();

    list.innerHTML = '';
    if (contacts.length === 0) {
      list.innerHTML = '<p class="muted" style="padding:1rem">No conversations yet.</p>';
      return;
    }

    contacts.forEach(c => {
      const el = document.createElement('div');
      el.className = 'contact-item';
      el.innerHTML = `<strong>${c.name}</strong> <small class="muted">(${c.role})</small>`;
      el.addEventListener('click', () => openChat(c));
      list.appendChild(el);
    });
  } catch (e) {
    console.error(e);
    list.innerHTML = '<p class="muted" style="padding:1rem">Error loading contacts.</p>';
  }
}

async function openChat(contact) {
  currentChatRecipient = contact;
  document.getElementById('chatContacts').classList.add('hidden');
  document.getElementById('chatWindow').classList.remove('hidden');
  document.getElementById('chatHeaderTitle').textContent = contact.name;
  document.getElementById('chatMessages').innerHTML = '<p class="muted">Loading history...</p>';

  try {
    const res = await fetch(`${API_BASE}/chat/history/${contact.id}`, { headers: authHeaders() });
    const history = await res.json();

    const container = document.getElementById('chatMessages');
    container.innerHTML = '';
    history.forEach(msg => {
      const isMe = msg.sender === currentUser.id;
      appendMessage(msg, isMe);
    });
    scrollToBottom();
  } catch (e) {
    console.error(e);
  }
}

function appendMessage(msg, isMe) {
  const container = document.getElementById('chatMessages');
  const el = document.createElement('div');
  el.className = `message-bubble ${isMe ? 'msg-sent' : 'msg-received'}`;
  el.textContent = msg.content;
  container.appendChild(el);
  scrollToBottom();
}

function scrollToBottom() {
  const container = document.getElementById('chatMessages');
  container.scrollTop = container.scrollHeight;
}
