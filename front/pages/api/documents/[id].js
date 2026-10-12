import { ObjectId } from 'mongodb';
import { getCollection } from '../../../src/lib/mongodb';
import { methodNotAllowed, sendDatabaseError, sendError } from '../../../src/lib/api';
import { requireWritePassword } from '../../../src/lib/auth';
import { submitChainWrite } from '../../../src/lib/chain';
import { hashText, removeFile, updateFile } from '../../../src/lib/contract';
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
    if (!requireWritePassword(req, res)) return;
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

    if (req.method === 'PUT') {
      const previous = await collection.findOneAndUpdate(filter, { $set: updateFields }, { returnDocument: 'before' });
      if (!previous) {
        return sendError(res, 404, 'Document not found');
      }
      const name = updateFields.name ?? previous.name;
      const hash = updateFields.hash ?? previous.hash;
      const chain = await submitChainWrite('update', () => updateFile(name, previous.hash, hash));
      await collection.updateOne(filter, { $set: { chain } });
      return res.status(200).json({ message: 'Document updated', chain });
    }

    const deleted = await collection.findOneAndDelete(filter);
    if (!deleted) {
      return sendError(res, 404, 'Document not found');
    }
    const chain = await submitChainWrite('remove', () => removeFile(deleted.hash));
    return res.status(200).json({ message: 'Document deleted', chain });
  } catch (error) {
    return sendDatabaseError(res, error, `Error handling ${req.method} /api/documents/${id}`);
  }
}
