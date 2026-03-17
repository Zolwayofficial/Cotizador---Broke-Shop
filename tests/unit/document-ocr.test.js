jest.mock('google-auth-library', () => {
  const getAccessToken = jest.fn();
  const getClient = jest.fn(() => ({ getAccessToken }));
  const GoogleAuth = jest.fn(() => ({ getClient }));
  return {
    GoogleAuth,
    __mock: { getAccessToken, getClient },
  };
});

const { GoogleAuth, __mock } = require('google-auth-library');
const { extractDocumentTextWithOcr, getDocumentOcrConfig } = require('../../server/document-ocr');

describe('document OCR', () => {
  const originalEnv = { ...process.env };
  let originalFetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    originalFetch = global.fetch;
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('queda deshabilitado por defecto si no hay configuracion real', () => {
    delete process.env.DOCUMENT_OCR_ENABLED;
    delete process.env.GOOGLE_CLOUD_PROJECT_ID;
    delete process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID;

    const config = getDocumentOcrConfig();

    expect(config.enabled).toBe(false);
    expect(config.configured).toBe(false);
  });

  it('arma configuracion valida cuando Document AI esta completo', () => {
    process.env.DOCUMENT_OCR_ENABLED = 'true';
    process.env.GOOGLE_CLOUD_PROJECT_ID = 'demo-project';
    process.env.GOOGLE_DOCUMENT_AI_LOCATION = 'us';
    process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID = 'processor-123';

    const config = getDocumentOcrConfig();

    expect(config.enabled).toBe(true);
    expect(config.endpoint).toContain('demo-project');
    expect(config.endpoint).toContain('processor-123');
  });

  it('procesa OCR con Google Document AI cuando esta habilitado', async () => {
    process.env.DOCUMENT_OCR_ENABLED = 'true';
    process.env.GOOGLE_CLOUD_PROJECT_ID = 'demo-project';
    process.env.GOOGLE_DOCUMENT_AI_LOCATION = 'us';
    process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID = 'processor-123';
    __mock.getAccessToken.mockResolvedValueOnce('token-demo');
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        document: {
          text: 'Factura comercial\nProveedor Demo\nFOB USD 15000',
          pages: [{}, {}],
        },
      }),
    });

    const result = await extractDocumentTextWithOcr(Buffer.from('fake-pdf'), {
      mimeType: 'application/pdf',
    });

    expect(GoogleAuth).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      source: 'google-documentai-ocr',
      provider: 'google_documentai',
    });
    expect(result.contenido).toMatch(/Proveedor Demo/);
  });
});
