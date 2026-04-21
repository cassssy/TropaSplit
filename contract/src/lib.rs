#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env};

#[contract]
pub struct TropaSplit;

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Payer,
    Token,
    FriendShare(Address),
    HasPaid(Address),
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SplitError {
    AlreadyInitialized = 1,
    Unauthorized = 2,
    FriendAlreadyRegistered = 3,
    FriendNotRegistered = 4,
    InvalidAmount = 5,
    AlreadyPaid = 6,
}

#[contractimpl]
impl TropaSplit {
    // Initializes the split with the payer wallet and token contract used for settlement.
    pub fn init_split(
        env: Env,
        payer: Address,
        token_contract: Address,
    ) -> Result<(), SplitError> {
        payer.require_auth();

        if env.storage().instance().has(&DataKey::Payer) {
            return Err(SplitError::AlreadyInitialized);
        }

        env.storage().instance().set(&DataKey::Payer, &payer);
        env.storage().instance().set(&DataKey::Token, &token_contract);
        Ok(())
    }

    // Registers a friend and the amount they owe for this split.
    pub fn register_friend(
        env: Env,
        payer: Address,
        friend: Address,
        share_amount: i128,
    ) -> Result<(), SplitError> {
        payer.require_auth();

        let stored_payer: Address = env
            .storage()
            .instance()
            .get(&DataKey::Payer)
            .ok_or(SplitError::Unauthorized)?;
        if stored_payer != payer {
            return Err(SplitError::Unauthorized);
        }

        if share_amount <= 0 {
            return Err(SplitError::InvalidAmount);
        }

        let share_key = DataKey::FriendShare(friend.clone());
        if env.storage().persistent().has(&share_key) {
            return Err(SplitError::FriendAlreadyRegistered);
        }

        env.storage().persistent().set(&share_key, &share_amount);
        env.storage()
            .persistent()
            .set(&DataKey::HasPaid(friend), &false);
        Ok(())
    }

    // Friend pays their share. The contract immediately forwards the amount to the payer.
    pub fn pay_share(env: Env, friend: Address) -> Result<(), SplitError> {
        friend.require_auth();

        let share_key = DataKey::FriendShare(friend.clone());
        let amount: i128 = env
            .storage()
            .persistent()
            .get(&share_key)
            .ok_or(SplitError::FriendNotRegistered)?;
        if amount <= 0 {
            return Err(SplitError::InvalidAmount);
        }

        let paid_key = DataKey::HasPaid(friend.clone());
        let already_paid: bool = env.storage().persistent().get(&paid_key).unwrap_or(false);
        if already_paid {
            return Err(SplitError::AlreadyPaid);
        }

        let payer: Address = env
            .storage()
            .instance()
            .get(&DataKey::Payer)
            .ok_or(SplitError::Unauthorized)?;
        let token_contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(SplitError::Unauthorized)?;

        let token_client = token::Client::new(&env, &token_contract);
        token_client.transfer(&friend, &payer, &amount);

        env.storage().persistent().set(&paid_key, &true);
        env.events()
            .publish((symbol_short!("paid"), friend, payer), amount);
        Ok(())
    }

    // Returns whether a friend has already paid their registered share.
    pub fn has_paid(env: Env, friend: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::HasPaid(friend))
            .unwrap_or(false)
    }

    // Returns the registered share amount for a friend, if they are part of this split.
    pub fn get_share(env: Env, friend: Address) -> Option<i128> {
        env.storage().persistent().get(&DataKey::FriendShare(friend))
    }
}

#[cfg(test)]
mod test;