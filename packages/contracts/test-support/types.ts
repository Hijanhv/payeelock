export type Activity = {
  id: string;
  title: string;
  detail: string;
  time: string;
  kind: 'success' | 'blocked' | 'info';
  hash?: string;
  block?: string;
};
export type InvoiceView = {
  id: string;
  label: string;
  description: string;
  total: string;
  paid: string;
  remaining: string;
  beneficiary: string;
  epoch: number;
  nonce: number;
  status: 'Ready' | 'Frozen' | 'Paid' | 'Needs migration' | 'Cancelled';
  due: string;
};
export type WorkspaceState = {
  mode: 'anvil-test';
  chainId: number;
  contract: string;
  token: string;
  resolver: string;
  buyer: string;
  oldBeneficiary: string;
  newBeneficiary: string;
  recoverySigner: string;
  guardian: string;
  supplier: {
    id: string;
    name: string;
    node: string;
    epoch: number;
    frozen: boolean;
    beneficiary: string;
    endpoint: string;
  };
  invoices: InvoiceView[];
  protected: string;
  paid: string;
  oldBalance: string;
  newBalance: string;
  proposal: null | {
    invoiceIds: string[];
    fromEpoch: number;
    toEpoch: number;
    beneficiary: string;
    digest: string;
    signature: string;
    expiresAt: number;
  };
  activity: Activity[];
};
export type WorkspaceAction =
  | 'freeze'
  | 'propose'
  | 'migrate'
  | 'pay'
  | 'replay'
  | 'duplicate'
  | 'attack'
  | 'publish'
  | 'reset';
