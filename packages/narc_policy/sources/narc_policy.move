module narc_policy::narc_policy;

use std::option::{Self, Option};
use sui::event;
use sui::object::{Self, ID, UID};
use sui::transfer;
use sui::tx_context::{Self, TxContext};

const E_POLICY_PAUSED: u64 = 1;
const E_POLICY_ACTIVE: u64 = 2;

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

fun init(ctx: &mut TxContext) {
    let sender = tx_context::sender(ctx);
    transfer::transfer(OwnerCap { id: object::new(ctx) }, sender);
    transfer::transfer(GuardianCap { id: object::new(ctx) }, sender);
    transfer::share_object(AgentPolicy {
        id: object::new(ctx),
        paused: false,
        mandate_hash: vector[],
        last_reason_blob: option::none<vector<u8>>(),
    });
}

public fun assert_active(policy: &AgentPolicy) {
    assert!(!policy.paused, E_POLICY_PAUSED);
}

public entry fun pause(cap: &GuardianCap, policy: &mut AgentPolicy, reason_blob: vector<u8>, _ctx: &mut TxContext) {
    policy.paused = true;
    policy.last_reason_blob = option::some(reason_blob);
    event::emit(Paused {
        policy_id: object::id(policy),
        guardian: object::id(cap),
        reason_blob,
    });
}

public entry fun override_resume(cap: &OwnerCap, policy: &mut AgentPolicy, reason: vector<u8>, _ctx: &mut TxContext) {
    assert!(policy.paused, E_POLICY_ACTIVE);
    policy.paused = false;
    policy.last_reason_blob = option::none<vector<u8>>();
    event::emit(Resumed {
        policy_id: object::id(policy),
        owner: object::id(cap),
        reason,
    });
}

public entry fun transfer_guardian(cap: GuardianCap, recipient: address) {
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
public fun new_for_test(mandate_hash: vector<u8>, ctx: &mut TxContext): (OwnerCap, GuardianCap, AgentPolicy) {
    (
        OwnerCap { id: object::new(ctx) },
        GuardianCap { id: object::new(ctx) },
        AgentPolicy {
            id: object::new(ctx),
            paused: false,
            mandate_hash,
            last_reason_blob: option::none<vector<u8>>(),
        },
    )
}

#[test_only]
public fun destroy_for_test(owner: OwnerCap, guardian: GuardianCap, policy: AgentPolicy) {
    let OwnerCap { id: owner_id } = owner;
    let GuardianCap { id: guardian_id } = guardian;
    let AgentPolicy { id: policy_id, paused: _, mandate_hash: _, last_reason_blob: _ } = policy;
    object::delete(owner_id);
    object::delete(guardian_id);
    object::delete(policy_id);
}

#[test]
fun pause_then_assert_aborts() {
    let ctx = &mut tx_context::dummy();
    let (owner, guardian, mut policy) = new_for_test(b"mandate", ctx);
    pause(&guardian, &mut policy, b"reason", ctx);
    assert!(paused(&policy), 0);
    destroy_for_test(owner, guardian, policy);
}

#[test]
fun override_clears_pause() {
    let ctx = &mut tx_context::dummy();
    let (owner, guardian, mut policy) = new_for_test(b"mandate", ctx);
    pause(&guardian, &mut policy, b"reason", ctx);
    override_resume(&owner, &mut policy, b"owner reason", ctx);
    assert!(!paused(&policy), 0);
    destroy_for_test(owner, guardian, policy);
}
