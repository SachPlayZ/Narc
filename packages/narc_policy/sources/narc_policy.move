module narc_policy::narc_policy;

use sui::event;

const VERSION: u64 = 1;

const EPolicyPaused: u64 = 1;
const EPolicyNotPaused: u64 = 2;
const EWrongVersion: u64 = 3;

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
    let sender = ctx.sender();

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
    assert!(policy.version == VERSION, EWrongVersion);
}

/// Aborts with `E_POLICY_PAUSED` if the policy is paused. Call in the same PTB
/// as any gated order so a paused policy makes the order fail atomically.
public fun assert_active(policy: &AgentPolicy) {
    assert!(!policy.paused, EPolicyPaused);
}

/// Pauses the policy and records the Walrus blob id of the pause reason.
/// Requires a `&GuardianCap`. Subsequent `assert_active` calls will abort.
public fun pause(
    policy: &mut AgentPolicy,
    cap: &GuardianCap,
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
    policy: &mut AgentPolicy,
    cap: &OwnerCap,
    reason: vector<u8>,
    _ctx: &mut TxContext,
) {
    assert_version(policy);
    assert!(policy.paused, EPolicyNotPaused);
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
    policy: &mut AgentPolicy,
    cap: &OwnerCap,
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

/// Moves pause authority by transferring the `GuardianCap` to `recipient`.
/// Irreversible from the sender's side once executed — the new holder gains
/// sole `pause()` rights.
public fun transfer_guardian(cap: GuardianCap, recipient: address) {
    transfer::public_transfer(cap, recipient);
}

/// Returns `true` if the policy is currently paused (orders gated by
/// `assert_active` will abort).
public fun paused(policy: &AgentPolicy): bool {
    policy.paused
}

/// Returns the on-chain mandate hash. Must match the off-chain mandate hashed
/// in `shared` (Invariant 2).
public fun mandate_hash(policy: &AgentPolicy): vector<u8> {
    policy.mandate_hash
}

/// Returns the Walrus blob id of the most recent pause reason, or `none` if the
/// policy has never been paused or was resumed.
public fun last_reason_blob(policy: &AgentPolicy): Option<vector<u8>> {
    policy.last_reason_blob
}

#[test_only]
use std::unit_test::{assert_eq, destroy};

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

#[test]
fun assert_active_when_unpaused() {
    let ctx = &mut tx_context::dummy();
    let (owner, guardian, policy) = new_for_test(b"mandate", ctx);

    assert_active(&policy);

    destroy(owner);
    destroy(guardian);
    destroy(policy);
}

#[test, expected_failure(abort_code = narc_policy::narc_policy::EPolicyPaused)]
fun assert_active_aborts_when_paused() {
    let ctx = &mut tx_context::dummy();
    let (_owner, guardian, mut policy) = new_for_test(b"mandate", ctx);

    pause(&mut policy, &guardian, b"reason", ctx);
    assert_active(&policy);
    abort
}

#[test]
fun pause_sets_state_and_reason_blob() {
    let ctx = &mut tx_context::dummy();
    let (owner, guardian, mut policy) = new_for_test(b"mandate", ctx);

    pause(&mut policy, &guardian, b"reason", ctx);

    assert!(paused(&policy));
    let reason_blob = last_reason_blob(&policy);
    assert!(reason_blob.is_some());
    assert_eq!(reason_blob.destroy_some(), b"reason");

    destroy(owner);
    destroy(guardian);
    destroy(policy);
}

#[test]
fun override_clears_pause_and_reason_blob() {
    let ctx = &mut tx_context::dummy();
    let (owner, guardian, mut policy) = new_for_test(b"mandate", ctx);

    pause(&mut policy, &guardian, b"reason", ctx);
    override_resume(&mut policy, &owner, b"owner reason", ctx);

    assert!(!paused(&policy));
    assert!(last_reason_blob(&policy).is_none());

    destroy(owner);
    destroy(guardian);
    destroy(policy);
}

#[test]
fun set_mandate_hash_updates_policy() {
    let ctx = &mut tx_context::dummy();
    let (owner, guardian, mut policy) = new_for_test(b"old", ctx);

    set_mandate_hash(&mut policy, &owner, b"new-hash", ctx);

    assert_eq!(mandate_hash(&policy), b"new-hash");

    destroy(owner);
    destroy(guardian);
    destroy(policy);
}

#[test, expected_failure(abort_code = narc_policy::narc_policy::EPolicyNotPaused)]
fun override_resume_aborts_when_not_paused() {
    let ctx = &mut tx_context::dummy();
    let (owner, _guardian, mut policy) = new_for_test(b"mandate", ctx);

    override_resume(&mut policy, &owner, b"owner reason", ctx);
    abort
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
    pause(&mut policy, &g, b"reason", sc.ctx());
    assert!(paused(&policy));
    sc.return_to_sender(g);

    // Clean up owner + policy (the guardian cap stays owned in the scenario).
    sc.next_tx(owner_addr);
    destroy(owner);
    destroy(policy);

    sc.end();
}
