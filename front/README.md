# Provable Server front end

Next.js app (pages API routes + app router UI) that stores documents in MongoDB
and records each create, update and delete on a Starknet Sepolia contract.

## Requirements

- Node.js 24 (`engines.node` is `24.x`; set the same version in the Vercel project).
- A MongoDB database and a Starknet Sepolia RPC endpoint.

## Environment variables

Copy `.env.example` to `.env.local` for local work. On Vercel, set them under
Project Settings > Environment Variables for Production and Preview.

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | yes | MongoDB connection string. |
| `MONGODB_DB` | no | Database name. Defaults to `myDatabase`, the database the original deployment used (documents live in its `myCollection` collection). |
| `STARKNET_RPC_URL` | yes | Starknet Sepolia JSON-RPC endpoint speaking spec 0.9 or 0.10 (starknet.js 10). For Alchemy: `https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/<api-key>`. |
| `PRIVATE_KEY` | yes | Private key of the account that signs contract writes. Read server-side only; never expose it with a `NEXT_PUBLIC_` prefix. |
| `WRITE_PASSWORD` | yes | Password the UI asks for before saving or deleting. Writes are disabled while it is unset. |

Check an RPC endpoint (loads the contract and calls `get_file_count`, sends no transaction):

```bash
npm run check:rpc
```

## Behaviour

- Writes (`POST /api/documents`, `PUT`/`DELETE /api/documents/:id`) need the
  `x-write-password` header. Each client gets 5 wrong passwords per 15 minutes
  and 30 writes per 10 minutes, then `429`.
- A document is saved in MongoDB even when the Starknet write fails. Its
  `chain.status` is then `failed`, and the UI marks it "not on Starknet".
- Successful submissions start as `pending`; `GET /api/transactions/:hash`
  resolves them to `confirmed` or `rejected`.

## Development

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
```
