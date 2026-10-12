import { getCollection } from '../../../src/lib/mongodb';
import { methodNotAllowed, sendDatabaseError, sendError } from '../../../src/lib/api';
import { requireWritePassword } from '../../../src/lib/auth';
import { submitChainWrite } from '../../../src/lib/chain';
import { createFile, hashText } from '../../../src/lib/contract';
import { validateName } from '../../../src/lib/validation';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return methodNotAllowed(req, res, ['GET', 'POST']);
  }

  if (req.method === 'POST') {
    if (!requireWritePassword(req, res)) return;
    const { text, name } = req.body || {};
    if (typeof text !== 'string' || !text) {
      return sendError(res, 400, 'text is required');
    }
    const nameError = validateName(name);
    if (nameError) return sendError(res, 400, nameError);

    // The hash is always derived here, so the signer only ever commits the
    // hash of a document that is actually stored.
    const hash = hashText(text);
    try {
      const collection = await getCollection();
      const { insertedId } = await collection.insertOne({ text, name, hash, createdAt: new Date() });
      const chain = await submitChainWrite('create', () => createFile(name, hash));
      await collection.updateOne({ _id: insertedId }, { $set: { chain } });
      return res.status(201).json({ id: insertedId, chain });
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
