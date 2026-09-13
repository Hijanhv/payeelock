// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PayeeLock} from "./PayeeLock.sol";
import {WorkspaceResolver} from "./WorkspaceResolver.sol";

/// @notice Permissionless entry point: the caller becomes the buyer of its own vault.
/// @dev Each workspace is an isolated PayeeLock deployment. There is no shared buyer,
///      no shared custody, and no admin over a workspace this contract did not create.
contract PayeeLockFactory {
    error InvalidInput();

    event WorkspaceCreated(
        address indexed vault,
        address indexed buyer,
        address indexed resolver,
        address asset,
        address guardian,
        address recoverySigner,
        address invoicePublisher
    );

    address[] private allVaults;
    mapping(address => address[]) private buyerVaults;

    /// @notice Deploy a vault owned by the caller plus a payout resolver for it.
    /// @param asset ERC-20 used to prefund invoices. Must be a deployed contract.
    /// @param guardian Address allowed to pause, and nothing else.
    /// @param recoverySigner Address that must sign every recovery proposal.
    /// @param invoicePublisher Address allowed to maintain invoice metadata only.
    function createWorkspace(IERC20 asset, address guardian, address recoverySigner, address invoicePublisher)
        external
        returns (PayeeLock vault, WorkspaceResolver resolver)
    {
        if (
            address(asset) == address(0) || address(asset).code.length == 0 || guardian == address(0)
                || recoverySigner == address(0) || invoicePublisher == address(0)
        ) revert InvalidInput();

        vault = new PayeeLock(asset, msg.sender, msg.sender, guardian);
        resolver = new WorkspaceResolver(recoverySigner, invoicePublisher);

        allVaults.push(address(vault));
        buyerVaults[msg.sender].push(address(vault));

        emit WorkspaceCreated(
            address(vault), msg.sender, address(resolver), address(asset), guardian, recoverySigner, invoicePublisher
        );
    }

    function vaultCount() external view returns (uint256) {
        return allVaults.length;
    }

    function vaultAt(uint256 index) external view returns (address) {
        return allVaults[index];
    }

    function vaultsOf(address buyer) external view returns (address[] memory) {
        return buyerVaults[buyer];
    }
}
