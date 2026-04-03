function isStaleWorkspaceResponse({ requestId, latestRequestId, workspaceVersion, latestWorkspaceVersion }) {
  return requestId !== latestRequestId || workspaceVersion !== latestWorkspaceVersion;
}

function isWorkspaceBusy({ loading, sending, calculating, uploadingDocument }) {
  return Boolean(loading || sending || calculating || uploadingDocument);
}

module.exports = {
  isStaleWorkspaceResponse,
  isWorkspaceBusy,
};
