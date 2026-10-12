import { getCollection } from '../../../src/lib/mongodb';
import { methodNotAllowed, sendDatabaseError, sendError } from '../../../src/lib/api';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return methodNotAllowed(req, res, ['GET', 'POST']);
  }

  if (req.method === 'POST') {
    const { text, name, hash } = req.body || {};
    if (!text || !name || !hash) {
      return sendError(res, 400, 'text, name and hash are required');
    }
    try {
      const collection = await getCollection();
      const result = await collection.insertOne({ text, name, hash, createdAt: new Date() });
      return res.status(201).json({ id: result.insertedId });
    } catch (error) {
      return sendDatabaseError(res, error, 'Error inserting document');
    }
  }

  try {
    const collection = await getCollection();
    const documents = await collection.find({}).toArray();
    return res.status(200).json(documents);
  } catch (error) {
    return sendDatabaseError(res, error, 'Error fetching documents');
  }
}
