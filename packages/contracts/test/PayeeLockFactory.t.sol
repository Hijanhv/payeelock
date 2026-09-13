// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PayeeLock} from "../src/PayeeLock.sol";
import {PayeeLockFactory} from "../src/PayeeLockFactory.sol";
import {WorkspaceResolver} from "../src/WorkspaceResolver.sol";
import {TestUSD} from "../src/TestFixtures.sol";

contract PayeeLockFactoryTest is Test {
    PayeeLockFactory factory;
    TestUSD usd;
    PayeeLock vault;
    WorkspaceResolver resolver;

    uint256 buyerKey = 101;
    uint256 recoveryKey = 202;
    address buyer;
    address recovery;
    address publisher = address(6);
    address guardian = address(7);
    address oldPayee = address(4);
    address newPayee = address(5);
    address stranger = address(9);

    bytes32 supplier = keccak256("acme-cloud");
    bytes32 node = keccak256("acme.workspace.local");
    bytes32 inv1 = keccak256("WS-001");

    function setUp() public {
        buyer = vm.addr(buyerKey);
        recovery = vm.addr(recoveryKey);
        usd = new TestUSD(address(this));
        factory = new PayeeLockFactory();
        vm.prank(buyer);
        (vault, resolver) = factory.createWorkspace(usd, guardian, recovery, publisher);
        usd.mint(buyer, 1000e6);
    }

    function sig(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function enrol() internal {
        vm.prank(recovery);
        resolver.setAddr(node, oldPayee);
        vm.startPrank(buyer);
        usd.approve(address(vault), type(uint256).max);
        vault.registerSupplier(supplier, oldPayee, recovery, address(resolver), node);
        vault.approveInvoice(inv1, supplier, 100e6);
        vm.stopPrank();
    }

    function testCallerBecomesBuyerOfItsOwnVault() public {
        assertEq(vault.BUYER(), buyer);
        assertEq(vault.guardian(), guardian);
        assertEq(resolver.ADDRESS_AUTHORITY(), recovery);
        assertEq(resolver.INVOICE_PUBLISHER(), publisher);
        assertEq(factory.vaultCount(), 1);
        assertEq(factory.vaultsOf(buyer).length, 1);
    }

    function testAnyoneCanCreateAndStrangersCannotSpend() public {
        vm.prank(stranger);
        (PayeeLock other,) = factory.createWorkspace(usd, guardian, recovery, publisher);
        assertEq(other.BUYER(), stranger);
        assertEq(factory.vaultCount(), 2);

        enrol();
        vm.expectRevert(PayeeLock.Unauthorized.selector);
        vm.prank(stranger);
        vault.approveInvoice(keccak256("WS-999"), supplier, 1e6);

        vm.expectRevert(PayeeLock.Unauthorized.selector);
        vm.prank(stranger);
        vault.cancelInvoice(inv1);
    }

    function testResolverSeparatesAddressFromInvoiceAuthority() public {
        vm.prank(publisher);
        resolver.setInvoiceEndpoint(node, "https://invoices.acme.example");
        assertEq(resolver.invoiceEndpoint(node), "https://invoices.acme.example");

        vm.expectRevert(WorkspaceResolver.UnauthorizedRecord.selector);
        vm.prank(publisher);
        resolver.setAddr(node, newPayee);
        assertEq(resolver.addr(node), address(0));

        vm.prank(recovery);
        resolver.setAddr(node, oldPayee);
        assertEq(resolver.addr(node), oldPayee);
    }

    function testRegistrationRejectsBeneficiaryThatResolverDoesNotServe() public {
        vm.expectRevert(PayeeLock.ResolverMismatch.selector);
        vm.prank(buyer);
        vault.registerSupplier(supplier, newPayee, recovery, address(resolver), node);
    }

    function testInvalidInputsRevert() public {
        vm.expectRevert(PayeeLockFactory.InvalidInput.selector);
        vm.prank(buyer);
        factory.createWorkspace(usd, address(0), recovery, publisher);

        vm.expectRevert(PayeeLockFactory.InvalidInput.selector);
        vm.prank(buyer);
        factory.createWorkspace(usd, guardian, address(0), publisher);

        vm.expectRevert(PayeeLockFactory.InvalidInput.selector);
        vm.prank(buyer);
        factory.createWorkspace(usd, guardian, recovery, address(0));

        vm.expectRevert(PayeeLockFactory.InvalidInput.selector);
        vm.prank(buyer);
        factory.createWorkspace(TestUSD(address(0xdead)), guardian, recovery, publisher);
    }

    function testFullLifecycleOnFactoryWorkspace() public {
        enrol();

        PayeeLock.Payment memory first = PayeeLock.Payment(inv1, 40e6, oldPayee, 0, 0, block.timestamp + 1 days);
        bytes memory firstSig = sig(buyerKey, vault.paymentDigest(first));
        vm.prank(buyer);
        vault.pay(first, firstSig);
        assertEq(usd.balanceOf(oldPayee), 40e6);
        assertEq(vault.reserved(), 60e6);

        vm.prank(recovery);
        vault.freeze(supplier);
        vm.prank(recovery);
        resolver.setAddr(node, newPayee);

        bytes32[] memory ids = new bytes32[](1);
        ids[0] = inv1;
        PayeeLock.Migration memory m =
            PayeeLock.Migration(supplier, 0, 1, newPayee, keccak256(abi.encode(ids)), 0, block.timestamp + 1 days);
        bytes memory migrationSig = sig(recoveryKey, vault.migrationDigest(m));
        vm.prank(buyer);
        vault.migrate(m, ids, migrationSig);

        PayeeLock.Payment memory stale = PayeeLock.Payment(inv1, 60e6, oldPayee, 0, 2, block.timestamp + 1 days);
        bytes memory staleSig = sig(buyerKey, vault.paymentDigest(stale));
        vm.expectRevert(PayeeLock.StaleAuthorization.selector);
        vm.prank(buyer);
        vault.pay(stale, staleSig);

        PayeeLock.Payment memory settled = PayeeLock.Payment(inv1, 60e6, newPayee, 1, 2, block.timestamp + 1 days);
        bytes memory settledSig = sig(buyerKey, vault.paymentDigest(settled));
        vm.prank(buyer);
        vault.pay(settled, settledSig);

        assertEq(usd.balanceOf(oldPayee), 40e6);
        assertEq(usd.balanceOf(newPayee), 60e6);
        assertEq(vault.reserved(), 0);
        assertEq(usd.balanceOf(address(vault)), 0);
    }
}
