#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, Env, Map, Symbol, Vec
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    SplitNotFound = 1,
    AlreadyPaid = 2,
    InvalidAmount = 3,
    InvalidName = 4,
    Unauthorized = 5,
    NotAssigned = 6,
    AlreadyRegistered = 7,
}

#[derive(Clone)]
#[contracttype]
pub enum SplitMode {
    Standard = 0,
    Open = 1,
    Direct = 2,
}

#[derive(Clone)]
#[contracttype]
pub struct SplitConfig {
    pub payer: Address,
    pub token: Address,
    pub total_bill: i128,
    pub service_charge: i128,
    pub target_people: u32,
    pub mode: SplitMode,
    pub owner_included: bool,
}

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Counter,
    Config(u32),                 // split_id -> SplitConfig
    PaidCount(u32),              // split_id -> u32
    Lobby(u32),                  // split_id -> Vec<Address>
    ParticipantName(u32, Address),// split_id, address -> Symbol
    AssignedAmount(u32, Address),// split_id, address -> i128
    PaidAddr(u32, Address),      // split_id, address -> bool
}

#[contract]
pub struct TropaSplit;

#[contractimpl]
impl TropaSplit {
    /// Creates a new split and returns the generated split_id
    pub fn create_split(
        env: Env,
        payer: Address,
        token: Address,
        total_bill: i128,
        service_charge: i128,
        target_people: u32,
        mode: u32,
        owner_included: bool,
    ) -> u32 {
        payer.require_auth();

        let split_mode = match mode {
            0 => SplitMode::Standard,
            1 => SplitMode::Open,
            _ => SplitMode::Direct,
        };

        let mut split_id: u32 = env.storage().persistent().get(&DataKey::Counter).unwrap_or(1000);
        env.storage().persistent().set(&DataKey::Counter, &(split_id + 1));

        let config = SplitConfig {
            payer,
            token,
            total_bill,
            service_charge,
            target_people,
            mode: split_mode,
            owner_included,
        };

        env.storage().persistent().set(&DataKey::Config(split_id), &config);
        env.storage().persistent().set(&DataKey::PaidCount(split_id), &0u32);
        env.storage().persistent().set(&DataKey::Lobby(split_id), &Vec::<Address>::new(&env));

        split_id
    }

    /// Gets the split configuration
    pub fn get_split(env: Env, split_id: u32) -> Result<SplitConfig, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Config(split_id))
            .ok_or(Error::SplitNotFound)
    }

    /// Register a participant in the lobby (Direct Mode)
    pub fn register_participant(env: Env, split_id: u32, friend: Address, name: Symbol) -> Result<(), Error> {
        friend.require_auth();
        
        let _config: SplitConfig = env.storage().persistent().get(&DataKey::Config(split_id)).ok_or(Error::SplitNotFound)?;

        if env.storage().persistent().has(&DataKey::ParticipantName(split_id, friend.clone())) {
            return Err(Error::AlreadyRegistered);
        }

        env.storage().persistent().set(&DataKey::ParticipantName(split_id, friend.clone()), &name);
        
        let mut lobby: Vec<Address> = env.storage().persistent().get(&DataKey::Lobby(split_id)).unwrap_or_else(|| Vec::new(&env));
        lobby.push_back(friend);
        env.storage().persistent().set(&DataKey::Lobby(split_id), &lobby);

        Ok(())
    }

    /// Get the list of lobby participants
    pub fn get_lobby(env: Env, split_id: u32) -> Vec<Address> {
        env.storage().persistent().get(&DataKey::Lobby(split_id)).unwrap_or_else(|| Vec::new(&env))
    }

    /// Get the name of a participant
    pub fn get_participant_name(env: Env, split_id: u32, friend: Address) -> Option<Symbol> {
        env.storage().persistent().get(&DataKey::ParticipantName(split_id, friend))
    }

    /// Get the assigned amount for a participant
    pub fn get_assigned_amount(env: Env, split_id: u32, friend: Address) -> Option<i128> {
        env.storage().persistent().get(&DataKey::AssignedAmount(split_id, friend))
    }

    /// Assign amounts to participants in the lobby (Callable only by payer)
    pub fn assign_amounts(env: Env, split_id: u32, amounts: Map<Address, i128>) -> Result<(), Error> {
        let config: SplitConfig = env.storage().persistent().get(&DataKey::Config(split_id)).ok_or(Error::SplitNotFound)?;
        config.payer.require_auth();

        for (addr, amount) in amounts.iter() {
            env.storage().persistent().set(&DataKey::AssignedAmount(split_id, addr), &amount);
        }

        Ok(())
    }

    /// Gets the number of people who have paid
    pub fn get_paid_count(env: Env, split_id: u32) -> u32 {
        env.storage().persistent().get(&DataKey::PaidCount(split_id)).unwrap_or(0)
    }

    /// Checks if an address has paid
    pub fn has_address_paid(env: Env, split_id: u32, addr: Address) -> bool {
        env.storage().persistent().has(&DataKey::PaidAddr(split_id, addr))
    }

    /// Pays a share of the split.
    /// - For Standard mode: `custom_amount` is ignored.
    /// - For Open mode: `custom_amount` must be provided.
    /// - For Direct mode: `custom_amount` is ignored (uses AssignedAmount).
    pub fn pay_share(
        env: Env,
        split_id: u32,
        friend: Address,
        custom_amount: i128,
    ) -> Result<(), Error> {
        friend.require_auth();

        let config: SplitConfig = env.storage().persistent().get(&DataKey::Config(split_id)).ok_or(Error::SplitNotFound)?;

        if env.storage().persistent().has(&DataKey::PaidAddr(split_id, friend.clone())) {
            return Err(Error::AlreadyPaid);
        }

        let math_tax = if config.owner_included {
            config.service_charge / (config.target_people as i128)
        } else {
            let friends_count = if config.target_people > 1 { config.target_people - 1 } else { 1 };
            config.service_charge / (friends_count as i128)
        };

        let amount_to_pay = match config.mode {
            SplitMode::Standard => {
                let divisor = if config.owner_included { config.target_people } else { config.target_people - 1 };
                let divisor = if divisor > 0 { divisor } else { 1 };
                
                let share_base = config.total_bill / (divisor as i128);
                share_base + math_tax
            }
            SplitMode::Open => {
                if custom_amount <= 0 {
                    return Err(Error::InvalidAmount);
                }
                custom_amount + math_tax
            }
            SplitMode::Direct => {
                let base_owed: i128 = env.storage().persistent()
                    .get(&DataKey::AssignedAmount(split_id, friend.clone()))
                    .ok_or(Error::NotAssigned)?;
                base_owed + math_tax
            }
        };

        let token_client = token::Client::new(&env, &config.token);
        token_client.transfer(&friend, &config.payer, &amount_to_pay);

        env.storage().persistent().set(&DataKey::PaidAddr(split_id, friend), &true);

        let count: u32 = env.storage().persistent().get(&DataKey::PaidCount(split_id)).unwrap_or(0);
        env.storage().persistent().set(&DataKey::PaidCount(split_id), &(count + 1));

        Ok(())
    }
}