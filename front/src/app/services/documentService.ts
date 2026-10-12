const API_BASE_URL = '/api';
const WRITE_PASSWORD_HEADER = 'x-write-password';
const PASSWORD_STORAGE_KEY = 'provable-write-password';

export interface ChainRecord {
  action: 'create' | 'update' | 'remove';
  status: 'pending' | 'confirmed' | 'rejected' | 'failed';
  txHash?: string;
  error?: string;
}

interface WriteResult {
  id?: string;
  message?: string;
  chain: ChainRecord;
}

const readStoredPassword = () => {
  try {
    return sessionStorage.getItem(PASSWORD_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

const storePassword = (password: string) => {
  try {
    if (password) sessionStorage.setItem(PASSWORD_STORAGE_KEY, password);
    else sessionStorage.removeItem(PASSWORD_STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode); the password is then asked again next time.
  }
};

const errorMessage = async (response: Response, fallback: string) => {
  const body = await response.json().catch(() => ({}));
  return body.error || `${fallback}: ${response.statusText}`;
};

// Writes need the server's write password. Ask for it on the first 401 and retry once.
const authorizedWrite = async (url: string, init: RequestInit): Promise<WriteResult> => {
  const send = (password: string) =>
    fetch(url, { ...init, headers: { ...init.headers, [WRITE_PASSWORD_HEADER]: password } });

  let response = await send(readStoredPassword());
  if (response.status === 401) {
    const password = window.prompt('Enter the write password') || '';
    storePassword(password);
    if (!password) throw new Error('A write password is required to save changes');
    response = await send(password);
    if (response.status === 401) storePassword('');
  }
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
  return authorizedWrite(url, {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
};

export const deleteDocument = (id: string) =>
  authorizedWrite(`${API_BASE_URL}/documents/${id}`, { method: 'DELETE' });

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
