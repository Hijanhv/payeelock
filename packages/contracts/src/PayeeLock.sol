// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IBeneficiaryResolver {
    function addr(bytes32 node) external view returns (address);
}

/// @notice Prefunded accounts payable with bilateral beneficiary recovery.
/// @dev Single buyer, fixed ERC20. No arbitrary-call or approval escape hatch.
///      ENS resolver is pinned at supplier enrollment; changes never redirect invoices.
contract PayeeLock is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Supplier {
        address beneficiary;
        address recoverySigner;
        address resolver;
        bytes32 node;
        uint64 epoch;
        bool frozen;
        bool exists;
    }

    struct Invoice {
        bytes32 supplierId;
        uint256 total;
        uint256 paid;
        address beneficiary;
        uint64 epoch;
        uint64 nonce;
        bool cancelled;
    }

    struct Payment {
        bytes32 invoiceId;
        uint256 amount;
        address beneficiary;
        uint64 epoch;
        uint64 nonce;
        uint256 deadline;
    }

    struct Migration {
        bytes32 supplierId;
        uint64 fromEpoch;
        uint64 toEpoch;
        address beneficiary;
        bytes32 invoiceIdsHash;
        uint256 nonce;
        uint256 deadline;
    }

    bytes32 public constant PAYMENT_TYPEHASH = keccak256(
        "Payment(bytes32 invoiceId,uint256 amount,address beneficiary,uint64 epoch,uint64 nonce,uint256 deadline)"
    );
    bytes32 public constant MIGRATION_TYPEHASH = keccak256(
        "Migration(bytes32 supplierId,uint64 fromEpoch,uint64 toEpoch,address beneficiary,bytes32 invoiceIdsHash,uint256 nonce,uint256 deadline)"
    );
    IERC20 public immutable TOKEN;
    address public immutable BUYER;
    address public executor;
    address public guardian;
    uint256 public reserved;
    mapping(bytes32 => Supplier) public suppliers;
    mapping(bytes32 => Invoice) public invoices;
    mapping(bytes32 => uint256) public migrationNonces;

    error Unauthorized();
    error InvalidInput();
    error AlreadyExists();
    error UnknownSupplier();
    error Frozen();
    error StaleAuthorization();
    error Overpayment();
    error Expired();
    error InvalidSignature();
    error ResolverMismatch();
    error InvalidMigration();
    error TokenAmountMismatch();

    event SupplierRegistered(
        bytes32 indexed supplierId, bytes32 indexed node, address beneficiary, address recoverySigner, address resolver
    );
    event InvoiceApproved(
        bytes32 indexed invoiceId, bytes32 indexed supplierId, uint256 total, address beneficiary, uint64 epoch
    );
    event SupplierFrozen(bytes32 indexed supplierId, uint64 epoch);
    event InvoiceMigrated(
        bytes32 indexed invoiceId, uint64 fromEpoch, uint64 toEpoch, address beneficiary, uint256 alreadyPaid
    );
    event RecoveryActivated(bytes32 indexed supplierId, uint64 epoch, address beneficiary);
    event InvoicePaid(
        bytes32 indexed invoiceId, address indexed beneficiary, uint256 amount, uint256 totalPaid, uint64 nonce
    );
    event InvoiceCancelled(bytes32 indexed invoiceId, uint256 refunded);
    event ExecutorChanged(address indexed executor);
    event GuardianChanged(address indexed guardian);

    constructor(IERC20 asset, address buyer_, address executor_, address guardian_) EIP712("PayeeLock", "1") {
        if (
            address(asset).code.length == 0 || buyer_ == address(0) || executor_ == address(0)
                || guardian_ == address(0)
        ) revert InvalidInput();
        TOKEN = asset;
        BUYER = buyer_;
        executor = executor_;
        guardian = guardian_;
    }

    modifier onlyBuyer() {
        if (msg.sender != BUYER) revert Unauthorized();
        _;
    }

    function setExecutor(address next) external onlyBuyer {
        if (next == address(0)) revert InvalidInput();
        executor = next;
        emit ExecutorChanged(next);
    }

    function setGuardian(address next) external onlyBuyer {
        if (next == address(0)) revert InvalidInput();
        guardian = next;
        emit GuardianChanged(next);
    }

    function registerSupplier(bytes32 id, address beneficiary, address recoverySigner, address resolver, bytes32 node)
        external
        onlyBuyer
    {
        if (
            id == bytes32(0) || beneficiary == address(0) || beneficiary == address(this)
                || recoverySigner == address(0) || resolver.code.length == 0
        ) revert InvalidInput();
        if (suppliers[id].exists) revert AlreadyExists();
        if (IBeneficiaryResolver(resolver).addr(node) != beneficiary) revert ResolverMismatch();
        suppliers[id] = Supplier(beneficiary, recoverySigner, resolver, node, 0, false, true);
        emit SupplierRegistered(id, node, beneficiary, recoverySigner, resolver);
    }

    function approveInvoice(bytes32 id, bytes32 supplierId, uint256 total) external onlyBuyer nonReentrant {
        Supplier memory s = suppliers[supplierId];
        if (!s.exists) revert UnknownSupplier();
        if (s.frozen) revert Frozen();
        if (id == bytes32(0) || total == 0) revert InvalidInput();
        if (invoices[id].total != 0) revert AlreadyExists();
        if (IBeneficiaryResolver(s.resolver).addr(s.node) != s.beneficiary) revert ResolverMismatch();
        uint256 beforeBalance = TOKEN.balanceOf(address(this));
        TOKEN.safeTransferFrom(BUYER, address(this), total);
        if (TOKEN.balanceOf(address(this)) != beforeBalance + total) revert TokenAmountMismatch();
        invoices[id] = Invoice(supplierId, total, 0, s.beneficiary, s.epoch, 0, false);
        reserved += total;
        emit InvoiceApproved(id, supplierId, total, s.beneficiary, s.epoch);
    }

    function freeze(bytes32 id) external nonReentrant {
        Supplier storage s = suppliers[id];
        if (!s.exists) revert UnknownSupplier();
        if (msg.sender != BUYER && msg.sender != s.recoverySigner && msg.sender != guardian) revert Unauthorized();
        s.frozen = true;
        emit SupplierFrozen(id, s.epoch);
    }

    function paymentDigest(Payment calldata p) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(abi.encode(PAYMENT_TYPEHASH, p.invoiceId, p.amount, p.beneficiary, p.epoch, p.nonce, p.deadline))
        );
    }

    function migrationDigest(Migration calldata m) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    MIGRATION_TYPEHASH,
                    m.supplierId,
                    m.fromEpoch,
                    m.toEpoch,
                    m.beneficiary,
                    m.invoiceIdsHash,
                    m.nonce,
                    m.deadline
                )
            )
        );
    }

    function pay(Payment calldata p, bytes calldata buyerSignature) external nonReentrant {
        if (msg.sender != executor && msg.sender != BUYER) revert Unauthorized();
        if (block.timestamp > p.deadline) revert Expired();
        Invoice storage i = invoices[p.invoiceId];
        Supplier memory s = suppliers[i.supplierId];
        if (i.total == 0 || i.cancelled) revert InvalidInput();
        if (s.frozen) revert Frozen();
        if (
            p.epoch != i.epoch || i.epoch != s.epoch || p.nonce != i.nonce || p.beneficiary != i.beneficiary
                || i.beneficiary != s.beneficiary
        ) revert StaleAuthorization();
        if (p.amount == 0 || p.amount > i.total - i.paid) revert Overpayment();
        if (IBeneficiaryResolver(s.resolver).addr(s.node) != i.beneficiary) revert ResolverMismatch();
        if (!SignatureChecker.isValidSignatureNow(BUYER, paymentDigest(p), buyerSignature)) revert InvalidSignature();
        i.paid += p.amount;
        i.nonce++;
        reserved -= p.amount;
        uint256 beforeBalance = TOKEN.balanceOf(i.beneficiary);
        TOKEN.safeTransfer(i.beneficiary, p.amount);
        if (TOKEN.balanceOf(i.beneficiary) != beforeBalance + p.amount) revert TokenAmountMismatch();
        emit InvoicePaid(p.invoiceId, i.beneficiary, p.amount, i.paid, i.nonce);
    }
    /// @notice Buyer transaction + recovery-signer typed signature are independent approvals.

    function migrate(Migration calldata m, bytes32[] calldata ids, bytes calldata recoverySignature)
        external
        onlyBuyer
        nonReentrant
    {
        Supplier storage s = suppliers[m.supplierId];
        if (!s.exists) revert UnknownSupplier();
        if (block.timestamp > m.deadline) revert Expired();
        if (
            ids.length == 0 || ids.length > 50 || m.beneficiary == address(0) || m.beneficiary == address(this)
                || m.invoiceIdsHash != keccak256(abi.encode(ids)) || m.nonce != migrationNonces[m.supplierId]
        ) revert InvalidMigration();
        bool activating = m.toEpoch == s.epoch + 1;
        if (activating) {
            if (!s.frozen || m.fromEpoch != s.epoch) revert InvalidMigration();
        } else if (s.frozen || m.toEpoch != s.epoch || m.fromEpoch >= s.epoch || m.beneficiary != s.beneficiary) {
            revert InvalidMigration();
        }
        if (IBeneficiaryResolver(s.resolver).addr(s.node) != m.beneficiary) revert ResolverMismatch();
        if (!SignatureChecker.isValidSignatureNow(s.recoverySigner, migrationDigest(m), recoverySignature)) {
            revert InvalidSignature();
        }
        migrationNonces[m.supplierId]++;
        if (activating) {
            s.epoch = m.toEpoch;
            s.beneficiary = m.beneficiary;
            s.frozen = false;
            emit RecoveryActivated(m.supplierId, m.toEpoch, m.beneficiary);
        }
        for (uint256 n; n < ids.length; n++) {
            Invoice storage i = invoices[ids[n]];
            if (
                i.total == 0 || i.cancelled || i.paid == i.total || i.supplierId != m.supplierId
                    || i.epoch != m.fromEpoch
            ) revert InvalidMigration();
            i.epoch = m.toEpoch;
            i.beneficiary = m.beneficiary;
            i.nonce++;
            emit InvoiceMigrated(ids[n], m.fromEpoch, m.toEpoch, m.beneficiary, i.paid);
        }
    }
    /// @notice Buyer can cancel unpaid remainder; this is not guaranteed-credit escrow.

    function cancelInvoice(bytes32 id) external onlyBuyer nonReentrant {
        Invoice storage i = invoices[id];
        if (i.total == 0 || i.cancelled || i.paid == i.total) revert InvalidInput();
        i.cancelled = true;
        i.nonce++;
        uint256 remainder = i.total - i.paid;
        reserved -= remainder;
        TOKEN.safeTransfer(BUYER, remainder);
        emit InvoiceCancelled(id, remainder);
    }
}
