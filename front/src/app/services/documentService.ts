const API_BASE_URL = '/api';

export interface ChainRecord {
  action: 'create' | 'update' | 'remove';
  status: 'pending' | 'confirmed' | 'rejected' | 'failed' | 'unknown' | 'skipped';
  txHash?: string;
  error?: string;
}

interface WriteResult {
  id?: string;
  message?: string;
  chain: ChainRecord;
}

const errorMessage = async (response: Response, fallback: string) => {
  const body = await response.json().catch(() => ({}));
  return body.error || `${fallback}: ${response.statusText}`;
};

const write = async (url: string, init: RequestInit): Promise<WriteResult> => {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(await errorMessage(response, 'Request failed'));
  return response.json();
};

export const fetchDocuments = async () => {
  const response = await fetch(`${API_BASE_URL}/documents`);
  if (!response.ok) throw new Error(await errorMessage(response, 'Failed to fetch documents'));
  return response.json();
};

export const saveDocument = (id: string | undefined, data: { text: string; name: string }) => {
  const url = id ? `${API_BASE_URL}/documents/${id}` : `${API_BASE_URL}/documents`;
  return write(url, {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
};

export const deleteDocument = (id: string) =>
  write(`${API_BASE_URL}/documents/${id}`, { method: 'DELETE' });

export const fetchDocumentDetails = async (id: string) => {
  const response = await fetch(`${API_BASE_URL}/documents/${id}`);
  if (!response.ok) throw new Error(await errorMessage(response, 'Failed to fetch document details'));
  return response.json();
};

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

// Resolves with 'confirmed' or 'rejected', or 'pending' if the outcome is still
// unknown when the timeout runs out.
export const waitForTransaction = async (txHash: string): Promise<ChainRecord['status']> => {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const response = await fetch(`${API_BASE_URL}/transactions/${txHash}`);
    if (!response.ok) continue;
    const { status } = await response.json();
    if (status === 'confirmed' || status === 'rejected') return status;
  }
  return 'pending';
};
