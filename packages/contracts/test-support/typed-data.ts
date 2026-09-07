import { encodeAbiParameters, keccak256, type Address, type Hex } from 'viem';
export const paymentTypes = {
  Payment: [
    { name: 'invoiceId', type: 'bytes32' },
    { name: 'amount', type: 'uint256' },
    { name: 'beneficiary', type: 'address' },
    { name: 'epoch', type: 'uint64' },
    { name: 'nonce', type: 'uint64' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;
export const migrationTypes = {
  Migration: [
    { name: 'supplierId', type: 'bytes32' },
    { name: 'fromEpoch', type: 'uint64' },
    { name: 'toEpoch', type: 'uint64' },
    { name: 'beneficiary', type: 'address' },
    { name: 'invoiceIdsHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;
export const domain = (chainId: number, verifyingContract: Address) =>
  ({ name: 'PayeeLock', version: '1', chainId, verifyingContract }) as const;
export const invoiceListHash = (ids: readonly Hex[]) =>
  keccak256(encodeAbiParameters([{ type: 'bytes32[]' }], [ids]));
export type Payment = {
  invoiceId: Hex;
  amount: bigint;
  beneficiary: Address;
  epoch: bigint;
  nonce: bigint;
  deadline: bigint;
};
export type Migration = {
  supplierId: Hex;
  fromEpoch: bigint;
  toEpoch: bigint;
  beneficiary: Address;
  invoiceIdsHash: Hex;
  nonce: bigint;
  deadline: bigint;
};
