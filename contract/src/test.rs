#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol, Map};
use soroban_sdk::token;

fn setup_token<'a>(env: &Env, admin: &Address) -> (token::Client<'a>, token::StellarAssetClient<'a>) {
    let token_address = env.register_stellar_asset_contract(admin.clone());
    (
        token::Client::new(env, &token_address),
        token::StellarAssetClient::new(env, &token_address),
    )
}

#[test]
fn test_standard_split_owner_included() {
    let env = Env::default();
    env.mock_all_auths();

    let payer = Address::generate(&env);
    let friend1 = Address::generate(&env);
    
    let token_admin = Address::generate(&env);
    let (token, token_admin_client) = setup_token(&env, &token_admin);

    let contract_id = env.register_contract(None, TropaSplit);
    let client = TropaSplitClient::new(&env, &contract_id);

    token_admin_client.mint(&friend1, &1000);

    // Total bill: 90, Service: 10, Target: 3
    // Mode: 0 (Standard), Owner Included: true
    let split_id = client.create_split(
        &payer,
        &token.address,
        &90,
        &10,
        &3,
        &0,
        &true,
    );

    // Share = (90/3) + (10/3) = 30 + 3 = 33
    client.pay_share(&split_id, &friend1, &0);
    
    assert_eq!(token.balance(&friend1), 967);
    assert_eq!(token.balance(&payer), 33);
}

#[test]
fn test_direct_split_lobby() {
    let env = Env::default();
    env.mock_all_auths();

    let payer = Address::generate(&env);
    let friend1 = Address::generate(&env);
    let friend2 = Address::generate(&env);
    
    let token_admin = Address::generate(&env);
    let (token, token_admin_client) = setup_token(&env, &token_admin);

    let contract_id = env.register_contract(None, TropaSplit);
    let client = TropaSplitClient::new(&env, &contract_id);

    token_admin_client.mint(&friend1, &1000);
    token_admin_client.mint(&friend2, &1000);

    // Mode: 2 (Direct), Owner Included: true
    let split_id = client.create_split(
        &payer,
        &token.address,
        &100,
        &20,
        &3,
        &2,
        &true,
    );

    let alice = Symbol::new(&env, "Alice");
    client.register_participant(&split_id, &friend1, &alice);
    
    let bob = Symbol::new(&env, "Bob");
    client.register_participant(&split_id, &friend2, &bob);

    let lobby = client.get_lobby(&split_id);
    assert_eq!(lobby.len(), 2);

    let mut amounts = Map::new(&env);
    amounts.set(friend1.clone(), 40); // Alice owes 40
    amounts.set(friend2.clone(), 30); // Bob owes 30

    client.assign_amounts(&split_id, &amounts);

    // Math tax: 20 / 3 = 6
    // Alice pays: 40 + 6 = 46
    client.pay_share(&split_id, &friend1, &0);
    assert_eq!(token.balance(&friend1), 954);
    assert_eq!(token.balance(&payer), 46);

    // Bob pays: 30 + 6 = 36
    client.pay_share(&split_id, &friend2, &0);
    assert_eq!(token.balance(&friend2), 964);
    assert_eq!(token.balance(&payer), 82); // 46 + 36 = 82
}