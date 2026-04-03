function normalizeAdminFormPayload(form = {}) {
  const normalizedRole = String(form.role || 'user').trim().toLowerCase() === 'admin' ? 'admin' : 'user';

  return {
    email: String(form.email || '').trim().toLowerCase(),
    password: String(form.password || ''),
    name: String(form.name || '').trim(),
    company: String(form.company || '').trim(),
    ruc: String(form.ruc || '').trim(),
    role: normalizedRole,
  };
}

function getAdminUserIdentity(user = {}) {
  if (user.id !== undefined && user.id !== null && String(user.id).trim()) {
    return `id:${String(user.id).trim()}`;
  }

  const email = String(user.email || '').trim().toLowerCase();
  return email ? `email:${email}` : '';
}

function mergeAdminUsers(currentUsers = [], incomingUsers = []) {
  const merged = [];
  const seen = new Set();

  [...incomingUsers, ...currentUsers].forEach((user) => {
    const identity = getAdminUserIdentity(user);
    if (!identity || seen.has(identity)) return;
    seen.add(identity);
    merged.push(user);
  });

  return merged;
}

function normalizeAdminUsers(incomingUsers = []) {
  const normalized = [];
  const seen = new Set();

  for (const user of Array.isArray(incomingUsers) ? incomingUsers : []) {
    const identity = getAdminUserIdentity(user);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    normalized.push(user);
  }

  return normalized;
}

function upsertAdminUser(currentUsers = [], incomingUser) {
  if (!incomingUser) return Array.isArray(currentUsers) ? [...currentUsers] : [];

  const identity = getAdminUserIdentity(incomingUser);
  if (!identity) return Array.isArray(currentUsers) ? [...currentUsers] : [];

  const nextUsers = [];
  let replaced = false;

  for (const user of Array.isArray(currentUsers) ? currentUsers : []) {
    if (getAdminUserIdentity(user) === identity) {
      nextUsers.push(incomingUser);
      replaced = true;
    } else {
      nextUsers.push(user);
    }
  }

  if (!replaced) {
    nextUsers.unshift(incomingUser);
  }

  return nextUsers;
}

function isStaleAdminResponse({ requestId, latestRequestId, mutationVersion, latestMutationVersion }) {
  return requestId !== latestRequestId || mutationVersion !== latestMutationVersion;
}

function buildAdminUsersView({ users = [], isLoading = false, error = null } = {}) {
  const normalizedUsers = Array.isArray(users) ? users : [];
  const hasUsers = normalizedUsers.length > 0;
  const normalizedError = String(error ?? '').trim();

  return {
    users: normalizedUsers,
    hasUsers,
    showLoadingState: Boolean(isLoading) && !hasUsers,
    showErrorState: !isLoading && !hasUsers && Boolean(normalizedError),
    showEmptyState: !isLoading && !hasUsers && !normalizedError,
    loadingMessage: 'Cargando miembros registrados...',
    errorMessage: normalizedError || 'No pude cargar la lista de miembros.',
    emptyMessage: 'Todavia no hay mas miembros registrados. Usa el formulario para crear la primera cuenta manual.',
  };
}

module.exports = {
  normalizeAdminFormPayload,
  mergeAdminUsers,
  normalizeAdminUsers,
  upsertAdminUser,
  isStaleAdminResponse,
  buildAdminUsersView,
};
