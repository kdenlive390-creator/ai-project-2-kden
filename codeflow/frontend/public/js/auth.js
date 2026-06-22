// Auth state
let currentUser = null;

function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
  document.querySelector(`[onclick="switchTab('${tab}')"]`).classList.add('active');
  document.getElementById(`${tab}-form`).classList.remove('hidden');
  hideAuthError();
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideAuthError() {
  document.getElementById('auth-error').classList.add('hidden');
}

async function login() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) return showAuthError('Please fill in all fields');

  try {
    const data = await API.post('/auth/login', { email, password });
    localStorage.setItem('cf_token', data.token);
    localStorage.setItem('cf_user', JSON.stringify(data.user));
    currentUser = data.user;
    showDashboard();
  } catch (err) {
    showAuthError(err.message);
  }
}

async function register() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  if (!name || !email || !password) return showAuthError('Please fill in all fields');

  try {
    const data = await API.post('/auth/register', { name, email, password });
    localStorage.setItem('cf_token', data.token);
    localStorage.setItem('cf_user', JSON.stringify(data.user));
    currentUser = data.user;
    showDashboard();
  } catch (err) {
    showAuthError(err.message);
  }
}

function logout() {
  localStorage.removeItem('cf_token');
  localStorage.removeItem('cf_user');
  currentUser = null;
  showScreen('auth-screen');
}

// Enter key support
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') login();
  });
  document.getElementById('reg-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') register();
  });
});
