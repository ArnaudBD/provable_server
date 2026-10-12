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
| `ACCOUNT_ADDRESS` | yes | Address (`0x…`) of the deployed Starknet Sepolia account that signs contract writes. It pays the fees, so keep it funded with STRK. |
| `PRIVATE_KEY` | yes | Private key of the `ACCOUNT_ADDRESS` account. Read server-side only; never expose it with a `NEXT_PUBLIC_` prefix. |

Check an RPC endpoint (loads the contract and calls `get_file_count`, sends no transaction):

```bash
npm run check:rpc
```

## Behaviour

- Writes (`POST /api/documents`, `PUT`/`DELETE /api/documents/:id`) are open
  to anyone; each one signs a Starknet transaction paid by `ACCOUNT_ADDRESS`.
  Each client (by IP) gets 30 writes per 10 minutes, then `429`.
- A document is saved in MongoDB even when the Starknet write fails. Its
  `chain.status` is then `failed`, and the UI marks it "not on Starknet".
- Successful submissions start as `pending`; `GET /api/transactions/:hash`
  resolves them to `confirmed` or `rejected`.
- `onChainHash` is the hash the contract holds for a document. It only changes
  when a transaction is confirmed, and the next update or removal is signed
  against it. A write to a document whose previous transaction is still
  pending returns `409`.
- A submission that has not been broadcast after 15 s is abandoned and never
  sent (`failed`). One that was sent but whose answer never came back is
  recorded as `unknown`.

## Development

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
```
