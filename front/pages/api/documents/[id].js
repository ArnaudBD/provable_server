import { ObjectId } from 'mongodb';
import { getCollection } from '../../../src/lib/mongodb';
import { methodNotAllowed, sendDatabaseError, sendError } from '../../../src/lib/api';

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
  if (req.method === 'PUT') {
    const { text, name, hash } = req.body || {};
    updateFields = {};
    if (text) updateFields.text = text;
    if (name) updateFields.name = name;
    if (hash) updateFields.hash = hash;
    if (Object.keys(updateFields).length === 0) {
      return sendError(res, 400, 'At least one field (text, name, or hash) is required');
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
      const result = await collection.updateOne(filter, { $set: updateFields });
      if (result.matchedCount === 0) {
        return sendError(res, 404, 'Document not found');
      }
      return res.status(200).json({ message: 'Document updated' });
    }

    const result = await collection.deleteOne(filter);
    if (result.deletedCount === 0) {
      return sendError(res, 404, 'Document not found');
    }
    return res.status(200).json({ message: 'Document deleted' });
  } catch (error) {
    return sendDatabaseError(res, error, `Error handling ${req.method} /api/documents/${id}`);
  }
}
