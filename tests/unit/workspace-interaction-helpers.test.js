const helpers = require('../../client/src/workspace-interaction-helpers.cjs');

describe('workspace interaction helpers', () => {
  it('detecta respuestas anteriores por request o por version del espacio de trabajo', () => {
    expect(
      helpers.isStaleWorkspaceResponse({
        requestId: 1,
        latestRequestId: 2,
        workspaceVersion: 3,
        latestWorkspaceVersion: 3,
      }),
    ).toBe(true);

    expect(
      helpers.isStaleWorkspaceResponse({
        requestId: 2,
        latestRequestId: 2,
        workspaceVersion: 3,
        latestWorkspaceVersion: 4,
      }),
    ).toBe(true);

    expect(
      helpers.isStaleWorkspaceResponse({
        requestId: 5,
        latestRequestId: 5,
        workspaceVersion: 8,
        latestWorkspaceVersion: 8,
      }),
    ).toBe(false);
  });

  it('marca el espacio de trabajo ocupado cuando cualquier flujo critico esta activo', () => {
    expect(helpers.isWorkspaceBusy({ loading: false, sending: false, calculating: false, uploadingDocument: false })).toBe(false);
    expect(helpers.isWorkspaceBusy({ loading: true, sending: false, calculating: false, uploadingDocument: false })).toBe(true);
    expect(helpers.isWorkspaceBusy({ loading: false, sending: true, calculating: false, uploadingDocument: false })).toBe(true);
    expect(helpers.isWorkspaceBusy({ loading: false, sending: false, calculating: true, uploadingDocument: false })).toBe(true);
    expect(helpers.isWorkspaceBusy({ loading: false, sending: false, calculating: false, uploadingDocument: true })).toBe(true);
  });
});
