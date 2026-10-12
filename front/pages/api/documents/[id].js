import { ObjectId } from 'mongodb';
import { getCollection } from '../../../src/lib/mongodb';
import { methodNotAllowed, sendDatabaseError, sendError } from '../../../src/lib/api';
import { checkWriteRateLimit } from '../../../src/lib/writeLimit';
import { getOnChainHash, settlePendingWrite, submitChainWrite } from '../../../src/lib/chain';
import { hashText } from '../../../src/lib/contract';
import { validateName } from '../../../src/lib/validation';

const ALLOWED_METHODS = ['GET', 'PUT', 'DELETE'];

export default async function handler(req, res) {
  if (!ALLOWED_METHODS.includes(req.method)) {
    return methodNotAllowed(req, res, ALLOWED_METHODS);
  }

  const { id } = req.query;
  if (typeof id !== 'string' || !ObjectId.isValid(id)) {
    return sendError(res, 400, 'Invalid ID format');
  }
  const filter = { _id: new ObjectId(id) };

  let updateFields;
  if (req.method === 'PUT' || req.method === 'DELETE') {
    if (!(await checkWriteRateLimit(req, res))) return;
  }
  if (req.method === 'PUT') {
    const { text, name } = req.body || {};
    updateFields = {};
    if (text !== undefined) {
      if (typeof text !== 'string' || !text) return sendError(res, 400, 'text must be a non-empty string');
      updateFields.text = text;
      updateFields.hash = hashText(text);
    }
    if (name !== undefined) {
      const nameError = validateName(name);
      if (nameError) return sendError(res, 400, nameError);
      updateFields.name = name;
    }
    if (Object.keys(updateFields).length === 0) {
      return sendError(res, 400, 'At least one field (text or name) is required');
    }
  }

  try {
    const collection = await getCollection();

    if (req.method === 'GET') {
      const document = await collection.findOne(filter);
      if (!document) {
        return sendError(res, 404, 'Document not found');
      }
      return res.status(200).json(document);
    }

    // Writes derive the next transaction from what the contract holds for this
    // document (onChainHash), not from the latest saved content, which can be
    // ahead of the chain after a failed or rejected write.
    const current = await collection.findOne(filter);
    if (!current) {
      return sendError(res, 404, 'Document not found');
    }
    const settled = await settlePendingWrite(collection, current);
    if (!settled) {
      return sendError(res, 409, 'The previous Starknet transaction for this document is still pending, try again shortly');
    }
    const onChainHash = getOnChainHash(settled);

    if (req.method === 'PUT') {
      await collection.updateOne(filter, { $set: { ...updateFields, onChainHash } });
      const name = updateFields.name ?? settled.name;
      const hash = updateFields.hash ?? settled.hash;
      // Nothing confirmed on chain yet (the create failed or was rejected): create it now.
      const chain = onChainHash === null
        ? await submitChainWrite('create', 'create_file', [name, hash], hash)
        : await submitChainWrite('update', 'update', [name, onChainHash, hash], hash);
      await collection.updateOne(filter, { $set: { chain } });
      return res.status(200).json({ message: 'Document updated', chain });
    }

    await collection.deleteOne(filter);
    const chain = onChainHash === null
      ? { action: 'remove', status: 'skipped', updatedAt: new Date() }
      : await submitChainWrite('remove', 'remove', [onChainHash], null);
    return res.status(200).json({ message: 'Document deleted', chain });
  } catch (error) {
    return sendDatabaseError(res, error, `Error handling ${req.method} /api/documents/${id}`);
  }
}
