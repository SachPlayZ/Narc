module narc_policy::narc_policy;

use std::option::{Self as option, Option};
use sui::event;
use sui::object::{Self as object, ID, UID};
use sui::transfer;
use sui::tx_context::{Self as tx_context, TxContext};

const E_POLICY_PAUSED: u64 = 1;
const E_POLICY_NOT_PAUSED: u64 = 2;

public struct OwnerCap has key {
    id: UID,
}

public struct GuardianCap has key, store {
    id: UID,
}

public struct AgentPolicy has key {
    id: UID,
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
        paused: false,
        mandate_hash: vector[],
        last_reason_blob: option::none(),
    });
}

public fun assert_active(policy: &AgentPolicy) {
    assert!(!policy.paused, E_POLICY_PAUSED);
}

public fun pause(
    cap: &GuardianCap,
    policy: &mut AgentPolicy,
    reason_blob: vector<u8>,
    _ctx: &mut TxContext,
) {
    policy.paused = true;
    policy.last_reason_blob = option::some(reason_blob);

    event::emit(Paused {
        policy_id: object::id(policy),
        guardian: object::id(cap),
        reason_blob,
    });
}

public fun override_resume(
    cap: &OwnerCap,
    policy: &mut AgentPolicy,
    reason: vector<u8>,
    _ctx: &mut TxContext,
) {
    assert!(policy.paused, E_POLICY_NOT_PAUSED);
    policy.paused = false;
    policy.last_reason_blob = option::none();

    event::emit(Resumed {
        policy_id: object::id(policy),
        owner: object::id(cap),
        reason,
    });
}

public fun set_mandate_hash(
    cap: &OwnerCap,
    policy: &mut AgentPolicy,
    mandate_hash: vector<u8>,
    _ctx: &mut TxContext,
) {
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
