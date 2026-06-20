module narc_policy::narc_policy;

use std::option::{Self as option, Option};
use sui::event;
use sui::object::{Self as object, ID, UID};
use sui::transfer;
use sui::tx_context::{Self as tx_context, TxContext};

const VERSION: u64 = 1;

const E_POLICY_PAUSED: u64 = 1;
const E_POLICY_NOT_PAUSED: u64 = 2;
const E_WRONG_VERSION: u64 = 3;

public struct OwnerCap has key {
    id: UID,
}

public struct GuardianCap has key, store {
    id: UID,
}

public struct AgentPolicy has key {
    id: UID,
    version: u64,
    paused: bool,
    mandate_hash: vector<u8>,
    last_reason_blob: Option<vector<u8>>,
}

public struct Paused has copy, drop {
    policy_id: ID,
    guardian: ID,
    reason_blob: vector<u8>,
}

public struct Resumed has copy, drop {
    policy_id: ID,
    owner: ID,
    reason: vector<u8>,
}

public struct MandateHashUpdated has copy, drop {
    policy_id: ID,
    owner: ID,
    mandate_hash: vector<u8>,
}

fun init(ctx: &mut TxContext) {
    let sender = tx_context::sender(ctx);

    transfer::transfer(OwnerCap { id: object::new(ctx) }, sender);
    transfer::transfer(GuardianCap { id: object::new(ctx) }, sender);
    transfer::share_object(AgentPolicy {
        id: object::new(ctx),
        version: VERSION,
        paused: false,
        mandate_hash: vector[],
        last_reason_blob: option::none(),
    });
}

/// Aborts with `E_WRONG_VERSION` if `policy` was created by an incompatible
/// package version. Call at the top of every state-mutating entry point so a
/// post-upgrade object can be fenced off from stale code paths.
fun assert_version(policy: &AgentPolicy) {
    assert!(policy.version == VERSION, E_WRONG_VERSION);
}

/// Aborts with `E_POLICY_PAUSED` if the policy is paused. Call in the same PTB
/// as any gated order so a paused policy makes the order fail atomically.
public fun assert_active(policy: &AgentPolicy) {
    assert!(!policy.paused, E_POLICY_PAUSED);
}

/// Pauses the policy and records the Walrus blob id of the pause reason.
/// Requires a `&GuardianCap`. Subsequent `assert_active` calls will abort.
public fun pause(
    cap: &GuardianCap,
    policy: &mut AgentPolicy,
    reason_blob: vector<u8>,
    _ctx: &mut TxContext,
) {
    assert_version(policy);
    policy.paused = true;
    policy.last_reason_blob = option::some(reason_blob);

    event::emit(Paused {
        policy_id: object::id(policy),
        guardian: object::id(cap),
        reason_blob,
    });
}

/// Clears a pause. Requires a `&OwnerCap` and aborts with
/// `E_POLICY_NOT_PAUSED` if the policy is not currently paused.
public fun override_resume(
    cap: &OwnerCap,
    policy: &mut AgentPolicy,
    reason: vector<u8>,
    _ctx: &mut TxContext,
) {
    assert_version(policy);
    assert!(policy.paused, E_POLICY_NOT_PAUSED);
    policy.paused = false;
    policy.last_reason_blob = option::none();

    event::emit(Resumed {
        policy_id: object::id(policy),
        owner: object::id(cap),
        reason,
    });
}

/// Updates the on-chain mandate hash. Requires a `&OwnerCap`. The new hash
/// must match the off-chain mandate hashed in `shared` (Invariant 2).
public fun set_mandate_hash(
    cap: &OwnerCap,
    policy: &mut AgentPolicy,
    mandate_hash: vector<u8>,
    _ctx: &mut TxContext,
) {
    assert_version(policy);
    policy.mandate_hash = mandate_hash;

    event::emit(MandateHashUpdated {
        policy_id: object::id(policy),
        owner: object::id(cap),
        mandate_hash,
    });
}

public fun transfer_guardian(cap: GuardianCap, recipient: address) {
    transfer::public_transfer(cap, recipient);
}

public fun paused(policy: &AgentPolicy): bool {
    policy.paused
}

public fun mandate_hash(policy: &AgentPolicy): vector<u8> {
    policy.mandate_hash
}

public fun last_reason_blob(policy: &AgentPolicy): Option<vector<u8>> {
    policy.last_reason_blob
}

#[test_only]
public fun new_for_test(
    mandate_hash: vector<u8>,
    ctx: &mut TxContext,
): (OwnerCap, GuardianCap, AgentPolicy) {
    (
        OwnerCap { id: object::new(ctx) },
        GuardianCap { id: object::new(ctx) },
        AgentPolicy {
            id: object::new(ctx),
            version: VERSION,
            paused: false,
            mandate_hash,
            last_reason_blob: option::none(),
        },
    )
}

#[test_only]
public fun destroy_for_test(owner: OwnerCap, guardian: GuardianCap, policy: AgentPolicy) {
    let OwnerCap { id: owner_id } = owner;
    let GuardianCap { id: guardian_id } = guardian;
    let AgentPolicy {
        id: policy_id,
        version: _,
        paused: _,
        mandate_hash: _,
        last_reason_blob: _,
    } = policy;

    object::delete(owner_id);
    object::delete(guardian_id);
    object::delete(policy_id);
}

#[test]
fun assert_active_when_unpaused() {
    let ctx = &mut tx_context::dummy();
    let (owner, guardian, policy) = new_for_test(b"mandate", ctx);

    assert_active(&policy);

    destroy_for_test(owner, guardian, policy);
}

#[test, expected_failure(abort_code = narc_policy::narc_policy::E_POLICY_PAUSED)]
fun assert_active_aborts_when_paused() {
    let ctx = &mut tx_context::dummy();
    let (owner, guardian, mut policy) = new_for_test(b"mandate", ctx);

    pause(&guardian, &mut policy, b"reason", ctx);
    assert_active(&policy);
    destroy_for_test(owner, guardian, policy);
}

#[test]
fun pause_sets_state_and_reason_blob() {
    let ctx = &mut tx_context::dummy();
    let (owner, guardian, mut policy) = new_for_test(b"mandate", ctx);

    pause(&guardian, &mut policy, b"reason", ctx);

    assert!(paused(&policy), 0);
    let reason_blob = last_reason_blob(&policy);
    assert!(option::is_some(&reason_blob), 1);
    assert!(option::destroy_some(reason_blob) == b"reason", 2);

    destroy_for_test(owner, guardian, policy);
}

#[test]
fun override_clears_pause_and_reason_blob() {
    let ctx = &mut tx_context::dummy();
    let (owner, guardian, mut policy) = new_for_test(b"mandate", ctx);

    pause(&guardian, &mut policy, b"reason", ctx);
    override_resume(&owner, &mut policy, b"owner reason", ctx);

    assert!(!paused(&policy), 0);
    assert!(option::is_none(&last_reason_blob(&policy)), 1);

    destroy_for_test(owner, guardian, policy);
}

#[test]
fun set_mandate_hash_updates_policy() {
    let ctx = &mut tx_context::dummy();
    let (owner, guardian, mut policy) = new_for_test(b"old", ctx);

    set_mandate_hash(&owner, &mut policy, b"new-hash", ctx);

    assert!(mandate_hash(&policy) == b"new-hash", 0);

    destroy_for_test(owner, guardian, policy);
}

#[test, expected_failure(abort_code = narc_policy::narc_policy::E_POLICY_NOT_PAUSED)]
fun override_resume_aborts_when_not_paused() {
    let ctx = &mut tx_context::dummy();
    let (owner, guardian, mut policy) = new_for_test(b"mandate", ctx);

    override_resume(&owner, &mut policy, b"owner reason", ctx);

    destroy_for_test(owner, guardian, policy);
}

#[test]
fun transfer_guardian_moves_pause_authority() {
    use sui::test_scenario;

    let owner_addr = @0xA;
    let new_guardian_addr = @0xB;

    let mut sc = test_scenario::begin(owner_addr);
    let (owner, guardian, mut policy) = new_for_test(b"mandate", sc.ctx());

    // Hand the GuardianCap to a different address.
    transfer_guardian(guardian, new_guardian_addr);

    // The new holder can pause with the cap they now own.
    sc.next_tx(new_guardian_addr);
    let g = sc.take_from_sender<GuardianCap>();
    pause(&g, &mut policy, b"reason", sc.ctx());
    assert!(paused(&policy), 0);
    sc.return_to_sender(g);

    // Clean up owner + policy (the guardian cap stays owned in the scenario).
    sc.next_tx(owner_addr);
    let OwnerCap { id: owner_id } = owner;
    let AgentPolicy {
        id: policy_id,
        version: _,
        paused: _,
        mandate_hash: _,
        last_reason_blob: _,
    } = policy;
    object::delete(owner_id);
    object::delete(policy_id);

    sc.end();
}
