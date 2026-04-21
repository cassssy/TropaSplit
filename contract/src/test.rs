#![cfg(test)]

mod tests {
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
    use soroban_sdk::{Address, Env};

    use crate::{SplitError, TropaSplit, TropaSplitClient};

    #[test]
    fn happy_path_friend_pays_and_payer_receives_usdc() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(TropaSplit, ());
        let client = TropaSplitClient::new(&env, &contract_id);

        let token_admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token = TokenClient::new(&env, &token_contract.address());
        let token_admin_client = StellarAssetClient::new(&env, &token_contract.address());

        let payer = Address::generate(&env);
        let friend = Address::generate(&env);
        let share_amount: i128 = 10;

        token_admin_client.mint(&friend, &share_amount);

        client.init_split(&payer, &token_contract.address());
        client.register_friend(&payer, &friend, &share_amount);

        let payer_before = token.balance(&payer);
        let friend_before = token.balance(&friend);
        client.pay_share(&friend);
        let payer_after = token.balance(&payer);
        let friend_after = token.balance(&friend);

        assert_eq!(payer_after - payer_before, share_amount);
        assert_eq!(friend_before - friend_after, share_amount);
        assert_eq!(client.has_paid(&friend), true);
    }

    #[test]
    fn unauthorized_register_friend_rejected() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(TropaSplit, ());
        let client = TropaSplitClient::new(&env, &contract_id);

        let token_admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
        let payer = Address::generate(&env);
        let attacker = Address::generate(&env);
        let friend = Address::generate(&env);

        client.init_split(&payer, &token_contract.address());

        let res = client.try_register_friend(&attacker, &friend, &10);
        assert_eq!(res, Err(Ok(SplitError::Unauthorized)));
    }

    #[test]
    fn double_payment_rejected() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(TropaSplit, ());
        let client = TropaSplitClient::new(&env, &contract_id);

        let token_admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token = TokenClient::new(&env, &token_contract.address());
        let token_admin_client = StellarAssetClient::new(&env, &token_contract.address());

        let payer = Address::generate(&env);
        let friend = Address::generate(&env);
        let share_amount: i128 = 10;

        token_admin_client.mint(&friend, &(share_amount * 2));

        client.init_split(&payer, &token_contract.address());
        client.register_friend(&payer, &friend, &share_amount);

        client.pay_share(&friend);
        let friend_after_first = token.balance(&friend);
        let second = client.try_pay_share(&friend);
        let friend_after_second = token.balance(&friend);

        assert_eq!(second, Err(Ok(SplitError::AlreadyPaid)));
        assert_eq!(friend_after_first, friend_after_second);
    }
}