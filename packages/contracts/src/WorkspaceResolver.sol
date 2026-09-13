// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Payout resolver for workspaces that do not use an ENSv2 name.
/// @dev Two authorities: ADDRESS_AUTHORITY may change the payout address,
///      INVOICE_PUBLISHER may only maintain invoice metadata. This mirrors the
///      separation the ENSv2 Permissioned Resolver enforces for the ENS case.
contract WorkspaceResolver {
    address public immutable ADDRESS_AUTHORITY;
    address public immutable INVOICE_PUBLISHER;
    mapping(bytes32 => address) public addr;
    mapping(bytes32 => string) public invoiceEndpoint;

    error UnauthorizedRecord();
    error InvalidAuthority();

    event AddrChanged(bytes32 indexed node, address beneficiary);
    event InvoiceEndpointChanged(bytes32 indexed node, string endpoint);

    constructor(address addressAuthority, address invoicePublisher) {
        if (addressAuthority == address(0) || invoicePublisher == address(0)) revert InvalidAuthority();
        ADDRESS_AUTHORITY = addressAuthority;
        INVOICE_PUBLISHER = invoicePublisher;
    }

    function setAddr(bytes32 node, address beneficiary) external {
        if (msg.sender != ADDRESS_AUTHORITY) revert UnauthorizedRecord();
        addr[node] = beneficiary;
        emit AddrChanged(node, beneficiary);
    }

    function setInvoiceEndpoint(bytes32 node, string calldata endpoint) external {
        if (msg.sender != INVOICE_PUBLISHER && msg.sender != ADDRESS_AUTHORITY) revert UnauthorizedRecord();
        invoiceEndpoint[node] = endpoint;
        emit InvoiceEndpointChanged(node, endpoint);
    }
}
