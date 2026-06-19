module narc_move_spike::spike;

use sui::object::{Self, UID};
use sui::transfer;
use sui::tx_context::{Self, TxContext};

public struct OwnerCap has key {
    id: UID,
}

public struct SpikeState has key {
    id: UID,
    counter: u64,
}

fun init(ctx: &mut TxContext) {
    let sender = tx_context::sender(ctx);
    transfer::transfer(OwnerCap { id: object::new(ctx) }, sender);
    transfer::share_object(SpikeState {
        id: object::new(ctx),
        counter: 0,
    });
}

public entry fun bump(_cap: &OwnerCap, state: &mut SpikeState) {
    state.counter = state.counter + 1;
}

public fun counter(state: &SpikeState): u64 {
    state.counter
}
