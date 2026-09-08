import { Address, Bytes, ethereum } from '@graphprotocol/graph-ts';
import {
  AddrChanged,
  AddressChanged,
  EACRolesChanged,
  TextChanged,
} from '../generated/PermissionedResolver/PermissionedResolver';
import { EnsActivity } from '../generated/schema';

function eventId(event: ethereum.Event): Bytes {
  return event.transaction.hash.concatI32(event.logIndex.toI32());
}

function baseEvent(event: ethereum.Event, kind: string): EnsActivity {
  const entity = new EnsActivity(eventId(event));
  entity.kind = kind;
  entity.transaction = event.transaction.hash;
  entity.actor = event.transaction.from;
  entity.block = event.block.number;
  entity.timestamp = event.block.timestamp;
  return entity;
}

export function handleAddrChanged(event: AddrChanged): void {
  const activity = baseEvent(event, 'AddrChanged');
  activity.node = event.params.node;
  activity.addressValue = event.params.a;
  activity.save();
}

export function handleAddressChanged(event: AddressChanged): void {
  const activity = baseEvent(event, 'AddressChanged');
  activity.node = event.params.node;
  activity.coinType = event.params.coinType;
  activity.addressValue = event.params.newAddress;
  activity.save();
}

export function handleRolesChanged(event: EACRolesChanged): void {
  const activity = baseEvent(event, 'EACRolesChanged');
  activity.resource = event.params.resource;
  activity.account = event.params.account;
  activity.oldRoles = event.params.oldRoleBitmap;
  activity.newRoles = event.params.newRoleBitmap;
  activity.save();
}

export function handleTextChanged(event: TextChanged): void {
  const activity = baseEvent(event, 'TextChanged');
  activity.node = event.params.node;
  activity.textKey = event.params.key;
  activity.textValue = event.params.value;
  activity.save();
}
