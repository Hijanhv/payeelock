import { Address, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts';
import {
  ExecutorChanged,
  GuardianChanged,
  InvoiceApproved,
  InvoiceCancelled,
  InvoiceMigrated,
  InvoicePaid,
  RecoveryActivated,
  SupplierFrozen,
  SupplierRegistered,
} from '../generated/PayeeLock/PayeeLock';
import { Invoice, PayeeLockEvent, Supplier } from '../generated/schema';

function eventId(event: ethereum.Event): Bytes {
  return event.transaction.hash.concatI32(event.logIndex.toI32());
}

function baseEvent(event: ethereum.Event, kind: string): PayeeLockEvent {
  const entity = new PayeeLockEvent(eventId(event));
  entity.kind = kind;
  entity.actor = event.transaction.from;
  entity.transaction = event.transaction.hash;
  entity.block = event.block.number;
  entity.timestamp = event.block.timestamp;
  return entity;
}

export function handleSupplierRegistered(event: SupplierRegistered): void {
  const supplier = new Supplier(event.params.supplierId);
  supplier.node = event.params.node;
  supplier.beneficiary = event.params.beneficiary;
  supplier.recoverySigner = event.params.recoverySigner;
  supplier.resolver = event.params.resolver;
  supplier.epoch = BigInt.zero();
  supplier.frozen = false;
  supplier.registeredAtBlock = event.block.number;
  supplier.registeredTransaction = event.transaction.hash;
  supplier.save();

  const activity = baseEvent(event, 'SupplierRegistered');
  activity.supplierId = event.params.supplierId;
  activity.beneficiary = event.params.beneficiary;
  activity.epoch = BigInt.zero();
  activity.save();
}

export function handleInvoiceApproved(event: InvoiceApproved): void {
  const invoice = new Invoice(event.params.invoiceId);
  invoice.supplier = event.params.supplierId;
  invoice.total = event.params.total;
  invoice.paid = BigInt.zero();
  invoice.beneficiary = event.params.beneficiary;
  invoice.epoch = event.params.epoch;
  invoice.nonce = BigInt.zero();
  invoice.cancelled = false;
  invoice.approvedAtBlock = event.block.number;
  invoice.approvedTransaction = event.transaction.hash;
  invoice.save();

  const activity = baseEvent(event, 'InvoiceApproved');
  activity.supplierId = event.params.supplierId;
  activity.invoiceId = event.params.invoiceId;
  activity.beneficiary = event.params.beneficiary;
  activity.amount = event.params.total;
  activity.epoch = event.params.epoch;
  activity.nonce = BigInt.zero();
  activity.save();
}

export function handleSupplierFrozen(event: SupplierFrozen): void {
  const supplier = Supplier.load(event.params.supplierId);
  if (supplier) {
    supplier.frozen = true;
    supplier.save();
  }
  const activity = baseEvent(event, 'SupplierFrozen');
  activity.supplierId = event.params.supplierId;
  activity.epoch = event.params.epoch;
  activity.save();
}

export function handleRecoveryActivated(event: RecoveryActivated): void {
  const supplier = Supplier.load(event.params.supplierId);
  if (supplier) {
    supplier.beneficiary = event.params.beneficiary;
    supplier.epoch = event.params.epoch;
    supplier.frozen = false;
    supplier.save();
  }
  const activity = baseEvent(event, 'RecoveryActivated');
  activity.supplierId = event.params.supplierId;
  activity.beneficiary = event.params.beneficiary;
  activity.epoch = event.params.epoch;
  activity.save();
}

export function handleInvoiceMigrated(event: InvoiceMigrated): void {
  const invoice = Invoice.load(event.params.invoiceId);
  if (invoice) {
    invoice.beneficiary = event.params.beneficiary;
    invoice.epoch = event.params.toEpoch;
    invoice.nonce = invoice.nonce.plus(BigInt.fromI32(1));
    invoice.save();
  }
  const activity = baseEvent(event, 'InvoiceMigrated');
  activity.invoiceId = event.params.invoiceId;
  activity.beneficiary = event.params.beneficiary;
  activity.amount = event.params.alreadyPaid;
  activity.epoch = event.params.toEpoch;
  activity.nonce = invoice ? invoice.nonce : null;
  activity.save();
}

export function handleInvoicePaid(event: InvoicePaid): void {
  const invoice = Invoice.load(event.params.invoiceId);
  if (invoice) {
    invoice.paid = event.params.totalPaid;
    invoice.nonce = event.params.nonce;
    invoice.save();
  }
  const activity = baseEvent(event, 'InvoicePaid');
  activity.invoiceId = event.params.invoiceId;
  activity.beneficiary = event.params.beneficiary;
  activity.amount = event.params.amount;
  activity.nonce = event.params.nonce;
  activity.save();
}

export function handleInvoiceCancelled(event: InvoiceCancelled): void {
  const invoice = Invoice.load(event.params.invoiceId);
  if (invoice) {
    invoice.cancelled = true;
    invoice.nonce = invoice.nonce.plus(BigInt.fromI32(1));
    invoice.save();
  }
  const activity = baseEvent(event, 'InvoiceCancelled');
  activity.invoiceId = event.params.invoiceId;
  activity.amount = event.params.refunded;
  activity.nonce = invoice ? invoice.nonce : null;
  activity.save();
}

export function handleExecutorChanged(event: ExecutorChanged): void {
  const activity = baseEvent(event, 'ExecutorChanged');
  activity.beneficiary = event.params.executor;
  activity.save();
}

export function handleGuardianChanged(event: GuardianChanged): void {
  const activity = baseEvent(event, 'GuardianChanged');
  activity.beneficiary = event.params.guardian;
  activity.save();
}
