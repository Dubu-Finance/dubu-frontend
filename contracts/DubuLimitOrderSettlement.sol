// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title DubuLimitOrderSettlement
/// @notice Non-custodial settlement for EIP-712 signed, full-fill limit orders.
/// @dev The contract never stores user funds between transactions. An authorized executor supplies
///      fresh Dubu Router calldata, while the signed minAmountOut remains the user's final guard.
contract DubuLimitOrderSettlement {
    struct Order {
        address maker;
        address receiver;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        uint64 validAfter;
        uint64 expiry;
        uint256 nonce;
        uint256 salt;
        uint16 maxFeeBps;
    }

    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "Order(address maker,address receiver,address tokenIn,address tokenOut,uint256 amountIn,uint256 minAmountOut,uint64 validAfter,uint64 expiry,uint256 nonce,uint256 salt,uint16 maxFeeBps)"
    );
    bytes32 private constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant NAME_HASH = keccak256("Dubu Limit Orders");
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 private constant SECP256K1_HALF_N =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;
    uint16 public constant MAX_PROTOCOL_FEE_BPS = 100;

    address public immutable router;
    address public owner;
    address public feeRecipient;
    uint16 public feeBps;

    mapping(address => bool) public executors;
    mapping(bytes32 => bool) public filled;
    mapping(bytes32 => bool) public cancelled;
    mapping(address => uint256) public minNonce;

    uint256 private locked = 1;

    event ExecutorUpdated(address indexed executor, bool allowed);
    event OwnershipTransferred(address indexed previousOwner, address indexed nextOwner);
    event FeeConfigurationUpdated(address indexed recipient, uint16 feeBps);
    event OrderCancelled(bytes32 indexed orderHash, address indexed maker);
    event NonceInvalidated(address indexed maker, uint256 newMinNonce);
    event OrderFilled(
        bytes32 indexed orderHash,
        address indexed maker,
        address indexed receiver,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 grossAmountOut,
        uint256 netAmountOut,
        uint256 protocolFee,
        address executor
    );

    error AlreadyCancelled();
    error AlreadyFilled();
    error BadRouter();
    error FeeTooHigh();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidNonce();
    error InvalidSignature();
    error NotExecutor();
    error NotMaker();
    error NotOwner();
    error OrderExpired();
    error OrderNotActive();
    error Reentrancy();
    error RouterCallFailed(bytes reason);
    error SlippageExceeded(uint256 received, uint256 minimum);
    error TokenCallFailed(address token, bytes data);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyExecutor() {
        if (!executors[msg.sender]) revert NotExecutor();
        _;
    }

    modifier nonReentrant() {
        if (locked != 1) revert Reentrancy();
        locked = 2;
        _;
        locked = 1;
    }

    constructor(address router_, address feeRecipient_, address initialExecutor) {
        if (router_ == address(0) || feeRecipient_ == address(0) || initialExecutor == address(0)) {
            revert InvalidAddress();
        }
        router = router_;
        owner = msg.sender;
        feeRecipient = feeRecipient_;
        executors[initialExecutor] = true;
        emit OwnershipTransferred(address(0), msg.sender);
        emit ExecutorUpdated(initialExecutor, true);
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                NAME_HASH,
                VERSION_HASH,
                block.chainid,
                address(this)
            )
        );
    }

    function hashOrder(Order calldata order) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                ORDER_TYPEHASH,
                order.maker,
                order.receiver,
                order.tokenIn,
                order.tokenOut,
                order.amountIn,
                order.minAmountOut,
                order.validAfter,
                order.expiry,
                order.nonce,
                order.salt,
                order.maxFeeBps
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    function fillOrder(
        Order calldata order,
        bytes calldata signature,
        bytes calldata routerCalldata
    ) external onlyExecutor nonReentrant returns (uint256 netAmountOut) {
        if (
            order.maker == address(0) ||
            order.receiver == address(0) ||
            order.tokenIn == address(0) ||
            order.tokenOut == address(0)
        ) revert InvalidAddress();
        if (order.tokenIn == order.tokenOut) revert InvalidAddress();
        if (order.amountIn == 0 || order.minAmountOut == 0) revert InvalidAmount();
        if (block.timestamp < order.validAfter) revert OrderNotActive();
        if (block.timestamp >= order.expiry) revert OrderExpired();
        if (order.nonce < minNonce[order.maker]) revert InvalidNonce();
        if (feeBps > order.maxFeeBps) revert FeeTooHigh();

        bytes32 orderHash = hashOrder(order);
        if (filled[orderHash]) revert AlreadyFilled();
        if (cancelled[orderHash]) revert AlreadyCancelled();
        if (_recover(orderHash, signature) != order.maker) revert InvalidSignature();

        // Mark before all external calls. Any downstream revert rolls this write back atomically.
        filled[orderHash] = true;

        uint256 tokenInBefore = _balanceOf(order.tokenIn, address(this));
        uint256 tokenOutBefore = _balanceOf(order.tokenOut, address(this));
        _safeTransferFrom(order.tokenIn, order.maker, address(this), order.amountIn);
        _forceApprove(order.tokenIn, router, order.amountIn);

        (bool success, bytes memory result) = router.call(routerCalldata);
        if (!success) revert RouterCallFailed(result);
        _forceApprove(order.tokenIn, router, 0);

        uint256 tokenOutAfter = _balanceOf(order.tokenOut, address(this));
        uint256 grossAmountOut = tokenOutAfter - tokenOutBefore;
        uint256 protocolFee = (grossAmountOut * feeBps) / 10_000;
        netAmountOut = grossAmountOut - protocolFee;
        if (netAmountOut < order.minAmountOut) {
            revert SlippageExceeded(netAmountOut, order.minAmountOut);
        }

        if (protocolFee != 0) _safeTransfer(order.tokenOut, feeRecipient, protocolFee);
        _safeTransfer(order.tokenOut, order.receiver, netAmountOut);

        uint256 tokenInAfter = _balanceOf(order.tokenIn, address(this));
        if (tokenInAfter > tokenInBefore) {
            _safeTransfer(order.tokenIn, order.maker, tokenInAfter - tokenInBefore);
        }

        emit OrderFilled(
            orderHash,
            order.maker,
            order.receiver,
            order.tokenIn,
            order.tokenOut,
            order.amountIn,
            grossAmountOut,
            netAmountOut,
            protocolFee,
            msg.sender
        );
    }

    function cancelOrder(Order calldata order) external {
        if (msg.sender != order.maker) revert NotMaker();
        bytes32 orderHash = hashOrder(order);
        if (filled[orderHash]) revert AlreadyFilled();
        if (cancelled[orderHash]) revert AlreadyCancelled();
        cancelled[orderHash] = true;
        emit OrderCancelled(orderHash, order.maker);
    }

    function invalidateNonces(uint256 newMinNonce) external {
        if (newMinNonce <= minNonce[msg.sender]) revert InvalidNonce();
        minNonce[msg.sender] = newMinNonce;
        emit NonceInvalidated(msg.sender, newMinNonce);
    }

    function setExecutor(address executor, bool allowed) external onlyOwner {
        if (executor == address(0)) revert InvalidAddress();
        executors[executor] = allowed;
        emit ExecutorUpdated(executor, allowed);
    }

    function setFeeConfiguration(address recipient, uint16 nextFeeBps) external onlyOwner {
        if (recipient == address(0)) revert InvalidAddress();
        if (nextFeeBps > MAX_PROTOCOL_FEE_BPS) revert FeeTooHigh();
        feeRecipient = recipient;
        feeBps = nextFeeBps;
        emit FeeConfigurationUpdated(recipient, nextFeeBps);
    }

    function transferOwnership(address nextOwner) external onlyOwner {
        if (nextOwner == address(0)) revert InvalidAddress();
        emit OwnershipTransferred(owner, nextOwner);
        owner = nextOwner;
    }

    function _recover(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (uint256(s) > SECP256K1_HALF_N) revert InvalidSignature();
        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert InvalidSignature();
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
        return signer;
    }

    function _balanceOf(address token, address account) internal view returns (uint256 value) {
        (bool success, bytes memory result) = token.staticcall(
            abi.encodeWithSelector(0x70a08231, account)
        );
        if (!success || result.length < 32) revert TokenCallFailed(token, result);
        value = abi.decode(result, (uint256));
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        _callToken(token, abi.encodeWithSelector(0xa9059cbb, to, amount));
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        _callToken(token, abi.encodeWithSelector(0x23b872dd, from, to, amount));
    }

    function _forceApprove(address token, address spender, uint256 amount) internal {
        _callToken(token, abi.encodeWithSelector(0x095ea7b3, spender, 0));
        if (amount != 0) {
            _callToken(token, abi.encodeWithSelector(0x095ea7b3, spender, amount));
        }
    }

    function _callToken(address token, bytes memory data) internal {
        (bool success, bytes memory result) = token.call(data);
        if (!success || (result.length != 0 && !abi.decode(result, (bool)))) {
            revert TokenCallFailed(token, data);
        }
    }
}
