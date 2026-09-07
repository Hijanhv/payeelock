// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PayeeLock} from "../src/PayeeLock.sol";
import {TestUSD, TestResolver} from "../src/TestFixtures.sol";

contract PayeeLockTest is Test {
    PayeeLock vault;
    TestUSD usd;
    TestResolver resolver;
    uint256 buyerKey = 101;
    uint256 recoveryKey = 202;
    address buyer;
    address recovery;
    address executor = address(3);
    address guardian = address(7);
    address oldPayee = address(4);
    address newPayee = address(5);
    address publisher = address(6);
    bytes32 supplier = keccak256("harbor-systems");
    bytes32 node = keccak256("harbor.payeelock.eth");
    bytes32 inv1 = keccak256("INV-001");
    bytes32 inv2 = keccak256("INV-002");

    function setUp() public {
        buyer = vm.addr(buyerKey);
        recovery = vm.addr(recoveryKey);
        usd = new TestUSD(buyer);
        resolver = new TestResolver(recovery, publisher);
        vm.prank(recovery);
        resolver.setAddr(node, oldPayee);
        vault = new PayeeLock(usd, buyer, executor, guardian);
        vm.startPrank(buyer);
        vault.registerSupplier(supplier, oldPayee, recovery, address(resolver), node);
        usd.approve(address(vault), type(uint256).max);
        vault.approveInvoice(inv1, supplier, 100e6);
        vault.approveInvoice(inv2, supplier, 50e6);
        vm.stopPrank();
    }

    function sig(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function payment(bytes32 id, uint256 amount, uint64 epoch, uint64 nonce, address to)
        internal
        view
        returns (PayeeLock.Payment memory)
    {
        return PayeeLock.Payment(id, amount, to, epoch, nonce, block.timestamp + 1 days);
    }

    function pay(PayeeLock.Payment memory p) internal {
        bytes memory signature = sig(buyerKey, vault.paymentDigest(p));
        vm.prank(executor);
        vault.pay(p, signature);
    }

    function migration(bytes32[] memory ids) internal view returns (PayeeLock.Migration memory) {
        return PayeeLock.Migration(supplier, 0, 1, newPayee, keccak256(abi.encode(ids)), 0, block.timestamp + 1 days);
    }

    function prepareRecovery() internal {
        vm.prank(recovery);
        vault.freeze(supplier);
        vm.prank(recovery);
        resolver.setAddr(node, newPayee);
    }

    function testRecoveryPreservesPartialPaymentAndBlocksOldJob() public {
        pay(payment(inv1, 20e6, 0, 0, oldPayee));
        PayeeLock.Payment memory oldJob = payment(inv1, 80e6, 0, 1, oldPayee);
        bytes memory oldSig = sig(buyerKey, vault.paymentDigest(oldJob));
        prepareRecovery();
        bytes32[] memory ids = new bytes32[](2);
        ids[0] = inv1;
        ids[1] = inv2;
        PayeeLock.Migration memory m = migration(ids);
        bytes memory signed = sig(recoveryKey, vault.migrationDigest(m));
        vm.prank(buyer);
        vault.migrate(m, ids, signed);
        vm.expectRevert(PayeeLock.StaleAuthorization.selector);
        vm.prank(executor);
        vault.pay(oldJob, oldSig);
        pay(payment(inv1, 80e6, 1, 2, newPayee));
        pay(payment(inv2, 50e6, 1, 1, newPayee));
        assertEq(usd.balanceOf(oldPayee), 20e6);
        assertEq(usd.balanceOf(newPayee), 130e6);
        assertEq(vault.reserved(), 0);
        assertEq(usd.balanceOf(address(vault)), 0);
    }

    function testFrozenOldSignatureCannotExecute() public {
        PayeeLock.Payment memory p = payment(inv1, 100e6, 0, 0, oldPayee);
        bytes memory signed = sig(buyerKey, vault.paymentDigest(p));
        vm.prank(recovery);
        vault.freeze(supplier);
        vm.expectRevert(PayeeLock.Frozen.selector);
        vm.prank(executor);
        vault.pay(p, signed);
    }

    function testPublisherCannotRedirectResolver() public {
        vm.prank(publisher);
        resolver.setInvoiceEndpoint(node, "https://invoices.example");
        vm.expectRevert(TestResolver.UnauthorizedRecord.selector);
        vm.prank(publisher);
        resolver.setAddr(node, newPayee);
        assertEq(resolver.addr(node), oldPayee);
    }

    function testMutableResolverChangeBlocksInsteadOfRedirecting() public {
        vm.prank(recovery);
        resolver.setAddr(node, newPayee);
        PayeeLock.Payment memory p = payment(inv1, 100e6, 0, 0, oldPayee);
        bytes memory signed = sig(buyerKey, vault.paymentDigest(p));
        vm.expectRevert(PayeeLock.ResolverMismatch.selector);
        vm.prank(executor);
        vault.pay(p, signed);
        assertEq(usd.balanceOf(newPayee), 0);
    }

    function testUnauthorizedExecutorAndInvalidBuyerSignature() public {
        PayeeLock.Payment memory p = payment(inv1, 100e6, 0, 0, oldPayee);
        bytes memory signed = sig(buyerKey, vault.paymentDigest(p));
        vm.expectRevert(PayeeLock.Unauthorized.selector);
        vm.prank(publisher);
        vault.pay(p, signed);
        signed = sig(recoveryKey, vault.paymentDigest(p));
        vm.expectRevert(PayeeLock.InvalidSignature.selector);
        vm.prank(executor);
        vault.pay(p, signed);
    }

    function testCannotReplayOrOverpay() public {
        PayeeLock.Payment memory p = payment(inv1, 60e6, 0, 0, oldPayee);
        pay(p);
        bytes memory signed = sig(buyerKey, vault.paymentDigest(p));
        vm.expectRevert(PayeeLock.StaleAuthorization.selector);
        vm.prank(executor);
        vault.pay(p, signed);
        p = payment(inv1, 41e6, 0, 1, oldPayee);
        signed = sig(buyerKey, vault.paymentDigest(p));
        vm.expectRevert(PayeeLock.Overpayment.selector);
        vm.prank(executor);
        vault.pay(p, signed);
    }

    function testExpiredPayment() public {
        PayeeLock.Payment memory p = payment(inv1, 100e6, 0, 0, oldPayee);
        bytes memory signed = sig(buyerKey, vault.paymentDigest(p));
        vm.warp(p.deadline + 1);
        vm.expectRevert(PayeeLock.Expired.selector);
        vm.prank(executor);
        vault.pay(p, signed);
    }

    function testMigrationRequiresBothPartiesAndExactList() public {
        prepareRecovery();
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = inv1;
        PayeeLock.Migration memory m = migration(ids);
        bytes memory signed = sig(recoveryKey, vault.migrationDigest(m));
        vm.expectRevert(PayeeLock.Unauthorized.selector);
        vm.prank(recovery);
        vault.migrate(m, ids, signed);
        ids[0] = inv2;
        vm.expectRevert(PayeeLock.InvalidMigration.selector);
        vm.prank(buyer);
        vault.migrate(m, ids, signed);
        ids[0] = inv1;
        signed = sig(buyerKey, vault.migrationDigest(m));
        vm.expectRevert(PayeeLock.InvalidSignature.selector);
        vm.prank(buyer);
        vault.migrate(m, ids, signed);
    }

    function testDuplicateMigrationIdsRevertAtomically() public {
        prepareRecovery();
        bytes32[] memory ids = new bytes32[](2);
        ids[0] = inv1;
        ids[1] = inv1;
        PayeeLock.Migration memory m = migration(ids);
        bytes memory signed = sig(recoveryKey, vault.migrationDigest(m));
        vm.expectRevert(PayeeLock.InvalidMigration.selector);
        vm.prank(buyer);
        vault.migrate(m, ids, signed);
        assertEq(vault.migrationNonces(supplier), 0);
        (,,,, uint64 epoch,,) = vault.invoices(inv1);
        assertEq(epoch, 0);
    }

    function testCancelledInvoiceRefundsOnlyRemainderAndCannotRevive() public {
        pay(payment(inv1, 20e6, 0, 0, oldPayee));
        uint256 beforeBalance = usd.balanceOf(buyer);
        vm.prank(buyer);
        vault.cancelInvoice(inv1);
        assertEq(usd.balanceOf(buyer) - beforeBalance, 80e6);
        assertEq(vault.reserved(), 50e6);
        prepareRecovery();
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = inv1;
        PayeeLock.Migration memory m = migration(ids);
        bytes memory signed = sig(recoveryKey, vault.migrationDigest(m));
        vm.expectRevert(PayeeLock.InvalidMigration.selector);
        vm.prank(buyer);
        vault.migrate(m, ids, signed);
    }

    function testCrossDeploymentSignatureCannotReplay() public {
        PayeeLock other = new PayeeLock(usd, buyer, executor, guardian);
        PayeeLock.Payment memory p = payment(inv1, 100e6, 0, 0, oldPayee);
        assertTrue(vault.paymentDigest(p) != other.paymentDigest(p));
    }

    function testFuzzPartialPaymentConservesFunds(uint96 first, uint96 second) public {
        uint256 a = bound(first, 1, 100e6 - 1);
        uint256 b = bound(second, 1, 100e6 - a);
        pay(payment(inv1, a, 0, 0, oldPayee));
        pay(payment(inv1, b, 0, 1, oldPayee));
        assertEq(usd.balanceOf(oldPayee), a + b);
        assertEq(usd.balanceOf(address(vault)), 150e6 - a - b);
        assertEq(vault.reserved(), 150e6 - a - b);
    }

    function testUnselectedInvoicesStayBlockedUntilSeparateBatchApproval() public {
        prepareRecovery();
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = inv1;
        PayeeLock.Migration memory m = migration(ids);
        bytes memory signed = sig(recoveryKey, vault.migrationDigest(m));
        vm.prank(buyer);
        vault.migrate(m, ids, signed);
        PayeeLock.Payment memory oldJob = payment(inv2, 50e6, 0, 0, oldPayee);
        bytes memory oldSig = sig(buyerKey, vault.paymentDigest(oldJob));
        vm.expectRevert(PayeeLock.StaleAuthorization.selector);
        vm.prank(executor);
        vault.pay(oldJob, oldSig);
        vm.expectRevert(PayeeLock.InvalidMigration.selector);
        vm.prank(buyer);
        vault.migrate(m, ids, signed);
        ids[0] = inv2;
        m = migration(ids);
        m.nonce = 1;
        signed = sig(recoveryKey, vault.migrationDigest(m));
        vm.prank(buyer);
        vault.migrate(m, ids, signed);
        pay(payment(inv1, 100e6, 1, 1, newPayee));
        pay(payment(inv2, 50e6, 1, 1, newPayee));
        assertEq(vault.reserved(), 0);
        assertEq(usd.balanceOf(newPayee), 150e6);
        assertEq(vault.migrationNonces(supplier), 2);
    }

    function testExpiredRecoveryCannotChangeEpochOrFunds() public {
        prepareRecovery();
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = inv1;
        PayeeLock.Migration memory m = migration(ids);
        bytes memory signed = sig(recoveryKey, vault.migrationDigest(m));
        vm.warp(m.deadline + 1);
        vm.expectRevert(PayeeLock.Expired.selector);
        vm.prank(buyer);
        vault.migrate(m, ids, signed);
        assertEq(vault.reserved(), 150e6);
        assertEq(vault.migrationNonces(supplier), 0);
        (,,,, uint64 epoch, bool frozen,) = vault.suppliers(supplier);
        assertEq(epoch, 0);
        assertTrue(frozen);
    }

    function testChangedChainRejectsPreviouslyValidSignature() public {
        PayeeLock.Payment memory p = payment(inv1, 100e6, 0, 0, oldPayee);
        bytes memory signed = sig(buyerKey, vault.paymentDigest(p));
        vm.chainId(block.chainid + 1);
        vm.expectRevert(PayeeLock.InvalidSignature.selector);
        vm.prank(executor);
        vault.pay(p, signed);
        assertEq(vault.reserved(), 150e6);
        assertEq(usd.balanceOf(oldPayee), 0);
    }

    function testGuardianCanFreezeButCannotMoveFundsOrChangeAuthority() public {
        vm.prank(guardian);
        vault.freeze(supplier);
        (,,,,, bool frozen,) = vault.suppliers(supplier);
        assertTrue(frozen);

        vm.expectRevert(PayeeLock.Unauthorized.selector);
        vm.prank(guardian);
        vault.setExecutor(guardian);

        vm.expectRevert(PayeeLock.Unauthorized.selector);
        vm.prank(guardian);
        vault.setGuardian(oldPayee);

        vm.expectRevert(PayeeLock.Unauthorized.selector);
        vm.prank(guardian);
        vault.cancelInvoice(inv1);

        PayeeLock.Payment memory p = payment(inv1, 100e6, 0, 0, oldPayee);
        bytes memory signed = sig(buyerKey, vault.paymentDigest(p));
        vm.expectRevert(PayeeLock.Unauthorized.selector);
        vm.prank(guardian);
        vault.pay(p, signed);
    }

    function testBuyerCanRotateGuardianAndOldGuardianLosesAccess() public {
        address next = address(8);
        vm.prank(buyer);
        vault.setGuardian(next);
        assertEq(vault.guardian(), next);

        vm.expectRevert(PayeeLock.Unauthorized.selector);
        vm.prank(guardian);
        vault.freeze(supplier);

        vm.prank(next);
        vault.freeze(supplier);
        (,,,,, bool frozen,) = vault.suppliers(supplier);
        assertTrue(frozen);
    }
}
